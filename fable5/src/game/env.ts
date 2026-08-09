import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 空・海・雲・遠景・ライティングなどの環境要素 */
export interface EnvData {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  update(t: number, dt: number): void;
}

export function buildEnv(scene: THREE.Scene): EnvData {
  const group = new THREE.Group();

  scene.fog = new THREE.Fog('#c2e0ee', 90, 235);

  // ===== ライティング =====
  const sun = new THREE.DirectionalLight('#fff2dc', 2.3);
  sun.position.set(42, 36, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -44;
  sun.shadow.camera.right = 44;
  sun.shadow.camera.top = 44;
  sun.shadow.camera.bottom = -44;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  group.add(sun);
  group.add(sun.target);

  const hemi = new THREE.HemisphereLight('#bfe4ff', '#8c8478', 0.35);
  group.add(hemi);

  // リムライト（太陽の逆側から輪郭を出す）
  const rim = new THREE.DirectionalLight('#a8ccff', 0.55);
  rim.position.set(-28, 26, -34);
  group.add(rim);

  // ===== 空 =====
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(42, 36, 26).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.1, 1.0);
        vec3 top = vec3(0.22, 0.55, 0.88);
        vec3 hor = vec3(0.83, 0.94, 0.98);
        vec3 col = mix(hor, top, pow(max(h, 0.0), 0.55));

        // 地平線ではエアロゾルによる暖色のにじみと、レイリー散乱の青を重ねる
        float horizonBand = exp(-abs(vDir.y - 0.015) * 13.0);
        col += vec3(0.17, 0.105, 0.045) * horizonBand * 0.42;
        float mu = dot(vDir, uSunDir);
        float rayleigh = 0.035 * (1.0 + mu * mu) * (0.35 + horizonBand * 0.65);
        col += vec3(0.18, 0.42, 0.68) * rayleigh;

        float sunD = max(dot(vDir, uSunDir), 0.0);
        col += vec3(1.0, 0.9, 0.6) * pow(sunD, 350.0) * 2.2;
        col += vec3(1.0, 0.85, 0.55) * pow(sunD, 18.0) * 0.22;
        col += vec3(1.0, 0.72, 0.42) * pow(sunD, 4.0) * horizonBand * 0.07;

        // 球面上に低い山並みを描き、実ジオメトリよりさらに遠い霞んだレイヤーを作る
        float az = atan(vDir.z, vDir.x);
        float farProfile = 0.038
          + sin(az * 2.3 + 0.6) * 0.012
          + sin(az * 5.1 - 1.1) * 0.009
          + sin(az * 11.7 + 2.2) * 0.004;
        float nearProfile = 0.018
          + sin(az * 3.7 - 0.8) * 0.010
          + sin(az * 8.9 + 0.5) * 0.006;
        float brokenChain = smoothstep(-0.25, 0.45,
          sin(az * 1.65 + 0.4) + sin(az * 3.2 - 1.7) * 0.45);
        float horizonFloor = smoothstep(-0.025, -0.002, vDir.y);
        float farRidge = (1.0 - smoothstep(farProfile, farProfile + 0.006, vDir.y))
          * horizonFloor * (0.25 + brokenChain * 0.75);
        float nearRidge = (1.0 - smoothstep(nearProfile, nearProfile + 0.004, vDir.y))
          * horizonFloor * brokenChain;
        col = mix(col, vec3(0.34, 0.51, 0.55), farRidge * 0.16);
        col = mix(col, vec3(0.24, 0.41, 0.43), nearRidge * 0.12);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  // 半径はカメラのfar(460)より内側に収める。はみ出すと空がクリップされて黒く抜ける
  const sky = new THREE.Mesh(new THREE.SphereGeometry(360, 24, 14), skyMat);
  group.add(sky);

  // ===== 海 =====
  const oceanMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(42, 36, 26).normalize() },
      uFogColor: { value: new THREE.Color('#c2e0ee') },
      uFogNear: { value: 90 },
      uFogFar: { value: 235 },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWPos;
      varying vec3 vNormalW;
      void main() {
        vec3 p = position;
        float t = uTime;
        // position は回転前のローカル(x, y)平面。回転後 y=z なので xy を使う
        float wx = p.x;
        float wz = -p.y;
        // 位相を別の低周波で歪ませ、同じ波形の反復が一直線に見えないようにする
        float p1 = wx * 0.14 + sin(wz * 0.031 + t * 0.09) * 0.75 + t * 0.9;
        float p2 = wz * 0.11 + sin(wx * 0.027 - t * 0.07) * 0.65 + t * 1.25;
        float warp3 = (wx - wz) * 0.018;
        float p3 = (wx + wz) * 0.055 + sin(warp3) * 0.9 + t * 0.6;
        float p4 = wx * 0.31 - wz * 0.23 + sin(wz * 0.041 + t * 0.13) * 1.1 + t * 1.7;
        float warp5 = wx * 0.022 + wz * 0.017;
        float p5 = wx * 0.075 + wz * 0.19 + sin(warp5) * 1.3 - t * 1.05;
        float h = sin(p1) * 0.35
                + sin(p2) * 0.3
                + sin(p3) * 0.42
                + sin(p4) * 0.12
                + sin(p5) * 0.15;
        p.z += h;
        float d3 = cos(warp3) * 0.9 * 0.018;
        float d5 = cos(warp5) * 1.3;
        float dhx = cos(p1) * 0.35 * 0.14
          + cos(p2) * 0.3 * cos(wx * 0.027 - t * 0.07) * 0.65 * 0.027
          + cos(p3) * 0.42 * (0.055 + d3)
          + cos(p4) * 0.12 * 0.31
          + cos(p5) * 0.15 * (0.075 + d5 * 0.022);
        float dhz = cos(p1) * 0.35 * cos(wz * 0.031 + t * 0.09) * 0.75 * 0.031
          + cos(p2) * 0.3 * 0.11
          + cos(p3) * 0.42 * (0.055 - d3)
          + cos(p4) * 0.12 * (-0.23 + cos(wz * 0.041 + t * 0.13) * 1.1 * 0.041)
          + cos(p5) * 0.15 * (0.19 + d5 * 0.017);
        vNormalW = normalize(vec3(-dhx, 1.0, -dhz));
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      varying vec3 vWPos;
      varying vec3 vNormalW;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWPos);
        vec3 n = normalize(vNormalW);
        n = normalize(n + vec3(
          sin(vWPos.x * 0.73 + vWPos.z * 0.51 + uTime * 1.4) * 0.025,
          0.0,
          cos(vWPos.z * 0.67 - vWPos.x * 0.39 - uTime * 1.1) * 0.025
        ));
        float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 2.4);
        vec3 deep = vec3(0.05, 0.27, 0.42);
        vec3 lite = vec3(0.32, 0.68, 0.72);
        vec3 col = mix(deep, lite, fres);
        // 太陽ギラつき
        vec3 refl = reflect(-viewDir, n);
        col += vec3(1.0, 0.92, 0.7) * pow(max(dot(refl, uSunDir), 0.0), 120.0) * 1.6;
        // 細かいきらめき（ハッシュで不規則に）
        vec2 cell = floor(vWPos.xz * 0.8);
        float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        float sp = sin(vWPos.x * 2.1 + uTime * 2.0 + h * 6.28) * sin(vWPos.z * 1.7 - uTime * 1.6 + h * 4.0);
        col += vec3(0.4, 0.6, 0.7) * smoothstep(0.985, 1.0, sp) * 0.35 * step(0.35, h);
        // 海面は水平距離で霧量を決め、水平線に近いほど少し早く空気遠近へ溶かす
        float dist = length(cameraPosition.xz - vWPos.xz);
        float fogBase = smoothstep(uFogNear, uFogFar, dist);
        float grazing = pow(1.0 - abs(viewDir.y), 4.0);
        float fogF = clamp(pow(fogBase, 0.82) + fogBase * grazing * 0.08, 0.0, 1.0);
        col = mix(col, uFogColor, fogF);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  // 対角が far を超えないサイズ（620の半対角=438 < 460）
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(620, 620, 72, 72), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -2.7;
  group.add(ocean);

  // ===== 雲（スプライト） =====
  const cloudTex = makeCloudTexture();
  const clouds: THREE.Sprite[] = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m);
    const a = (i / 7) * Math.PI * 2 + Math.random();
    const r = 120 + Math.random() * 130;
    s.position.set(Math.cos(a) * r, 26 + Math.random() * 26, Math.sin(a) * r);
    const sc = 40 + Math.random() * 45;
    s.scale.set(sc, sc * 0.42, 1);
    (s.userData as { drift: number }).drift = 0.4 + Math.random() * 0.7;
    clouds.push(s);
    group.add(s);
  }

  // ===== ブイ（海に浮かぶ目印） =====
  const buoys: THREE.Group[] = [];
  const buoyBody = new THREE.MeshStandardMaterial({ color: '#e85d3a', roughness: 0.5 });
  const buoyTop = new THREE.MeshStandardMaterial({ color: '#111820', emissive: '#ffcf40', emissiveIntensity: 1.8 });
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.3, 2.2, 10), buoyBody);
    cone.position.y = 0.6;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), buoyTop);
    light.position.y = 2.0;
    g.add(cone, light);
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const r = 48 + (i % 2) * 14;
    g.position.set(Math.cos(a) * r, -2.4, Math.sin(a) * r);
    (g.userData as { ph: number }).ph = i * 1.7;
    buoys.push(g);
    group.add(g);
  }

  // ===== 水平線の小島・岩礁（インスタンス化して2ドローに集約） =====
  const islandMat = new THREE.MeshStandardMaterial({
    color: '#71936b', map: makeIslandTexture(), roughness: 1, metalness: 0, fog: true,
  });
  const rockMat = new THREE.MeshStandardMaterial({
    color: '#738083', map: makeRockTexture(), roughness: 1, metalness: 0, flatShading: true, fog: true,
  });
  const hillSpecs = [
    [-168, -92, -1.1, 15, 5.8, 11, 0.2], [-153, -86, -1.4, 10, 4.1, 8, -0.3],
    [174, -94, -1.0, 14, 5.2, 10, 0.5], [188, -88, -1.5, 9, 3.8, 7, -0.4],
    [-82, 172, -1.2, 16, 5.5, 10, -0.2], [-66, 176, -1.5, 9, 3.6, 7, 0.6],
    [144, 132, -1.1, 13, 4.8, 10, 0.1], [158, 124, -1.4, 9, 3.5, 7, -0.5],
  ] as const;
  const rockSpecs = [
    [-184, -88, -1.6, 4.2, 3.8, 3.5, 0.2], [-142, -92, -1.8, 3.4, 2.8, 3.1, 0.8],
    [160, -101, -1.7, 3.8, 3.4, 3.3, 0.4], [199, -82, -1.8, 3.1, 2.6, 2.8, -0.3],
    [-98, 178, -1.7, 4.8, 3.6, 3.7, 0.5], [-54, 169, -1.8, 3.2, 2.7, 3.0, -0.7],
    [130, 137, -1.7, 4.1, 3.2, 3.6, 0.1], [170, 119, -1.8, 3.0, 2.5, 2.8, 0.9],
    [105, -151, -1.8, 5.4, 3.8, 4.2, -0.2], [114, -158, -1.9, 3.2, 2.7, 3.0, 0.5],
  ] as const;
  const placement = new THREE.Object3D();
  const islandHills = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 10), islandMat, hillSpecs.length);
  for (let i = 0; i < hillSpecs.length; i++) {
    const [x, z, y, sx, sy, sz, rot] = hillSpecs[i];
    setInstanceTransform(islandHills, i, placement, x, y, z, rot, sx, sy, sz);
  }
  islandHills.computeBoundingSphere();
  const islandRocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, rockSpecs.length);
  for (let i = 0; i < rockSpecs.length; i++) {
    const [x, z, y, sx, sy, sz, rot] = rockSpecs[i];
    setInstanceTransform(islandRocks, i, placement, x, y, z, rot, sx, sy, sz);
  }
  islandRocks.computeBoundingSphere();
  group.add(islandHills, islandRocks);

  // ===== 遠方を航行する帆船・貨物船（各船種を1つのInstancedMeshに集約） =====
  const sailboatMats = [
    new THREE.MeshStandardMaterial({ color: '#536c75', map: makeShipHullTexture(), roughness: 0.9, fog: true }),
    new THREE.MeshStandardMaterial({ color: '#3d342d', roughness: 0.95, fog: true }),
    new THREE.MeshStandardMaterial({
      color: '#fff3d5', map: makeSailTexture(), roughness: 0.85, side: THREE.DoubleSide,
      alphaTest: 0.22, fog: true,
    }),
  ];
  const sailSpecs = [
    { radius: 148, angle: -2.35, speed: 0.0026, phase: 0.3, scale: 0.82, direction: 1 },
    { radius: 174, angle: -0.58, speed: 0.0021, phase: 2.0, scale: 1.05, direction: -1 },
    { radius: 196, angle: 0.72, speed: 0.0018, phase: 4.1, scale: 0.9, direction: 1 },
    { radius: 160, angle: 2.18, speed: 0.0024, phase: 5.3, scale: 0.76, direction: -1 },
  ] as const;
  const sailboats = new THREE.InstancedMesh(makeSailboatGeometry(), sailboatMats, sailSpecs.length);
  sailboats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sailboats.frustumCulled = false;

  const cargoMats = [
    new THREE.MeshStandardMaterial({ color: '#425762', map: makeShipHullTexture(), roughness: 0.88, fog: true }),
    new THREE.MeshStandardMaterial({ color: '#b7c3c2', map: makeCabinTexture(), roughness: 0.82, fog: true }),
    new THREE.MeshStandardMaterial({ color: '#d78556', map: makeCargoTexture(), roughness: 0.92, fog: true }),
  ];
  const cargoSpecs = [
    { radius: 205, angle: -1.72, speed: 0.00135, phase: 1.1, scale: 0.82, direction: 1 },
    { radius: 218, angle: 1.62, speed: 0.00115, phase: 3.8, scale: 0.92, direction: -1 },
  ] as const;
  const cargoShips = new THREE.InstancedMesh(makeCargoShipGeometry(), cargoMats, cargoSpecs.length);
  cargoShips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cargoShips.frustumCulled = false;
  group.add(sailboats, cargoShips);
  updateFleetInstances(sailboats, sailSpecs, placement, 0, -2.0, 0.14, 0.022);
  updateFleetInstances(cargoShips, cargoSpecs, placement, 0, -2.05, 0.08, 0.008);

  // ===== 遠景の港クレーン（シルエット） =====
  const craneMat = new THREE.MeshStandardMaterial({ color: '#4b5568', roughness: 0.9, fog: true });
  const craneGeometry = mergeGeometryParts([
    placeGeometry(new THREE.BoxGeometry(4, 46, 4), 0, 23, 0),
    placeGeometry(new THREE.BoxGeometry(56, 3.4, 3.4), 14, 44, 0),
    placeGeometry(new THREE.BoxGeometry(0.7, 20, 0.7), 34, 33, 0),
  ]);
  const craneSpecs = [[-130, -60, 0.4], [150, 40, -0.8], [60, -170, 1.9]] as const;
  const cranes = new THREE.InstancedMesh(craneGeometry, craneMat, craneSpecs.length);
  for (let i = 0; i < craneSpecs.length; i++) {
    const [x, z, rot] = craneSpecs[i];
    setInstanceTransform(cranes, i, placement, x, -2.5, z, rot, 1, 1, 1);
  }
  cranes.computeBoundingSphere();
  group.add(cranes);

  // ===== 中央上空のホロリング =====
  const holoMatA = new THREE.MeshStandardMaterial({
    color: '#0a1a20', emissive: '#3ae0ff', emissiveIntensity: 2.6, roughness: 0.3,
    transparent: true, opacity: 0.9,
  });
  const holoMatB = new THREE.MeshStandardMaterial({
    color: '#180a20', emissive: '#ff64c8', emissiveIntensity: 2.2, roughness: 0.3,
    transparent: true, opacity: 0.85,
  });
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.13, 10, 48), holoMatA);
  ringA.position.set(0, 13, 0);
  ringA.rotation.x = Math.PI / 2.3;
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.1, 10, 40), holoMatB);
  ringB.position.set(0, 13, 0);
  ringB.rotation.x = Math.PI / 1.8;
  const holoCore = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9, 0),
    new THREE.MeshStandardMaterial({ color: '#101820', emissive: '#7df9ff', emissiveIntensity: 2.0, flatShading: true })
  );
  holoCore.position.set(0, 13, 0);
  group.add(ringA, ringB, holoCore);

  const update = (t: number, dt: number) => {
    oceanMat.uniforms.uTime.value = t;
    for (const s of clouds) {
      s.position.x += (s.userData as { drift: number }).drift * dt;
      if (s.position.x > 260) s.position.x = -260;
    }
    for (const b of buoys) {
      const ph = (b.userData as { ph: number }).ph;
      b.position.y = -2.4 + Math.sin(t * 0.9 + ph) * 0.35;
      b.rotation.z = Math.sin(t * 0.7 + ph) * 0.08;
      b.rotation.x = Math.cos(t * 0.8 + ph) * 0.08;
    }
    updateFleetInstances(sailboats, sailSpecs, placement, t, -2.0, 0.14, 0.022);
    updateFleetInstances(cargoShips, cargoSpecs, placement, t, -2.05, 0.08, 0.008);
    ringA.rotation.z += dt * 0.5;
    ringB.rotation.z -= dt * 0.7;
    holoCore.rotation.y += dt * 0.9;
    holoCore.position.y = 13 + Math.sin(t * 1.2) * 0.3;
  };

  return { group, sun, update };
}

