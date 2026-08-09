import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PaintSystem, PaintSurface } from './paint';
import { CollisionWorld } from './collision';
import { NavGrid } from './nav';
import { INK_COLORS } from '../core/utils';
import { BoxDef, PrepaintDef, StageDefinition } from './stageLayouts';
import { buildPlazaDecor } from './stageDecorPlaza';
import { buildDocksDecor } from './stageDecorDocks';
import { buildYardDecor } from './stageDecorYard';

export interface StageDecor {
  group: THREE.Group;
  update(t: number, dt: number): void;
}

export interface StageData {
  id: string;
  name: string;
  group: THREE.Group;
  nav: NavGrid;
  spawns: { pos: THREE.Vector3; yaw: number }[][];
  prepaint: PrepaintDef[];
  overlayMat: THREE.MeshStandardMaterial;
  decor: StageDecor;
}

/** 選択されたステージの床・壁・遮蔽物・ライトを生成する。 */
export function buildStage(
  paint: PaintSystem,
  world: CollisionWorld,
  definition: StageDefinition,
): StageData {
  const layout = definition.create();
  const group = new THREE.Group();
  world.bounds = { ...layout.bounds };

  // ===== 衝突 + ベースジオメトリ =====
  const baseGeos: THREE.BufferGeometry[] = [];
  const natural = layout.id === 'yard';
  for (const d of layout.boxes) {
    world.addBox(d.x0, d.y0, d.z0, d.x1, d.y1, d.z1, !!d.top || !!d.walk);
    baseGeos.push(coloredBox(d));
    addBoxDetailGeometry(baseGeos, d, natural);
  }
  // バレルは衝突判定を箱、見た目を円柱として生成する。
  for (const barrel of layout.barrels) {
    const { x, z, color } = barrel;
    world.addBox(x - 0.38, 0, z - 0.38, x + 0.38, 0.92, z + 0.38);
    const g = new THREE.CylinderGeometry(0.42, 0.46, 0.92, 14);
    g.translate(x, 0.46, z);
    tintGeometry(g, new THREE.Color(color), 0.38);
    baseGeos.push(g);
    const ring = new THREE.TorusGeometry(0.44, 0.035, 6, 18);
    ring.rotateX(Math.PI / 2);
    ring.translate(x, 0.75, z);
    tintGeometry(ring, new THREE.Color('#3d4852'), 0.86);
    baseGeos.push(ring);
  }

  // ===== ステージ専用の世界観装飾（非衝突） =====
  const decor: StageDecor =
    layout.id === 'plaza' ? buildPlazaDecor() :
    layout.id === 'docks' ? buildDocksDecor() :
    buildYardDecor();
  group.add(decor.group);

  const baseMat = makeBaseMaterial(natural);
  const baseMesh = new THREE.Mesh(mergeGeometries(baseGeos, false)!, baseMat);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // ===== ペイント面登録（床は面積の大きい順に登録してアトラスに詰める） =====
  const overlayGeos: THREE.BufferGeometry[] = [];
  const floorDefs = layout.boxes
    .filter((d) => d.top)
    .sort((a, b) => (b.z1 - b.z0) - (a.z1 - a.z0));
  for (const d of floorDefs) {
    const s = paint.addFloor(d.x0, d.z0, d.x1 - d.x0, d.z1 - d.z0, d.y1);
    overlayGeos.push(floorPlane(paint, s));
  }
  for (const d of layout.boxes) {
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
  for (const strip of layout.strips) {
    const g = new THREE.BoxGeometry(strip.x1 - strip.x0, 0.07, strip.z1 - strip.z0);
    g.translate((strip.x0 + strip.x1) / 2, strip.y + 0.035, (strip.z0 + strip.z1) / 2);
    stripGeos.push(g);
  }
  const stripMat = new THREE.MeshStandardMaterial({
    color: '#04181d', emissive: '#35e2ff', emissiveIntensity: 1.45, roughness: 0.4,
  });
  const stripMesh = new THREE.Mesh(mergeGeometries(stripGeos, false)!, stripMat);
  group.add(stripMesh);

  // ===== スポーンパッド =====
  for (let team = 0; team < 2; team++) {
    const home = layout.spawns[team][0];
    const padMat = new THREE.MeshStandardMaterial({
      color: '#0a0a12', emissive: INK_COLORS[team], emissiveIntensity: 1.1, roughness: 0.3,
    });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.08, 32), padMat);
    pad.position.set(home.x, home.y + 0.04, home.z);
    group.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.07, 8, 40), padMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(home.x, home.y + 0.14, home.z);
    ring.userData.spin = team === 0 ? 0.6 : -0.6;
    group.add(ring);
    // アンテナ（遠くから陣地が分かる目印）
    const antennaX = team === 0 ? layout.bounds.minX + 0.8 : layout.bounds.maxX - 0.8;
    const poleMat = new THREE.MeshStandardMaterial({ color: '#39404d', roughness: 0.5, metalness: 0.6 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 5.4, 8), poleMat);
    pole.position.set(antennaX, 4.9, -8.2);
    pole.castShadow = true;
    group.add(pole);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 12),
      new THREE.MeshStandardMaterial({ color: '#111', emissive: INK_COLORS[team], emissiveIntensity: 2.6 }),
    );
    orb.position.set(antennaX, 7.7, -8.2);
    orb.userData.pulse = true;
    group.add(orb);
    const spotLight = new THREE.PointLight(INK_COLORS[team], 26, 22, 1.8);
    spotLight.position.set(home.x, home.y + 3.2, home.z);
    group.add(spotLight);
  }
  const centerLight = new THREE.PointLight('#40e0ff', 34, 30, 1.8);
  centerLight.position.set(0, 8.5, 0);
  group.add(centerLight);

  // ===== nav =====
  const nav = new NavGrid();
  nav.build(world);
  const spawns = layout.spawns.map((team) => team.map((spawn) => ({
    pos: new THREE.Vector3(spawn.x, spawn.y, spawn.z),
    yaw: spawn.yaw,
  })));

  return {
    id: layout.id,
    name: layout.name,
    group,
    nav,
    spawns,
    prepaint: layout.prepaint,
    overlayMat,
    decor,
  };
}

