import * as THREE from 'three';
import { clamp, INK_COLORS, INK_HI_COLORS } from '../core/utils';

const MAX_POINTS = 30;
const LIFE = 0.72;
const MIN_STEP_SQ = 0.11 * 0.11;

interface TrailPoint {
  pos: THREE.Vector3;
  age: number;
  width: number;
}

/** 1 Agentにつき1 Meshだけで描く、頂点更新式の移動リボン */
export class Trail {
  readonly mesh: THREE.Mesh;
  private points: TrailPoint[] = [];
  private free: TrailPoint[] = [];
  private positions = new Float32Array(MAX_POINTS * 2 * 3);
  private alphas = new Float32Array(MAX_POINTS * 2);
  private geometry: THREE.BufferGeometry;
  private side = new THREE.Vector3();
  private tangent = new THREE.Vector3();

  constructor(team: number) {
    this.geometry = new THREE.BufferGeometry();
    const colors = new Float32Array(MAX_POINTS * 2 * 3);
    const ink = INK_COLORS[team];
    const hi = INK_HI_COLORS[team];
    for (let i = 0; i < MAX_POINTS; i++) {
      colors.set([ink.r, ink.g, ink.b], i * 6);
      colors.set([hi.r, hi.g, hi.b], i * 6 + 3);
    }

    const indices = new Uint16Array((MAX_POINTS - 1) * 6);
    for (let i = 0; i < MAX_POINTS - 1; i++) {
      const v = i * 2;
      indices.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6);
    }

    const posAttr = new THREE.BufferAttribute(this.positions, 3);
    const alphaAttr = new THREE.BufferAttribute(this.alphas, 1);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', posAttr);
    this.geometry.setAttribute('aAlpha', alphaAttr);
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.geometry.setDrawRange(0, 0);

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aColor;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          if (vAlpha < 0.01) discard;
          gl_FragColor = vec4(vColor * 1.8, vAlpha);
        }
      `,
    });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
  }

  clear() {
    this.free.push(...this.points);
    this.points.length = 0;
    this.geometry.setDrawRange(0, 0);
    this.mesh.visible = false;
  }

  update(dt: number, position: THREE.Vector3, active: boolean, width: number) {
    for (const point of this.points) point.age += dt;
    while (this.points.length > 0 && this.points[0].age >= LIFE) this.free.push(this.points.shift()!);

    if (active) {
      const last = this.points[this.points.length - 1];
      const dx = last ? position.x - last.pos.x : 0;
      const dy = last ? position.y + 0.12 - last.pos.y : 0;
      const dz = last ? position.z - last.pos.z : 0;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (last && distSq > 3 * 3) this.clear();
      if (!last || distSq >= MIN_STEP_SQ) {
        const point = this.free.pop() ?? { pos: new THREE.Vector3(), age: 0, width };
        point.pos.set(position.x, position.y + 0.12, position.z);
        point.age = 0;
        point.width = width;
        this.points.push(point);
        if (this.points.length > MAX_POINTS) this.free.push(this.points.shift()!);
      }
    }

    const count = this.points.length;
    this.mesh.visible = count >= 2;
    this.geometry.setDrawRange(0, Math.max(0, count - 1) * 6);
    if (count < 2) return;

    for (let i = 0; i < count; i++) {
      const point = this.points[i];
      const prev = this.points[Math.max(0, i - 1)].pos;
      const next = this.points[Math.min(count - 1, i + 1)].pos;
      this.tangent.copy(next).sub(prev);
      this.tangent.y = 0;
      if (this.tangent.lengthSq() < 1e-5) this.tangent.set(0, 0, 1);
      else this.tangent.normalize();
      this.side.set(-this.tangent.z, 0, this.tangent.x);

      const life = clamp(1 - point.age / LIFE, 0, 1);
      const tail = clamp(i / 3, 0, 1);
      const head = i === count - 1 ? 0.28 : 1;
      const alpha = life * tail * head * 0.72;
      const halfWidth = point.width * (0.32 + life * 0.68);
      const base = i * 6;
      this.positions[base] = point.pos.x + this.side.x * halfWidth;
      this.positions[base + 1] = point.pos.y;
      this.positions[base + 2] = point.pos.z + this.side.z * halfWidth;
      this.positions[base + 3] = point.pos.x - this.side.x * halfWidth;
      this.positions[base + 4] = point.pos.y;
      this.positions[base + 5] = point.pos.z - this.side.z * halfWidth;
      this.alphas[i * 2] = alpha * 0.72;
      this.alphas[i * 2 + 1] = alpha;
    }

    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }
}