type FleetSpec = {
  readonly radius: number;
  readonly angle: number;
  readonly speed: number;
  readonly phase: number;
  readonly scale: number;
  readonly direction: number;
};

function setInstanceTransform(
  mesh: THREE.InstancedMesh,
  index: number,
  dummy: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
): void {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, rotationY, 0);
  dummy.scale.set(scaleX, scaleY, scaleZ);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
  mesh.instanceMatrix.needsUpdate = true;
}

function updateFleetInstances(
  mesh: THREE.InstancedMesh,
  specs: readonly FleetSpec[],
  dummy: THREE.Object3D,
  t: number,
  baseY: number,
  bobAmount: number,
  rollAmount: number,
): void {
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const angle = spec.angle + t * spec.speed * spec.direction;
    dummy.position.set(
      Math.cos(angle) * spec.radius,
      baseY + Math.sin(t * 0.55 + spec.phase) * bobAmount,
      Math.sin(angle) * spec.radius,
    );
    // 船首（ローカル+X）を円周の進行方向へ向ける
    dummy.rotation.set(
      Math.sin(t * 0.43 + spec.phase) * rollAmount * 0.6,
      -angle - spec.direction * Math.PI / 2,
      Math.sin(t * 0.37 + spec.phase) * rollAmount,
    );
    dummy.scale.setScalar(spec.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function placeGeometry(
  geometry: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rotationX = 0,
  rotationY = 0,
  rotationZ = 0,
  scaleX = 1,
  scaleY = 1,
  scaleZ = 1,
): THREE.BufferGeometry {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotationX, rotationY, rotationZ)),
    new THREE.Vector3(scaleX, scaleY, scaleZ),
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}

