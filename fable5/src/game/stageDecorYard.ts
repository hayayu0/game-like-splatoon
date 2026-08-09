import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

interface TreeDef {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
}

interface FoliageDef {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  rotation: THREE.Euler;
  color: THREE.Color;
}

interface GrassPlacement {
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  yaw: number;
  phase: number;
}

interface GrassBed {
  x: number;
  y: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  heightScale?: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const TREE_DEFS: readonly TreeDef[] = [
  { x: -26, y: 0, z: 25.8, scale: 1.08, yaw: 0.1 },
  { x: -17, y: 0, z: 25.8, scale: 0.92, yaw: 1.2 },
  { x: -7, y: 0, z: 25.8, scale: 1.16, yaw: 2.5 },
  { x: 4, y: 0, z: 25.8, scale: 0.98, yaw: 0.8 },
  { x: 15, y: 0, z: 25.8, scale: 1.12, yaw: 2.1 },
  { x: 25, y: 0, z: 25.8, scale: 0.9, yaw: 1.6 },
  { x: -25, y: 0, z: -25.8, scale: 1.04, yaw: 2.8 },
  { x: -14, y: 0, z: -25.8, scale: 1.18, yaw: 0.4 },
  { x: -3, y: 0, z: -25.8, scale: 0.94, yaw: 1.9 },
  { x: 8, y: 0, z: -25.8, scale: 1.1, yaw: 2.3 },
  { x: 18, y: 0, z: -25.8, scale: 0.96, yaw: 0.7 },
  { x: 27, y: 0, z: -25.8, scale: 1.14, yaw: 1.4 },
  { x: -33.5, y: 0, z: -18, scale: 1.06, yaw: 0.2 },
  { x: -33.5, y: 0, z: -7, scale: 0.91, yaw: 2.4 },
  { x: -33.5, y: 0, z: 6, scale: 1.17, yaw: 1.1 },
  { x: -33.5, y: 0, z: 18, scale: 1, yaw: 2.9 },
  { x: 33.5, y: 0, z: -17, scale: 0.95, yaw: 1.8 },
  { x: 33.5, y: 0, z: -5, scale: 1.13, yaw: 0.5 },
  { x: 33.5, y: 0, z: 7, scale: 0.9, yaw: 2.6 },
  { x: 33.5, y: 0, z: 19, scale: 1.09, yaw: 1.3 },
  { x: 13.2, y: 2.5, z: -8.75, scale: 0.62, yaw: 0.4 },
  { x: -12.8, y: 2.5, z: 8.75, scale: 0.67, yaw: 2.2 },
  { x: 15.5, y: 2.5, z: 5.75, scale: 0.6, yaw: 1.5 },
  { x: -15.3, y: 2.5, z: -5.75, scale: 0.64, yaw: 2.8 },
  { x: -28.4, y: 0, z: 18.9, scale: 0.67, yaw: 0.9 },
  { x: 28.4, y: 0, z: 18.6, scale: 0.61, yaw: 2.5 },
  { x: -28.2, y: 0, z: -18.5, scale: 0.63, yaw: 1.7 },
  { x: 28.3, y: 0, z: -18.9, scale: 0.69, yaw: 0.3 },
];

const GRASS_BEDS: readonly GrassBed[] = [
  { x: -29.1, y: 0.02, z: 14.5, radiusX: 0.55, radiusZ: 3.2 },
  { x: -29.1, y: 0.02, z: -14.5, radiusX: 0.55, radiusZ: 3.2 },
  { x: 29.1, y: 0.02, z: 14.5, radiusX: 0.55, radiusZ: 3.2 },
  { x: 29.1, y: 0.02, z: -14.5, radiusX: 0.55, radiusZ: 3.2 },
  { x: -20, y: 0.02, z: 21.25, radiusX: 3, radiusZ: 0.45 },
  { x: -8, y: 0.02, z: 21.25, radiusX: 3, radiusZ: 0.45 },
  { x: 8, y: 0.02, z: 21.25, radiusX: 3, radiusZ: 0.45 },
  { x: 20, y: 0.02, z: 21.25, radiusX: 3, radiusZ: 0.45 },
  { x: -20, y: 0.02, z: -21.25, radiusX: 3, radiusZ: 0.45 },
  { x: -8, y: 0.02, z: -21.25, radiusX: 3, radiusZ: 0.45 },
  { x: 8, y: 0.02, z: -21.25, radiusX: 3, radiusZ: 0.45 },
  { x: 20, y: 0.02, z: -21.25, radiusX: 3, radiusZ: 0.45 },
  { x: 10.5, y: 2.52, z: -9.75, radiusX: 2.4, radiusZ: 0.22 },
  { x: -10.5, y: 2.52, z: 9.75, radiusX: 2.4, radiusZ: 0.22 },
  { x: 13.5, y: 2.52, z: 6.75, radiusX: 2.3, radiusZ: 0.22 },
  { x: -13.5, y: 2.52, z: -6.75, radiusX: 2.3, radiusZ: 0.22 },
  // 外周の隅と南北端。高草は主導線の外側に寄せる。
  { x: -29.1, y: 0.02, z: 20, radiusX: 0.45, radiusZ: 1.15, heightScale: 1.8 },
  { x: -29.1, y: 0.02, z: -20, radiusX: 0.45, radiusZ: 1.15, heightScale: 1.8 },
  { x: 29.1, y: 0.02, z: 20, radiusX: 0.45, radiusZ: 1.15, heightScale: 1.8 },
  { x: 29.1, y: 0.02, z: -20, radiusX: 0.45, radiusZ: 1.15, heightScale: 1.8 },
  { x: 0, y: 0.02, z: 21.25, radiusX: 2.2, radiusZ: 0.4, heightScale: 1.7 },
  { x: 0, y: 0.02, z: -21.25, radiusX: 2.2, radiusZ: 0.4, heightScale: 1.7 },
  // 大型遮蔽物の外向きの縁は高草、中央側の角は通常の草で覆う。
  { x: 8.2, y: 0.02, z: -10.45, radiusX: 1, radiusZ: 0.18, heightScale: 1.75 },
  { x: 13.45, y: 0.02, z: -6.92, radiusX: 0.5, radiusZ: 0.18 },
  { x: -8.2, y: 0.02, z: 10.45, radiusX: 1, radiusZ: 0.18, heightScale: 1.75 },
  { x: -13.45, y: 0.02, z: 6.92, radiusX: 0.5, radiusZ: 0.18 },
  { x: 16.1, y: 0.02, z: 7.45, radiusX: 0.7, radiusZ: 0.18, heightScale: 1.75 },
  { x: 9.75, y: 0.02, z: 5.5, radiusX: 0.18, radiusZ: 0.7 },
  { x: -16.1, y: 0.02, z: -7.45, radiusX: 0.7, radiusZ: 0.18, heightScale: 1.75 },
  { x: -9.75, y: 0.02, z: -5.5, radiusX: 0.18, radiusZ: 0.7 },
  // 中央床と小型遮蔽物の角。狭い帯にして通路中央を空ける。
  { x: -5.45, y: 0.02, z: -4.3, radiusX: 0.2, radiusZ: 0.7 },
  { x: 5.45, y: 0.02, z: 4.3, radiusX: 0.2, radiusZ: 0.7 },
  { x: -4.3, y: 0.02, z: 5.45, radiusX: 0.7, radiusZ: 0.2 },
  { x: 4.3, y: 0.02, z: -5.45, radiusX: 0.7, radiusZ: 0.2 },
  { x: 7.65, y: 0.02, z: 11.5, radiusX: 0.18, radiusZ: 0.65, heightScale: 1.7 },
  { x: -7.65, y: 0.02, z: -11.5, radiusX: 0.18, radiusZ: 0.65, heightScale: 1.7 },
];

const PUDDLE_DEFS = [
  // x, z, x半径, z半径, 回転, 高さ
  [-27.1, 18.1, 1.7, 0.82, 0.2, 0.028], [26.8, 18.4, 1.45, 0.72, 2.1, 0.028],
  [-27.2, -18.2, 1.55, 0.76, 1.5, 0.028], [27, -18.3, 1.8, 0.7, 2.8, 0.028],
  [-18.2, 20.6, 1.35, 0.62, 0.7, 0.028], [17.4, 20.8, 1.6, 0.68, 2.5, 0.028],
  [-17.6, -20.7, 1.45, 0.72, 1.1, 0.028], [18.1, -20.5, 1.3, 0.6, 2.9, 0.028],
  // 遮蔽物の陰と通路の隅。
  [8.2, -6.55, 1.05, 0.4, 0.35, 0.028], [-8.2, 6.55, 1.05, 0.4, 1.9, 0.028],
  [16.8, 8.1, 1.2, 0.46, 2.65, 0.028], [-16.8, -8.1, 1.2, 0.46, 0.8, 0.028],
  [22.1, 12.8, 1.35, 0.55, 0.15, 0.028], [-22.1, -12.8, 1.35, 0.55, 1.7, 0.028],
  [7.8, 12.8, 0.9, 0.36, 2.4, 0.028], [-7.8, -12.8, 0.9, 0.36, 0.65, 0.028],
  // 高台の縁。射線中央を避け、短辺側へ寄せる。
  [12.45, -8.05, 0.78, 0.3, 0.1, 2.528], [-12.45, 8.05, 0.78, 0.3, 1.8, 2.528],
  [15.5, 5.1, 0.7, 0.28, 2.7, 2.528], [-15.5, -5.1, 0.7, 0.28, 0.9, 2.528],
] as const;

/** フォレストグレン専用の遠景・外周装飾。すべて非衝突・非ペイント登録。 */
export function buildYardDecor(): { group: THREE.Group; update(t: number, dt: number): void } {
  const group = new THREE.Group();
  group.name = 'forest-glen-decor';

  const random = seededRandom(0x5a17c0de);
  const leafTexture = makeLeafTexture();
  const barkTexture = makeBarkTexture();
  const grassTexture = makeGrassTexture();
  const waterTexture = makeWaterTexture();

  const barkMaterial = new THREE.MeshStandardMaterial({
    map: barkTexture,
    // The texture already contains the bark albedo; a second brown tint made
    // shadowed trunks nearly black because map and material colors multiply.
    color: '#ffffff',
    roughness: 0.96,
    metalness: 0,
  });
  const leafMaterial = new THREE.MeshStandardMaterial({
    map: leafTexture,
    // setColorAt() enables Three.js's instancing-color shader path by itself.
    // vertexColors would additionally read a missing geometry color attribute,
    // whose zero default would cancel every instance color.
    color: '#ffffff',
    roughness: 0.9,
    metalness: 0,
  });

  const trunkParts: THREE.BufferGeometry[] = [];
  const roundFoliage: FoliageDef[] = [];
  const conicalFoliage: FoliageDef[] = [];
  const flatFoliage: FoliageDef[] = [];
  TREE_DEFS.forEach((tree, index) => {
    addTree(tree, index, trunkParts, roundFoliage, conicalFoliage, flatFoliage);
  });

  const trunks = new THREE.Mesh(mergeParts(trunkParts), barkMaterial);
  trunks.name = 'forest-tree-trunks';
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  group.add(trunks);

  group.add(
    createFoliageMesh(new THREE.SphereGeometry(1, 9, 7), leafMaterial, roundFoliage, 'forest-round-foliage'),
    createFoliageMesh(new THREE.ConeGeometry(1, 1.8, 9, 2), leafMaterial, conicalFoliage, 'forest-conical-foliage'),
    createFoliageMesh(new THREE.SphereGeometry(1, 9, 6), leafMaterial, flatFoliage, 'forest-flat-foliage'),
  );

  const grassPlacements = makeGrassPlacements(random);
  const grassMaterial = new THREE.MeshStandardMaterial({
    map: grassTexture,
    color: '#78945b',
    roughness: 0.92,
    metalness: 0,
    transparent: true,
    alphaTest: 0.32,
    side: THREE.DoubleSide,
  });
  const grass = new THREE.InstancedMesh(makeGrassGeometry(), grassMaterial, grassPlacements.length);
  grass.name = 'forest-wind-grass';
  grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grass.frustumCulled = false;
  grass.receiveShadow = true;
  group.add(grass);

  const waterMaterial = new THREE.MeshPhysicalMaterial({
    map: waterTexture,
    color: '#789b94',
    roughness: 0.16,
    metalness: 0.08,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const puddles = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 36), waterMaterial, PUDDLE_DEFS.length);
  puddles.name = 'forest-shallow-puddles';
  puddles.renderOrder = 2;
  const dummy = new THREE.Object3D();
  PUDDLE_DEFS.forEach(([x, z, radiusX, radiusZ, rotation, y], index) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(-Math.PI / 2, 0, rotation);
    dummy.scale.set(radiusX, radiusZ, 1);
    dummy.updateMatrix();
    puddles.setMatrixAt(index, dummy.matrix);
  });
  puddles.instanceMatrix.needsUpdate = true;
  group.add(puddles);

