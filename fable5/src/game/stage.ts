import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PaintSystem, PaintSurface } from './paint';
import { CollisionWorld } from './collision';
import { NavGrid } from './nav';
import { INK_COLORS } from '../core/utils';

type Side = 'px' | 'nx' | 'pz' | 'nz';

interface BoxDef {
  x0: number; x1: number; z0: number; z1: number; y0: number; y1: number;
  c: string;
  top?: boolean;   // 上面を塗装可能な床として登録
  sides?: Side[];  // 塗装可能な側面
  walk?: boolean;  // navの地面候補(topがtrueなら自動でtrue)
}

export interface StageData {
  group: THREE.Group;
  nav: NavGrid;
  spawns: { pos: THREE.Vector3; yaw: number }[][];
  overlayMat: THREE.MeshStandardMaterial;
}

export function buildStage(paint: PaintSystem, world: CollisionWorld): StageData {
  const group = new THREE.Group();
  const defs: BoxDef[] = [];
  const B = (d: BoxDef) => defs.push(d);

  // ===== 地形定義（西=プレイヤー陣地, 東=敵陣地, 点対称レイアウト） =====
  // メインフロア
  B({ x0: -30.4, x1: 30.4, z0: -22.3, z1: 22.3, y0: -1.4, y1: 0, c: '#d3d7dc', top: true });
  // スポーンデッキ
  B({ x0: -30.4, x1: -25.2, z0: -10, z1: 10, y0: 0, y1: 2.2, c: '#c8ccd2', top: true, sides: ['px', 'pz', 'nz'] });
  B({ x0: 25.2, x1: 30.4, z0: -10, z1: 10, y0: 0, y1: 2.2, c: '#c8ccd2', top: true, sides: ['nx', 'pz', 'nz'] });
  // デッキ階段（幅10, 3段）
  for (let i = 0; i < 3; i++) {
    const top = 1.65 - 0.55 * i;
    B({ x0: -25.2 + i * 0.8, x1: -24.4 + i * 0.8, z0: -5, z1: 5, y0: 0, y1: top, c: '#c8ccd2', top: true });
    B({ x0: 24.4 - i * 0.8, x1: 25.2 - i * 0.8, z0: -5, z1: 5, y0: 0, y1: top, c: '#c8ccd2', top: true });
  }
  // 中央プラザ（3段の高台 + 頂上タワー）
  B({ x0: -8.4, x1: 8.4, z0: -8.4, z1: 8.4, y0: 0, y1: 0.5, c: '#bcd0d8', top: true, sides: ['px', 'nx', 'pz', 'nz'] });
  B({ x0: -7.2, x1: 7.2, z0: -7.2, z1: 7.2, y0: 0, y1: 1.0, c: '#aec6cf', top: true });
  B({ x0: -6, x1: 6, z0: -6, z1: 6, y0: 0, y1: 1.5, c: '#9fbecb', top: true, sides: ['px', 'nx', 'pz', 'nz'] });
  B({ x0: -1.4, x1: 1.4, z0: -1.4, z1: 1.4, y0: 0, y1: 3.5, c: '#e8b34c', top: true, sides: ['px', 'nx', 'pz', 'nz'] });
  // タワーへの足場クレート（点対称ペア）
  B({ x0: 2.0, x1: 3.6, z0: 2.0, z1: 3.6, y0: 0, y1: 2.5, c: '#e0b955', top: true, sides: ['px', 'nx', 'pz', 'nz'] });
  B({ x0: -3.6, x1: -2.0, z0: -3.6, z1: -2.0, y0: 0, y1: 2.5, c: '#e0b955', top: true, sides: ['px', 'nx', 'pz', 'nz'] });
  // 南北の高架ウォークウェイ
  B({ x0: -14, x1: 14, z0: 11.2, z1: 13.6, y0: 0, y1: 2.0, c: '#c9a877', top: true, sides: ['nz', 'pz'] });
  B({ x0: -14, x1: 14, z0: -13.6, z1: -11.2, y0: 0, y1: 2.0, c: '#c9a877', top: true, sides: ['pz', 'nz'] });
  // ウォークウェイ階段（両端 x 南北）
  for (let i = 0; i < 3; i++) {
    const top = 1.5 - 0.5 * i;
    for (const zs of [[11.2, 13.6], [-13.6, -11.2]]) {
      B({ x0: 14 + i * 0.8, x1: 14.8 + i * 0.8, z0: zs[0], z1: zs[1], y0: 0, y1: top, c: '#c9a877', top: true });
      B({ x0: -14.8 - i * 0.8, x1: -14 - i * 0.8, z0: zs[0], z1: zs[1], y0: 0, y1: top, c: '#c9a877', top: true });
    }
  }
  // 遮蔽クレート
  B({ x0: 9, x1: 10.8, z0: -4.8, z1: -3, y0: 0, y1: 1.6, c: '#e0b955', top: true, sides: ['px', 'nx', 'pz', 'nz'] });
  B({ x0: -10.8, x1: -9, z0: 3, z1: 4.8, y0: 0, y1: 1.6, c: '#e0b955', top: true, sides: ['px', 'nx', 'pz', 'nz'] });
  B({ x0: 2.5, x1: 4.1, z0: 9.5, z1: 11.1, y0: 0, y1: 1.6, c: '#6fc2b6', top: true, sides: ['px', 'nx', 'pz', 'nz'] });
  B({ x0: -4.1, x1: -2.5, z0: -11.1, z1: -9.5, y0: 0, y1: 1.6, c: '#6fc2b6', top: true, sides: ['px', 'nx', 'pz', 'nz'] });
  // 視線を遮る長壁
  B({ x0: 16, x1: 17.6, z0: -8, z1: -1, y0: 0, y1: 2.6, c: '#d97f6e', sides: ['px', 'nx'] });
  B({ x0: -17.6, x1: -16, z0: 1, z1: 8, y0: 0, y1: 2.6, c: '#d97f6e', sides: ['px', 'nx'] });
  // 通路仕切り壁（狭い通路を作る）
  for (const zs of [[16.2, 17.2], [-17.2, -16.2]]) {
    for (const xs of [[-24, -14], [-6, 6], [14, 24]]) {
      B({ x0: xs[0], x1: xs[1], z0: zs[0], z1: zs[1], y0: 0, y1: 2.4, c: '#7f8fa6', sides: ['pz', 'nz'] });
    }
  }
  // 通路内の小クレート
  B({ x0: 10, x1: 11.4, z0: 14.4, z1: 15.8, y0: 0, y1: 1.1, c: '#6fc2b6', top: true, sides: ['px', 'nx', 'pz', 'nz'] });
  B({ x0: -11.4, x1: -10, z0: -15.8, z1: -14.4, y0: 0, y1: 1.1, c: '#6fc2b6', top: true, sides: ['px', 'nx', 'pz', 'nz'] });
  // 外周壁（落下防止）
  B({ x0: -31.4, x1: -30.4, z0: -23.3, z1: 23.3, y0: -1, y1: 3.4, c: '#b7bdc7', sides: ['px'] });
  B({ x0: 30.4, x1: 31.4, z0: -23.3, z1: 23.3, y0: -1, y1: 3.4, c: '#b7bdc7', sides: ['nx'] });
  B({ x0: -31.4, x1: 31.4, z0: 22.3, z1: 23.3, y0: -1, y1: 3.4, c: '#b7bdc7', sides: ['nz'] });
  B({ x0: -31.4, x1: 31.4, z0: -23.3, z1: -22.3, y0: -1, y1: 3.4, c: '#b7bdc7', sides: ['pz'] });
  // バレル（小型遮蔽）
  const barrels: [number, number, string][] = [
    [7, -9.5, '#6fc2b6'], [-7, 9.5, '#6fc2b6'], [18.5, 9, '#e8955c'], [-18.5, -9, '#e8955c'],
  ];
  for (const [bx, bz] of barrels) {
    B({ x0: bx - 0.38, x1: bx + 0.38, z0: bz - 0.38, z1: bz + 0.38, y0: 0, y1: 0.92, c: '#00000000' });
  }
  const barrelDefCount = barrels.length;

  // ===== 衝突 + ベースジオメトリ =====
  const baseGeos: THREE.BufferGeometry[] = [];
  const visualDefs = defs.slice(0, defs.length - barrelDefCount);
  for (const d of defs) {
    world.addBox(d.x0, d.y0, d.z0, d.x1, d.y1, d.z1, !!d.top || !!d.walk);
  }
  for (const d of visualDefs) baseGeos.push(coloredBox(d));
  // バレルは円柱で描く
  for (const [bx, bz, bc] of barrels) {
    const g = new THREE.CylinderGeometry(0.42, 0.46, 0.92, 14);
    g.translate(bx, 0.46, bz);
    tintGeometry(g, new THREE.Color(bc));
    baseGeos.push(g);
    const ring = new THREE.TorusGeometry(0.44, 0.035, 6, 18);
    ring.rotateX(Math.PI / 2);
    ring.translate(bx, 0.75, bz);
    tintGeometry(ring, new THREE.Color('#3d4852'));
    baseGeos.push(ring);
  }

  const baseMat = makeBaseMaterial();
  const baseMesh = new THREE.Mesh(mergeGeometries(baseGeos, false)!, baseMat);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // ===== ペイント面登録（床は面積の大きい順に登録してアトラスに詰める） =====
  const overlayGeos: THREE.BufferGeometry[] = [];
  const floorDefs = defs.filter((d) => d.top).sort((a, b) => (b.z1 - b.z0) - (a.z1 - a.z0));
  for (const d of floorDefs) {
    const s = paint.addFloor(d.x0, d.z0, d.x1 - d.x0, d.z1 - d.z0, d.y1);
    overlayGeos.push(floorPlane(paint, s));
  }
  for (const d of defs) {
    if (!d.sides) continue;
    for (const side of d.sides) {
      let s: PaintSurface;
      const y0 = Math.max(d.y0, -0.2);
      const hh = d.y1 - y0;
      if (side === 'pz') s = paint.addWall('pz', d.z1, d.x0, d.x1 - d.x0, y0, hh);
      else if (side === 'nz') s = paint.addWall('nz', d.z0, d.x0, d.x1 - d.x0, y0, hh);
      else if (side === 'px') s = paint.addWall('px', d.x1, d.z0, d.z1 - d.z0, y0, hh);
      else s = paint.addWall('nx', d.x0, d.z0, d.z1 - d.z0, y0, hh);
      overlayGeos.push(wallPlane(paint, s));
    }
  }
  const overlayMat = makeOverlayMaterial(paint);
  const overlayMesh = new THREE.Mesh(mergeGeometries(overlayGeos, false)!, overlayMat);
  overlayMesh.receiveShadow = true;
  overlayMesh.renderOrder = 1;
  group.add(overlayMesh);

  // ===== ネオンストリップ（エミッシブ装飾） =====
  const stripGeos: THREE.BufferGeometry[] = [];
  const strip = (x0: number, x1: number, z0: number, z1: number, y: number) => {
    const g = new THREE.BoxGeometry(x1 - x0, 0.07, z1 - z0);
    g.translate((x0 + x1) / 2, y + 0.035, (z0 + z1) / 2);
    stripGeos.push(g);
  };
  strip(-14, 14, 11.2, 11.33, 2.0);
  strip(-14, 14, 13.47, 13.6, 2.0);
  strip(-14, 14, -11.33, -11.2, 2.0);
  strip(-14, 14, -13.6, -13.47, 2.0);
  strip(-6, 6, -6, -5.88, 1.5); strip(-6, 6, 5.88, 6, 1.5);
  strip(-6, -5.88, -6, 6, 1.5); strip(5.88, 6, -6, 6, 1.5);
  strip(-25.33, -25.2, -10, 10, 2.2); strip(25.2, 25.33, -10, 10, 2.2);
  for (const zs of [[16.2, 17.2], [-17.2, -16.2]]) {
    for (const xs of [[-24, -14], [-6, 6], [14, 24]]) strip(xs[0], xs[1], zs[0], zs[1], 2.4);
  }
  strip(-31.4, 31.4, 22.3, 23.3, 3.4); strip(-31.4, 31.4, -23.3, -22.3, 3.4);
  strip(-31.4, -30.4, -23.3, 23.3, 3.4); strip(30.4, 31.4, -23.3, 23.3, 3.4);
  const stripMat = new THREE.MeshStandardMaterial({
    color: '#04181d', emissive: '#35e2ff', emissiveIntensity: 1.45, roughness: 0.4,
  });
  const stripMesh = new THREE.Mesh(mergeGeometries(stripGeos, false)!, stripMat);
  group.add(stripMesh);

  // ===== スポーンパッド =====
  for (let team = 0; team < 2; team++) {
    const cx = team === 0 ? -27.8 : 27.8;
    const padMat = new THREE.MeshStandardMaterial({
      color: '#0a0a12', emissive: INK_COLORS[team], emissiveIntensity: 1.1, roughness: 0.3,
    });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.08, 32), padMat);
    pad.position.set(cx, 2.24, 0);
    group.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.07, 8, 40), padMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, 2.34, 0);
    ring.userData.spin = team === 0 ? 0.6 : -0.6;
    group.add(ring);
    // アンテナ（遠くから陣地が分かる目印）
    const poleMat = new THREE.MeshStandardMaterial({ color: '#39404d', roughness: 0.5, metalness: 0.6 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 5.4, 8), poleMat);
    pole.position.set(team === 0 ? -29.6 : 29.6, 4.9, -8.2);
    pole.castShadow = true;
    group.add(pole);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 12),
      new THREE.MeshStandardMaterial({ color: '#111', emissive: INK_COLORS[team], emissiveIntensity: 2.6 })
    );
    orb.position.set(team === 0 ? -29.6 : 29.6, 7.7, -8.2);
    orb.userData.pulse = true;
    group.add(orb);
    const spotLight = new THREE.PointLight(INK_COLORS[team], 26, 22, 1.8);
    spotLight.position.set(cx, 5.4, 0);
    group.add(spotLight);
  }
  const centerLight = new THREE.PointLight('#40e0ff', 34, 30, 1.8);
  centerLight.position.set(0, 8.5, 0);
  group.add(centerLight);

  // ===== nav =====
  const nav = new NavGrid();
  nav.build(world);

  const spawns = [
    [
      { pos: new THREE.Vector3(-27.8, 2.2, 0), yaw: Math.PI / 2 },
      { pos: new THREE.Vector3(-27.8, 2.2, 3.2), yaw: Math.PI / 2 },
      { pos: new THREE.Vector3(-27.8, 2.2, -3.2), yaw: Math.PI / 2 },
    ],
    [
      { pos: new THREE.Vector3(27.8, 2.2, 0), yaw: -Math.PI / 2 },
      { pos: new THREE.Vector3(27.8, 2.2, 3.2), yaw: -Math.PI / 2 },
      { pos: new THREE.Vector3(27.8, 2.2, -3.2), yaw: -Math.PI / 2 },
    ],
  ];

  return { group, nav, spawns, overlayMat };
}

