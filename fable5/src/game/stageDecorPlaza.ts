import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

interface BillboardPlacement {
  position: THREE.Vector3;
  rotationY: number;
  phase: number;
}

interface BeaconPlacement {
  position: THREE.Vector3;
  phase: number;
  scale: number;
}

const BILLBOARD_WIDTH = 5.6;
const BILLBOARD_HEIGHT = 2.8;
const WALL_TOP = 3.4;

/** ネオンプラザ専用の広告パネルと浮遊ホロビーコンを生成する。 */
export function buildPlazaDecor(): { group: THREE.Group; update(t: number, dt: number): void } {
  const group = new THREE.Group();
  group.name = 'plaza-decor';

  const billboardPlacements: BillboardPlacement[] = [
    { position: new THREE.Vector3(-18.2, 6.25, 22.3), rotationY: Math.PI, phase: 0.2 },
    { position: new THREE.Vector3(17.4, 6.55, -22.3), rotationY: 0, phase: 2.3 },
    { position: new THREE.Vector3(30.4, 6.45, 11.8), rotationY: -Math.PI / 2, phase: 4.5 },
  ];
  const billboardTexture = makeBillboardTexture();
  const billboardMaterial = new THREE.MeshStandardMaterial({
    color: '#15203a',
    map: billboardTexture,
    emissive: '#d9faff',
    emissiveMap: billboardTexture,
    emissiveIntensity: 1.75,
    metalness: 0.15,
    roughness: 0.28,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const billboardScreens = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(BILLBOARD_WIDTH, BILLBOARD_HEIGHT),
    billboardMaterial,
    billboardPlacements.length,
  );
  billboardScreens.name = 'plaza-holo-billboards';
  billboardScreens.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  billboardScreens.renderOrder = 2;

  const frameGeometries: THREE.BufferGeometry[] = [];
  const frameRotation = new THREE.Quaternion();
  const unitScale = new THREE.Vector3(1, 1, 1);
  for (const placement of billboardPlacements) {
    frameRotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.rotationY);
    const rootMatrix = new THREE.Matrix4().compose(placement.position, frameRotation, unitScale);
    addFramePart(frameGeometries, rootMatrix, BILLBOARD_WIDTH + 0.48, 0.18, 0.24, 0, BILLBOARD_HEIGHT / 2 + 0.12, 0);
    addFramePart(frameGeometries, rootMatrix, BILLBOARD_WIDTH + 0.48, 0.18, 0.24, 0, -BILLBOARD_HEIGHT / 2 - 0.12, 0);
    addFramePart(frameGeometries, rootMatrix, 0.18, BILLBOARD_HEIGHT, 0.24, -BILLBOARD_WIDTH / 2 - 0.15, 0, 0);
    addFramePart(frameGeometries, rootMatrix, 0.18, BILLBOARD_HEIGHT, 0.24, BILLBOARD_WIDTH / 2 + 0.15, 0, 0);

    const supportHeight = placement.position.y - BILLBOARD_HEIGHT / 2 - WALL_TOP;
    addFramePart(frameGeometries, rootMatrix, 0.14, supportHeight, 0.14, -1.9, -BILLBOARD_HEIGHT / 2 - supportHeight / 2, 0);
    addFramePart(frameGeometries, rootMatrix, 0.14, supportHeight, 0.14, 1.9, -BILLBOARD_HEIGHT / 2 - supportHeight / 2, 0);
  }
  const mergedFrames = mergeGeometries(frameGeometries, false);
  for (const geometry of frameGeometries) geometry.dispose();
  if (!mergedFrames) throw new Error('Failed to merge plaza billboard frames');
  const billboardFrames = new THREE.Mesh(
    mergedFrames,
    new THREE.MeshStandardMaterial({
      color: '#273243',
      emissive: '#5eeaff',
      emissiveIntensity: 0.22,
      metalness: 0.72,
      roughness: 0.3,
    }),
  );
  billboardFrames.name = 'plaza-billboard-frames';
  billboardFrames.castShadow = true;

  const beaconPlacements: BeaconPlacement[] = [
    { position: new THREE.Vector3(20.5, 6.55, 16.7), phase: 0.4, scale: 0.92 },
    { position: new THREE.Vector3(-20.2, 6.85, -16.7), phase: 2.6, scale: 1.0 },
    { position: new THREE.Vector3(-23.0, 6.35, 16.7), phase: 4.8, scale: 0.84 },
  ];
  const beaconTexture = makeBeaconTexture();
  const beaconCoreMaterial = new THREE.MeshStandardMaterial({
    color: '#b8f8ff',
    map: beaconTexture,
    emissive: '#57ddff',
    emissiveMap: beaconTexture,
    emissiveIntensity: 1.55,
    metalness: 0.35,
    roughness: 0.25,
  });
  const beaconCores = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.52, 1),
    beaconCoreMaterial,
    beaconPlacements.length,
  );
  beaconCores.name = 'plaza-holo-beacon-cores';
  beaconCores.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const beaconRingMaterial = new THREE.MeshStandardMaterial({
    color: '#a2ecff',
    map: beaconTexture,
    emissive: '#ff68d5',
    emissiveMap: beaconTexture,
    emissiveIntensity: 1.7,
    metalness: 0.2,
    roughness: 0.3,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beaconRings = new THREE.InstancedMesh(
    new THREE.TorusGeometry(0.92, 0.055, 6, 28),
    beaconRingMaterial,
    beaconPlacements.length * 2,
  );
  beaconRings.name = 'plaza-holo-beacon-rings';
  beaconRings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  beaconRings.renderOrder = 2;

  const interiorDecor = buildPlazaInteriorDecor(billboardTexture, beaconTexture);
  group.add(billboardFrames, billboardScreens, beaconCores, beaconRings, interiorDecor);

  const matrixObject = new THREE.Object3D();
  const update = (t: number, dt: number) => {
    billboardTexture.offset.x = (billboardTexture.offset.x + dt * 0.018) % 1;
    const flicker = 0.94 + Math.sin(t * 2.7) * 0.035 + Math.sin(t * 11.3) * 0.018;
    billboardMaterial.emissiveIntensity = 1.75 * flicker;
    billboardMaterial.opacity = 0.84 + flicker * 0.06;

    for (let i = 0; i < billboardPlacements.length; i++) {
      const placement = billboardPlacements[i];
      matrixObject.position.copy(placement.position);
      matrixObject.position.y += Math.sin(t * 1.25 + placement.phase) * 0.035;
      matrixObject.rotation.set(0, placement.rotationY, 0);
      matrixObject.scale.setScalar(1);
      matrixObject.updateMatrix();
      billboardScreens.setMatrixAt(i, matrixObject.matrix);
    }
    billboardScreens.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < beaconPlacements.length; i++) {
      const placement = beaconPlacements[i];
      const floatY = Math.sin(t * 0.9 + placement.phase) * 0.22;
      const pulse = placement.scale * (1 + Math.sin(t * 1.7 + placement.phase) * 0.035);
      matrixObject.position.set(placement.position.x, placement.position.y + floatY, placement.position.z);
      matrixObject.rotation.set(t * 0.28 + placement.phase, t * 0.7 + placement.phase, t * 0.18);
      matrixObject.scale.setScalar(pulse);
      matrixObject.updateMatrix();
      beaconCores.setMatrixAt(i, matrixObject.matrix);

      for (let ringIndex = 0; ringIndex < 2; ringIndex++) {
        matrixObject.position.set(placement.position.x, placement.position.y + floatY, placement.position.z);
        matrixObject.rotation.set(
          Math.PI / 2 + ringIndex * 0.85 + Math.sin(t * 0.45 + placement.phase) * 0.16,
          (ringIndex === 0 ? 1 : -1) * t * 0.42 + placement.phase,
          t * (ringIndex === 0 ? 0.55 : -0.38),
        );
        matrixObject.scale.setScalar(pulse * (1 + ringIndex * 0.2));
        matrixObject.updateMatrix();
        beaconRings.setMatrixAt(i * 2 + ringIndex, matrixObject.matrix);
      }
    }
    beaconCores.instanceMatrix.needsUpdate = true;
    beaconRings.instanceMatrix.needsUpdate = true;
    beaconCoreMaterial.emissiveIntensity = 1.45 + Math.sin(t * 2.1) * 0.16;
    beaconRingMaterial.opacity = 0.76 + Math.sin(t * 1.6) * 0.08;
  };

  update(0, 0);
  billboardScreens.computeBoundingSphere();
  beaconCores.computeBoundingSphere();
  beaconRings.computeBoundingSphere();
  return { group, update };
}