/** スポーン地点の事前塗装（試合開始/リセット時に呼ぶ）。 */
export function prepaintSpawns(paint: PaintSystem, stage: StageData) {
  for (const area of stage.prepaint) {
    paint.prepaintRect(area.team, area.x0, area.z0, area.x1, area.z1, area.y);
  }
}

/* ---------------- ジオメトリヘルパ ---------------- */

function coloredBox(d: BoxDef): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(d.x1 - d.x0, d.y1 - d.y0, d.z1 - d.z0);
  g.translate((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, (d.z0 + d.z1) / 2);
  tintGeometry(g, new THREE.Color(d.c));
  return g;
}

type BoxDetailScale = 'small' | 'large';

/** BoxDef の寸法だけから、共通ベースメッシュへ非衝突の表面ディテールを追加する。 */
function addBoxDetailGeometry(target: THREE.BufferGeometry[], d: BoxDef, natural: boolean) {
  const width = d.x1 - d.x0;
  const depth = d.z1 - d.z0;
  const height = d.y1 - d.y0;
  const footprint = width * depth;
  const scale: BoxDetailScale = footprint >= 24 || Math.max(width, depth) >= 6 ? 'large' : 'small';

  // 極端に低い段差には縦角を作らず、上面トリムだけを残す。
  if (height >= 0.7 && Math.min(width, depth) >= 0.75) {
    if (natural) addNaturalCornerRoots(target, d, scale, width, depth, height);
    else addIndustrialCornerDetails(target, d, scale, width, depth, height);
  }
  if (!d.top) return;
  if (natural) addNaturalTopTrim(target, d, scale, width, depth);
  else addIndustrialTopTrim(target, d, scale, width, depth);
}

