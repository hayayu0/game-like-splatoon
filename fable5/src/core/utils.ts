import * as THREE from 'three';

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** フレームレート非依存の指数補間 */
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 1, b?: number) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randSpread = (r: number) => (Math.random() * 2 - 1) * r;

/** 角度差を [-PI, PI] に正規化 */
export const angleDelta = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** チームインク色（linear計算はthree側で行うのでsRGB指定） */
export const INK_HEX = ['#ff8c1a', '#8a3cff'];
export const INK_HI_HEX = ['#ffb02e', '#b06bff'];
export const INK_COLORS = INK_HEX.map((h) => new THREE.Color(h));
export const INK_HI_COLORS = INK_HI_HEX.map((h) => new THREE.Color(h));

/** yaw(0=+Z, +yaw=+X側) から前方ベクトル */
export const dirFromYawPitch = (yaw: number, pitch: number, out = new THREE.Vector3()) => {
  const cp = Math.cos(pitch);
  return out.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
};
export const rightFromYaw = (yaw: number, out = new THREE.Vector3()) =>
  out.set(-Math.cos(yaw), 0, Math.sin(yaw));
