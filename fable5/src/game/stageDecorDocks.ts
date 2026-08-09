import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;

interface CraneDecor {
  group: THREE.Group;
  hookRig: THREE.Group;
  hookHead: THREE.Group;
}

interface BeaconDecor {
  group: THREE.Group;
  lensMaterial: THREE.MeshStandardMaterial;
  lights: THREE.PointLight[];
}

interface BirdDecor {
  mesh: THREE.InstancedMesh;
  update(t: number): void;
}

/** ツインドック専用の非衝突装飾。後工程でステージに接続して使う。 */
export function buildDocksDecor(): { group: THREE.Group; update(t: number, dt: number): void } {
  const group = new THREE.Group();
  group.name = 'docks-decor';

  const yellowMetal = makeWornMetalTexture('#d7a62f', '#76501d', 0x51a2);
  const darkMetal = makeWornMetalTexture('#314550', '#14242b', 0x83d7);
  const ropeTexture = makeWornMetalTexture('#a8844f', '#3f2a1c', 0x6a91);
  const warning = makeWarningTexture();

  const crane = buildGantryCrane(yellowMetal, darkMetal, warning);
  const beacons = buildBeacons(darkMetal);
  const birds = buildBirds();
  const interiorDecor = buildDocksInteriorDecor(darkMetal, warning, ropeTexture);
  group.add(crane.group, beacons.group, birds.mesh, interiorDecor);

  const update = (t: number, dt: number) => {
    crane.hookRig.rotation.z = Math.sin(t * 0.55) * 0.055;
    crane.hookRig.rotation.x = Math.cos(t * 0.43 + 0.8) * 0.035;
    crane.hookHead.rotation.y = (crane.hookHead.rotation.y + dt * 0.22) % TAU;

    const lensPulse = Math.pow(0.5 + Math.sin(t * 1.65) * 0.5, 10);
    beacons.lensMaterial.emissiveIntensity = 0.45 + lensPulse * 4.2;
    for (let i = 0; i < beacons.lights.length; i++) {
      const pulse = Math.pow(0.5 + Math.sin(t * 1.65 + i * Math.PI) * 0.5, 12);
      beacons.lights[i].intensity = pulse * 18;
    }

    birds.update(t);
  };

  return { group, update };
}

