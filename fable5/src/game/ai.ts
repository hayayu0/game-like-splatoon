import * as THREE from 'three';
import { clamp, rand, randSpread } from '../core/utils';
import { Agent, Controller, newIntent } from './character';
import type { Game } from './game';

type Mode = 'paint' | 'attack' | 'retreat' | 'defend' | 'highground' | 'recover';

/**
 * ユーティリティベースAI:
 * 塗り拡げ / 交戦 / 撤退 / 自陣防衛 / 高所確保 を状況で切り替える。
 */
export class AIController implements Controller {
  intent = newIntent();
  mode: Mode = 'paint';
  private decideT = rand(0.3);
  private repathT = 0;
  private path: THREE.Vector3[] = [];
  private pathI = 0;
  private target: Agent | null = null;
  private paintGoal: THREE.Vector3 | null = null;
  private burstT = 0;
  private burstOn = true;
  private paintAim: THREE.Vector3 | null = null;
  private paintScanT = 0;
  private stuckT = 0;
  private reactT = 0;
  private eye = new THREE.Vector3();
  private tEye = new THREE.Vector3();
  /** 狙いのブレ。1発ごとの乱数ではなくゆっくり漂わせる */
  private aimDrift = new THREE.Vector3();
  private aimGoal = new THREE.Vector3();
  private driftT = 0;
  private fireBurstT = 0;
  private firing = false;

  constructor(
    private aggression: number, // 0.6-1.3
    private lane: number // -1 / 0 / 1 : z方向の担当
  ) {}

  reset() {
    this.path = [];
    this.pathI = 0;
    this.mode = 'paint';
    this.target = null;
    this.paintGoal = null;
    this.paintAim = null;
    this.paintScanT = 0;
    this.burstT = 0;
    this.burstOn = true;
    this.decideT = rand(0.4);
  }

  update(dt: number, agent: Agent, game: Game) {
    const it = this.intent;
    it.shoot = false;
    it.jump = false;
    it.dash = false;

    this.decideT -= dt;
    this.repathT -= dt;
    if (this.decideT <= 0) {
      this.decide(agent, game);
      this.decideT = rand(0.4, 0.75);
    }

    // ===== 経路追従 =====
    let goal: THREE.Vector3 | null = null;
    if (this.mode === 'attack' && this.target?.alive) {
      goal = this.target.pos;
      if (this.repathT <= 0) {
        this.setPath(agent, game, goal.x, goal.z);
        this.repathT = 0.9;
      }
    } else if (this.paintGoal) {
      goal = this.paintGoal;
      if (this.path.length === 0 && this.repathT <= 0) {
        this.setPath(agent, game, goal.x, goal.z);
        this.repathT = 1.2;
      }
    }

    it.moveX = 0;
    it.moveZ = 0;
    let moveLen = 0;
    if (this.path.length > 0 && this.pathI < this.path.length) {
      let wp = this.path[this.pathI];
      let dx = wp.x - agent.pos.x;
      let dz = wp.z - agent.pos.z;
      if (Math.hypot(dx, dz) < 0.9) {
        this.pathI++;
        if (this.pathI < this.path.length) {
          wp = this.path[this.pathI];
          dx = wp.x - agent.pos.x;
          dz = wp.z - agent.pos.z;
        }
      }
      if (this.pathI < this.path.length) {
        const len = Math.hypot(dx, dz) || 1;
        it.moveX = dx / len;
        it.moveZ = dz / len;
        moveLen = len;
        // 段差はジャンプ
        if (wp.y - agent.pos.y > 0.6 && len < 2.2 && agent.grounded) it.jump = true;
      } else if (goal) {
        this.paintGoal = null;
      }
    } else if (goal) {
      // 経路なし: 直進
      const dx = goal.x - agent.pos.x;
      const dz = goal.z - agent.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      if (len > 1.2) {
        it.moveX = dx / len;
        it.moveZ = dz / len;
        moveLen = len;
      } else {
        this.paintGoal = null;
      }
    }

    // スタック検出 → ジャンプ + 経路再計算
    const speed = Math.hypot(agent.vel.x, agent.vel.z);
    if (moveLen > 1.5 && speed < 0.7) {
      this.stuckT += dt;
      if (this.stuckT > 0.7) {
        it.jump = true;
        this.path = [];
        this.repathT = 0;
        this.stuckT = 0;
      }
    } else {
      this.stuckT = Math.max(0, this.stuckT - dt);
    }

    // ===== 交戦 / 塗り =====
    agent.eyePos(this.eye);
    const enemy = this.mode === 'attack' ? this.target : this.nearestVisibleEnemy(agent, game, 15);
    let aimed = false;
    let visibleEnemy = false;
    if (enemy && enemy.alive) {
      enemy.eyePos(this.tEye);
      const dist = this.eye.distanceTo(this.tEye);
      const visible = dist < 16 && game.world.los(this.eye, this.tEye);
      if (visible) {
        visibleEnemy = true;
        this.reactT += dt;
        // 狙いのブレをゆっくり漂わせる。1発ごとに乱数を振るより
        // 「狙いが甘い」挙動に近く、撃たれる側から見て理不尽になりにくい
        this.driftT -= dt;
        if (this.driftT <= 0) {
          this.driftT = rand(0.28, 0.55);
          const sp = (0.55 + dist * 0.062) / this.aggression;
          this.aimGoal.set(randSpread(sp), randSpread(sp * 0.4), randSpread(sp));
        }
        this.aimDrift.lerp(this.aimGoal, Math.min(1, dt * 4.5));
        // バースト射撃。撃ちっぱなしにせず必ず間を置く
        this.fireBurstT -= dt;
        if (this.fireBurstT <= 0) {
          this.firing = !this.firing;
          this.fireBurstT = this.firing ? rand(0.45, 0.85) : rand(0.45, 0.9);
        }
        if (this.reactT > 0.38 && this.firing && agent.energy > 8) {
          // リードも完璧には読まない
          const lead = clamp(dist / 27, 0, 0.7) * rand(0.45, 1.0);
          it.aimPoint.set(
            this.tEye.x + enemy.vel.x * lead + this.aimDrift.x,
            this.tEye.y - 0.35 + this.aimDrift.y,
            this.tEye.z + enemy.vel.z * lead + this.aimDrift.z
          );
          it.shoot = true;
          aimed = true;
        }
        // 交戦中は横ステップ（撃っていない間も動く）
        if (this.mode === 'attack' && dist < 9) {
          const strafe = Math.sin(game.time * 2.2 + this.lane * 2) > 0 ? 1 : -1;
          it.moveX += (-(this.tEye.z - this.eye.z) / dist) * strafe * 0.8;
          it.moveZ += ((this.tEye.x - this.eye.x) / dist) * strafe * 0.8;
        }
      } else {
        this.reactT = 0;
        this.aimDrift.multiplyScalar(0.9);
      }
    } else {
      this.reactT = 0;
    }

    // 非交戦時は周囲の未塗装/敵色を探し、移動停止中も積極的に塗る
    if (!aimed && !visibleEnemy && this.mode !== 'retreat' && this.mode !== 'recover' && agent.energy > 28) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burstOn = !this.burstOn;
        this.burstT = this.burstOn ? rand(2.8, 4.2) : rand(0.08, 0.16);
      }