function mergeGeometryParts(parts: THREE.BufferGeometry[], useGroups = false): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, useGroups);
  if (!merged) throw new Error('環境用ジオメトリの結合に失敗しました');
  for (const part of parts) part.dispose();
  return merged;
}

function makeSailboatGeometry(): THREE.BufferGeometry {
  const hull = mergeGeometryParts([
    placeGeometry(new THREE.BoxGeometry(7.2, 1.05, 2.0), -0.35, 0, 0),
    placeGeometry(new THREE.ConeGeometry(1.38, 3.0, 4), 4.65, 0, 0, 0, 0, -Math.PI / 2),
  ]);
  const rig = mergeGeometryParts([
    placeGeometry(new THREE.CylinderGeometry(0.085, 0.11, 6.5, 7), 0, 3.2, 0),
    placeGeometry(new THREE.CylinderGeometry(0.06, 0.075, 4.0, 7), 1.45, 3.45, 0, 0, 0, Math.PI / 2),
  ]);
  const sails = mergeGeometryParts([
    placeGeometry(new THREE.PlaneGeometry(3.8, 4.7), 1.92, 4.75, 0.06),
    placeGeometry(new THREE.PlaneGeometry(2.6, 3.6), -1.32, 4.3, 0.04, 0, 0, 0, -1, 1, 1),
  ]);
  return mergeGeometryParts([hull, rig, sails], true);
}