  group.add(buildRockClusters(random), buildFallenLogs(barkMaterial), buildMushroomClusters(random));

  let fallbackTime = 0;
  const update = (t: number, dt: number) => {
    fallbackTime += Math.min(Math.max(dt, 0), 0.1);
    const time = Number.isFinite(t) ? t : fallbackTime;
    for (let i = 0; i < grassPlacements.length; i++) {
      const blade = grassPlacements[i];
      const gust = Math.sin(time * 1.45 + blade.phase) * 0.075;
      const ripple = Math.sin(time * 2.3 + blade.phase * 1.7) * 0.025;
      dummy.position.set(blade.x, blade.y, blade.z);
      dummy.rotation.set(gust, blade.yaw, ripple, 'XYZ');
      dummy.scale.set(blade.scaleX, blade.scaleY, blade.scaleX);
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
    }
    grass.instanceMatrix.needsUpdate = true;
    waterMaterial.opacity = 0.55 + Math.sin(time * 0.72) * 0.035;
    waterMaterial.roughness = 0.15 + Math.sin(time * 0.47 + 0.8) * 0.025;
    waterTexture.rotation = Math.sin(time * 0.16) * 0.018;
  };

  update(0, 0);
  return { group, update };
}

function addTree(
  tree: TreeDef,
  index: number,
  trunkParts: THREE.BufferGeometry[],
  roundFoliage: FoliageDef[],
  conicalFoliage: FoliageDef[],
  flatFoliage: FoliageDef[],
) {
  const random = seededRandom(0x2468ace + index * 977);
  const height = (7.2 + random() * 2.2) * tree.scale;
  const bendX = Math.cos(tree.yaw) * height * (0.035 + random() * 0.018);
  const bendZ = Math.sin(tree.yaw) * height * (0.035 + random() * 0.018);
  const base = new THREE.Vector3(tree.x, tree.y, tree.z);
  const lower = new THREE.Vector3(tree.x + bendX * 0.18, tree.y + height * 0.35, tree.z + bendZ * 0.18);
  const middle = new THREE.Vector3(tree.x + bendX * 0.56, tree.y + height * 0.7, tree.z + bendZ * 0.56);
  const crown = new THREE.Vector3(tree.x + bendX, tree.y + height, tree.z + bendZ);
  trunkParts.push(
    taperedCylinderBetween(base, lower, tree.scale * 0.38, tree.scale * 0.57, 9),
    taperedCylinderBetween(lower, middle, tree.scale * 0.25, tree.scale * 0.4, 9),
    taperedCylinderBetween(middle, crown, tree.scale * 0.13, tree.scale * 0.27, 8),
  );

  const greens = ['#415f35', '#557441', '#6f884d', '#354e31', '#7d955d'];
  for (let i = 0; i < 4; i++) {
    const angle = tree.yaw + i * Math.PI * 0.5 + random() * 0.42;
    const distance = (0.65 + random() * 0.55) * tree.scale;
    roundFoliage.push({
      position: crown.clone().add(new THREE.Vector3(
        Math.cos(angle) * distance,
        (-0.15 + random() * 1.35) * tree.scale,
        Math.sin(angle) * distance,
      )),
      scale: new THREE.Vector3(
        (1.55 + random() * 0.65) * tree.scale,
        (1.25 + random() * 0.55) * tree.scale,
        (1.5 + random() * 0.7) * tree.scale,
      ),
      rotation: new THREE.Euler(random() * 0.22, random() * Math.PI, random() * 0.18),
      color: new THREE.Color(greens[(index + i) % greens.length]),
    });
  }
  for (let i = 0; i < 2; i++) {
    conicalFoliage.push({
      position: crown.clone().add(new THREE.Vector3(
        (random() - 0.5) * tree.scale * 1.4,
        (1.2 + i * 0.8) * tree.scale,
        (random() - 0.5) * tree.scale * 1.4,
      )),
      scale: new THREE.Vector3(
        (1.35 + random() * 0.4) * tree.scale,
        (1.35 + random() * 0.5) * tree.scale,
        (1.35 + random() * 0.4) * tree.scale,
      ),
      rotation: new THREE.Euler(0, random() * Math.PI, (random() - 0.5) * 0.12),
      color: new THREE.Color(greens[(index + i + 2) % greens.length]),
    });
  }
  for (let i = 0; i < 2; i++) {
    flatFoliage.push({
      position: crown.clone().add(new THREE.Vector3(
        (random() - 0.5) * tree.scale * 2.2,
        (-0.7 + i * 0.65) * tree.scale,
        (random() - 0.5) * tree.scale * 2.2,
      )),
      scale: new THREE.Vector3(
        (2 + random() * 0.65) * tree.scale,
        (0.72 + random() * 0.24) * tree.scale,
        (1.85 + random() * 0.7) * tree.scale,
      ),
      rotation: new THREE.Euler(0, random() * Math.PI, 0),
      color: new THREE.Color(greens[(index + i + 3) % greens.length]),
    });
  }
}

function createFoliageMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
  foliage: FoliageDef[],
  name: string,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, foliage.length);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  foliage.forEach((cluster, index) => {
    dummy.position.copy(cluster.position);
    dummy.rotation.copy(cluster.rotation);
    dummy.scale.copy(cluster.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, cluster.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function makeGrassPlacements(random: () => number): GrassPlacement[] {
  const placements: GrassPlacement[] = [];
  for (const bed of GRASS_BEDS) {
    for (let i = 0; i < 12; i++) {
      placements.push({
        x: bed.x + (random() - 0.5) * bed.radiusX * 2,
        y: bed.y,
        z: bed.z + (random() - 0.5) * bed.radiusZ * 2,
        scaleX: 0.72 + random() * 0.48,
        scaleY: (0.7 + random() * 0.48) * (bed.heightScale ?? 1),
        yaw: random() * Math.PI,
        phase: random() * Math.PI * 2,
      });
    }
  }
  return placements;
}

function makeGrassGeometry(): THREE.BufferGeometry {
  const planes: THREE.BufferGeometry[] = [];
  for (const rotation of [0, Math.PI / 3, Math.PI * 2 / 3]) {
    const plane = new THREE.PlaneGeometry(0.34, 0.58, 1, 2);
    plane.translate(0, 0.29, 0);
    plane.rotateY(rotation);
    planes.push(plane);
  }
  return mergeParts(planes);
}

function buildRockClusters(random: () => number): THREE.InstancedMesh {
  const sites = [
    [-28.7, 19.2, 0.05], [28.7, 19, 0.05], [-28.6, -19, 0.05], [28.6, -19.2, 0.05],
    [-20, 21, 0.05], [20, 21, 0.05], [-20, -21, 0.05], [20, -21, 0.05],
    [9.2, -9.4, 2.53], [-9.2, 9.4, 2.53], [14.4, 6.4, 2.53], [-14.4, -6.4, 2.53],
  ] as const;
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: '#65766d',
    roughness: 0.82,
    metalness: 0.04,
    vertexColors: true,
  });
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.72, 0), rockMaterial, sites.length * 3);
  rocks.name = 'forest-wet-rocks';
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  const colors = ['#52645b', '#6c7d71', '#485b50', '#778278'];
  const dummy = new THREE.Object3D();
  let index = 0;
  for (const [x, z, y] of sites) {
    for (let i = 0; i < 3; i++) {
      const scale = 0.3 + random() * 0.44;
      dummy.position.set(x + (random() - 0.5) * 1.5, y + scale * 0.42, z + (random() - 0.5) * 1.5);
      dummy.rotation.set(random() * 0.7, random() * Math.PI, random() * 0.45);
      dummy.scale.set(scale * (0.85 + random() * 0.5), scale * (0.65 + random() * 0.35), scale);
      dummy.updateMatrix();
      rocks.setMatrixAt(index, dummy.matrix);
      rocks.setColorAt(index, new THREE.Color(colors[index % colors.length]));
      index++;
    }
  }
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  return rocks;
}

