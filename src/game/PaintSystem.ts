import * as THREE from 'three';
import { ARENA, OBSTACLES } from './config';

const CANVAS = 1024; // 塗りテクスチャの解像度
const GRID = 256; // 所有権グリッドの解像度（面積計算・足元判定用）

// 所有権グリッドの値
const NONE = 0;
const BLOCKED = 3; // 遮蔽物の足元（塗れない / 集計から除外）

/**
 * 床の塗り状態を管理する。
 * - 見た目: Canvas を CanvasTexture として床マテリアルに貼る
 * - ゲーム判定: 低解像度の所有権グリッド(Uint8Array)で面積と足元のインク色を管理
 *
 * ワールド座標 (x, z) と Canvas/グリッド座標の対応:
 *   px = (0.5 + x / (2*half)) * size
 *   py = (0.5 + z / (2*half)) * size
 * 床メッシュは rotation.x = -PI/2、テクスチャは flipY=true(既定) を前提に導出。
 */
export class PaintSystem {
  readonly texture: THREE.CanvasTexture;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private owner: Uint8Array;
  private dirty = false;
  private paintableTotal = 0;

  // 直近の集計結果（セル数）
  private count0 = 0;
  private count1 = 0;

  constructor(private inkCss: string[]) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS;
    this.canvas.height = CANVAS;
    this.ctx = this.canvas.getContext('2d')!;
    this.owner = new Uint8Array(GRID * GRID);

    this.drawBase();
    this.markObstacles();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.needsUpdate = true;

    this.computePaintableTotal();
  }

  // ---- 座標変換 ----
  private toCanvas(x: number, z: number): [number, number] {
    const px = (0.5 + x / (2 * ARENA.half)) * CANVAS;
    const py = (0.5 + z / (2 * ARENA.half)) * CANVAS;
    return [px, py];
  }

  private toGrid(x: number, z: number): [number, number] {
    let gx = Math.floor((0.5 + x / (2 * ARENA.half)) * GRID);
    let gz = Math.floor((0.5 + z / (2 * ARENA.half)) * GRID);
    gx = Math.max(0, Math.min(GRID - 1, gx));
    gz = Math.max(0, Math.min(GRID - 1, gz));
    return [gx, gz];
  }

  // ---- 初期描画 ----
  private drawBase() {
    const ctx = this.ctx;
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(0, 0, CANVAS, CANVAS);

    // 2ワールド単位ごとのグリッド線（うっすら）
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2;
    const step = (CANVAS / (2 * ARENA.half)) * 2;
    for (let p = 0; p <= CANVAS; p += step) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, CANVAS);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(CANVAS, p);
      ctx.stroke();
    }
  }

  private markObstacles() {
    for (const o of OBSTACLES) {
      const xs = [o.x - o.w / 2, o.x + o.w / 2];
      const zs = [o.z - o.d / 2, o.z + o.d / 2];

      // グリッドを BLOCKED に
      const corners = [
        this.toGrid(xs[0], zs[0]),
        this.toGrid(xs[1], zs[1]),
      ];
      const gx0 = Math.min(corners[0][0], corners[1][0]);
      const gx1 = Math.max(corners[0][0], corners[1][0]);
      const gz0 = Math.min(corners[0][1], corners[1][1]);
      const gz1 = Math.max(corners[0][1], corners[1][1]);
      for (let gz = gz0; gz <= gz1; gz++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          this.owner[gz * GRID + gx] = BLOCKED;
        }
      }

      // Canvas にも暗い足元を描く
      const [cx0, cy0] = this.toCanvas(xs[0], zs[0]);
      const [cx1, cy1] = this.toCanvas(xs[1], zs[1]);
      this.ctx.fillStyle = '#23272e';
      this.ctx.fillRect(
        Math.min(cx0, cx1),
        Math.min(cy0, cy1),
        Math.abs(cx1 - cx0),
        Math.abs(cy1 - cy0),
      );
    }
  }

  private computePaintableTotal() {
    let total = 0;
    for (let i = 0; i < this.owner.length; i++) {
      if (this.owner[i] !== BLOCKED) total++;
    }
    this.paintableTotal = total;
  }

  // ---- 塗り ----
  /** ワールド座標 (x,z) に半径 radius のインクを team(0/1) の色で塗る */
  paint(x: number, z: number, radius: number, team: number) {
    // 見た目
    const [cx, cy] = this.toCanvas(x, z);
    const rPix = (radius / (2 * ARENA.half)) * CANVAS;
    this.ctx.fillStyle = this.inkCss[team];
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, rPix, 0, Math.PI * 2);
    this.ctx.fill();
    this.dirty = true;

    // 所有権グリッド
    const [gx0, gz0] = this.toGrid(x, z);
    const rCells = (radius / (2 * ARENA.half)) * GRID;
    const r = Math.ceil(rCells);
    const r2 = rCells * rCells;
    const val = team + 1; // 0->1, 1->2
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r2) continue;
        const gx = gx0 + dx;
        const gz = gz0 + dz;
        if (gx < 0 || gx >= GRID || gz < 0 || gz >= GRID) continue;
        const idx = gz * GRID + gx;
        if (this.owner[idx] === BLOCKED) continue;
        this.owner[idx] = val;
      }
    }
  }

  /** 足元のインク所有権を返す: 0=なし, 1=team0, 2=team1, 3=遮蔽物 */
  ownerAt(x: number, z: number): number {
    const [gx, gz] = this.toGrid(x, z);
    return this.owner[gz * GRID + gx];
  }

  /** テクスチャ更新（描画があったフレームだけアップロード） */
  update() {
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }

  /** 面積集計（毎フレームではなく間引いて呼ぶ） */
  computeCoverage() {
    let c0 = 0;
    let c1 = 0;
    for (let i = 0; i < this.owner.length; i++) {
      const v = this.owner[i];
      if (v === 1) c0++;
      else if (v === 2) c1++;
    }
    this.count0 = c0;
    this.count1 = c1;
  }

  get pct0(): number {
    return this.paintableTotal ? this.count0 / this.paintableTotal : 0;
  }
  get pct1(): number {
    return this.paintableTotal ? this.count1 / this.paintableTotal : 0;
  }
}
