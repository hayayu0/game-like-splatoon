import * as THREE from 'three';
import { ARENA, OBSTACLES } from './config';
import { PaintSystem } from './PaintSystem';
import { Weapon } from './Weapon';
import { createOctopus } from './Characters';

interface Bot {
  group: THREE.Group;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  paintTimer: number;
  retargetTimer: number;
}

const SPEED = 4.5;
const RADIUS = 0.5;

/** 敵チームのボット。ランダムに歩き回り、足元と前方を敵色で塗る。 */
export class EnemyAI {
  private bots: Bot[] = [];

  constructor(
    scene: THREE.Scene,
    private paint: PaintSystem,
    private weapon: Weapon,
    private team: number,
    color: number,
    count: number,
    spawns: THREE.Vector3[],
  ) {
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      group.add(createOctopus(color)); // タコ型キャラ

      const pos = spawns[i % spawns.length].clone();
      group.position.copy(pos);
      scene.add(group);

      this.bots.push({
        group,
        pos,
        target: this.randomPoint(),
        paintTimer: 0,
        retargetTimer: 2 + Math.random() * 3,
      });
    }
  }

  private randomPoint(): THREE.Vector3 {
    const r = ARENA.half - 2;
    return new THREE.Vector3((Math.random() * 2 - 1) * r, 0, (Math.random() * 2 - 1) * r);
  }

  update(dt: number) {
    for (const b of this.bots) {
      b.retargetTimer -= dt;
      const toT = new THREE.Vector3().subVectors(b.target, b.pos);
      toT.y = 0;
      if (toT.length() < 1.5 || b.retargetTimer <= 0) {
        b.target = this.randomPoint();
        b.retargetTimer = 3 + Math.random() * 3;
        toT.subVectors(b.target, b.pos);
        toT.y = 0;
      }
      const dir = toT.clone().normalize();

      b.pos.x += dir.x * SPEED * dt;
      b.pos.z += dir.z * SPEED * dt;
      this.resolve(b);

      b.group.position.copy(b.pos);
      if (dir.lengthSq() > 0) b.group.rotation.y = Math.atan2(dir.x, dir.z);

      // 足元に塗りつつ、時々前方へ発射
      b.paintTimer -= dt;
      if (b.paintTimer <= 0) {
        this.paint.paint(b.pos.x, b.pos.z, 1.4, this.team);
        b.paintTimer = 0.12;
        if (Math.random() < 0.3) {
          const muzzle = new THREE.Vector3(b.pos.x, 1.0, b.pos.z).addScaledVector(dir, 0.7);
          const fdir = new THREE.Vector3(dir.x, 0.12, dir.z);
          this.weapon.tryFire(muzzle, fdir, this.team, 0.1);
        }
      }
    }
  }

  private resolve(b: Bot) {
    const lim = ARENA.half - 0.7;
    if (b.pos.x < -lim || b.pos.x > lim || b.pos.z < -lim || b.pos.z > lim) {
      b.pos.x = Math.max(-lim, Math.min(lim, b.pos.x));
      b.pos.z = Math.max(-lim, Math.min(lim, b.pos.z));
      b.target = this.randomPoint();
    }
    for (const o of OBSTACLES) {
      const minX = o.x - o.w / 2 - RADIUS;
      const maxX = o.x + o.w / 2 + RADIUS;
      const minZ = o.z - o.d / 2 - RADIUS;
      const maxZ = o.z + o.d / 2 + RADIUS;
      if (b.pos.x > minX && b.pos.x < maxX && b.pos.z > minZ && b.pos.z < maxZ) {
        const penL = b.pos.x - minX;
        const penR = maxX - b.pos.x;
        const penT = b.pos.z - minZ;
        const penB = maxZ - b.pos.z;
        const m = Math.min(penL, penR, penT, penB);
        if (m === penL) b.pos.x = minX;
        else if (m === penR) b.pos.x = maxX;
        else if (m === penT) b.pos.z = minZ;
        else b.pos.z = maxZ;
        b.target = this.randomPoint();
      }
    }
  }
}