function makeCargoShipGeometry(): THREE.BufferGeometry {
  const hull = mergeGeometryParts([
    placeGeometry(new THREE.BoxGeometry(21, 2.0, 4.3), -0.8, 0, 0),
    placeGeometry(new THREE.ConeGeometry(2.75, 4.2, 4), 11.8, 0, 0, 0, 0, -Math.PI / 2),
  ]);
  const cabin = mergeGeometryParts([
    placeGeometry(new THREE.BoxGeometry(5.0, 3.6, 3.7), -7.0, 2.7, 0),
    placeGeometry(new THREE.BoxGeometry(3.6, 1.2, 3.3), -6.6, 5.05, 0),
    placeGeometry(new THREE.CylinderGeometry(0.42, 0.5, 2.5, 8), -7.5, 6.45, 0),
  ]);
  const containers: THREE.BufferGeometry[] = [];
  for (const x of [-2.6, 1.1, 4.8, 8.1]) {
    containers.push(placeGeometry(new THREE.BoxGeometry(3.25, 1.8, 3.45), x, 2.0, 0));
    if (x < 7) containers.push(placeGeometry(new THREE.BoxGeometry(3.25, 1.8, 3.45), x, 3.85, 0));
  }
  const cargo = mergeGeometryParts(containers);
  return mergeGeometryParts([hull, cabin, cargo], true);
}

function finishCanvasTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeatX !== 1 || repeatY !== 1) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
  }
  return texture;
}

function makeIslandTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#9cbd79');
  g.addColorStop(0.52, '#66865e');
  g.addColorStop(1, '#435d50');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 180; i++) {
    const x = (i * 47 + i * i * 3) % 128;
    const y = (i * 83 + i * i) % 128;
    const shade = 65 + (i * 29) % 55;
    ctx.fillStyle = `rgba(${shade - 14},${shade + 34},${shade - 8},${0.08 + (i % 5) * 0.025})`;
    ctx.beginPath();
    ctx.arc(x, y, 1 + (i % 4) * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  return finishCanvasTexture(c, 2.5, 1.5);
}

function makeRockTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 96, 96);
  g.addColorStop(0, '#9ca7a3');
  g.addColorStop(0.48, '#697779');
  g.addColorStop(1, '#46585d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 96, 96);
  ctx.strokeStyle = 'rgba(34,48,51,0.22)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 24; i++) {
    const y = (i * 37) % 96;
    ctx.beginPath();
    ctx.moveTo(-8, y);
    ctx.lineTo(32 + (i % 4) * 9, y - 8 - (i % 5));
    ctx.lineTo(104, y + 5);
    ctx.stroke();
  }
  return finishCanvasTexture(c, 2, 2);
}

function makeShipHullTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#8da1a6');
  g.addColorStop(0.48, '#526a72');
  g.addColorStop(0.52, '#d9b36c');
  g.addColorStop(0.59, '#d9b36c');
  g.addColorStop(0.61, '#40545b');
  g.addColorStop(1, '#263d47');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = 'rgba(225,239,236,0.34)';
  for (let x = 8; x < 128; x += 16) ctx.fillRect(x, 13 + (x % 5), 5, 2);
  ctx.fillStyle = 'rgba(30,43,47,0.22)';
  for (let i = 0; i < 28; i++) ctx.fillRect((i * 43) % 128, 34 + (i * 17) % 27, 2, 1);
  return finishCanvasTexture(c, 2, 1);
}

function makeSailTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  const g = ctx.createLinearGradient(14, 8, 110, 122);
  g.addColorStop(0, 'rgba(255,252,230,0.98)');
  g.addColorStop(0.58, 'rgba(239,226,194,0.96)');
  g.addColorStop(1, 'rgba(183,204,202,0.94)');
  ctx.beginPath();
  ctx.moveTo(12, 119);
  ctx.lineTo(116, 119);
  ctx.lineTo(18, 8);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(47,143,157,0.34)';
  ctx.fillRect(-12, 76, 150, 11);
  ctx.fillStyle = 'rgba(232,112,83,0.28)';
  ctx.fillRect(-12, 94, 150, 7);
  ctx.strokeStyle = 'rgba(92,104,100,0.26)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(18, 8);
  ctx.lineTo(73, 119);
  ctx.moveTo(18, 8);
  ctx.lineTo(43, 119);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(74,87,83,0.62)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(12, 119);
  ctx.lineTo(116, 119);
  ctx.lineTo(18, 8);
  ctx.closePath();
  ctx.stroke();
  return finishCanvasTexture(c);
}

function makeCabinTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c8d2cf';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#486b78';
  for (let x = 7; x < 128; x += 18) ctx.fillRect(x, 12, 11, 9);
  ctx.fillStyle = '#92a19f';
  ctx.fillRect(0, 35, 128, 5);
  ctx.fillStyle = 'rgba(61,76,75,0.2)';
  for (let x = 0; x < 128; x += 13) ctx.fillRect(x, 48 + (x % 4), 7, 2);
  return finishCanvasTexture(c, 2, 1);
}

function makeCargoTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const colors = ['#c85f46', '#d79543', '#4d8d91', '#5b7895', '#9b5c72'];
  for (let y = 0; y < 128; y += 32) {
    for (let x = 0; x < 128; x += 32) {
      ctx.fillStyle = colors[(x / 32 + y / 16) % colors.length];
      ctx.fillRect(x + 1, y + 1, 30, 30);
      ctx.strokeStyle = 'rgba(31,42,45,0.28)';
      ctx.strokeRect(x + 3, y + 3, 26, 26);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(x + 5, y + 5, 2, 22);
      ctx.fillRect(x + 13, y + 5, 2, 22);
      ctx.fillRect(x + 21, y + 5, 2, 22);
    }
  }
  return finishCanvasTexture(c, 2, 1);
}

function makeCloudTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  for (const [x, y, r] of [[70, 80, 44], [120, 62, 52], [175, 78, 42], [100, 90, 38], [150, 92, 36]]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 128);
  }
  return new THREE.CanvasTexture(c);
}
