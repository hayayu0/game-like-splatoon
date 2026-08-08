import * as THREE from 'three';
import { ARENA, OBSTACLES } from './config';
import { PaintSystem } from './PaintSystem';
import { Weapon } from './Weapon';
import { createOctopus } from './Characters';
import type { Combatant } from './Combatant';

interface Bot extends Combatant {
  group: THREE.Group;
  spawn: THREE.Vector3;
  target: THREE.Vector3;
  health: number;
  respawnTimer: number;
  paintTimer: number;
  retargetTimer: number;
  recognizeTimer: number;
  combatTimer: number;
  combatCooldown: number;
  fireTimer: number;
}

const SPEED = 4.5;
const RADIUS = 0.5;
const HEALTH_MAX = 100;
const RESPAWN_TIME = 2;

/** 敵チームのボット。徘徊と塗りを続けつつ、見つけたプレイヤーを狙って戦う。 */
export class EnemyAI {
  private bots: Bot[] = [];
  private attacker: Bot | null = null;

  constructor(
    scene: THREE.Scene,
    private paint: PaintSystem,
    private weapon: Weapon,
    private player: Combatant,
    private team: number,
    color: number,
    count: number,
    spawns: THREE.Vector3[],
  ) {
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      group.add(createOctopus(color)); // オクタリング風キャラ

      const pos = spawns[i % spawns.length].clone();
      group.position.copy(pos);
      scene.add(group);

      const paint = this.paint;
      const bot: Bot = {
        group,
        pos,
        spawn: pos.clone(),
        target: this.randomPoint(),
        team: this.team,
        alive: true,
        health: HEALTH_MAX,
        hitRadius: 0.6,
        hitHeight: 2,
        respawnTimer: 0,
        paintTimer: 0,
        retargetTimer: 2 + Math.random() * 3,
        recognizeTimer: 0.8 + Math.random() * 1.2,
        combatTimer: 0,
        combatCooldown: 0,
        fireTimer: 0.6,
        takeDamage(amount: number, byTeam: number) {
          if (!this.alive || byTeam === this.team) return;
          this.health = Math.max(0, this.health - amount);
          if (this.health > 0) return;
          this.alive = false;
          this.respawnTimer = RESPAWN_TIME;
          this.group.visible = false;
          paint.paint(this.pos.x, this.pos.z, 2, byTeam);
        },
      };
      this.bots.push(bot);
    }
  }

  get combatants(): Combatant[] {
    return this.bots;
  }

  private randomPoint(): THREE.Vector3 {
    const r = ARENA.half - 2;
    return new THREE.Vector3((Math.random() * 2 - 1) * r, 0, (Math.random() * 2 - 1) * r);
  }

  update(dt: number) {
    for (const b of this.bots) {
      if (!b.alive) {
        if (this.attacker === b) this.attacker = null;
        b.combatTimer = 0;
        b.respawnTimer -= dt;
        if (b.respawnTimer <= 0) this.respawn(b);
        continue;
      }

      b.combatTimer = Math.max(0, b.combatTimer - dt);
      b.combatCooldown = Math.max(0, b.combatCooldown - dt);
      const playerDistance = b.pos.distanceTo(this.player.pos);
      if (
        this.attacker === b &&
        (!this.player.alive || playerDistance > 16 || b.combatTimer <= 0)
      ) {
        this.endCombat(b);
      }

      // 共有枠が空いている時だけ、低確率でプレイヤーを認識する
      b.recognizeTimer -= dt;
      if (b.recognizeTimer <= 0) {
        if (
          this.attacker === null &&
          b.combatCooldown <= 0 &&
          this.player.alive &&
          playerDistance <= 14 &&
          Math.random() < 0.25
        ) {
          this.beginCombat(b);
        }
        b.recognizeTimer = 1.1 + Math.random() * 1.2;
      }
      const aiming = this.attacker === b;

      if (aiming) {
        b.target.copy(this.player.pos);
      } else {
        b.retargetTimer -= dt;
      }
      const toT = new THREE.Vector3().subVectors(b.target, b.pos);
      toT.y = 0;
      if (!aiming && (toT.length() < 1.5 || b.retargetTimer <= 0)) {
        b.target = this.randomPoint();
        b.retargetTimer = 3 + Math.random() * 3;
        toT.subVectors(b.target, b.pos);
        toT.y = 0;
      }
      const dir = toT.clone().normalize();
      const moveSpeed = aiming && toT.length() < 5 ? SPEED * 0.25 : SPEED;

      b.pos.x += dir.x * moveSpeed * dt;
      b.pos.z += dir.z * moveSpeed * dt;
      this.resolve(b);

      b.group.position.copy(b.pos);
      if (dir.lengthSq() > 0) b.group.rotation.y = Math.atan2(dir.x, dir.z);

      // 足元に塗りつつ、時々前方へ発射
      b.paintTimer -= dt;
      if (b.paintTimer <= 0) {
        this.paint.paint(b.pos.x, b.pos.z, 1.4, this.team);
        b.paintTimer = 0.12;
        if (!aiming && Math.random() < 0.3) {
          const muzzle = new THREE.Vector3(b.pos.x, 1.0, b.pos.z).addScaledVector(dir, 0.7);
          const fdir = new THREE.Vector3(dir.x, 0.12, dir.z);
          this.weapon.tryFire(muzzle, fdir, this.team, 0.1);
        }
      }

      if (aiming) {
        b.fireTimer -= dt;
        if (b.fireTimer <= 0) {
          const muzzle = new THREE.Vector3(b.pos.x, 1.0, b.pos.z).addScaledVector(dir, 0.7);
          const aim = this.player.pos.clone().setY(this.player.pos.y + 0.9).sub(muzzle);
          const distance = Math.hypot(aim.x, aim.z);
          // 弾の重力落下を距離に応じて補正し、遠距離では緩い山なりにする
          aim.y += Math.min(10, (30 * distance * distance) / (2 * 26 * 26));
          aim.x += (Math.random() - 0.5) * 1.8;
          aim.z += (Math.random() - 0.5) * 1.8;
          this.weapon.tryFire(muzzle, aim, this.team, 0.12);
          b.fireTimer = 0.6 + Math.random() * 0.3;
        }
      }
    }
  }

  private beginCombat(b: Bot) {
    this.attacker = b;
    b.combatTimer = 1.3 + Math.random() * 0.7;
    b.fireTimer = 0.6 + Math.random() * 0.3;
    b.target.copy(this.player.pos);
  }

  private endCombat(b: Bot) {
    if (this.attacker === b) this.attacker = null;
    b.combatTimer = 0;
    b.combatCooldown = 3 + Math.random() * 2;
    b.target = this.randomPoint();
    b.retargetTimer = 1.5 + Math.random() * 2;
  }

  private respawn(b: Bot) {
    b.pos.copy(b.spawn);
    b.target = this.randomPoint();
    b.health = HEALTH_MAX;
    b.alive = true;
    b.group.visible = true;
    b.group.position.copy(b.pos);
    b.retargetTimer = 2 + Math.random() * 2;
    b.recognizeTimer = 1.5 + Math.random();
    b.combatTimer = 0;
    b.combatCooldown = 4;
    b.fireTimer = 0.7;
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
