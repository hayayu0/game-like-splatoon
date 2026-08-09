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
  private angle = new Float32Array(N);
  private spin = new Float32Array(N);
  private shape = new Float32Array(N);
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
    this.geo.setAttribute('aAngle', new THREE.BufferAttribute(this.angle, 1));
    this.geo.setAttribute('aShape', new THREE.BufferAttribute(this.shape, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aLife;
        attribute float aAngle;
        attribute float aShape;
        varying vec3 vColor;
        varying float vLife;
        varying float vAngle;
        varying float vShape;
        void main() {
          vColor = aColor;
          vLife = aLife;
          vAngle = aAngle;
          vShape = aShape;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 340.0 / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vLife;
        varying float vAngle;
        varying float vShape;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float cs = cos(vAngle);
          float sn = sin(vAngle);
          vec2 q = mat2(cs, -sn, sn, cs) * uv;
          float circle = smoothstep(0.5, 0.26, length(uv));
          float strip = smoothstep(0.5, 0.4, max(abs(q.x), abs(q.y) * 2.5));
          float silhouette = mix(circle, strip, step(0.5, vShape));
          float a = silhouette * clamp(vLife * 3.0, 0.0, 1.0);
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
    this.angle[i] = 0;
    this.spin[i] = 0;
    this.shape[i] = 0;
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

  /** カメラ前方の錐台を埋める、勝者色の紙吹雪 */
  celebrate(
    camera: THREE.PerspectiveCamera,
    color: THREE.Color,
    accent: THREE.Color,
    count = 360
  ) {
    camera.updateMatrixWorld(true);
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3(1, 0, 0);
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const v = new THREE.Vector3();
    const q = new THREE.Quaternion();
    camera.getWorldDirection(forward);
    camera.getWorldQuaternion(q);
    right.applyQuaternion(q);
    up.applyQuaternion(q);
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));

    for (let k = 0; k < count; k++) {
      const depth = rand(3.2, 10);
      const halfH = tanHalfFov * depth;
      const halfW = halfH * camera.aspect;
      p.copy(camera.position)
        .addScaledVector(forward, depth)
        .addScaledVector(right, randSpread(halfW * 1.08))
        .addScaledVector(up, rand(-halfH * 0.8, halfH * 1.15));
      v.copy(right).multiplyScalar(randSpread(1.1))
        .addScaledVector(up, rand(-0.25, 1.5))
        .addScaledVector(forward, randSpread(0.35));
      this.spawn(p, v, k % 4 === 0 ? accent : color, rand(0.11, 0.22), rand(2.4, 4.2), rand(0.08, 0.2));
      const i = (this.cursor + N - 1) % N;
      this.shape[i] = 1;
      this.angle[i] = rand(0, Math.PI * 2);
      this.spin[i] = randSpread(7);
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
      this.angle[i] += this.spin[i] * dt;
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
    (this.geo.getAttribute('aAngle') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aShape') as THREE.BufferAttribute).needsUpdate = true;
  }
}
