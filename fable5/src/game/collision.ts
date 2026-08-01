import * as THREE from 'three';

export interface ColBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
  /** navグリッドの地面候補になるか（床/台/箱 = true, 壁 = false） */
  walkable: boolean;
}

export interface MoveResult {
  onGround: boolean;
  steppedUp: boolean;
  landed: boolean;
  landSpeed: number;
}

const STEP_UP = 0.56;

export class CollisionWorld {
  boxes: ColBox[] = [];
  bounds = { minX: -30.4, maxX: 30.4, minZ: -22.3, maxZ: 22.3 };

  addBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, walkable = false): ColBox {
    const b: ColBox = {
      min: new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      max: new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
      walkable,
    };
    this.boxes.push(b);
    return b;
  }

  /** 円柱キャラクタの移動と衝突解決。posは足元中心。 */
  moveCharacter(
    pos: THREE.Vector3, vel: THREE.Vector3, dt: number,
    radius: number, height: number, wasGrounded: boolean
  ): MoveResult {
    const res: MoveResult = { onGround: false, steppedUp: false, landed: false, landSpeed: 0 };

    // 水平: 軸ごとに解決すると安定する
    for (const axis of ['x', 'z'] as const) {
      pos[axis] += vel[axis] * dt;
      for (const b of this.boxes) {
        if (pos.x + radius <= b.min.x || pos.x - radius >= b.max.x) continue;
        if (pos.z + radius <= b.min.z || pos.z - radius >= b.max.z) continue;
        if (pos.y + height <= b.min.y + 1e-4 || pos.y >= b.max.y - 1e-4) continue;
        const rise = b.max.y - pos.y;
        if (rise > 0 && rise <= STEP_UP && wasGrounded && this.clearAbove(pos, b.max.y, radius, height)) {
          pos.y = b.max.y + 1e-4;
          res.steppedUp = true;
          continue;
        }
        const mid = (b.min[axis] + b.max[axis]) / 2;
        pos[axis] = pos[axis] < mid ? b.min[axis] - radius : b.max[axis] + radius;
        vel[axis] = 0;
      }
    }

    // 垂直
    const prevY = pos.y;
    pos.y += vel.y * dt;
    if (vel.y <= 0) {
      let best = -Infinity;
      for (const b of this.boxes) {
        if (pos.x + radius * 0.8 <= b.min.x || pos.x - radius * 0.8 >= b.max.x) continue;
        if (pos.z + radius * 0.8 <= b.min.z || pos.z - radius * 0.8 >= b.max.z) continue;
        if (prevY >= b.max.y - 0.02 && pos.y <= b.max.y && b.max.y > best) best = b.max.y;
      }
      if (best > -Infinity) {
        pos.y = best;
        if (vel.y < -3) {
          res.landed = true;
          res.landSpeed = -vel.y;
        }
        vel.y = 0;
        res.onGround = true;
      }
    } else {
      for (const b of this.boxes) {
        if (pos.x + radius * 0.8 <= b.min.x || pos.x - radius * 0.8 >= b.max.x) continue;
        if (pos.z + radius * 0.8 <= b.min.z || pos.z - radius * 0.8 >= b.max.z) continue;
        if (prevY + height <= b.min.y + 0.02 && pos.y + height >= b.min.y) {
          pos.y = b.min.y - height;
          vel.y = 0;
        }
      }
    }

    // 安全クランプ（境界外落下防止の最終保険）
    const bd = this.bounds;
    pos.x = Math.min(bd.maxX - radius, Math.max(bd.minX + radius, pos.x));
    pos.z = Math.min(bd.maxZ - radius, Math.max(bd.minZ + radius, pos.z));
    return res;
  }

  private clearAbove(pos: THREE.Vector3, newY: number, radius: number, height: number): boolean {
    for (const b of this.boxes) {
      if (pos.x + radius <= b.min.x || pos.x - radius >= b.max.x) continue;
      if (pos.z + radius <= b.min.z || pos.z - radius >= b.max.z) continue;
      if (b.min.y < newY + height && b.max.y > newY + 0.05) return false;
    }
    return true;
  }

  /** 線分と箱群の交差（弾丸/カメラ用）。刻み幅マーチ。 */
  segmentHit(
    p0: THREE.Vector3, p1: THREE.Vector3, inflate = 0.04
  ): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return null;
    const steps = Math.max(1, Math.ceil(len / 0.12));
    let px = p0.x, py = p0.y, pz = p0.z;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = p0.x + dx * t, y = p0.y + dy * t, z = p0.z + dz * t;
      for (const b of this.boxes) {
        if (
          x > b.min.x - inflate && x < b.max.x + inflate &&
          y > b.min.y - inflate && y < b.max.y + inflate &&
          z > b.min.z - inflate && z < b.max.z + inflate
        ) {
          const n = new THREE.Vector3();
          if (py >= b.max.y - 0.02) n.set(0, 1, 0);
          else if (py <= b.min.y + 0.02) n.set(0, -1, 0);
          else if (px <= b.min.x + inflate) n.set(-1, 0, 0);
          else if (px >= b.max.x - inflate) n.set(1, 0, 0);
          else if (pz <= b.min.z + inflate) n.set(0, 0, -1);
          else n.set(0, 0, 1);
          return { point: new THREE.Vector3(px, py, pz), normal: n };
        }
      }
      px = x; py = y; pz = z;
    }
    return null;
  }

  /** 視線が通るか（AI用の粗いチェック） */
  los(p0: THREE.Vector3, p1: THREE.Vector3): boolean {
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
    const len = Math.hypot(dx, dy, dz);
    const steps = Math.max(1, Math.ceil(len / 0.4));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = p0.x + dx * t, y = p0.y + dy * t, z = p0.z + dz * t;
      for (const b of this.boxes) {
        if (x > b.min.x && x < b.max.x && y > b.min.y && y < b.max.y && z > b.min.z && z < b.max.z)
          return false;
      }
    }
    return true;
  }

  /** カメラの壁めり込み回避: fromからtoへ球半径rで進める最遠点 */
  clampCamera(from: THREE.Vector3, to: THREE.Vector3, r: number, out: THREE.Vector3): THREE.Vector3 {
    const N = 24;
    out.copy(to);
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const z = from.z + (to.z - from.z) * t;
      for (const b of this.boxes) {
        if (
          x > b.min.x - r && x < b.max.x + r &&
          y > b.min.y - r && y < b.max.y + r &&
          z > b.min.z - r && z < b.max.z + r
        ) {
          const tSafe = (i - 1) / N;
          out.set(
            from.x + (to.x - from.x) * tSafe,
            from.y + (to.y - from.y) * tSafe,
            from.z + (to.z - from.z) * tSafe
          );
          return out;
        }
      }
    }
    return out;
  }

  /** 上からの地面高さ（点） */
  groundHeight(x: number, z: number, belowY = 100): number {
    let best = -Infinity;
    for (const b of this.boxes) {
      if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) continue;
      if (b.max.y <= belowY && b.max.y > best) best = b.max.y;
    }
    return best;
  }
}
