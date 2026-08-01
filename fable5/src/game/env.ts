import * as THREE from 'three';

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
        float sunD = max(dot(vDir, uSunDir), 0.0);
        col += vec3(1.0, 0.9, 0.6) * pow(sunD, 350.0) * 2.2;
        col += vec3(1.0, 0.85, 0.55) * pow(sunD, 18.0) * 0.22;
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
        float h = sin(wx * 0.14 + t * 0.9) * 0.35
                + sin(wz * 0.11 + t * 1.25) * 0.3
                + sin((wx + wz) * 0.055 + t * 0.6) * 0.42;
        p.z += h;
        float dhx = cos(wx * 0.14 + t * 0.9) * 0.35 * 0.14 + cos((wx + wz) * 0.055 + t * 0.6) * 0.42 * 0.055;
        float dhz = -cos(wz * 0.11 + t * 1.25) * 0.3 * 0.11 - cos((wx + wz) * 0.055 + t * 0.6) * 0.42 * 0.055;
        vNormalW = normalize(vec3(-dhx, 1.0, dhz));
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
        float dist = length(cameraPosition - vWPos);
        float fogF = smoothstep(uFogNear, uFogFar, dist);
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

  // ===== 遠景の港クレーン（シルエット） =====
  const craneMat = new THREE.MeshStandardMaterial({ color: '#4b5568', roughness: 0.9, fog: true });
  for (const [cx, cz, rot] of [[-130, -60, 0.4], [150, 40, -0.8], [60, -170, 1.9]] as const) {
    const crane = new THREE.Group();
    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(4, 46, 4), craneMat);
    leg1.position.y = 23;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(56, 3.4, 3.4), craneMat);
    arm.position.set(14, 44, 0);
    const wire = new THREE.Mesh(new THREE.BoxGeometry(0.7, 20, 0.7), craneMat);
    wire.position.set(34, 33, 0);
    crane.add(leg1, arm, wire);
    crane.position.set(cx, -2.5, cz);
    crane.rotation.y = rot;
    group.add(crane);
  }

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
    ringA.rotation.z += dt * 0.5;
    ringB.rotation.z -= dt * 0.7;
    holoCore.rotation.y += dt * 0.9;
    holoCore.position.y = 13 + Math.sin(t * 1.2) * 0.3;
  };

  return { group, sun, update };
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
