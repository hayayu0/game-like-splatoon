import * as THREE from 'three';
import { angleDelta, clamp, damp, dirFromYawPitch, INK_COLORS, rand, rightFromYaw } from '../core/utils';
import { buildCharacter, CharacterRig } from './charModel';
import { Input } from '../core/input';
import { GameCamera } from './fxcamera';
import type { Game } from './game';
import { Trail } from './trail';
import { WEAPONS, WEAPON_COUNT, type WeaponDef } from './weapons';

export interface Intent {
  moveX: number;
  moveZ: number;
  aimYaw: number;
  aimPitch: number;
  aimPoint: THREE.Vector3;
  shoot: boolean;
  jump: boolean;
  dash: boolean;
}

export interface Controller {
  intent: Intent;
  update(dt: number, agent: Agent, game: Game): void;
  reset?(): void;
}

export const newIntent = (): Intent => ({
  moveX: 0, moveZ: 0, aimYaw: 0, aimPitch: 0,
  aimPoint: new THREE.Vector3(), shoot: false, jump: false, dash: false,
});

const WALK = 6.0;
const SWIM = 11.4;
const ENEMY_INK = 2.6;
const OWN_INK = 6.8;
const JUMP_V = 8.6;
const G = 22;
const SWEEPER_LUNGE_SPEED = WALK * 6;
const SWEEPER_TURNS = 1;

export class Agent {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  aimPitch = 0;
  hp = 100;
  energy = 100;
  alive = true;
  respawnT = 0;
  invulnT = 0;
  swim = false;
  grounded = false;
  groundTeam = -1;
  fireCd = 0;
  fireT = 9;
  landT = 9;
  hurtT = 9;
  kills = 0;
  deaths = 0;
  paintScore = 0;
  rig: CharacterRig;
  readonly trail: Trail;
  radius = 0.42;
  height = 1.5;
  private visualY = 0;
  private turnVel = 0;
  private swimSfxT = 0;
  private stepT = 0;
  private tmpMuz = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();
  private tmpRight = new THREE.Vector3();
  private tmpChest = new THREE.Vector3();
  private tmpAim = new THREE.Vector3();
  private tmpPaint = new THREE.Vector3();
  private spinT = 0;
  private spinVisualAngle = 0;
  private spinRadius = 0;
  private spinWeapon: WeaponDef | null = null;
  private spinHits = new Set<Agent>();

  constructor(
    public team: number,
    public name: string,
    public kind: 'squid' | 'octo',
    public isPlayer: boolean,
    public spawn: { pos: THREE.Vector3; yaw: number },
    public controller: Controller,
    public weaponIndex = 0
  ) {
    this.rig = buildCharacter(team, kind);
    this.trail = new Trail(team);
    this.resetState();
  }

  resetState() {
    this.pos.copy(this.spawn.pos);
    this.pos.y += 0.05;
    this.vel.set(0, 0, 0);
    this.yaw = this.spawn.yaw;
    this.aimPitch = 0;
    this.hp = 100;
    this.energy = 100;
    this.alive = true;
    this.respawnT = 0;
    this.invulnT = 0;
    this.swim = false;
    this.spinT = 0;
    this.spinVisualAngle = 0;
    this.spinWeapon = null;
    this.spinHits.clear();
    this.visualY = this.pos.y;
    this.fireT = this.landT = this.hurtT = 9;
    this.rig.root.visible = true;
    this.rig.setFlash(0);
    this.trail.clear();
    this.controller.reset?.();
  }

  resetStats() {
    this.kills = this.deaths = this.paintScore = 0;
  }

  eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 1.42, this.pos.z);
  }

  update(dt: number, game: Game, allowControl: boolean) {
    if (!this.alive) {
      this.respawnT -= dt;
      this.trail.update(dt, this.pos, false, 0);
      if (this.respawnT <= 0) this.respawn(game);
      return;
    }
    if (allowControl) this.controller.update(dt, this, game);
    const it = this.controller.intent;
    if (!allowControl) {
      it.moveX = it.moveZ = 0;
      it.shoot = it.jump = it.dash = false;
    }

    // 足元インク判定
    this.groundTeam = game.paint.floorTeamAt(this.pos.x, this.pos.y, this.pos.z);
    const onOwn = this.groundTeam === this.team;
    const onEnemy = this.groundTeam === 1 - this.team;
    const wantSwim = this.spinT <= 0 && it.dash && onOwn && !it.shoot;
    this.swim = wantSwim;

    let maxSpeed = WALK;
    if (this.swim) maxSpeed = SWIM;
    else if (onOwn) maxSpeed = OWN_INK;
    else if (onEnemy) maxSpeed = ENEMY_INK;

    // 加速
    const mlen = Math.hypot(it.moveX, it.moveZ);
    const mx = mlen > 1 ? it.moveX / mlen : it.moveX;
    const mz = mlen > 1 ? it.moveZ / mlen : it.moveZ;
    const accel = this.grounded ? 13 : 4.5;
    this.vel.x = damp(this.vel.x, mx * maxSpeed, accel, dt);
    this.vel.z = damp(this.vel.z, mz * maxSpeed, accel, dt);
    if (this.spinT > 0) this.vel.x = this.vel.z = 0;

    // 向き: 泳ぎ中は進行方向、それ以外はエイム方向
    const moving = mlen > 0.1;
    const desiredYaw = this.swim && moving ? Math.atan2(mx, mz) : it.aimYaw;
    const dYaw = angleDelta(this.yaw, desiredYaw);
    const turn = dYaw * Math.min(1, dt * 15);
    this.turnVel = damp(this.turnVel, dYaw * 6, 10, dt);
    this.yaw += turn;
    this.aimPitch = it.aimPitch;

    // ジャンプ
    if (it.jump && this.grounded) {
      this.vel.y = JUMP_V;
      this.grounded = false;
      game.audio.sfx('jump', this.pos);
      game.particles.burst(this.pos, new THREE.Color('#dfe8ee'), 5, 2, 0.08, 0.4, 0.3);
    }

    this.vel.y -= G * dt;
    const res = game.world.moveCharacter(this.pos, this.vel, dt, this.radius, this.height, this.grounded);
    this.grounded = res.onGround;
    if (res.landed) {
      this.landT = 0;
      game.audio.sfx('land', this.pos);
      const c = this.groundTeam >= 0 ? INK_COLORS[this.groundTeam] : new THREE.Color('#cfd6dc');
      game.particles.burst(this.pos, c, 8, 2.6, 0.09, 0.5, 0.35);
      if (this.isPlayer) game.camera.addShake(clamp(res.landSpeed * 0.014, 0, 0.3));
    }

    // インクエネルギー
    if (this.swim) this.energy = Math.min(100, this.energy + 42 * dt);
    else if (onOwn && this.grounded) this.energy = Math.min(100, this.energy + 11 * dt);
    else this.energy = Math.min(100, this.energy + 4.5 * dt);

    // 射撃
    this.fireCd -= dt;
    if (this.spinT > 0) this.updateSpin(dt, game);
    if (it.shoot && !this.swim && this.fireCd <= 0) {
      const weapon = WEAPONS[this.weaponIndex];
      if (this.energy >= weapon.fireCost) {
        this.fireCd = weapon.fireCd;
        this.fireT = 0;
        this.energy -= weapon.fireCost;
        if (weapon.kind === 'spin') this.startSpin(game, weapon);
        else this.shoot(it, game, weapon);
      } else if (this.isPlayer) {
        this.fireCd = 0.2;
        game.audio.sfx('dry');
      }
    }

    // スイム演出
    if (this.swim && moving) {
      this.swimSfxT -= dt;
      if (this.swimSfxT <= 0) {
        this.swimSfxT = 0.16;
        game.audio.sfx('swim', this.pos);
        game.particles.burst(this.pos, INK_COLORS[this.team], 2, 1.6, 0.1, 0.35, 0.5);
      }
    }
    // 走り中の足元しぶき
    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    const trailActive = (this.swim && moving) || hspeed > WALK * 1.05;
    const trailWidth = (this.swim ? 0.3 : 0.2) * clamp(hspeed / SWIM, 0.55, 1);
    this.trail.update(dt, this.pos, trailActive, trailWidth);
    if (!this.swim && this.grounded && hspeed > 3) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = 0.26;
        if (this.groundTeam >= 0) {
          game.particles.burst(this.pos, INK_COLORS[this.groundTeam], 2, 1.4, 0.07, 0.3, 0.4);
        }
      }
    }

    // HP自動回復
    this.hurtT += dt;
    this.fireT += dt;
    this.landT += dt;
    this.invulnT -= dt;
    if (this.hurtT > 5 && this.hp < 100) this.hp = Math.min(100, this.hp + 26 * dt);

    // 見た目更新
    this.visualY = damp(this.visualY, this.pos.y, 22, dt);
    this.rig.root.position.set(this.pos.x, this.visualY, this.pos.z);
    this.rig.root.rotation.y = this.yaw + this.spinVisualAngle;
    this.rig.update({
      t: game.time,
      dt,
      speed: hspeed,
      runBlend: clamp(hspeed / WALK, 0, 1.15),
      grounded: this.grounded,
      vy: this.vel.y,
      aimPitch: this.aimPitch,
      fireT: this.fireT,
      landT: this.landT,
      swim: this.swim,
      hurtT: this.hurtT,
      turnVel: this.turnVel,
      energy: this.energy / 100,
    });
    const flashK = Math.max(0, 1 - this.hurtT / 0.25);
    this.rig.setFlash(flashK * 0.85);
    // 無敵中は点滅
    if (this.invulnT > 0) {
      this.rig.root.visible = Math.floor(game.time * 12) % 2 === 0;
    } else if (!this.rig.root.visible && this.alive) {
      this.rig.root.visible = true;
    }
  }

  /** 足元を塗りながら回転し、範囲内の敵へ1回ずつ接触ダメージを与える。 */
  private startSpin(game: Game, weapon: WeaponDef) {
    this.spinT = weapon.fireCd;
    this.spinVisualAngle = 0;
    this.spinRadius = rand(...weapon.paintRadius);
    this.spinWeapon = weapon;
    this.spinHits.clear();
    this.tmpPaint.copy(this.pos);
    const gained = game.paint.paintAt(this.team, this.tmpPaint, new THREE.Vector3(0, 1, 0), this.spinRadius);
    this.paintScore += gained;
    game.particles.burst(this.pos, INK_COLORS[this.team], 14, 4.2, 0.11, 0.55);
    game.audio.sfx('shoot', this.pos);
  }

  private updateSpin(dt: number, game: Game) {
    const weapon = this.spinWeapon;
    if (!weapon) return;
    this.spinT = Math.max(0, this.spinT - dt);
    const progress = 1 - this.spinT / weapon.fireCd;
    this.spinVisualAngle = progress * Math.PI * 2 * SWEEPER_TURNS;

    for (const a of game.agents) {
      if (a.team === this.team || !a.alive || a.invulnT > 0 || this.spinHits.has(a)) continue;
      const dx = a.pos.x - this.pos.x;
      const dz = a.pos.z - this.pos.z;
      if (dx * dx + dz * dz > this.spinRadius * this.spinRadius || Math.abs(a.pos.y - this.pos.y) > this.height) continue;
      this.spinHits.add(a);
      const damage = this.isPlayer ? weapon.damage : weapon.damageAI;
      a.damage(rand(...damage), this, game);
      if (this.isPlayer) game.ui.hitmarker();
    }

    if (this.spinT > 0) return;
    this.spinVisualAngle = 0;
    this.spinWeapon = null;
    dirFromYawPitch(this.yaw, 0, this.tmpDir);
    this.vel.x = this.tmpDir.x * SWEEPER_LUNGE_SPEED;
    this.vel.z = this.tmpDir.z * SWEEPER_LUNGE_SPEED;
  }

  /**
   * 発射位置と方向を「そのフレームの姿勢」から直接求めて撃つ。
   * リグから取る銃口ワールド座標は1フレーム古く、高速移動中や旋回中に
   * 壁の内側から発射されて弾が即消滅する（＝インクが出ない）原因になる。
   */
  private shoot(it: Intent, game: Game, weapon: WeaponDef) {
    dirFromYawPitch(it.aimYaw, it.aimPitch, this.tmpDir);
    rightFromYaw(it.aimYaw, this.tmpRight);
    // 胸元は必ず地形の外側にあるので、そこを起点に安全な発射点を探す
    this.tmpChest.set(this.pos.x, this.pos.y + 1.12, this.pos.z);
    this.tmpMuz.copy(this.tmpChest)
      .addScaledVector(this.tmpDir, 0.5)
      .addScaledVector(this.tmpRight, 0.13);
    if (game.world.segmentHit(this.tmpChest, this.tmpMuz, 0.02)) {
      this.tmpMuz.copy(this.tmpChest).addScaledVector(this.tmpDir, 0.12);
    }
    // 画面中央の照準点へ収束させる（三人称の視差補正）。
    // 近すぎる点や背後の点は誤差が暴れるので使わない。
    this.tmpAim.copy(it.aimPoint).sub(this.tmpMuz);
    if (this.tmpAim.lengthSq() > 9 && this.tmpAim.dot(this.tmpDir) > 0) {
      this.tmpDir.copy(this.tmpAim).normalize();
    }
    const spread = this.isPlayer ? weapon.spreadPlayer : weapon.spreadAI;
    game.projectiles.fire(this, this.tmpMuz, this.tmpDir, spread, weapon);
    game.audio.sfx('shoot', this.pos);
    if (this.isPlayer) game.camera.recoil();
  }

  switchWeapon() {
    this.weaponIndex = (this.weaponIndex + 1) % WEAPON_COUNT;
  }

  damage(amount: number, from: Agent, game: Game) {
    if (!this.alive || this.invulnT > 0) return;
    this.hp -= amount;
    this.hurtT = 0;
    if (this.isPlayer) {
      game.ui.damageFlash();
      game.camera.addShake(0.35);
      game.audio.sfx('damage');
    } else {
      game.audio.sfx('damage', this.pos);
    }
    if (this.hp <= 0) this.die(from, game);
  }

  die(from: Agent, game: Game) {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.deaths++;
    from.kills++;
    this.respawnT = 3.6;
    this.rig.root.visible = false;
    // 撃破された側は相手インクで爆散 + 足元に大きなスプラット
    const center = new THREE.Vector3(this.pos.x, this.pos.y + 0.8, this.pos.z);
    game.particles.burst(center, INK_COLORS[from.team], 40, 6.5, 0.14, 0.9, 0.9);
    game.particles.burst(center, INK_COLORS[this.team], 14, 4, 0.1, 0.7, 0.8);
    const gy = game.world.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.5);
    if (gy > -10) {
      game.paint.paintAt(from.team, new THREE.Vector3(this.pos.x, gy, this.pos.z), new THREE.Vector3(0, 1, 0), 1.8);
    }
    game.onKill(from, this);
    if (this.isPlayer) game.audio.sfx('death');
    else game.audio.sfx('ko', this.pos);
  }

  respawn(game: Game) {
    this.resetState();
    this.invulnT = 2.2;
    game.audio.sfx('respawn', this.pos);
    game.particles.burst(
      new THREE.Vector3(this.pos.x, this.pos.y + 0.5, this.pos.z),
      INK_COLORS[this.team], 22, 3.5, 0.1, 0.8, 1.2, 0.3
    );
    if (this.isPlayer) game.onPlayerRespawn();
  }
}