/** 高台の縁と既存遮蔽物の上だけに置く、非衝突の内部装飾。 */
function buildPlazaInteriorDecor(
  metalTexture: THREE.CanvasTexture,
  glowTexture: THREE.CanvasTexture,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'plaza-interior-decor';

  const poleParts: THREE.BufferGeometry[] = [];
  const base = new THREE.CylinderGeometry(0.34, 0.42, 0.22, 12);
  base.translate(0, 0.11, 0);
  poleParts.push(base);
  const stem = new THREE.CylinderGeometry(0.1, 0.14, 1.38, 10);
  stem.translate(0, 0.84, 0);
  poleParts.push(stem);
  const collar = new THREE.TorusGeometry(0.19, 0.045, 6, 18);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 1.49, 0);
  poleParts.push(collar);
  const poleGeometry = mergeGeometries(poleParts, false);
  for (const part of poleParts) part.dispose();
  if (!poleGeometry) throw new Error('Failed to merge plaza interior poles');

  const poleMaterial = new THREE.MeshStandardMaterial({
    map: metalTexture,
    color: '#8da2b8',
    emissive: '#17354c',
    emissiveIntensity: 0.24,
    metalness: 0.62,
    roughness: 0.38,
  });
  const polePlacements = [
    new THREE.Vector3(-13, 2.0, 13.14),
    new THREE.Vector3(-10, 2.0, 13.14),
    new THREE.Vector3(-5, 2.0, 13.14),
    new THREE.Vector3(0, 2.0, 13.14),
    new THREE.Vector3(5, 2.0, 13.14),
    new THREE.Vector3(10, 2.0, 13.14),
    new THREE.Vector3(-10, 2.0, -13.14),
    new THREE.Vector3(-5, 2.0, -13.14),
    new THREE.Vector3(0, 2.0, -13.14),
    new THREE.Vector3(5, 2.0, -13.14),
    new THREE.Vector3(10, 2.0, -13.14),
    new THREE.Vector3(13, 2.0, -13.14),
  ];
  const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, polePlacements.length);
  poles.name = 'plaza-interior-neon-poles';
  poles.castShadow = true;

  const globeMaterial = new THREE.MeshStandardMaterial({
    map: glowTexture,
    color: '#d9fbff',
    emissiveMap: glowTexture,
    emissive: '#67eaff',
    emissiveIntensity: 1.7,
    metalness: 0.14,
    roughness: 0.22,
  });
  const globeGeometry = new THREE.SphereGeometry(0.29, 14, 9);
  globeGeometry.translate(0, 1.72, 0);
  const globes = new THREE.InstancedMesh(globeGeometry, globeMaterial, polePlacements.length);
  globes.name = 'plaza-interior-neon-globes';

  const dummy = new THREE.Object3D();
  const cyan = new THREE.Color('#a9f7ff');
  const magenta = new THREE.Color('#ff9adf');
  polePlacements.forEach((position, index) => {
    dummy.position.copy(position);
    dummy.rotation.y = index % 2 === 0 ? 0 : Math.PI / 3;
    dummy.updateMatrix();
    poles.setMatrixAt(index, dummy.matrix);
    globes.setMatrixAt(index, dummy.matrix);
    globes.setColorAt(index, index % 2 === 0 ? cyan : magenta);
  });
  poles.instanceMatrix.needsUpdate = true;
  globes.instanceMatrix.needsUpdate = true;
  if (globes.instanceColor) globes.instanceColor.needsUpdate = true;

  const domePlacements = [
    new THREE.Vector3(2.8, 2.5, 2.8),
    new THREE.Vector3(-2.8, 2.5, -2.8),
    new THREE.Vector3(9.9, 1.6, -3.9),
    new THREE.Vector3(-9.9, 1.6, 3.9),
    new THREE.Vector3(3.3, 1.6, 10.3),
    new THREE.Vector3(-3.3, 1.6, -10.3),
    new THREE.Vector3(10.7, 1.1, 15.1),
    new THREE.Vector3(-10.7, 1.1, -15.1),
  ];
  const domeGeometry = new THREE.SphereGeometry(0.48, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeMaterial = new THREE.MeshStandardMaterial({
    map: glowTexture,
    color: '#b9eef5',
    emissiveMap: glowTexture,
    emissive: '#cf55d8',
    emissiveIntensity: 0.82,
    metalness: 0.3,
    roughness: 0.3,
  });
  const domes = new THREE.InstancedMesh(domeGeometry, domeMaterial, domePlacements.length);
  domes.name = 'plaza-interior-domes';
  domePlacements.forEach((position, index) => {
    dummy.position.copy(position);
    dummy.rotation.y = index * 0.7;
    dummy.updateMatrix();
    domes.setMatrixAt(index, dummy.matrix);
  });
  domes.instanceMatrix.needsUpdate = true;

  group.add(poles, globes, domes);
  return group;
}