function buildFallenLogs(material: THREE.MeshStandardMaterial): THREE.Mesh {
  const logs = [
    [8.1, 2.66, -9.05, 11.6, 2.75, -9.05, 0.34],
    [-12.2, 2.68, 9.15, -8.7, 2.77, 9.15, 0.31],
    [11.2, 2.67, 5.55, 14.7, 2.76, 5.55, 0.32],
    [-15.2, 2.67, -5.6, -11.7, 2.75, -5.6, 0.33],
    [-26.4, 0.3, 20.2, -23.4, 0.42, 19.2, 0.38],
    [23.8, 0.32, -19.1, 26.8, 0.43, -20, 0.36],
  ] as const;
  const parts = logs.map(([x0, y0, z0, x1, y1, z1, radius]) => taperedCylinderBetween(
    new THREE.Vector3(x0, y0, z0),
    new THREE.Vector3(x1, y1, z1),
    radius * 0.86,
    radius,
    11,
  ));
  const mesh = new THREE.Mesh(mergeParts(parts), material);
  mesh.name = 'forest-fallen-logs';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildMushroomClusters(random: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'forest-mushrooms';
  const sites = [
    [-27.8, 18.9, 0.03], [27.7, 18.7, 0.03], [-27.7, -18.8, 0.03], [27.8, -19, 0.03],
    [8.4, -9.5, 2.53], [-8.4, 9.5, 2.53], [15.7, 6.3, 2.53], [-15.7, -6.3, 2.53],
  ] as const;
  const count = 32;
  const stemMaterial = new THREE.MeshStandardMaterial({ color: '#c9c2a3', roughness: 0.9 });
  const capMaterial = new THREE.MeshStandardMaterial({ color: '#8a5c48', roughness: 0.84, vertexColors: true });
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 0.46, 7), stemMaterial, count);
  const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.25, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.56), capMaterial, count);
  stems.name = 'forest-mushroom-stems';
  caps.name = 'forest-mushroom-caps';
  const capColors = ['#845445', '#9b684e', '#6f5142', '#a47a58'];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const [siteX, siteZ, siteY] = sites[i % sites.length];
    const heightScale = 0.55 + random() * 0.75;
    const x = siteX + (random() - 0.5) * 1.3;
    const z = siteZ + (random() - 0.5) * 1.3;
    dummy.position.set(x, siteY + 0.23 * heightScale, z);
    dummy.rotation.set(0, random() * Math.PI, (random() - 0.5) * 0.1);
    dummy.scale.set(0.8 + random() * 0.3, heightScale, 0.8 + random() * 0.3);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    dummy.position.y = siteY + 0.46 * heightScale;
    dummy.scale.set(0.7 + random() * 0.65, 0.55 + random() * 0.28, 0.7 + random() * 0.65);
    dummy.updateMatrix();
    caps.setMatrixAt(i, dummy.matrix);
    caps.setColorAt(i, new THREE.Color(capColors[i % capColors.length]));
  }
  stems.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
  stems.castShadow = true;
  caps.castShadow = true;
  group.add(stems, caps);
  return group;
}