/** スポーン地点の事前塗装（試合開始/リセット時に呼ぶ） */
export function prepaintSpawns(paint: PaintSystem) {
  paint.prepaintRect(0, -30.2, -9.8, -25.4, 9.8, 2.2);
  paint.prepaintRect(1, 25.4, -9.8, 30.2, 9.8, 2.2);
}

/* ---------------- ジオメトリヘルパ ---------------- */

function coloredBox(d: BoxDef): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(d.x1 - d.x0, d.y1 - d.y0, d.z1 - d.z0);
  g.translate((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, (d.z0 + d.z1) / 2);
  tintGeometry(g, new THREE.Color(d.c === '#00000000' ? '#888888' : d.c));
  return g;
}

/** 法線に応じた擬似シェーディング入り頂点色を付与 */
function tintGeometry(g: THREE.BufferGeometry, col: THREE.Color) {
  const n = g.getAttribute('normal');
  const arr = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const ny = n.getY(i);
    const nx = n.getX(i);
    const shade = ny > 0.5 ? 1.0 : ny < -0.5 ? 0.55 : Math.abs(nx) > 0.5 ? 0.8 : 0.9;
    arr[i * 3] = col.r * shade;
    arr[i * 3 + 1] = col.g * shade;
    arr[i * 3 + 2] = col.b * shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

function remapUV(g: THREE.BufferGeometry, r: { u0: number; v0: number; u1: number; v1: number }) {
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
  }
}

