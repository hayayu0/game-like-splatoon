import * as THREE from 'three';
import { CollisionWorld } from './collision';

/** AI用の歩行可能グリッド + A* */
export class NavGrid {
  cell = 1.0;
  ox = 0;
  oz = 0;
  w = 0;
  h = 0;
  height!: Float32Array;
  walk!: Uint8Array;
  private world!: CollisionWorld;

  build(world: CollisionWorld) {
    this.world = world;
    const b = world.bounds;
    this.ox = b.minX;
    this.oz = b.minZ;
    this.w = Math.ceil((b.maxX - b.minX) / this.cell);
    this.h = Math.ceil((b.maxZ - b.minZ) / this.cell);
    this.height = new Float32Array(this.w * this.h).fill(-Infinity);
    this.walk = new Uint8Array(this.w * this.h);
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const cx = this.ox + (i + 0.5) * this.cell;
        const cz = this.oz + (j + 0.5) * this.cell;
        let ground = -Infinity;
        for (const box of world.boxes) {
          if (!box.walkable) continue;
          if (cx < box.min.x + 0.2 || cx > box.max.x - 0.2) continue;
          if (cz < box.min.z + 0.2 || cz > box.max.z - 0.2) continue;
          if (box.max.y > ground) ground = box.max.y;
        }
        if (ground === -Infinity) continue;
        // 頭上クリアランス
        let blocked = false;
        for (const box of world.boxes) {
          if (cx < box.min.x - 0.15 || cx > box.max.x + 0.15) continue;
          if (cz < box.min.z - 0.15 || cz > box.max.z + 0.15) continue;
          if (box.min.y < ground + 1.9 && box.max.y > ground + 0.3) {
            blocked = true;
            break;
          }
        }
        const idx = j * this.w + i;
        this.height[idx] = ground;
        this.walk[idx] = blocked ? 0 : 1;
      }
    }
  }

  cellIndexAt(x: number, z: number): number {
    const i = Math.floor((x - this.ox) / this.cell);
    const j = Math.floor((z - this.oz) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  cellCenter(idx: number, out = new THREE.Vector3()): THREE.Vector3 {
    const i = idx % this.w;
    const j = Math.floor(idx / this.w);
    return out.set(this.ox + (i + 0.5) * this.cell, this.height[idx], this.oz + (j + 0.5) * this.cell);
  }

  /** 最寄りの歩行可能セル（スパイラル探索） */
  nearestWalkable(x: number, z: number): number {
    const ci = Math.floor((x - this.ox) / this.cell);
    const cj = Math.floor((z - this.oz) / this.cell);
    for (let r = 0; r < 8; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
          const idx = j * this.w + i;
          if (this.walk[idx]) return idx;
        }
      }
    }
    return -1;
  }

  /** ランダムな歩行可能セルをn個サンプル */
  sampleCells(n: number, filter?: (idx: number, x: number, z: number, y: number) => boolean): number[] {
    const out: number[] = [];
    for (let t = 0; t < n * 6 && out.length < n; t++) {
      const idx = (Math.random() * this.w * this.h) | 0;
      if (!this.walk[idx]) continue;
      const i = idx % this.w, j = Math.floor(idx / this.w);
      const x = this.ox + (i + 0.5) * this.cell;
      const z = this.oz + (j + 0.5) * this.cell;
      if (filter && !filter(idx, x, z, this.height[idx])) continue;
      out.push(idx);
    }
    return out;
  }

  /** A*経路探索。世界座標の経由点列を返す（目的地含む）。 */
  findPath(sx: number, sz: number, tx: number, tz: number): THREE.Vector3[] {
    const start = this.nearestWalkable(sx, sz);
    const goal = this.nearestWalkable(tx, tz);
    if (start < 0 || goal < 0) return [];
    if (start === goal) return [this.cellCenter(goal)];
    const N = this.w * this.h;
    const g = new Float32Array(N).fill(Infinity);
    const f = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    g[start] = 0;
    const gi = goal % this.w, gj = Math.floor(goal / this.w);
    const hFn = (idx: number) => {
      const i = idx % this.w, j = Math.floor(idx / this.w);
      return Math.hypot(i - gi, j - gj);
    };
    f[start] = hFn(start);
    const open: number[] = [start];
    let iter = 0;
    while (open.length && iter++ < 5000) {
      // 最小fを取り出し
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
      const cur = open[bi];
      open.splice(bi, 1);
      if (cur === goal) return this.reconstruct(came, cur);
      closed[cur] = 1;
      const ci = cur % this.w, cj = Math.floor(cur / this.w);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= this.w || nj >= this.h) continue;
          const nIdx = nj * this.w + ni;
          if (!this.walk[nIdx] || closed[nIdx]) continue;
          // 斜め移動は両隣が通れる場合のみ
          if (di !== 0 && dj !== 0) {
            const a = cj * this.w + ni, b = nj * this.w + ci;
            if (!this.walk[a] || !this.walk[b]) continue;
          }
          const dh = this.height[nIdx] - this.height[cur];
          if (dh > 1.55) continue; // ジャンプで届かない
          let cost = di !== 0 && dj !== 0 ? 1.414 : 1;
          if (dh > 0.56) cost += dh * 1.6; // 要ジャンプはやや回避
          if (dh < -3.5) cost += 1.5; // 大落下は少し嫌う
          const ng = g[cur] + cost;
          if (ng < g[nIdx]) {
            g[nIdx] = ng;
            f[nIdx] = ng + hFn(nIdx);
            came[nIdx] = cur;
            if (!open.includes(nIdx)) open.push(nIdx);
          }
        }
      }
    }
    return [];
  }

  private reconstruct(came: Int32Array, cur: number): THREE.Vector3[] {
    const cells: number[] = [cur];
    while (came[cur] >= 0) {
      cur = came[cur];
      cells.push(cur);
    }
    cells.reverse();
    // 直線で結べる中間点を間引く
    const pts = cells.map((c) => this.cellCenter(c));
    const out: THREE.Vector3[] = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(i + 6, pts.length - 1);
      for (; j > i + 1; j--) {
        const a = pts[i].clone().add(new THREE.Vector3(0, 0.6, 0));
        const b = pts[j].clone().add(new THREE.Vector3(0, 0.6, 0));
        if (Math.abs(pts[i].y - pts[j].y) < 0.3 && this.world.los(a, b)) break;
      }
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
}
