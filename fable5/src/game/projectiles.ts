import * as THREE from 'three';
import { INK_COLORS, INK_HI_COLORS, rand } from '../core/utils';
import type { Agent } from './character';
import type { Game } from './game';
import type { WeaponDef } from './weapons';

const MAX = 96;

interface Shot {
  active: boolean;
  team: number;
  owner: Agent;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  projectileSpeed: number;
  gravity: number;
  paintRadius: [number, number];
  damage: [number, number];
  damageAI: [number, number];
}

/** チームごとのInstancedMeshで描くインク弾プール */
export class ProjectilePool {
  private shots: Shot[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private dummy = new THREE.Object3D();
  private tmpPrev = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.085, 8, 6);
    for (let team = 0; team < 2; team++) {
      const mat = new THREE.MeshStandardMaterial({
        color: INK_COLORS[team],
        emissive: INK_HI_COLORS[team],
        emissiveIntensity: 0.55,
        roughness: 0.3,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, MAX);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  fire(owner: Agent, origin: THREE.Vector3, dir: THREE.Vector3, spreadRad: number, weapon: WeaponDef) {
    let shot = this.shots.find((s) => !s.active);
    if (!shot) {
      if (this.shots.length >= MAX * 2) return;
      shot = {
        active: false, team: 0, owner,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0,
        projectileSpeed: 0, gravity: 0, paintRadius: [0, 0], damage: [0, 0], damageAI: [0, 0],
      };
      this.shots.push(shot);
    }
    shot.active = true;
    shot.team = owner.team;
    shot.owner = owner;
    shot.pos.copy(origin);
    shot.projectileSpeed = weapon.projectileSpeed;
    shot.gravity = weapon.gravity;
    shot.paintRadius = weapon.paintRadius;
    shot.damage = weapon.damage;
    shot.damageAI = weapon.damageAI;
    const d = dir.clone().normalize();
    // 円錐スプレッド
    const a = rand(Math.PI * 2);
    const r = Math.random() * spreadRad;
    const up = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t1 = new THREE.Vector3().crossVectors(d, up).normalize();
    const t2 = new THREE.Vector3().crossVectors(d, t1);
    d.addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).normalize();
    shot.vel.copy(d).multiplyScalar(shot.projectileSpeed);
    shot.vel.y += 1.2; // わずかに山なり
    shot.life = 2.0;
  }

  update(dt: number, game: Game) {
    for (const s of this.shots) {
      if (!s.active) continue;
      s.life -= dt;
      this.tmpPrev.copy(s.pos);
      s.vel.y -= s.gravity * dt;
      s.pos.addScaledVector(s.vel, dt);

      // 地形ヒット
      const hit = game.world.segmentHit(this.tmpPrev, s.pos, 0.05);
      if (hit) {
        const radius = rand(...s.paintRadius);
        const gained = game.paint.paintAt(s.team, hit.point, hit.normal, radius);
        s.owner.paintScore += gained;
        game.particles.burst(hit.point, INK_COLORS[s.team], 6, 3.2, 0.09, 0.45);
        game.audio.sfx('splat', hit.point);
        s.active = false;
        continue;
      }
      // キャラクターヒット
      let hitAgent = false;
      for (const a of game.agents) {
        if (a.team === s.team || !a.alive || a.invulnT > 0) continue;
        const dx = a.pos.x - s.pos.x;
        const dy = a.pos.y + 0.85 - s.pos.y;
        const dz = a.pos.z - s.pos.z;
        if (dx * dx + dz * dz < 0.42 && Math.abs(dy) < 1.15) {
          game.particles.burst(s.pos, INK_COLORS[s.team], 10, 4, 0.1, 0.5);
          // AIの弾は威力を落とし、囲まれても即死しないようにする
          const damage = s.owner.isPlayer ? s.damage : s.damageAI;
          a.damage(rand(...damage), s.owner, game);
          if (s.owner.isPlayer) game.ui.hitmarker();
          s.active = false;
          hitAgent = true;
          break;
        }
      }
      if (hitAgent) continue;
      if (s.life <= 0 || s.pos.y < -3) s.active = false;
    }

    // インスタンス行列更新
    for (let team = 0; team < 2; team++) {
      const mesh = this.meshes[team];
      let n = 0;
      for (const s of this.shots) {
        if (!s.active || s.team !== team) continue;
        this.dummy.position.copy(s.pos);
        this.dummy.lookAt(
          s.pos.x + s.vel.x, s.pos.y + s.vel.y, s.pos.z + s.vel.z
        );
        this.dummy.scale.set(1, 1, 2.3);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(n++, this.dummy.matrix);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  clear() {
    for (const s of this.shots) s.active = false;
  }
}