/** 人間プレイヤー操作 */
export class PlayerController implements Controller {
  intent = newIntent();
  private tmpF = new THREE.Vector3();
  private tmpR = new THREE.Vector3();
  private tapPath: THREE.Vector3[] = [];
  private tapPathI = 0;
  private weaponSwitchQueued = false;

  constructor(private input: Input, private cam: GameCamera) {}

  reset() {
    this.tapPath = [];
    this.tapPathI = 0;
    this.weaponSwitchQueued = false;
  }

  queueWeaponSwitch() {
    this.weaponSwitchQueued = true;
  }

  update(_dt: number, agent: Agent, game: Game) {
    const i = this.input;
    const it = this.intent;
    if (this.weaponSwitchQueued) {
      this.weaponSwitchQueued = false;
      agent.switchWeapon();
    }
    const mx = (i.down('KeyD') ? 1 : 0) - (i.down('KeyA') ? 1 : 0);
    const mz = (i.down('KeyW') ? 1 : 0) - (i.down('KeyS') ? 1 : 0);
    it.jump = false;
    dirFromYawPitch(this.cam.yaw, 0, this.tmpF);
    rightFromYaw(this.cam.yaw, this.tmpR);
    it.moveX = this.tmpF.x * mz + this.tmpR.x * mx;
    it.moveZ = this.tmpF.z * mz + this.tmpR.z * mx;

    const tap = i.consumeTap();
    let tapShoot = false;
    if (tap?.onAim) {
      tapShoot = true;
    } else if (tap) {
      this.setTapPath(tap.ndcX, tap.ndcY, agent, game);
    }

    if (mx !== 0 || mz !== 0) {
      this.tapPath = [];
      this.tapPathI = 0;
    } else {
      this.followTapPath(agent, it);
    }

    it.aimYaw = this.cam.yaw;
    it.aimPitch = this.cam.pitch;
    it.aimPoint.copy(this.cam.aimPoint);
    // firePressed: 1フレームより短いクリックも取りこぼさない
    it.shoot = tapShoot || i.firePressed(0);
    it.jump = it.jump || i.down('Space');
    it.dash = i.down('ShiftLeft') || i.down('ShiftRight');
  }