function addFramePart(
  target: THREE.BufferGeometry[],
  rootMatrix: THREE.Matrix4,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(x, y, z);
  geometry.applyMatrix4(rootMatrix);
  target.push(geometry);
}

function makeBillboardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, '#07182d');
  background.addColorStop(0.42, '#17366b');
  background.addColorStop(0.68, '#50235f');
  background.addColorStop(1, '#140d2e');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const random = seededRandom(0x51a7c0de);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const grain = (random() - 0.5) * 22;
    pixels.data[i] = Math.max(0, Math.min(255, pixels.data[i] + grain));
    pixels.data[i + 1] = Math.max(0, Math.min(255, pixels.data[i + 1] + grain * 1.15));
    pixels.data[i + 2] = Math.max(0, Math.min(255, pixels.data[i + 2] + grain * 1.4));
  }
  ctx.putImageData(pixels, 0, 0);

  ctx.globalCompositeOperation = 'screen';
  const glow = ctx.createRadialGradient(300, 124, 4, 300, 124, 190);
  glow.addColorStop(0, 'rgba(80, 246, 255, 0.5)');
  glow.addColorStop(0.5, 'rgba(255, 72, 205, 0.2)');
  glow.addColorStop(1, 'rgba(10, 20, 70, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(96, 239, 255, 0.9)';
  ctx.beginPath();
  ctx.moveTo(58, 178);
  ctx.lineTo(118, 70);
  ctx.lineTo(182, 178);
  ctx.lineTo(238, 78);
  ctx.lineTo(298, 178);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 103, 218, 0.92)';
  ctx.strokeRect(332, 66, 116, 116);
  ctx.beginPath();
  ctx.arc(390, 124, 38, 0, Math.PI * 1.55);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 229, 111, 0.95)';
  ctx.beginPath();
  ctx.moveTo(370, 100);
  ctx.lineTo(424, 124);
  ctx.lineTo(370, 148);
  ctx.closePath();
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
  for (let y = 3; y < canvas.height; y += 7) {
    ctx.fillStyle = y % 14 === 3 ? 'rgba(180, 245, 255, 0.08)' : 'rgba(0, 8, 24, 0.12)';
    ctx.fillRect(0, y, canvas.width, 2);
  }
  for (let i = 0; i < 46; i++) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const width = 3 + random() * 28;
    ctx.fillStyle = `rgba(${120 + random() * 135}, ${120 + random() * 135}, 255, ${0.08 + random() * 0.16})`;
    ctx.fillRect(x, y, width, 1 + random() * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makeBeaconTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const glow = ctx.createRadialGradient(52, 44, 3, 64, 64, 76);
  glow.addColorStop(0, '#fffbd0');
  glow.addColorStop(0.18, '#72f7ff');
  glow.addColorStop(0.52, '#3869c9');
  glow.addColorStop(0.78, '#7c2d91');
  glow.addColorStop(1, '#090d29');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const random = seededRandom(0xb3ac0a11);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const grain = (random() - 0.5) * 30;
    pixels.data[i] = Math.max(0, Math.min(255, pixels.data[i] + grain * 0.7));
    pixels.data[i + 1] = Math.max(0, Math.min(255, pixels.data[i + 1] + grain));
    pixels.data[i + 2] = Math.max(0, Math.min(255, pixels.data[i + 2] + grain * 1.25));
  }
  ctx.putImageData(pixels, 0, 0);

  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(137, 250, 255, 0.72)';
  for (let radius = 20; radius <= 52; radius += 16) {
    ctx.beginPath();
    ctx.arc(64, 64, radius, radius * 0.018, Math.PI * (1.25 + radius * 0.003));
    ctx.stroke();
  }
  for (let i = 0; i < 24; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 12 + random() * 48;
    ctx.fillStyle = `rgba(255, ${150 + random() * 105}, 238, ${0.25 + random() * 0.55})`;
    ctx.fillRect(64 + Math.cos(angle) * radius, 64 + Math.sin(angle) * radius, 1 + random() * 2.5, 1 + random() * 2.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
