import * as THREE from 'three';
import { ARENA, OBSTACLES } from './config';
import { PaintSystem } from './PaintSystem';

interface Projectile {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  team: number;
  life: number;
  alive: boolean;
}

const GRAVITY = 30;
const SPEED = 26;
const SPREAD = 0.03;

/** インク弾の発射・飛翔・着弾（＝床への塗り）を管理する。プレイヤーと敵で共有。 */
export class Weapon {
  private projectiles: Projectile[] = [];
  private lastFire = new Map<number, number>(); // チームごとの連射クールダウン
  private geo = new THREE.SphereGeometry(0.18, 8, 8);
  private mats: THREE.MeshStandardMaterial[];

  constructor(
    private scene: THREE.Scene,
    private paint: PaintSystem,
    teamColors: number[],
  ) {
    this.mats = teamColors.map(
      (c) =>
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35 }),
    );
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

    // 死んだ弾を除去
    if (this.projectiles.some((p) => !p.alive)) {
      this.projectiles = this.projectiles.filter((p) => p.alive);
    }
  }

  private kill(p: Projectile) {
    p.alive = false;
    this.scene.remove(p.mesh);
  }
}
