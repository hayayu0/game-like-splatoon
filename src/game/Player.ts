import * as THREE from 'three';
import { ARENA, OBSTACLES } from './config';
import { Input } from './Input';
import { PaintSystem } from './PaintSystem';
import { Weapon } from './Weapon';
import { createSquid } from './Characters';
import type { Combatant } from './Combatant';

const RADIUS = 0.5;
const WALK_SPEED = 6;
const SQUID_SPEED = 10;
const ENEMY_INK_SPEED = 3;
const JUMP_VEL = 7;
const GRAVITY = 20;
const INK_PER_SHOT = 1.5;
const INK_MAX = 100;
const BOMB_COST = 35;
const HEALTH_MAX = 100;
const RESPAWN_TIME = 2;
const RESPAWN_INVULNERABILITY = 1.2;
const SENS = 0.0022;

/** 三人称プレイヤー。移動・視点・射撃・イカ潜伏・インクタンクを管理。 */
export class Player implements Combatant {
  readonly pos = new THREE.Vector3();
  readonly hitRadius = 0.6;
  readonly hitHeight = 2;
  readonly maxHealth = HEALTH_MAX;
  alive = true;
  health = HEALTH_MAX;
  ink = INK_MAX;
  special = 0;
  isSquid = false;

  private group = new THREE.Group();
  private character: THREE.Group;
  private velY = 0;
  private onGround = true;
  private yaw = 0;
  private pitch = -0.15;
  private camDistance = 6;
  private spawn = new THREE.Vector3();
  private respawnTimer = 0;
  private invulnerableTimer = 0;

  constructor(
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private input: Input,
    private paint: PaintSystem,
    private weapon: Weapon,
    readonly team: number,
    teamColor: number,
    spawn: THREE.Vector3,
  ) {
    this.pos.copy(spawn);
    this.spawn.copy(spawn);

    // インクリング風キャラ（ローカル +Z が前方）
    this.character = createSquid(teamColor);
    this.group.add(this.character);

    this.group.position.copy(this.pos);
    scene.add(this.group);
  }