      this.paintScanT -= dt;
      let refreshPaintAim = this.paintScanT <= 0 || !this.paintAim;
      if (this.paintAim) {
        const dx = this.paintAim.x - agent.pos.x;
        const dz = this.paintAim.z - agent.pos.z;
        const distSq = dx * dx + dz * dz;
        refreshPaintAim ||=
          distSq < 1.5 * 1.5 ||
          distSq > 6.5 * 6.5 ||
          Math.abs(this.paintAim.y - agent.pos.y) > 1.8 ||
          game.paint.floorTeamAt(this.paintAim.x, this.paintAim.y, this.paintAim.z) === agent.team;
      }
      if (refreshPaintAim) {
        this.paintAim = this.pickNearbyPaintPoint(agent, game);
        this.paintScanT = this.paintAim ? rand(0.35, 0.6) : rand(0.12, 0.22);
      }

      if (this.burstOn && this.paintAim) {
        it.aimPoint.copy(this.paintAim);
        it.shoot = true;
        aimed = true;
      }
    }

    // エイム方向を intent の yaw/pitch に反映
    if (aimed) {
      const dx = it.aimPoint.x - this.eye.x;
      const dy = it.aimPoint.y - this.eye.y;
      const dz = it.aimPoint.z - this.eye.z;
      const hl = Math.hypot(dx, dz) || 1;
      it.aimYaw = Math.atan2(dx, dz);
      it.aimPitch = clamp(Math.atan2(dy, hl), -1.1, 1.1);
    } else if (moveLen > 0.3) {
      it.aimYaw = Math.atan2(it.moveX, it.moveZ);
      it.aimPitch = 0;
    }

    // 自インク上の長距離移動はスイム
    if (!it.shoot && agent.groundTeam === agent.team) {
      const wantTravel = moveLen > 2.5 || this.mode === 'retreat';
      const wantRecover = agent.energy < 40;
      if (wantTravel || wantRecover) it.dash = true;
    }
  }

  /** モード選択 */
  private decide(agent: Agent, game: Game) {
    const timeLeft = game.timeLeft;
    const [c0, c1] = game.coverageCache;
    const myCov = agent.team === 0 ? c0 : c1;
    const opCov = agent.team === 0 ? c1 : c0;
    const behind = opCov - myCov;
    const endgame = timeLeft < 40;
    // 残り2分から連続的に強まる終盤の圧力(0=通常, 1=試合終了間際)
    const endgameUrgency = clamp((120 - timeLeft) / 120, 0, 1);
    const enemy = this.nearestVisibleEnemy(agent, game, 17);
    const energyRatio = agent.energy / 100;
    const onOwnInk = game.paint.floorTeamAt(agent.pos.x, agent.pos.y, agent.pos.z) === agent.team;

    let attackScore = 0;
    if (enemy) {
      const dist = agent.pos.distanceTo(enemy.pos);
      attackScore =
        this.aggression * (agent.hp / 100) * (1.5 - dist / 18) +
        (enemy.hp < 55 ? 0.35 : 0) +
        (enemy.isPlayer ? 0.1 : 0);
      attackScore -= endgameUrgency * 0.5;
      // インクが少ないと実際には撃てないので、攻撃の魅力を下げる
      attackScore *= clamp(energyRatio / 0.3, 0.4, 1);
    }
    const retreatScore = agent.hp < 34 ? 1.5 : agent.hp < 55 && enemy ? 0.5 : 0;
    // インク切れ寸前で自陣の上にいなければ、いったん引いてスイム回復する
    const recoverScore = !onOwnInk && energyRatio < 0.22 ? 1.2 + (0.22 - energyRatio) * 2.5 : 0;
    // 自陣が塗り返されているか
    const homeRatio = this.sampleHomeInvasion(agent, game);
    const defendScore = homeRatio * 2.2 + endgameUrgency * (homeRatio > 0.1 ? 1.0 : 0.2);
    let paintScore = 0.85 + Math.max(0, behind) * 0.025 + endgameUrgency * 0.75;
    let highScore = 0;
    if (!endgame && agent.pos.y < 1.4) {
      // 自陣が押されているほど、高所からの一掃を優先したくなる
      highScore = 0.3 + Math.max(0, behind) * 0.035 + (Math.random() < 0.3 ? 0.45 : 0);
    }

    const best = Math.max(attackScore, retreatScore, recoverScore, defendScore, paintScore, highScore);
    if (best === retreatScore && retreatScore > 0) {
      this.mode = 'retreat';
      this.target = null;
      this.paintGoal = this.pickRetreatPoint(agent, game);
      this.path = [];
      this.repathT = 0;
    } else if (best === recoverScore && recoverScore > 0) {
      this.mode = 'recover';
      this.target = null;
      this.paintGoal = this.pickRetreatPoint(agent, game);
      this.path = [];
      this.repathT = 0;
    } else if (best === attackScore && enemy) {
      this.mode = 'attack';
      this.target = enemy;
    } else if (best === defendScore && defendScore > 0.4) {
      this.mode = 'defend';
      this.target = null;
      this.paintGoal = this.pickPaintPoint(agent, game, 'home');
      this.path = [];
      this.repathT = 0;
    } else if (best === highScore && highScore > 0) {
      this.mode = 'highground';
      this.target = null;
      this.paintGoal = this.pickHighPoint(agent, game);
      this.path = [];
      this.repathT = 0;
    } else {
      this.mode = 'paint';
      this.target = null;
      if (!this.paintGoal || Math.random() < 0.4) {
        this.paintGoal = this.pickPaintPoint(agent, game, endgame ? 'center' : 'frontier');
        this.path = [];
        this.repathT = 0;
      }
    }
  }

  private setPath(agent: Agent, game: Game, tx: number, tz: number) {
    this.path = game.nav.findPath(agent.pos.x, agent.pos.z, tx, tz);
    this.pathI = 0;
  }

  private nearestVisibleEnemy(agent: Agent, game: Game, maxDist: number): Agent | null {
    let best: Agent | null = null;
    let bestD = maxDist;
    agent.eyePos(this.eye);
    for (const a of game.agents) {
      if (a.team === agent.team || !a.alive || a.invulnT > 0) continue;
      const d = agent.pos.distanceTo(a.pos);
      if (d < bestD && game.world.los(this.eye, a.eyePos(this.tEye))) {
        best = a;
        bestD = d;
      }
    }
    return best;
  }

  /** 周囲2〜6mの複数方向から、自チーム色でない床を次の塗り先に選ぶ */
  private pickNearbyPaintPoint(agent: Agent, game: Game): THREE.Vector3 | null {
    const minDistSq = 2 * 2;
    const maxDistSq = 6 * 6;
    const cells = game.nav.sampleCells(48, (_, x, z, y) => {
      const dx = x - agent.pos.x;
      const dz = z - agent.pos.z;
      const distSq = dx * dx + dz * dz;
      return distSq >= minDistSq && distSq <= maxDistSq && Math.abs(y - agent.pos.y) <= 1.6;
    });
    const v = new THREE.Vector3();
    let best: THREE.Vector3 | null = null;
    let bestScore = -Infinity;
    for (const c of cells) {
      game.nav.cellCenter(c, v);
      const t = game.paint.floorTeamAt(v.x, v.y, v.z);
      if (t === agent.team) continue;
      const dx = v.x - agent.pos.x;
      const dz = v.z - agent.pos.z;
      let score = t === 1 - agent.team ? 3.0 : 2.4;
      score += Math.hypot(dx, dz) * 0.04 + Math.random() * 0.55;
      // 同じ一点に居座らず、スキャンごとに周囲へ照準を散らす
      if (this.paintAim) score += Math.min(4, v.distanceTo(this.paintAim)) * 0.16;
      if (score > bestScore) {
        bestScore = score;
        best = v.clone();
      }
    }
    return best;
  }

  /** 自陣側が敵色に塗られている割合の推定 */
  private sampleHomeInvasion(agent: Agent, game: Game): number {
    const homeSign = agent.team === 0 ? -1 : 1;
    let enemyCells = 0;
    let total = 0;
    const cells = game.nav.sampleCells(14, (_, x) => x * homeSign > 6);
    const v = new THREE.Vector3();
    for (const c of cells) {
      game.nav.cellCenter(c, v);
      const t = game.paint.floorTeamAt(v.x, v.y, v.z);
      total++;
      if (t === 1 - agent.team) enemyCells++;
    }
    return total > 0 ? enemyCells / total : 0;
  }

  private pickPaintPoint(agent: Agent, game: Game, zone: 'frontier' | 'center' | 'home'): THREE.Vector3 | null {
    const homeSign = agent.team === 0 ? -1 : 1;
    const v = new THREE.Vector3();
    let filter: (idx: number, x: number, z: number, y: number) => boolean;
    if (zone === 'home') filter = (_, x) => x * homeSign > 4;
    else if (zone === 'center') filter = (_, x) => Math.abs(x) < 16;
    else filter = () => true;
    const cells = game.nav.sampleCells(24, filter);
    let best: THREE.Vector3 | null = null;
    let bestScore = -Infinity;
    for (const c of cells) {
      game.nav.cellCenter(c, v);
      const t = game.paint.floorTeamAt(v.x, v.y, v.z);
      let score = 0;
      if (t === -1) score += 2.1;
      else if (t === 1 - agent.team) score += 2.5;
      else score -= 1.2;
      score -= agent.pos.distanceTo(v) * 0.055;
      score += v.y * 0.12;
      // 担当レーンへの偏り
      score += (Math.sign(v.z) === this.lane ? 0.5 : 0) - Math.abs(v.z - this.lane * 12) * 0.012;
      if (zone === 'frontier') score -= Math.abs(v.x - homeSign * -4) * 0.02; // 前線へ
      if (score > bestScore) {
        bestScore = score;
        best = v.clone();
      }
    }
    return best;
  }

  private pickHighPoint(agent: Agent, game: Game): THREE.Vector3 | null {
    const v = new THREE.Vector3();
    const cells = game.nav.sampleCells(20, (_, __, ___, y) => y > 1.4);
    let best: THREE.Vector3 | null = null;
    let bestScore = -Infinity;
    for (const c of cells) {
      game.nav.cellCenter(c, v);
      const score = v.y * 0.6 - agent.pos.distanceTo(v) * 0.06 - Math.abs(v.x) * 0.02;
      if (score > bestScore) {
        bestScore = score;
        best = v.clone();
      }
    }
    return best;
  }

  private pickRetreatPoint(agent: Agent, game: Game): THREE.Vector3 {
    const homeSign = agent.team === 0 ? -1 : 1;
    const v = new THREE.Vector3();
    const cells = game.nav.sampleCells(14, (_, x) => x * homeSign > 10);
    let best: THREE.Vector3 | null = null;
    let bestScore = -Infinity;
    for (const c of cells) {
      game.nav.cellCenter(c, v);
      let score = agent.pos.distanceTo(v) * -0.02;
      const t = game.paint.floorTeamAt(v.x, v.y, v.z);
      if (t === agent.team) score += 1.0;
      if (score > bestScore) {
        bestScore = score;
        best = v.clone();
      }
    }
    return best ?? agent.spawn.pos.clone();
  }
}
