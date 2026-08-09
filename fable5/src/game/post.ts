import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

/** ポストプロセス: GTAO + Bloom + DoF + トーンマップ + SMAA + ビネット/軽い色収差 */
export class PostFX {
  composer: EffectComposer;
  private gtao: GTAOPass | null = null;
  private bloom: UnrealBloomPass;
  private dof: BokehPass | null = null;
  private final: ShaderPass;
  private smaa: SMAAPass | null = null;
  private camera: THREE.PerspectiveCamera;

  constructor(
    renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera,
    width: number, height: number
  ) {
    this.camera = camera;
    // 注意: samples>0(MSAA RT)にすると ANGLE/D3D11 環境でシャドウマップの
    // 比較サンプラーが壊れる不具合を確認済み。AAはSMAAパスで行う。
    const pr = renderer.getPixelRatio();
    const q = new URLSearchParams(location.search);
    const rt = new THREE.WebGLRenderTarget(width * pr, height * pr, {
      type: THREE.HalfFloatType,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    if (q.get('nogtao') !== '1') {
      try {
        this.gtao = new GTAOPass(scene, camera, width, height);
        this.gtao.output = GTAOPass.OUTPUT.Default;
        this.gtao.blendIntensity = 0.7;
        this.gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, scale: 1.0, thickness: 0.4 });
        this.composer.addPass(this.gtao);
      } catch (e) {
        console.warn('GTAO unavailable', e);
      }
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.5, 0.45, 1.0);
    if (q.get('nobloom') !== '1') this.composer.addPass(this.bloom);
    if (q.get('nodof') !== '1') {
      try {
        this.dof = new BokehPass(scene, camera, {
          focus: 12,
          aperture: 0.00007,
          maxblur: 0.0022,
        });
        this.composer.addPass(this.dof);
      } catch (e) {
        console.warn('DoF unavailable', e);
      }
    }
    this.composer.addPass(new OutputPass());
    if (q.get('nosmaa') !== '1') {
      try {
        this.smaa = new SMAAPass();
        this.composer.addPass(this.smaa);
      } catch (e) {
        console.warn('SMAA unavailable', e);
      }
    }
    this.final = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uVig: { value: 0.34 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uVig;
        varying vec2 vUv;
        void main() {
          vec2 off = (vUv - 0.5) * 0.0018;
          float r = texture2D(tDiffuse, vUv + off).r;
          vec4 c = texture2D(tDiffuse, vUv);
          float b = texture2D(tDiffuse, vUv - off).b;
          vec3 col = vec3(r, c.g, b);
          // 彩度をわずかに持ち上げ
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(lum), col, 1.07);
          float d = distance(vUv, vec2(0.5));
          col *= 1.0 - smoothstep(0.42, 0.92, d) * uVig;
          gl_FragColor = vec4(col, c.a);
        }
      `,
    });
    this.composer.addPass(this.final);
  }

  setAO(on: boolean) {
    if (this.gtao) this.gtao.enabled = on;
  }

  get hasAO() {
    return !!this.gtao && this.gtao.enabled;
  }

  setDOF(on: boolean) {
    if (this.dof) this.dof.enabled = on;
  }

  get hasDOF() {
    return !!this.dof && this.dof.enabled;
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    if (this.gtao) this.gtao.setSize(w, h);
    this.bloom.setSize(w, h);
    if (this.dof) this.dof.setSize(w, h);
  }

  render(dt: number) {
    if (this.dof?.enabled) {
      const target = this.camera.userData.dofFocusDistance;
      if (typeof target === 'number' && Number.isFinite(target)) {
        const focus = (this.dof.uniforms as { focus: { value: number } }).focus;
        const clamped = THREE.MathUtils.clamp(target, this.camera.near + 0.1, this.camera.far - 1);
        focus.value = THREE.MathUtils.lerp(focus.value, clamped, 1 - Math.exp(-dt * 10));
      }
    }
    this.composer.render(dt);
  }
}