function addIndustrialCornerDetails(
  target: THREE.BufferGeometry[],
  d: BoxDef,
  scale: BoxDetailScale,
  width: number,
  depth: number,
  height: number,
) {
  const minSpan = Math.min(width, depth);
  const large = scale === 'large';
  const plateThickness = THREE.MathUtils.clamp(minSpan * (large ? 0.035 : 0.055), 0.045, 0.11);
  const wing = THREE.MathUtils.clamp(minSpan * (large ? 0.12 : 0.2), 0.16, large ? 0.3 : 0.36);
  const protrusion = Math.min(0.012, plateThickness * 0.24);
  const margin = Math.min(0.12, height * 0.08);
  const railHeight = height - margin * 2;
  const bracketColor = adjustedBoxColor(d.c, large ? 0.66 : 0.58, 0.9);
  const boltColor = adjustedBoxColor(d.c, 1.28, 0.72);
  const boltRadius = THREE.MathUtils.clamp(plateThickness * 0.58, 0.028, 0.052);
  const boltLevels = large ? [0.16, 0.5, 0.84] : [0.22, 0.78];

  for (const sx of [-1, 1]) {
    const cornerX = sx < 0 ? d.x0 : d.x1;
    for (const sz of [-1, 1]) {
      const cornerZ = sz < 0 ? d.z0 : d.z1;
      // 二枚の細板を直角に噛み合わせ、平面視で L 字になる補強材。
      addTintedBox(
        target,
        plateThickness, railHeight, wing,
        cornerX + sx * (protrusion - plateThickness / 2),
        (d.y0 + d.y1) / 2,
        cornerZ - sz * wing / 2,
        bracketColor,
        0.82,
      );
      addTintedBox(
        target,
        wing, railHeight, plateThickness,
        cornerX - sx * wing / 2,
        (d.y0 + d.y1) / 2,
        cornerZ + sz * (protrusion - plateThickness / 2),
        bracketColor,
        0.82,
      );
      for (const level of boltLevels) {
        const bolt = new THREE.SphereGeometry(boltRadius, 6, 4);
        bolt.translate(
          cornerX + sx * boltRadius * 0.14,
          d.y0 + height * level,
          cornerZ + sz * boltRadius * 0.14,
        );
        addTintedGeometry(target, bolt, boltColor, 0.96);
      }
    }
  }

  if (!large || height < 1.2) return;
  // 大型床・壁では側面中央にもパネルの継ぎ目帯を一周させる。
  const seamThickness = THREE.MathUtils.clamp(minSpan * 0.025, 0.035, 0.075);
  const seamHeight = THREE.MathUtils.clamp(height * 0.035, 0.045, 0.085);
  const seamY = d.y0 + height * 0.52;
  const seamColor = adjustedBoxColor(d.c, 0.72, 0.82);
  addTintedBox(target, width, seamHeight, seamThickness, (d.x0 + d.x1) / 2, seamY,
    d.z0 + seamThickness / 2 - 0.01, seamColor, 0.74);
  addTintedBox(target, width, seamHeight, seamThickness, (d.x0 + d.x1) / 2, seamY,
    d.z1 - seamThickness / 2 + 0.01, seamColor, 0.74);
  addTintedBox(target, seamThickness, seamHeight, depth, d.x0 + seamThickness / 2 - 0.01, seamY,
    (d.z0 + d.z1) / 2, seamColor, 0.74);
  addTintedBox(target, seamThickness, seamHeight, depth, d.x1 - seamThickness / 2 + 0.01, seamY,
    (d.z0 + d.z1) / 2, seamColor, 0.74);
}

function addIndustrialTopTrim(
  target: THREE.BufferGeometry[],
  d: BoxDef,
  scale: BoxDetailScale,
  width: number,
  depth: number,
) {
  const minSpan = Math.min(width, depth);
  const large = scale === 'large';
  const trimWidth = THREE.MathUtils.clamp(minSpan * (large ? 0.018 : 0.04), 0.055, 0.12);
  const trimHeight = large ? 0.045 : 0.06;
  const trimY = d.y1 + trimHeight / 2;
  const trimColor = adjustedBoxColor(d.c, 1.14, 0.92);
  addTintedBox(target, width, trimHeight, trimWidth, (d.x0 + d.x1) / 2, trimY,
    d.z0 + trimWidth / 2, trimColor, 0.7);
  addTintedBox(target, width, trimHeight, trimWidth, (d.x0 + d.x1) / 2, trimY,
    d.z1 - trimWidth / 2, trimColor, 0.7);
  const innerDepth = Math.max(0.01, depth - trimWidth * 2);
  addTintedBox(target, trimWidth, trimHeight, innerDepth, d.x0 + trimWidth / 2, trimY,
    (d.z0 + d.z1) / 2, trimColor, 0.7);
  addTintedBox(target, trimWidth, trimHeight, innerDepth, d.x1 - trimWidth / 2, trimY,
    (d.z0 + d.z1) / 2, trimColor, 0.7);
}