function floorPlane(paint: PaintSystem, s: PaintSurface): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(s.w, s.d);
  g.rotateX(-Math.PI / 2);
  g.translate(s.x0 + s.w / 2, s.y + 0.015, s.z0 + s.d / 2);
  remapUV(g, paint.uvRect(s));
  return g;
}

function wallPlane(paint: PaintSystem, s: PaintSurface): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(s.w, s.hh);
  const cy = s.y0 + s.hh / 2;
  const off = 0.015;
  switch (s.axis) {
    case 'pz':
      g.translate(s.u0 + s.w / 2, cy, s.fixed + off);
      break;
    case 'nz':
      g.rotateY(Math.PI);
      g.translate(s.u0 + s.w / 2, cy, s.fixed - off);
      break;
    case 'px':
      g.rotateY(Math.PI / 2);
      g.translate(s.fixed + off, cy, s.u0 + s.w / 2);
      break;
    case 'nx':
      g.rotateY(-Math.PI / 2);
      g.translate(s.fixed - off, cy, s.u0 + s.w / 2);
      break;
  }
  remapUV(g, paint.uvRect(s));
  return g;
}

/* ---------------- マテリアル ---------------- */

/** コンクリ調トリプラナーディテールを乗せたベース材質 */
function makeBaseMaterial(): THREE.MeshStandardMaterial {
  const detail = makeDetailTexture();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.detailTex = { value: detail };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace(
        '#include <fog_vertex>',
        '#include <fog_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D detailTex;\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec3 triBw = pow(abs(vWNormal), vec3(6.0));
triBw /= (triBw.x + triBw.y + triBw.z + 0.0001);
float triTop = texture2D(detailTex, vWPos.xz * 0.21).r;
float triFront = texture2D(detailTex, vWPos.xy * 0.21).r;
float triSide = texture2D(detailTex, vWPos.zy * 0.21).r;
float triDet = triTop * triBw.y + triFront * triBw.z + triSide * triBw.x;
vec4 diffuseColor = vec4(diffuse * (0.80 + 0.40 * triDet), opacity);`
      );
  };
  return mat;
}

/** ペイントオーバーレイ材質: アトラスを参照し、インク部分だけ光沢面として描く */
function makeOverlayMaterial(paint: PaintSystem): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.16,
    metalness: 0.0,
    transparent: true,
    depthWrite: false,
    envMapIntensity: 1.1,
  });
  mat.onBeforeCompile = (shader) => {
    shader.defines = Object.assign(shader.defines ?? {}, { USE_UV: '' });
    shader.uniforms.paintTex = { value: paint.texture };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D paintTex;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 paintS = texture2D(paintTex, vUv);
float pm = smoothstep(0.3, 0.6, paintS.a);
if (pm < 0.04) discard;
vec3 inkCol = paintS.rgb;
float rim = smoothstep(0.62, 0.38, paintS.a);
vec4 diffuseColor = vec4(inkCol * (1.0 - rim * 0.2), pm);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
  vec2 dSTdx = dFdx(vUv);
  vec2 dSTdy = dFdy(vUv);
  float Hll = texture2D(paintTex, vUv).a;
  float dBx = texture2D(paintTex, vUv + dSTdx).a - Hll;
  float dBy = texture2D(paintTex, vUv + dSTdy).a - Hll;
  vec2 dHdxy = vec2(dBx, dBy) * 1.35;
  vec3 sp = -vViewPosition;
  vec3 sigX = dFdx(sp);
  vec3 sigY = dFdy(sp);
  vec3 R1 = cross(sigY, normal);
  vec3 R2 = cross(normal, sigX);
  float fDet = dot(sigX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  normal = normalize(abs(fDet) * normal - vGrad);
}`
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += inkCol * 0.045;'
      );
  };
  return mat;
}

function makeDetailTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(0, 0, S, S);
  // ノイズ斑点
  for (let i = 0; i < 2600; i++) {
    const v = 110 + Math.random() * 60;
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5);
  }
  // 大きめのしみ
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 12 + Math.random() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() > 0.5;
    g.addColorStop(0, dark ? 'rgba(90,90,95,0.22)' : 'rgba(180,180,185,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // タイル目地
  ctx.strokeStyle = 'rgba(40,44,52,0.4)';
  ctx.lineWidth = 2.5;
  for (let i = 0; i <= S; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
