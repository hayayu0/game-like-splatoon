import * as THREE from 'three';
import { ARENA, OBSTACLES } from './config';
import { PaintSystem } from './PaintSystem';
import type { Combatant } from './Combatant';

interface Projectile {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  team: number;
  life: number;
  alive: boolean;
}

interface Bomb {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  team: number;
  life: number;
  alive: boolean;
}

interface InkStrike {
  marker: THREE.Mesh;
  target: THREE.Vector3;
  team: number;
  time: number;
  alive: boolean;
}

interface ExplosionEffect {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  radius: number;
  age: number;
  duration: number;
}

const GRAVITY = 30;
const SPEED = 26;
const SPREAD = 0.03;
const DIRECT_DAMAGE = 34;
const BOMB_GRAVITY = 18;
const BOMB_FUSE = 1.5;

/** インク弾の発射・飛翔・着弾（＝床への塗り）を管理する。プレイヤーと敵で共有。 */
export class Weapon {
  private projectiles: Projectile[] = [];
  private bombs: Bomb[] = [];
  private strikes: InkStrike[] = [];
  private effects: ExplosionEffect[] = [];
  private lastFire = new Map<number, number>(); // チームごとの連射クールダウン
  private lastBomb = new Map<number, number>();
  private geo = new THREE.SphereGeometry(0.18, 8, 8);
  private bombGeo = new THREE.SphereGeometry(0.35, 12, 10);
  private mats: THREE.MeshStandardMaterial[];