function taperedCylinderBetween(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radiusTop: number,
  radiusBottom: number,
  radialSegments: number,
): THREE.BufferGeometry {
  const delta = new THREE.Vector3().subVectors(b, a);
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, delta.length(), radialSegments, 1, false);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, delta.normalize());
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
    quaternion,
    new THREE.Vector3(1, 1, 1),
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge forest decor geometry');
  for (const part of parts) part.dispose();
  return merged;
}

function makeLeafTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  // Keep this a light tonal map: the cluster hue comes from instanceColor.
  gradient.addColorStop(0, '#eef2da');
  gradient.addColorStop(0.5, '#c5d0ae');
  gradient.addColorStop(1, '#91a37e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const random = seededRandom(0x41ea92);
  for (let i = 0; i < 420; i++) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = 1.5 + random() * 8;
    const light = random() > 0.52;
    ctx.fillStyle = light
      ? `rgba(245,250,220,${0.035 + random() * 0.13})`
      : `rgba(42,58,38,${0.045 + random() * 0.15})`;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * (0.45 + random() * 0.5), random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(245,248,220,${0.035 + random() * 0.06})`;
    ctx.lineWidth = 0.5 + random();
    ctx.beginPath();
    const x = random() * canvas.width;
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + random() * 18 - 9, 38, x + random() * 20 - 10, 84, x + random() * 22 - 11, 128);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.6, 1.6);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeBarkTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, '#3f3429');
  gradient.addColorStop(0.45, '#765f43');
  gradient.addColorStop(1, '#493b2e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const random = seededRandom(0xb4a6c1);
  for (let i = 0; i < 155; i++) {
    const x = random() * canvas.width;
    ctx.strokeStyle = random() > 0.35 ? 'rgba(25,20,15,0.28)' : 'rgba(178,150,102,0.16)';
    ctx.lineWidth = 0.6 + random() * 2.4;
    ctx.beginPath();
    ctx.moveTo(x, -5);
    ctx.bezierCurveTo(x + random() * 8 - 4, 35, x + random() * 10 - 5, 86, x + random() * 8 - 4, 133);
    ctx.stroke();
  }
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = `rgba(91,119,64,${0.05 + random() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(random() * 128, random() * 128, 2 + random() * 8, 1 + random() * 4, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2.8);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeGrassTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const random = seededRandom(0x3ca771);
  for (let i = 0; i < 11; i++) {
    const baseX = 24 + random() * 80;
    const width = 3 + random() * 7;
    const tipX = baseX + (random() - 0.5) * 28;
    const height = 56 + random() * 65;
    const green = 82 + Math.floor(random() * 62);
    const blade = ctx.createLinearGradient(0, 128, 0, 128 - height);
    blade.addColorStop(0, `rgba(45,75,37,0.96)`);
    blade.addColorStop(0.58, `rgba(${green - 26},${green},${green - 48},0.94)`);
    blade.addColorStop(1, `rgba(${green + 28},${green + 38},${green - 10},0.12)`);
    ctx.fillStyle = blade;
    ctx.beginPath();
    ctx.moveTo(baseX - width, 128);
    ctx.quadraticCurveTo(baseX, 128 - height * 0.58, tipX, 128 - height);
    ctx.quadraticCurveTo(baseX + width * 0.35, 128 - height * 0.48, baseX + width, 128);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeWaterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const water = ctx.createRadialGradient(64, 61, 8, 64, 64, 63);
  water.addColorStop(0, 'rgba(172,211,204,0.88)');
  water.addColorStop(0.68, 'rgba(87,137,130,0.72)');
  water.addColorStop(0.9, 'rgba(66,105,94,0.42)');
  water.addColorStop(1, 'rgba(43,76,64,0)');
  ctx.fillStyle = water;
  ctx.fillRect(0, 0, 128, 128);
  const random = seededRandom(0x76c4e2);
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = `rgba(218,238,227,${0.045 + random() * 0.1})`;
    ctx.lineWidth = 0.6 + random() * 1.2;
    ctx.beginPath();
    const x = 16 + random() * 86;
    const y = 20 + random() * 88;
    ctx.ellipse(x, y, 8 + random() * 25, 2 + random() * 5, random() * 0.35, 0, Math.PI * 2);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.center.set(0.5, 0.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