function addNaturalCornerRoots(
  target: THREE.BufferGeometry[],
  d: BoxDef,
  scale: BoxDetailScale,
  width: number,
  depth: number,
  height: number,
) {
  const minSpan = Math.min(width, depth);
  const large = scale === 'large';
  const radius = THREE.MathUtils.clamp(minSpan * (large ? 0.026 : 0.038), 0.038, 0.085);
  const rootColor = adjustedBoxColor(d.c, 0.58, 1.04);
  let cornerIndex = 0;
  for (const sx of [-1, 1]) {
    const cornerX = sx < 0 ? d.x0 : d.x1;
    for (const sz of [-1, 1]) {
      const cornerZ = sz < 0 ? d.z0 : d.z1;
      const phase = width * 0.37 + depth * 0.19 + cornerIndex * 1.43;
      const points: THREE.Vector3[] = [];
      const pointCount = large ? 6 : 5;
      for (let i = 0; i < pointCount; i++) {
        const t = i / (pointCount - 1);
        // 中心線を半径より内側へ逃がさず、両側面から根の隆起が常に露出する。
        const insetX = radius * (0.28 + 0.56 * Math.abs(Math.sin(phase + t * 4.1)));
        const insetZ = radius * (0.28 + 0.56 * Math.abs(Math.cos(phase * 0.73 + t * 3.7)));
        points.push(new THREE.Vector3(
          cornerX - sx * insetX,
          d.y0 + radius + t * Math.max(0.01, height - radius * 2),
          cornerZ - sz * insetZ,
        ));
      }
      const root = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        large ? 9 : 7,
        radius,
        5,
        false,
      );
      addTintedGeometry(target, root, rootColor, 0);
      cornerIndex++;
    }
  }
}

function addNaturalTopTrim(
  target: THREE.BufferGeometry[],
  d: BoxDef,
  scale: BoxDetailScale,
  width: number,
  depth: number,
) {
  const minSpan = Math.min(width, depth);
  const large = scale === 'large';
  const radius = THREE.MathUtils.clamp(minSpan * (large ? 0.014 : 0.026), 0.026, 0.065);
  const inset = radius * 0.9;
  const mossColor = adjustedBoxColor(d.c, 0.86, 1.12);
  let edgeIndex = 0;
  for (const sz of [-1, 1]) {
    const edgeZ = sz < 0 ? d.z0 : d.z1;
    const points = makeMossEdgePoints(
      d.x0 + inset, d.x1 - inset, edgeZ - sz * inset,
      d.y1, radius, true, -sz, edgeIndex++, width,
    );
    addTintedGeometry(target, new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points), mossSegments(width), radius, 5, false,
    ), mossColor, 0);
  }
  for (const sx of [-1, 1]) {
    const edgeX = sx < 0 ? d.x0 : d.x1;
    const points = makeMossEdgePoints(
      d.z0 + inset, d.z1 - inset, edgeX - sx * inset,
      d.y1, radius, false, -sx, edgeIndex++, depth,
    );
    addTintedGeometry(target, new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points), mossSegments(depth), radius, 5, false,
    ), mossColor, 0);
  }
}

function makeMossEdgePoints(
  start: number,
  end: number,
  fixed: number,
  top: number,
  radius: number,
  alongX: boolean,
  inwardSign: number,
  edgeIndex: number,
  length: number,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const phase = edgeIndex * 1.71 + length * 0.13 + t * Math.PI * 3.2;
    const along = THREE.MathUtils.lerp(start, end, t);
    const fixedWobble = fixed + inwardSign * radius * 0.18 * (0.5 + 0.5 * Math.sin(phase));
    const y = top + radius * (0.18 + 0.2 * (0.5 + 0.5 * Math.cos(phase * 0.83)));
    points.push(alongX
      ? new THREE.Vector3(along, y, fixedWobble)
      : new THREE.Vector3(fixedWobble, y, along));
  }
  return points;
}

function mossSegments(length: number): number {
  return THREE.MathUtils.clamp(Math.ceil(length / 2.5), 6, 18);
}