  constructor(
    private scene: THREE.Scene,
    private paint: PaintSystem,
    teamColors: number[],
    private getCombatants: () => Combatant[],
  ) {
    this.mats = teamColors.map(
      (c) =>
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35 }),
    );
  }

  /** インクを消費できる状態ならスプラットボムを投げる */
  tryThrowBomb(origin: THREE.Vector3, dir: THREE.Vector3, team: number): boolean {
    const now = performance.now() / 1000;
    const last = this.lastBomb.get(team) ?? -999;
    if (now - last < 0.8) return false;
    this.lastBomb.set(team, now);

    const mesh = new THREE.Mesh(this.bombGeo, this.mats[team]);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    const vel = dir.clone().normalize().multiplyScalar(12);
    vel.y += 4.5;
    this.bombs.push({
      mesh,
      pos: origin.clone(),
      vel,
      team,
      life: 0,
      alive: true,
    });
    return true;
  }

  /** 指定した床位置にインクストライクの予兆を置く */
  startInkStrike(target: THREE.Vector3, team: number) {
    const material = new THREE.MeshBasicMaterial({
      color: this.mats[team].color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const marker = new THREE.Mesh(new THREE.RingGeometry(5.6, 6, 64), material);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(target.x, 0.04, target.z);
    this.scene.add(marker);
    this.strikes.push({ marker, target: target.clone(), team, time: 0, alive: true });
  }

  /** クールダウンを満たしていれば 1発撃って true を返す */
  tryFire(origin: THREE.Vector3, dir: THREE.Vector3, team: number, interval = 0.09): boolean {
    const now = performance.now() / 1000;
    const last = this.lastFire.get(team) ?? -999;
    if (now - last < interval) return false;
    this.lastFire.set(team, now);

    const mesh = new THREE.Mesh(this.geo, this.mats[team]);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    const v = dir.clone().normalize();
    v.x += (Math.random() - 0.5) * SPREAD;
    v.y += (Math.random() - 0.5) * SPREAD + 0.12; // 少し上向きに撃って弧を描かせる
    v.z += (Math.random() - 0.5) * SPREAD;
    v.normalize().multiplyScalar(SPEED);

    this.projectiles.push({
      mesh,
      pos: origin.clone(),
      vel: v,
      team,
      life: 0,
      alive: true,
    });
    return true;
  }

  update(dt: number) {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.life += dt;
      p.vel.y -= GRAVITY * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);

      // 相手の縦カプセルに触れたら直撃
      if (this.hitByProjectile(p)) {
        this.paint.paint(p.pos.x, p.pos.z, 0.9, p.team);
        this.kill(p);
        continue;
      }

      // 床に着弾
      if (p.pos.y <= 0) {
        this.paint.paint(p.pos.x, p.pos.z, 1.3, p.team);
        this.kill(p);
        continue;
      }

      // 場外 or 寿命切れ
      if (
        Math.abs(p.pos.x) > ARENA.half ||
        Math.abs(p.pos.z) > ARENA.half ||
        p.life > 3
      ) {
        this.kill(p);
        continue;
      }

      // 遮蔽物にぶつかったら根元に小さく塗って消える
      for (const o of OBSTACLES) {
        if (
          p.pos.x > o.x - o.w / 2 &&
          p.pos.x < o.x + o.w / 2 &&
          p.pos.z > o.z - o.d / 2 &&
          p.pos.z < o.z + o.d / 2 &&
          p.pos.y < o.h
        ) {
          this.paint.paint(p.pos.x, p.pos.z, 0.6, p.team);
          this.kill(p);
          break;
        }
      }
    }

    this.updateBombs(dt);
    this.updateStrikes(dt);
    this.updateEffects(dt);

    // 死んだ弾を除去
    if (this.projectiles.some((p) => !p.alive)) {
      this.projectiles = this.projectiles.filter((p) => p.alive);
    }
    if (this.bombs.some((b) => !b.alive)) {
      this.bombs = this.bombs.filter((b) => b.alive);
    }
    if (this.strikes.some((s) => !s.alive)) {
      this.strikes = this.strikes.filter((s) => s.alive);
    }
  }

  private hitByProjectile(p: Projectile): boolean {
    for (const target of this.getCombatants()) {
      if (!target.alive || target.team === p.team) continue;
      const y = Math.max(target.pos.y, Math.min(target.pos.y + target.hitHeight, p.pos.y));
      const dx = p.pos.x - target.pos.x;
      const dy = p.pos.y - y;
      const dz = p.pos.z - target.pos.z;
      const radius = target.hitRadius + 0.18;
      if (dx * dx + dy * dy + dz * dz <= radius * radius) {
        target.takeDamage(DIRECT_DAMAGE, p.team);
        return true;
      }
    }
    return false;
  }

  private updateBombs(dt: number) {
    for (const bomb of this.bombs) {
      if (!bomb.alive) continue;
      bomb.life += dt;
      bomb.vel.y -= BOMB_GRAVITY * dt;
      bomb.pos.addScaledVector(bomb.vel, dt);
      bomb.mesh.position.copy(bomb.pos);
      bomb.mesh.rotation.x += dt * 7;
      bomb.mesh.rotation.z += dt * 5;

      if (bomb.pos.y <= 0 || bomb.life >= BOMB_FUSE) {
        bomb.pos.y = 0;
        this.paint.paint(bomb.pos.x, bomb.pos.z, 3.2, bomb.team);
        this.damageArea(bomb.pos, 3, 100, bomb.team);
        this.createExplosion(bomb.pos, 3.2, bomb.team);
        bomb.alive = false;
        this.scene.remove(bomb.mesh);
      }
    }
  }

  private updateStrikes(dt: number) {
    for (const strike of this.strikes) {
      if (!strike.alive) continue;
      strike.time += dt;
      const pulse = 1 + Math.sin(strike.time * 14) * 0.12;
      strike.marker.scale.setScalar(pulse);
      const material = strike.marker.material as THREE.MeshBasicMaterial;
      material.opacity = 0.5 + 0.35 * Math.sin(strike.time * 10) ** 2;

      if (strike.time >= 1.2) {
        this.paint.paint(strike.target.x, strike.target.z, 6, strike.team);
        this.damageArea(strike.target, 6, 100, strike.team);
        this.createExplosion(strike.target, 6, strike.team);
        strike.alive = false;
        this.scene.remove(strike.marker);
        strike.marker.geometry.dispose();
        material.dispose();
      }
    }
  }

  private damageArea(center: THREE.Vector3, radius: number, amount: number, team: number) {
    const radiusSq = radius * radius;
    for (const target of this.getCombatants()) {
      if (!target.alive || target.team === team) continue;
      const dx = target.pos.x - center.x;
      const dz = target.pos.z - center.z;
      if (dx * dx + dz * dz <= radiusSq) target.takeDamage(amount, team);
    }
  }

  private createExplosion(center: THREE.Vector3, radius: number, team: number) {
    const material = new THREE.MeshBasicMaterial({
      color: this.mats[team].color,
      transparent: true,
      opacity: 0.65,
      wireframe: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material);
    mesh.position.set(center.x, 0.25, center.z);
    mesh.scale.setScalar(0.1);
    this.scene.add(mesh);
    this.effects.push({ mesh, material, radius, age: 0, duration: 0.45 });
  }

  private updateEffects(dt: number) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.age += dt;
      const t = Math.min(1, effect.age / effect.duration);
      effect.mesh.scale.setScalar(Math.max(0.1, effect.radius * t));
      effect.material.opacity = 0.65 * (1 - t);
      if (t >= 1) {
        this.scene.remove(effect.mesh);
        effect.mesh.geometry.dispose();
        effect.material.dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  private kill(p: Projectile) {
    p.alive = false;
    this.scene.remove(p.mesh);
  }
}