/** 埠頭上面の外縁に寄せた、非衝突の係船設備。 */
function buildDocksInteriorDecor(
  metalTexture: THREE.CanvasTexture,
  warningTexture: THREE.CanvasTexture,
  ropeTexture: THREE.CanvasTexture,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'docks-interior-decor';

  const bodyParts: THREE.BufferGeometry[] = [];
  const base = new THREE.CylinderGeometry(0.42, 0.48, 0.18, 12);
  base.translate(0, 0.09, 0);
  bodyParts.push(base);
  const stem = new THREE.CylinderGeometry(0.24, 0.29, 0.7, 11);
  stem.translate(0, 0.48, 0);
  bodyParts.push(stem);
  const bodyGeometry = mergeParts(bodyParts);

  const capParts: THREE.BufferGeometry[] = [];
  const cap = new THREE.CylinderGeometry(0.38, 0.38, 0.16, 12);
  cap.translate(0, 0.88, 0);
  capParts.push(cap);
  const crossbar = new THREE.CylinderGeometry(0.1, 0.1, 0.88, 9);
  crossbar.rotateZ(Math.PI / 2);
  crossbar.translate(0, 0.72, 0);
  capParts.push(crossbar);
  const capGeometry = mergeParts(capParts);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    map: metalTexture,
    color: '#a9b7bb',
    roughness: 0.78,
    metalness: 0.52,
  });
  const capMaterial = new THREE.MeshStandardMaterial({
    map: warningTexture,
    color: '#e4c067',
    roughness: 0.65,
    metalness: 0.3,
  });
  const bollardPlacements = [
    new THREE.Vector3(-14, 1.1, 12.85),
    new THREE.Vector3(-11, 1.1, 12.85),
    new THREE.Vector3(-7.5, 1.1, 12.85),
    new THREE.Vector3(-4, 1.1, 12.85),
    new THREE.Vector3(4, 1.1, 12.85),
    new THREE.Vector3(7.5, 1.1, 12.85),
    new THREE.Vector3(11, 1.1, 12.85),
    new THREE.Vector3(14, 1.1, 12.85),
    new THREE.Vector3(-14, 1.1, -12.85),
    new THREE.Vector3(-11, 1.1, -12.85),
    new THREE.Vector3(-7.5, 1.1, -12.85),
    new THREE.Vector3(-4, 1.1, -12.85),
    new THREE.Vector3(4, 1.1, -12.85),
    new THREE.Vector3(7.5, 1.1, -12.85),
    new THREE.Vector3(11, 1.1, -12.85),
    new THREE.Vector3(14, 1.1, -12.85),
  ];
  const bollardBodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, bollardPlacements.length);
  bollardBodies.name = 'dock-interior-bollard-bodies';
  bollardBodies.castShadow = true;
  const bollardCaps = new THREE.InstancedMesh(capGeometry, capMaterial, bollardPlacements.length);
  bollardCaps.name = 'dock-interior-bollard-caps';
  bollardCaps.castShadow = true;

  const dummy = new THREE.Object3D();
  bollardPlacements.forEach((position, index) => {
    dummy.position.copy(position);
    dummy.rotation.y = index < bollardPlacements.length / 2 ? 0 : Math.PI;
    dummy.updateMatrix();
    bollardBodies.setMatrixAt(index, dummy.matrix);
    bollardCaps.setMatrixAt(index, dummy.matrix);
  });
  bollardBodies.instanceMatrix.needsUpdate = true;
  bollardCaps.instanceMatrix.needsUpdate = true;

  const ropeParts: THREE.BufferGeometry[] = [];
  const outerCoil = new THREE.TorusGeometry(0.68, 0.085, 7, 28);
  outerCoil.rotateX(Math.PI / 2);
  outerCoil.translate(-0.06, 0.09, 0);
  ropeParts.push(outerCoil);
  const innerCoil = new THREE.TorusGeometry(0.48, 0.075, 7, 24);
  innerCoil.rotateX(Math.PI / 2);
  innerCoil.translate(0.08, 0.12, 0.03);
  ropeParts.push(innerCoil);
  const ropeGeometry = mergeParts(ropeParts);
  const ropeMaterial = new THREE.MeshStandardMaterial({
    map: ropeTexture,
    color: '#c7aa78',
    roughness: 0.94,
    metalness: 0.02,
  });
  const ropePlacements = [
    new THREE.Vector3(-12.25, 1.1, 10.15),
    new THREE.Vector3(12.25, 1.1, 10.15),
    new THREE.Vector3(-12.25, 1.1, -10.15),
    new THREE.Vector3(12.25, 1.1, -10.15),
  ];
  const ropeCoils = new THREE.InstancedMesh(ropeGeometry, ropeMaterial, ropePlacements.length);
  ropeCoils.name = 'dock-interior-rope-coils';
  ropeCoils.castShadow = true;
  ropePlacements.forEach((position, index) => {
    dummy.position.copy(position);
    dummy.rotation.y = index % 2 === 0 ? 0.35 : -0.45;
    dummy.updateMatrix();
    ropeCoils.setMatrixAt(index, dummy.matrix);
  });
  ropeCoils.instanceMatrix.needsUpdate = true;

  group.add(bollardBodies, bollardCaps, ropeCoils);
  return group;
}

