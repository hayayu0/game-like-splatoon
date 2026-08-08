import * as THREE from 'three';
import { INK_HEX, rand } from '../core/utils';

/**
 * ペイントシステム (Canvas 2D 方式)
 * - 2048x2048 のCanvasをアトラスとして持ち、塗り面ごとに矩形領域を割り当てる
 * - 見た目: ふち のやわらかいスプラットスプライトをCanvasに描き、
 *   スロットリングしつつ CanvasTexture としてGPUへアップロードする
 *   (WebGLレンダーターゲット方式はANGLE/D3D11でシャドウマップを壊すため不採用)
 * - 判定: 床面ごとに0.25m格子のCPUグリッドを持ち、塗り面積を増分集計する
 */

const ATLAS = 2048;
const FLOOR_PXM = 26; // px per meter
const WALL_PXM = 14;
const PAD = 6;
const CELL = 0.25;
const SPRITE = 128;
const SPRITE_R = 44; // スプライト内の代表半径(px)

export interface PaintSurface {
  id: number;
  kind: 'floor' | 'wall';
  px: number; py: number; pw: number; ph: number; // アトラス内矩形(px, 原点は左下)
  // floor
  x0: number; z0: number; w: number; d: number; y: number;
  grid: Uint8Array | null;
  gw: number; gd: number;
  // wall
  axis: 'px' | 'nx' | 'pz' | 'nz' | null;
  fixed: number; u0: number; y0: number; hh: number;
}