  private setTapPath(ndcX: number, ndcY: number, agent: Agent, game: Game) {
    const hit = this.cam.pointFromScreen(ndcX, ndcY, game.world);
    if (!hit || hit.normal.y < 0.7) return;

    const goal = game.nav.cellIndexAt(hit.point.x, hit.point.z);
    if (goal < 0 || !game.nav.walk[goal]) return;
    const goalPoint = game.nav.cellCenter(goal);
    if (Math.abs(goalPoint.y - hit.point.y) > 0.7) return;

    const path = game.nav.findPath(agent.pos.x, agent.pos.z, goalPoint.x, goalPoint.z);
    if (path.length === 0) return;
    this.tapPath = limitPath(path, agent.pos, game.nav.cell * 5);
    this.tapPathI = 0;
  }

  private followTapPath(agent: Agent, it: Intent) {
    it.jump = false;
    while (this.tapPathI < this.tapPath.length) {
      const wp = this.tapPath[this.tapPathI];
      const dx = wp.x - agent.pos.x;
      const dz = wp.z - agent.pos.z;
      const len = Math.hypot(dx, dz);
      const last = this.tapPathI === this.tapPath.length - 1;
      if (len <= (last ? 0.28 : 0.65)) {
        this.tapPathI++;
        continue;
      }
      it.moveX = dx / len;
      it.moveZ = dz / len;
      if (wp.y - agent.pos.y > 0.6 && len < 2.2 && agent.grounded) it.jump = true;
      return;
    }
    this.tapPath = [];
    this.tapPathI = 0;
  }
}

/** 経路を水平距離maxDistanceで打ち切る。 */
function limitPath(path: THREE.Vector3[], start: THREE.Vector3, maxDistance: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const prev = start.clone();
  let remain = maxDistance;
  for (const point of path) {
    const distance = Math.hypot(point.x - prev.x, point.z - prev.z);
    if (distance <= 1e-4) continue;
    if (distance <= remain) {
      out.push(point.clone());
      remain -= distance;
      prev.copy(point);
      if (remain <= 1e-4) break;
      continue;
    }
    const t = remain / distance;
    out.push(prev.clone().lerp(point, t));
    break;
  }
  return out;
}