function buildGantryCrane(
  yellowTexture: THREE.CanvasTexture,
  darkTexture: THREE.CanvasTexture,
  warningTexture: THREE.CanvasTexture,
): CraneDecor {
  const group = new THREE.Group();
  group.name = 'gantry-crane';
  group.position.z = 12.6;

  const yellowMaterial = new THREE.MeshStandardMaterial({
    map: yellowTexture,
    color: '#fff7dc',
    roughness: 0.72,
    metalness: 0.42,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    map: darkTexture,
    color: '#d6e0e3',
    roughness: 0.78,
    metalness: 0.55,
  });
  const warningMaterial = new THREE.MeshStandardMaterial({
    map: warningTexture,
    roughness: 0.68,
    metalness: 0.28,
  });

  const frameParts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      frameParts.push(beamBetween(
        new THREE.Vector3(sx * 32.4, 0, sz * 2.0),
        new THREE.Vector3(sx * 29.8, 17.3, sz * 1.4),
        0.68,
        0.68,
      ));
    }
    frameParts.push(boxPart(1.05, 0.78, 5.0, sx * 29.8, 17.3, 0));
  }
  frameParts.push(
    boxPart(60.5, 0.9, 0.9, 0, 17.3, -1.4),
    boxPart(60.5, 0.9, 0.9, 0, 17.3, 1.4),
    boxPart(61.2, 0.38, 0.46, 0, 19.7, -1.4),
    boxPart(61.2, 0.38, 0.46, 0, 19.7, 1.4),
  );
  const frame = new THREE.Mesh(mergeParts(frameParts), yellowMaterial);
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  const braceParts: THREE.BufferGeometry[] = [];
  for (const z of [-1.42, 1.42]) {
    for (let x = -27; x < 27; x += 6) {
      braceParts.push(
        beamBetween(new THREE.Vector3(x, 17.75, z), new THREE.Vector3(x + 3, 19.55, z), 0.18, 0.18),
        beamBetween(new THREE.Vector3(x + 3, 19.55, z), new THREE.Vector3(x + 6, 17.75, z), 0.18, 0.18),
      );
    }
  }
  braceParts.push(
    boxPart(59.2, 0.16, 0.7, 0, 16.72, 0),
    beamBetween(new THREE.Vector3(-29.7, 17.7, -1.3), new THREE.Vector3(-29.7, 19.5, 1.3), 0.18, 0.18),
    beamBetween(new THREE.Vector3(29.7, 17.7, 1.3), new THREE.Vector3(29.7, 19.5, -1.3), 0.18, 0.18),
  );
  const braces = new THREE.Mesh(mergeParts(braceParts), darkMaterial);
  braces.castShadow = true;
  group.add(braces);

  const trolley = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.82, 2.25), warningMaterial);
  trolley.position.set(7.5, 16.3, 0);
  trolley.castShadow = true;
  group.add(trolley);

  const wheelParts: THREE.BufferGeometry[] = [];
  for (const x of [-0.9, 0.9]) {
    for (const z of [-0.82, 0.82]) {
      const wheel = new THREE.CylinderGeometry(0.25, 0.25, 0.24, 10);
      wheel.rotateX(Math.PI / 2);
      wheel.translate(x, 16.78, z);
      wheelParts.push(wheel);
    }
  }
  const wheels = new THREE.Mesh(mergeParts(wheelParts), darkMaterial);
  wheels.position.x = 7.5;
  group.add(wheels);

  const hookRig = new THREE.Group();
  hookRig.name = 'swinging-hook';
  hookRig.position.set(7.5, 16.15, 0);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 6.25, 7), darkMaterial);
  cable.position.y = -3.12;
  cable.castShadow = true;
  hookRig.add(cable);

  const hookHead = new THREE.Group();
  hookHead.position.y = -6.35;
  const shackle = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.3, 0.45, 10), warningMaterial);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.14, 8, 22, Math.PI * 1.55), darkMaterial);
  hook.position.y = -0.55;
  hook.rotation.z = -Math.PI * 0.2;
  shackle.castShadow = hook.castShadow = true;
  hookHead.add(shackle, hook);
  hookRig.add(hookHead);
  group.add(hookRig);

  return { group, hookRig, hookHead };
}