export class PaintSystem {
  texture: THREE.CanvasTexture;
  surfaces: PaintSurface[] = [];
  floors: PaintSurface[] = [];
  counts = [0, 0];
  totalCells = 0;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sprites: HTMLCanvasElement[][] = [];
  private dirty = false;
  private lastUpload = 0;
  private curX = PAD;
  private curY = PAD;
  private rowH = 0;
  private nextId = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = ATLAS;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.clearRect(0, 0, ATLAS, ATLAS);
    for (let team = 0; team < 2; team++) {
      const list: HTMLCanvasElement[] = [];
      for (let i = 0; i < 6; i++) list.push(makeSplatSprite(INK_HEX[team]));
      this.sprites.push(list);
    }
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
  }

  private alloc(pw: number, ph: number): { px: number; py: number } {
    if (this.curX + pw + PAD > ATLAS) {
      this.curX = PAD;
      this.curY += this.rowH + PAD;
      this.rowH = 0;
    }
    if (this.curY + ph + PAD > ATLAS) {
      console.warn('paint atlas full');
      return { px: 0, py: 0 };
    }
    const r = { px: this.curX, py: this.curY };
    this.curX += pw + PAD;
    this.rowH = Math.max(this.rowH, ph);
    return r;
  }

  addFloor(x0: number, z0: number, w: number, d: number, y: number): PaintSurface {
    const pw = Math.ceil(w * FLOOR_PXM);
    const ph = Math.ceil(d * FLOOR_PXM);
    const { px, py } = this.alloc(pw, ph);
    const gw = Math.ceil(w / CELL);
    const gd = Math.ceil(d / CELL);
    const s: PaintSurface = {
      id: this.nextId++, kind: 'floor', px, py, pw, ph,
      x0, z0, w, d, y, grid: new Uint8Array(gw * gd), gw, gd,
      axis: null, fixed: 0, u0: 0, y0: 0, hh: 0,
    };
    this.surfaces.push(s);
    this.floors.push(s);
    this.totalCells += gw * gd;
    return s;
  }

  addWall(axis: 'px' | 'nx' | 'pz' | 'nz', fixed: number, u0: number, w: number, y0: number, hh: number): PaintSurface {
    const pw = Math.ceil(w * WALL_PXM);
    const ph = Math.ceil(hh * WALL_PXM);
    const { px, py } = this.alloc(pw, ph);
    const s: PaintSurface = {
      id: this.nextId++, kind: 'wall', px, py, pw, ph,
      x0: 0, z0: 0, w, d: 0, y: 0, grid: null, gw: 0, gd: 0,
      axis, fixed, u0, y0, hh,
    };
    this.surfaces.push(s);
    return s;
  }

  /** ジオメトリ構築用: 面のUV矩形 (0..1) */
  uvRect(s: PaintSurface) {
    return {
      u0: s.px / ATLAS, v0: s.py / ATLAS,
      u1: (s.px + s.pw) / ATLAS, v1: (s.py + s.ph) / ATLAS,
    };
  }

  /** 世界座標 → 面ローカルUV(0..1) */
  private worldToFrac(s: PaintSurface, x: number, y: number, z: number): { uf: number; vf: number } {
    let uf = 0, vf = 0;
    if (s.kind === 'floor') {
      uf = (x - s.x0) / s.w;
      vf = 1 - (z - s.z0) / s.d;
    } else {
      switch (s.axis) {
        case 'pz': uf = (x - s.u0) / s.w; break;
        case 'nz': uf = 1 - (x - s.u0) / s.w; break;
        case 'px': uf = 1 - (z - s.u0) / s.w; break;
        case 'nx': uf = (z - s.u0) / s.w; break;
      }
      vf = (y - s.y0) / s.hh;
    }
    return { uf, vf };
  }

  /** 着弾点にペイント。塗り替えた床セル数(=塗りポイント)を返す。 */
  paintAt(team: number, point: THREE.Vector3, normal: THREE.Vector3, radius: number): number {
    if (normal.y > 0.5) {
      const s = this.floorAt(point.x, point.y, point.z, 0.45);
      if (s) return this.splatFloor(team, s, point.x, point.z, radius);
      return 0;
    }
    if (normal.y < -0.5) return 0; // 天井は塗らない
    const axis = Math.abs(normal.x) > Math.abs(normal.z) ? (normal.x > 0 ? 'px' : 'nx') : (normal.z > 0 ? 'pz' : 'nz');
    for (const s of this.surfaces) {
      if (s.kind !== 'wall' || s.axis !== axis) continue;
      const coord = axis === 'px' || axis === 'nx' ? point.x : point.z;
      const span = axis === 'px' || axis === 'nx' ? point.z : point.x;
      if (Math.abs(coord - s.fixed) > 0.35) continue;
      if (span < s.u0 - 0.3 || span > s.u0 + s.w + 0.3) continue;
      if (point.y < s.y0 - 0.3 || point.y > s.y0 + s.hh + 0.3) continue;
      this.drawSplat(team, s, point, radius * 0.8);
      return 0;
    }
    return 0;
  }

  /** 指定座標を含む床面（高さが最も近いもの） */
  floorAt(x: number, y: number, z: number, tol = 0.5): PaintSurface | null {
    let best: PaintSurface | null = null;
    let bestDy = Infinity;
    for (const s of this.floors) {
      if (x < s.x0 || x > s.x0 + s.w || z < s.z0 || z > s.z0 + s.d) continue;
      const dy = Math.abs(s.y - y);
      if (dy < tol && dy < bestDy) {
        best = s;
        bestDy = dy;
      }
    }
    return best;
  }

  private splatFloor(team: number, s: PaintSurface, x: number, z: number, radius: number): number {
    this.drawSplat(team, s, new THREE.Vector3(x, s.y, z), radius);
    // CPUグリッド更新（スプライトの見た目の広がりに合わせる）
    const rr = radius * 1.0;
    const g = s.grid!;
    const gi0 = Math.max(0, Math.floor((x - rr - s.x0) / CELL));
    const gi1 = Math.min(s.gw - 1, Math.floor((x + rr - s.x0) / CELL));
    const gj0 = Math.max(0, Math.floor((z - rr - s.z0) / CELL));
    const gj1 = Math.min(s.gd - 1, Math.floor((z + rr - s.z0) / CELL));
    let gained = 0;
    const v = team + 1;
    for (let j = gj0; j <= gj1; j++) {
      const cz = s.z0 + (j + 0.5) * CELL;
      for (let i = gi0; i <= gi1; i++) {
        const cx = s.x0 + (i + 0.5) * CELL;
        const dx = cx - x, dz = cz - z;
        if (dx * dx + dz * dz > rr * rr) continue;
        const idx = j * s.gw + i;
        const old = g[idx];
        if (old === v) continue;
        if (old > 0) this.counts[old - 1]--;
        this.counts[team]++;
        g[idx] = v;
        gained++;
      }
    }
    return gained;
  }

  /** Canvasへスプラットを描く（面の矩形でクリップ） */
  private drawSplat(team: number, s: PaintSurface, p: THREE.Vector3, radius: number) {
    const { uf, vf } = this.worldToFrac(s, p.x, p.y, p.z);
    // CanvasはY下向き, アトラスpyは下端基準 → canvas上のy = ATLAS - (py + ph) + (1-vf)*ph
    const rx = s.px;
    const ry = ATLAS - s.py - s.ph;
    const cx = rx + uf * s.pw;
    const cy = ry + (1 - vf) * s.ph;
    const pxm = s.kind === 'floor' ? FLOOR_PXM : WALL_PXM;
    const rpx = radius * pxm;
    const scale = rpx / SPRITE_R;
    const sprite = this.sprites[team][(Math.random() * this.sprites[team].length) | 0];
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, ry, s.pw, s.ph);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(rand(Math.PI * 2));
    const half = (SPRITE / 2) * scale;
    ctx.drawImage(sprite, -half, -half, SPRITE * scale, SPRITE * scale);
    ctx.restore();
    this.dirty = true;
  }

  /** 足元のインク色: -1=未塗装, 0/1=チーム */
  floorTeamAt(x: number, y: number, z: number): number {
    const s = this.floorAt(x, y, z, 0.5);
    if (!s) return -1;
    const i = Math.floor((x - s.x0) / CELL);
    const j = Math.floor((z - s.z0) / CELL);
    if (i < 0 || j < 0 || i >= s.gw || j >= s.gd) return -1;
    const v = s.grid![j * s.gw + i];
    return v - 1;
  }

  coverage(): [number, number] {
    const t = this.totalCells || 1;
    return [(this.counts[0] / t) * 100, (this.counts[1] / t) * 100];
  }

  /** 変更をGPUへ反映（スロットリング付き）。毎フレーム呼ぶ。 */
  commit(now: number) {
    if (!this.dirty) return;
    if (now - this.lastUpload < 0.09) return;
    this.lastUpload = now;
    this.dirty = false;
    this.texture.needsUpdate = true;
  }

  /** 全消去（試合リセット用） */
  clearAll() {
    this.ctx.clearRect(0, 0, ATLAS, ATLAS);
    for (const s of this.floors) s.grid!.fill(0);
    this.counts = [0, 0];
    this.dirty = true;
    this.texture.needsUpdate = true;
  }

  /** 矩形範囲をチーム色で塗りつぶす（スポーン地点用） */
  prepaintRect(team: number, x0: number, z0: number, x1: number, z1: number, y: number) {
    const step = 1.1;
    for (let x = x0 + 0.6; x < x1; x += step) {
      for (let z = z0 + 0.6; z < z1; z += step) {
        const s = this.floorAt(x, y, z, 0.6);
        if (s) this.splatFloor(team, s, x + rand(-0.2, 0.2), z + rand(-0.2, 0.2), 1.15);
      }
    }
  }
}

/** ふちのやわらかい不規則スプラットスプライトを生成 */
function makeSplatSprite(colorHex: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE;
  const ctx = c.getContext('2d')!;
  const cx = SPRITE / 2, cy = SPRITE / 2;
  const blob = (bx: number, by: number, r: number) => {
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, colorHex);
    g.addColorStop(0.78, colorHex);
    g.addColorStop(1, colorHex + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(cx, cy, SPRITE * 0.31);
  const lobes = 5 + ((Math.random() * 4) | 0);
  for (let i = 0; i < lobes; i++) {
    const a = rand(Math.PI * 2);
    const d = rand(SPRITE * 0.1, SPRITE * 0.26);
    blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rand(SPRITE * 0.09, SPRITE * 0.17));
  }
  const drops = 6 + ((Math.random() * 5) | 0);
  for (let i = 0; i < drops; i++) {
    const a = rand(Math.PI * 2);
    const d = rand(SPRITE * 0.33, SPRITE * 0.46);
    blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rand(SPRITE * 0.02, SPRITE * 0.05));
  }
  return c;
}