  update(dt: number) {
    // --- 視点 ---
    const [mdx, mdy] = this.input.consumeMouse();
    this.yaw -= mdx * SENS;
    this.pitch -= mdy * SENS;
    this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch));

    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    // 照準（カメラの向く方向＝弾が飛ぶ方向）
    const forward = new THREE.Vector3(
      -Math.sin(this.yaw) * cp,
      sp,
      -Math.cos(this.yaw) * cp,
    );
    const horiz = new THREE.Vector3(forward.x, 0, forward.z).normalize();
    const right = new THREE.Vector3(-horiz.z, 0, horiz.x);
    const bombPressed = this.input.consumePressed('KeyQ');
    const specialPressed = this.input.consumePressed('KeyE');

    if (!this.alive) {
      this.isSquid = false;
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      this.updateAppearance(forward);
      return;
    }
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);

    // --- 足元のインク状態 ---
    const ground = this.paint.ownerAt(this.pos.x, this.pos.z);
    const onOwnInk = ground === this.team + 1;
    const onEnemyInk = ground !== 0 && ground !== 3 && ground !== this.team + 1;

    // --- イカ潜伏 ---
    this.isSquid = this.input.squidPressed && onOwnInk && this.onGround;

    // --- 移動 ---
    const mf = (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0);
    const ms = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0);
    const move = new THREE.Vector3()
      .addScaledVector(horiz, mf)
      .addScaledVector(right, ms);
    if (move.lengthSq() > 0) move.normalize();

    let speed = WALK_SPEED;
    if (this.isSquid) speed = SQUID_SPEED;
    else if (onEnemyInk) speed = ENEMY_INK_SPEED;

    this.pos.x += move.x * speed * dt;
    this.pos.z += move.z * speed * dt;

    // --- ジャンプ＆重力 ---
    if (this.input.isDown('Space') && this.onGround && !this.isSquid) {
      this.velY = JUMP_VEL;
      this.onGround = false;
    }
    this.velY -= GRAVITY * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.velY = 0;
      this.onGround = true;
    }

    this.resolveCollisions();

    // --- インク回復 ---
    this.ink = Math.min(INK_MAX, this.ink + (this.isSquid ? 40 : 8) * dt);

    // --- 射撃 ---
    if (this.input.firing && !this.isSquid && this.ink >= INK_PER_SHOT) {
      const muzzle = new THREE.Vector3(this.pos.x, 1.2, this.pos.z).addScaledVector(
        forward,
        0.7,
      );
      if (this.weapon.tryFire(muzzle, forward, this.team)) {
        this.ink -= INK_PER_SHOT;
        this.special = Math.min(100, this.special + 1.25);
      }
    }

    // --- サブウェポン ---
    if (bombPressed && !this.isSquid && this.ink >= BOMB_COST) {
      const origin = new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z)
        .addScaledVector(forward, 0.8);
      if (this.weapon.tryThrowBomb(origin, forward, this.team)) this.ink -= BOMB_COST;
    }

    // --- スペシャルウェポン ---
    if (specialPressed && this.special >= 100 && !this.isSquid) {
      this.weapon.startInkStrike(this.getStrikeTarget(forward), this.team);
      this.special = 0;
    }

    this.updateAppearance(forward);
  }

  /** 敵インクで HP が尽きたら、その場を塗ってリスポーン待ちに入る */
  takeDamage(amount: number, byTeam: number) {
    if (!this.alive || this.invulnerableTimer > 0 || byTeam === this.team) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health > 0) return;

    this.alive = false;
    this.isSquid = false;
    this.respawnTimer = RESPAWN_TIME;
    this.invulnerableTimer = 0;
    this.group.visible = false;
    this.paint.paint(this.pos.x, this.pos.z, 2, byTeam);
  }

  get respawnRemaining(): number {
    return Math.max(0, this.respawnTimer);
  }

  private respawn() {
    this.pos.copy(this.spawn);
    this.velY = 0;
    this.onGround = true;
    this.health = HEALTH_MAX;
    this.ink = INK_MAX;
    this.invulnerableTimer = RESPAWN_INVULNERABILITY;
    this.alive = true;
    this.group.visible = true;
  }

  private getStrikeTarget(forward: THREE.Vector3): THREE.Vector3 {
    const origin = new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z);
    let target: THREE.Vector3;
    if (forward.y < -0.02) {
      const t = -origin.y / forward.y;
      target = origin.clone().addScaledVector(forward, t);
    } else {
      const horiz = new THREE.Vector3(forward.x, 0, forward.z).normalize();
      target = this.pos.clone().addScaledVector(horiz, 14);
    }
    const lim = ARENA.half - 1;
    target.set(
      Math.max(-lim, Math.min(lim, target.x)),
      0,
      Math.max(-lim, Math.min(lim, target.z)),
    );
    return target;
  }

  private updateAppearance(forward: THREE.Vector3) {
    // --- 見た目（潜伏時はイカを平たく沈める） ---
    this.character.scale.set(1, this.isSquid ? 0.45 : 1, 1);
    if (this.alive) {
      this.group.visible =
        this.invulnerableTimer <= 0 || Math.floor(this.invulnerableTimer * 12) % 2 === 0;
    }
    this.group.position.copy(this.pos);
    this.group.rotation.y = Math.atan2(forward.x, forward.z);

    // --- カメラ（三人称） ---
    const target = new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z);
    const camPos = target.clone().addScaledVector(forward, -this.camDistance);
    camPos.y = Math.max(0.6, camPos.y);
    const lim = ARENA.half - 0.5;
    camPos.x = Math.max(-lim, Math.min(lim, camPos.x));
    camPos.z = Math.max(-lim, Math.min(lim, camPos.z));
    this.camera.position.copy(camPos);
    this.camera.lookAt(target);
  }

  private resolveCollisions() {
    const lim = ARENA.half - RADIUS - 0.2;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));

    for (const o of OBSTACLES) {
      const minX = o.x - o.w / 2 - RADIUS;
      const maxX = o.x + o.w / 2 + RADIUS;
      const minZ = o.z - o.d / 2 - RADIUS;
      const maxZ = o.z + o.d / 2 + RADIUS;
      if (
        this.pos.x > minX &&
        this.pos.x < maxX &&
        this.pos.z > minZ &&
        this.pos.z < maxZ
      ) {
        const penL = this.pos.x - minX;
        const penR = maxX - this.pos.x;
        const penT = this.pos.z - minZ;
        const penB = maxZ - this.pos.z;
        const m = Math.min(penL, penR, penT, penB);
        if (m === penL) this.pos.x = minX;
        else if (m === penR) this.pos.x = maxX;
        else if (m === penT) this.pos.z = minZ;
        else this.pos.z = maxZ;
      }
    }
  }
}