function adjustedBoxColor(hex: string, lightnessScale: number, saturationScale: number): THREE.Color {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(
    hsl.h,
    THREE.MathUtils.clamp(hsl.s * saturationScale, 0, 1),
    THREE.MathUtils.clamp(hsl.l * lightnessScale, 0.035, 0.94),
  );
  return color;
}

function addTintedBox(
  target: THREE.BufferGeometry[],
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  color: THREE.Color,
  metalness: number,
) {
  const g = new THREE.BoxGeometry(width, height, depth);
  g.translate(x, y, z);
  addTintedGeometry(target, g, color, metalness);
}

function addTintedGeometry(
  target: THREE.BufferGeometry[],
  geometry: THREE.BufferGeometry,
  color: THREE.Color,
  metalness: number,
) {
  tintGeometry(geometry, color, metalness);
  target.push(geometry);
}

/** 法線に応じた擬似シェーディング入り頂点色を付与 */
function tintGeometry(g: THREE.BufferGeometry, col: THREE.Color, metalness = 0) {
  const n = g.getAttribute('normal');
  const arr = new Float32Array(n.count * 3);
  const metalnessAttr = new Float32Array(n.count);
  for (let i = 0; i < n.count; i++) {
    const ny = n.getY(i);
    const nx = n.getX(i);
    const shade = ny > 0.5 ? 1.0 : ny < -0.5 ? 0.55 : Math.abs(nx) > 0.5 ? 0.8 : 0.9;
    arr[i * 3] = col.r * shade;
    arr[i * 3 + 1] = col.g * shade;
    arr[i * 3 + 2] = col.b * shade;
    metalnessAttr[i] = metalness;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.setAttribute('surfaceMetalness', new THREE.BufferAttribute(metalnessAttr, 1));
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

/** ステージに応じたトリプラナーディテールを乗せたベース材質。 */
function makeBaseMaterial(natural: boolean): THREE.MeshStandardMaterial {
  const detail = makeDetailTexture(natural);
  const colorDetail = makeColorDetailTexture(natural);
  const normalMap = makeNormalTexture(natural);
  const roughnessMap = makeRoughnessTexture(natural);
  const metalnessMap = makeMetalnessTexture();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    normalMap,
    normalScale: new THREE.Vector2(0.46, 0.46),
    roughness: 0.94,
    roughnessMap,
    metalness: 1.0,
    metalnessMap,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.detailTex = { value: detail };
    shader.uniforms.colorDetailTex = { value: colorDetail };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float surfaceMetalness;\nvarying float vSurfaceMetalness;\nvarying vec3 vWPos;\nvarying vec3 vWNormal;',
      )
      .replace(
        '#include <fog_vertex>',
        '#include <fog_vertex>\nvSurfaceMetalness = surfaceMetalness;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D detailTex;
uniform sampler2D colorDetailTex;
varying float vSurfaceMetalness;
varying vec3 vWPos;
varying vec3 vWNormal;

vec3 baseRgbToHsl(vec3 color) {
  float cMax = max(max(color.r, color.g), color.b);
  float cMin = min(min(color.r, color.g), color.b);
  float delta = cMax - cMin;
  float lightness = (cMax + cMin) * 0.5;
  float hue = 0.0;
  if (delta > 0.00001) {
    if (cMax == color.r) hue = mod((color.g - color.b) / delta, 6.0);
    else if (cMax == color.g) hue = (color.b - color.r) / delta + 2.0;
    else hue = (color.r - color.g) / delta + 4.0;
    hue = fract(hue / 6.0);
  }
  float saturation = delta / (1.0 - abs(2.0 * lightness - 1.0) + 0.00001);
  return vec3(hue, clamp(saturation, 0.0, 1.0), lightness);
}

vec3 baseHslToRgb(vec3 hsl) {
  vec3 hueRgb = clamp(
    abs(mod(hsl.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0,
    0.0,
    1.0
  );
  float chroma = (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y;
  return (hueRgb - 0.5) * chroma + hsl.z;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 triBw = pow(abs(vWNormal), vec3(6.0));
triBw /= (triBw.x + triBw.y + triBw.z + 0.0001);
vec2 triUvTop = vWPos.xz * 0.21;
vec2 triUvFront = vWPos.xy * 0.21;
vec2 triUvSide = vWPos.zy * 0.21;
float triTop = texture2D(detailTex, triUvTop).r;
float triFront = texture2D(detailTex, triUvFront).r;
float triSide = texture2D(detailTex, triUvSide).r;
float triDet = triTop * triBw.y + triFront * triBw.z + triSide * triBw.x;
vec2 triColorUvTop = vWPos.xz * 0.12;
vec2 triColorUvFront = vWPos.xy * 0.12;
vec2 triColorUvSide = vWPos.zy * 0.12;
vec4 triColor = texture2D(colorDetailTex, triColorUvTop) * triBw.y
  + texture2D(colorDetailTex, triColorUvFront) * triBw.z
  + texture2D(colorDetailTex, triColorUvSide) * triBw.x;
float colorMask = clamp(triColor.a * 1.18, 0.0, 1.0);
vec3 baseHsl = baseRgbToHsl(diffuseColor.rgb);
vec3 detailHsl = baseRgbToHsl(triColor.rgb);
float chromaMask = smoothstep(0.12, 0.46, detailHsl.y);
float fadeMask = 1.0 - chromaMask;
vec3 colorGuide = mix(diffuseColor.rgb, triColor.rgb, colorMask * 0.34);
vec3 guideHsl = baseRgbToHsl(colorGuide);
float hueDelta = mod(guideHsl.x - baseHsl.x + 0.5, 1.0) - 0.5;
vec3 agedHsl = baseHsl;
agedHsl.x = fract(baseHsl.x + hueDelta * colorMask * chromaMask);
agedHsl.y = mix(baseHsl.y, guideHsl.y, colorMask * chromaMask * 0.85);
agedHsl.y *= 1.0 - colorMask * fadeMask * 0.75;
float detailLightOffset = clamp((detailHsl.z - 0.50) * 0.85, -0.20, 0.20);
agedHsl.z = clamp(baseHsl.z + detailLightOffset * colorMask, 0.06, 0.92);
vec3 agedAlbedo = baseHslToRgb(agedHsl);
float depositMix = colorMask * (0.12 + 0.12 * chromaMask);
agedAlbedo = mix(agedAlbedo, triColor.rgb, depositMix);
float brightMask = colorMask * smoothstep(0.52, 0.72, detailHsl.z);
vec3 screenedAlbedo = 1.0 - (1.0 - agedAlbedo) * (1.0 - triColor.rgb);
agedAlbedo = mix(agedAlbedo, screenedAlbedo, brightMask * 0.24);
float fineDetail = smoothstep(0.32, 0.72, triDet);
float fineLight = mix(0.74, 1.28, fineDetail);
float triRough = texture2D(roughnessMap, triUvTop).r * triBw.y
  + texture2D(roughnessMap, triUvFront).r * triBw.z
  + texture2D(roughnessMap, triUvSide).r * triBw.x;
float triMetal = texture2D(metalnessMap, triUvTop).r * triBw.y
  + texture2D(metalnessMap, triUvFront).r * triBw.z
  + texture2D(metalnessMap, triUvSide).r * triBw.x;
diffuseColor.rgb = clamp(agedAlbedo * fineLight, 0.0, 1.0);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness * triRough;`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `float metalnessFactor = metalness * vSurfaceMetalness * triMetal;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `float triSignX = vWNormal.x < 0.0 ? -1.0 : 1.0;
float triSignY = vWNormal.y < 0.0 ? -1.0 : 1.0;
float triSignZ = vWNormal.z < 0.0 ? -1.0 : 1.0;
vec3 triNTop = texture2D(normalMap, vec2(vWPos.x, -vWPos.z * triSignY) * 0.21).xyz * 2.0 - 1.0;
vec3 triNFront = texture2D(normalMap, vec2(vWPos.x, vWPos.y * triSignZ) * 0.21).xyz * 2.0 - 1.0;
vec3 triNSide = texture2D(normalMap, vec2(vWPos.z, -vWPos.y * triSignX) * 0.21).xyz * 2.0 - 1.0;
triNTop.xy *= normalScale;
triNFront.xy *= normalScale;
triNSide.xy *= normalScale;
vec3 triNTopW = normalize(vec3(triNTop.x, triNTop.z * triSignY, -triNTop.y * triSignY));
vec3 triNFrontW = normalize(vec3(triNFront.x, triNFront.y * triSignZ, triNFront.z * triSignZ));
vec3 triNSideW = normalize(vec3(triNSide.z * triSignX, -triNSide.y * triSignX, triNSide.x));
vec3 triNormalW = normalize(triNTopW * triBw.y + triNFrontW * triBw.z + triNSideW * triBw.x);
normal = normalize((viewMatrix * vec4(triNormalW, 0.0)).xyz);`,
      );
  };
  return mat;
}

/** ペイントオーバーレイ材質: アトラスを参照し、インク部分だけ光沢面として描く */
function makeOverlayMaterial(paint: PaintSystem): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.75,
    metalness: 0.0,
    transparent: true,
    depthWrite: false,
    envMapIntensity: 0.2,
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
float dryGrain = fract(sin(dot(floor(vUv * 1536.0), vec2(12.9898, 78.233))) * 43758.5453);
vec4 diffuseColor = vec4(inkCol * (1.0 - rim * 0.2), pm);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        'float roughnessFactor = clamp(roughness * mix(0.86, 1.22, dryGrain), 0.55, 0.85);',
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
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += inkCol * 0.045;',
      );
  };
  return mat;
}

function surfaceHash(x: number, y: number, seed: number): number {
  let n = Math.imul(x + seed * 1013, 374761393) + Math.imul(y - seed * 37, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function canvasMap(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/** ステージ固有の汚れ・退色をRGBとアルファで保持する、アルベド専用の色付きマップ。 */
function makeColorDetailTexture(natural: boolean): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);

  let seed = 0x7f4a7c15;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const rgba = (rgb: readonly number[], alpha: number) =>
    `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  const palette = natural
    ? [
        { rgb: [51, 78, 46] as const, alpha: 0.9 },   // 深い苔
        { rgb: [83, 105, 61] as const, alpha: 0.82 }, // 明るい苔
        { rgb: [91, 79, 59] as const, alpha: 0.86 },  // 湿った土
        { rgb: [78, 91, 84] as const, alpha: 0.8 },   // 濡れた岩
        { rgb: [142, 125, 72] as const, alpha: 0.74 }, // 朽ち葉
      ]
    : [
        { rgb: [142, 63, 24] as const, alpha: 0.92 },   // 茶錆
        { rgb: [39, 132, 122] as const, alpha: 0.84 },  // 青緑の錆
        { rgb: [44, 48, 58] as const, alpha: 0.86 },    // 煤
        { rgb: [225, 219, 190] as const, alpha: 0.76 }, // 日焼け・退色
        { rgb: [88, 48, 31] as const, alpha: 0.88 },    // 古い油染み
      ];

  // 大小の色ムラを、端を跨いでも継ぎ目なく反復する楕円ブロッチとして描く。
  for (let i = 0; i < 18; i++) {
    const x = random() * S;
    const y = random() * S;
    const radius = 18 + random() * 26;
    const aspect = 1.15 + random() * 1.65;
    const angle = random() * Math.PI;
    const stain = palette[Math.floor(random() * palette.length)];
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        ctx.save();
        ctx.translate(x + ox, y + oy);
        ctx.rotate(angle);
        ctx.scale(aspect, 1);
        const gradient = ctx.createRadialGradient(0, 0, radius * 0.06, 0, 0, radius);
        gradient.addColorStop(0, rgba(stain.rgb, stain.alpha));
        gradient.addColorStop(0.52, rgba(stain.rgb, stain.alpha * 0.68));
        gradient.addColorStop(1, rgba(stain.rgb, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
        ctx.restore();
      }
    }
  }

  // 壁では水垂れ、床では引きずり跡として読める不規則な色筋。
  ctx.lineCap = 'round';
  for (let i = 0; i < 24; i++) {
    const x = random() * S;
    const y = random() * S;
    const length = 26 + random() * 72;
    const earthy = random() > 0.46;
    ctx.strokeStyle = natural
      ? earthy
        ? rgba([83, 75, 57], 0.42 + random() * 0.28) // 土の跡
        : rgba([45, 67, 57], 0.38 + random() * 0.26) // 濡れた跡
      : earthy
        ? rgba([128, 59, 27], 0.42 + random() * 0.28)
        : rgba([33, 119, 116], 0.38 + random() * 0.26);
    ctx.lineWidth = 2.5 + random() * 5.0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + (random() - 0.5) * 9,
      y + length * 0.32,
      x + (random() - 0.5) * 13,
      y + length * 0.72,
      x + (random() - 0.5) * 10,
      y + length,
    );
    ctx.stroke();
  }

  if (!natural) {
    // 2m前後のパネル目地。暗い青灰帯に細い茶錆を添えて色域を明確に分ける。
    for (let i = 0; i <= S; i += 64) {
      ctx.strokeStyle = 'rgba(31,55,62,0.88)';
      ctx.lineWidth = 5.5;
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
      ctx.strokeStyle = 'rgba(137,65,28,0.62)';
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(i + 3.5, 0); ctx.lineTo(i + 3.5, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i + 3.5); ctx.lineTo(S, i + 3.5); ctx.stroke();
    }
  }

  const tex = canvasMap(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeNormalTexture(natural: boolean): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const height = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let groove = 0;
      if (!natural) {
        const tileX = x % 64;
        const tileY = y % 64;
        const jointDist = Math.min(tileX, 64 - tileX, tileY, 64 - tileY);
        groove = jointDist < 3 ? (1 - jointDist / 3) * 0.34 : 0;
      }
      const fine = (surfaceHash(x, y, 17) - 0.5) * 0.045;
      const worn = Math.sin(x * 0.17 + y * 0.09) * 0.018
        + Math.sin(x * 0.051 - y * 0.13) * 0.014;
      height[y * S + x] = fine + worn - groove;
    }
  }
  const image = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (height[y * S + (x + 1) % S] - height[y * S + (x + S - 1) % S]) * 1.8;
      const dy = (height[((y + 1) % S) * S + x] - height[((y + S - 1) % S) * S + x]) * 1.8;
      const invLen = 1 / Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      image.data[i] = (-dx * invLen * 0.5 + 0.5) * 255;
      image.data[i + 1] = (-dy * invLen * 0.5 + 0.5) * 255;
      image.data[i + 2] = invLen * 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvasMap(c);
}

function makeRoughnessTexture(natural: boolean): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const image = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let wear: number;
      let joint = 0;
      if (natural) {
        // Interfering waves form broad, non-grid patches like damp soil and worn moss.
        wear = Math.max(0, Math.min(1,
          0.48
          + Math.sin(x * 0.047 + y * 0.031) * 0.24
          + Math.sin(x * 0.019 - y * 0.061) * 0.18,
        ));
      } else {
        const localX = x % 64 - 32;
        const localY = y % 64 - 32;
        const jointDist = Math.min(x % 64, 64 - x % 64, y % 64, 64 - y % 64);
        wear = Math.max(0, 1 - Math.hypot(localX, localY) / 27);
        joint = jointDist < 3 ? (3 - jointDist) * 7 : 0;
      }
      const stain = Math.sin(x * 0.029 + y * 0.041) * 10
        + Math.sin(x * 0.071 - y * 0.023) * 7;
      const fine = (surfaceHash(x, y, 31) - 0.5) * 18;
      const value = Math.max(168, Math.min(255, 225 + stain + fine + joint - wear * 22));
      const i = (y * S + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvasMap(c);
}

function makeMetalnessTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const image = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const value = 205 + surfaceHash(x, y, 47) * 28;
      const i = (y * S + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  let seed = 0x5f3759df;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 18; i++) {
    const x = random() * S;
    const y = random() * S;
    const r = 8 + random() * 24;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(45,45,45,0.58)');
    g.addColorStop(1, 'rgba(45,45,45,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  for (let i = 0; i < 44; i++) {
    const x = random() * S;
    const y = random() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 5 + random() * 20, y - 2 + random() * 4);
    ctx.stroke();
  }
  return canvasMap(c);
}

function makeDetailTexture(natural: boolean): THREE.CanvasTexture {
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
  if (!natural) {
    // タイル目地。自然ステージでは描画自体を省き、ノイズとしみだけを残す。
    ctx.strokeStyle = 'rgba(40,44,52,0.4)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i <= S; i += 64) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
    }
  }
  return canvasMap(c);
}