function buildBeacons(metalTexture: THREE.CanvasTexture): BeaconDecor {
  const group = new THREE.Group();
  group.name = 'harbor-beacons';
  const placements = [
    new THREE.Vector3(-21.5, 3.42, -22.8),
    new THREE.Vector3(23.0, 3.42, 22.8),
  ];

  const bodyParts: THREE.BufferGeometry[] = [];
  const base = new THREE.CylinderGeometry(0.48, 0.54, 0.24, 12);
  base.translate(0, 0.12, 0);
  const pole = new THREE.CylinderGeometry(0.16, 0.22, 1.5, 10);
  pole.translate(0, 0.92, 0);
  const deck = new THREE.CylinderGeometry(0.5, 0.42, 0.18, 12);
  deck.translate(0, 1.72, 0);
  const cageBottom = new THREE.TorusGeometry(0.38, 0.055, 6, 16);
  cageBottom.rotateX(Math.PI / 2);
  cageBottom.translate(0, 1.84, 0);
  const cageTop = cageBottom.clone();
  cageTop.translate(0, 0.47, 0);
  const roof = new THREE.ConeGeometry(0.52, 0.28, 12);
  roof.translate(0, 2.48, 0);
  bodyParts.push(base, pole, deck, cageBottom, cageTop, roof);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    map: metalTexture,
    color: '#c8d4d8',
    roughness: 0.78,
    metalness: 0.48,
  });
  const body = new THREE.InstancedMesh(mergeParts(bodyParts), bodyMaterial, placements.length);
  body.name = 'beacon-bodies';
  body.castShadow = true;
  body.receiveShadow = true;

  const lensTexture = makeBeaconLensTexture();
  const lensMaterial = new THREE.MeshStandardMaterial({
    map: lensTexture,
    emissiveMap: lensTexture,
    emissive: '#ff9326',
    emissiveIntensity: 0.45,
    roughness: 0.18,
    metalness: 0.05,
    transparent: true,
    opacity: 0.92,
  });
  const lensGeometry = new THREE.SphereGeometry(0.31, 14, 9);
  lensGeometry.scale(1, 1.12, 1);
  lensGeometry.translate(0, 2.08, 0);
  const lenses = new THREE.InstancedMesh(lensGeometry, lensMaterial, placements.length);
  lenses.name = 'beacon-lenses';

  const dummy = new THREE.Object3D();
  for (let i = 0; i < placements.length; i++) {
    dummy.position.copy(placements[i]);
    dummy.updateMatrix();
    body.setMatrixAt(i, dummy.matrix);
    lenses.setMatrixAt(i, dummy.matrix);
  }
  body.instanceMatrix.needsUpdate = true;
  lenses.instanceMatrix.needsUpdate = true;
  group.add(body, lenses);

  const lights = placements.map((placement) => {
    const light = new THREE.PointLight('#ffad42', 0, 10, 2.0);
    light.position.copy(placement).add(new THREE.Vector3(0, 2.1, 0));
    group.add(light);
    return light;
  });
  return { group, lensMaterial, lights };
}

function buildBirds(): BirdDecor {
  const texture = makeSeaBirdTexture();
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  const geometry = new THREE.PlaneGeometry(3.1, 1.45);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geometry, material, 3);
  mesh.name = 'sea-birds';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;

  const flights = [
    { rx: 38, rz: 25, y: 19.5, speed: 0.085, phase: 0.2, scale: 0.92 },
    { rx: 47, rz: 30, y: 23.0, speed: 0.063, phase: 2.4, scale: 1.08 },
    { rx: 31, rz: 36, y: 17.0, speed: 0.074, phase: 4.5, scale: 0.78 },
  ];
  const dummy = new THREE.Object3D();

  const update = (t: number) => {
    for (let i = 0; i < flights.length; i++) {
      const flight = flights[i];
      const angle = t * flight.speed + flight.phase;
      const dx = -Math.sin(angle) * flight.rx;
      const dz = Math.cos(angle) * flight.rz;
      const wingBeat = 0.92 + Math.sin(t * 2.7 + flight.phase * 3) * 0.08;
      dummy.position.set(
        Math.cos(angle) * flight.rx,
        flight.y + Math.sin(t * 0.42 + flight.phase) * 0.75,
        Math.sin(angle) * flight.rz,
      );
      dummy.rotation.set(0, Math.atan2(dx, dz), Math.sin(t * 0.35 + flight.phase) * 0.08);
      dummy.scale.set(flight.scale * wingBeat, flight.scale, flight.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { mesh, update };
}

function boxPart(
  sx: number, sy: number, sz: number,
  x: number, y: number, z: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(sx, sy, sz);
  geometry.translate(x, y, z);
  return geometry;
}

function beamBetween(
  from: THREE.Vector3,
  to: THREE.Vector3,
  thickness: number,
  depth: number,
): THREE.BufferGeometry {
  const direction = to.clone().sub(from);
  const geometry = new THREE.BoxGeometry(thickness, direction.length(), depth);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  ));
  geometry.translate(
    (from.x + to.x) * 0.5,
    (from.y + to.y) * 0.5,
    (from.z + to.z) * 0.5,
  );
  return geometry;
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge docks decor geometry');
  for (const part of parts) part.dispose();
  return merged;
}

