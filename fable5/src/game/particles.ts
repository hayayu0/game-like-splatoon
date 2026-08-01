import * as THREE from 'three';
import { rand, randSpread } from '../core/utils';

const N = 1600;

/** CPUシミュレーションのポイントパーティクル（インク飛沫/土煙/紙吹雪など兼用） */
export class Particles {
  private pos = new Float32Array(N * 3);
  private vel = new Float32Array(N * 3);
  private col = new Float32Array(N * 3);
  private size = new Float32Array(N);
  private life = new Float32Array(N);
  private maxLife = new Float32Array(N);
  private grav = new Float32Array(N);
  private lifeAttr = new Float32Array(N);
  private cursor = 0;
  points: THREE.Points;
  private geo: THREE.BufferGeometry;

  constructor(scene: THREE.Scene) {
    this.geo = new THREE.BufferGeometry();
    this.pos.fill(0);
    for (let i = 0; i < N; i++) this.pos[i * 3 + 1] = -999;
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aLife', new THREE.BufferAttribute(this.lifeAttr, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aLife;
        varying vec3 vColor;
        varying float vLife;
        void main() {
          vColor = aColor;
          vLife = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 340.0 / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vLife;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.26, d) * clamp(vLife * 3.0, 0.0, 1.0);
          if (a < 0.02) discard;
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(
    p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color,
    size: number, life: number, gravity = 1
  ) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % N;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
  }

  /** 放射状バースト */
  burst(
    p: THREE.Vector3, color: THREE.Color, count: number,
    speed = 4, size = 0.1, life = 0.6, upBias = 0.5, gravity = 1
  ) {
    const v = new THREE.Vector3();
    for (let k = 0; k < count; k++) {
      v.set(randSpread(1), Math.random() * upBias * 2, randSpread(1)).normalize()
        .multiplyScalar(speed * rand(0.4, 1.1));
      this.spawn(p, v, color, size * rand(0.6, 1.5), life * rand(0.6, 1.3), gravity);
    }
  }

  update(dt: number) {
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) {
        if (this.pos[i * 3 + 1] > -900) this.pos[i * 3 + 1] = -999;
        this.lifeAttr[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 16 * this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.lifeAttr[i] = Math.max(0, this.life[i] / this.maxLife[i]);
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aLife') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  }
}