function makeWornMetalTexture(baseColor: string, shadowColor: string, seed: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const random = seededRandom(seed);

  const base = ctx.createLinearGradient(0, 0, size, size);
  base.addColorStop(0, baseColor);
  base.addColorStop(0.48, shadowColor);
  base.addColorStop(0.72, baseColor);
  base.addColorStop(1, shadowColor);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 34; i++) {
    const x = random() * size;
    const y = random() * size;
    const radius = 6 + random() * 28;
    const stain = ctx.createRadialGradient(x, y, 0, x, y, radius);
    stain.addColorStop(0, random() > 0.45 ? 'rgba(48,25,12,0.30)' : 'rgba(220,229,220,0.17)');
    stain.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = stain;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  for (let i = 0; i < 900; i++) {
    const v = random() > 0.5 ? 235 : 22;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.03 + random() * 0.09})`;
    const d = 0.5 + random() * 1.8;
    ctx.fillRect(random() * size, random() * size, d, d);
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 42; i++) {
    const x = random() * size;
    const y = random() * size;
    ctx.strokeStyle = random() > 0.35 ? 'rgba(245,239,218,0.20)' : 'rgba(43,24,14,0.30)';
    ctx.lineWidth = 0.5 + random() * 1.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 8 + random() * 40, y + (random() - 0.5) * 4);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  return texture;
}

function makeWarningTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const random = seededRandom(0x9f31);
  ctx.fillStyle = '#d9aa2e';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1d282d';
  for (let x = -size; x < size * 2; x += 34) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 17, 0);
    ctx.lineTo(x - size + 17, size);
    ctx.lineTo(x - size, size);
    ctx.closePath();
    ctx.fill();
  }
  const shade = ctx.createLinearGradient(0, 0, 0, size);
  shade.addColorStop(0, 'rgba(255,255,235,0.28)');
  shade.addColorStop(0.45, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(30,18,10,0.34)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 420; i++) {
    const pale = random() > 0.55;
    ctx.fillStyle = pale ? 'rgba(255,246,210,0.16)' : 'rgba(35,24,18,0.20)';
    ctx.fillRect(random() * size, random() * size, 0.8 + random() * 2.4, 0.8 + random() * 1.4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  return texture;
}

function makeBeaconLensTexture(): THREE.CanvasTexture {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const random = seededRandom(0x31bf);
  const glow = ctx.createRadialGradient(37, 29, 2, 48, 48, 58);
  glow.addColorStop(0, '#fff9c7');
  glow.addColorStop(0.18, '#ffc857');
  glow.addColorStop(0.68, '#d7621e');
  glow.addColorStop(1, '#62261c');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(255,255,225,0.25)' : 'rgba(70,22,15,0.18)';
    ctx.fillRect(random() * size, random() * size, 1 + random() * 3, 1 + random() * 7);
  }
  ctx.strokeStyle = 'rgba(255,246,199,0.22)';
  ctx.lineWidth = 2;
  for (let x = 8; x < size; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 5, size);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSeaBirdTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  const random = seededRandom(0xb17d);

  traceBird(ctx);
  const feathers = ctx.createLinearGradient(0, 12, 0, 82);
  feathers.addColorStop(0, '#f4f5eb');
  feathers.addColorStop(0.52, '#b9c5c8');
  feathers.addColorStop(1, '#53656c');
  ctx.fillStyle = feathers;
  ctx.fill();
  ctx.save();
  traceBird(ctx);
  ctx.clip();
  for (let i = 0; i < 240; i++) {
    const v = 90 + Math.floor(random() * 150);
    ctx.fillStyle = `rgba(${v},${v + 4},${v + 5},${0.05 + random() * 0.16})`;
    ctx.fillRect(random() * canvas.width, random() * canvas.height, 0.8 + random() * 2, 0.8 + random() * 2);
  }
  ctx.strokeStyle = 'rgba(65,78,84,0.36)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(83 - i * 8, 49 - i * 3.8);
    ctx.lineTo(24 + i * 4, 20 + i * 2.2);
    ctx.moveTo(109 + i * 8, 49 - i * 3.8);
    ctx.lineTo(168 - i * 4, 20 + i * 2.2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(42,54,60,0.7)';
  ctx.lineWidth = 2;
  traceBird(ctx);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function traceBird(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(96, 47);
  ctx.bezierCurveTo(77, 36, 55, 14, 13, 12);
  ctx.bezierCurveTo(31, 31, 55, 49, 81, 56);
  ctx.bezierCurveTo(87, 62, 90, 72, 96, 82);
  ctx.bezierCurveTo(102, 72, 105, 62, 111, 56);
  ctx.bezierCurveTo(137, 49, 161, 31, 179, 12);
  ctx.bezierCurveTo(137, 14, 115, 36, 96, 47);
  ctx.closePath();
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
