import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

/** ポストプロセス: トーンマップ + SMAA + ビネット/軽い色収差（テクスチャで質感を作っているため GTAO/Bloom/DoF は不要） */
export class PostFX {
  composer: EffectComposer;
  private final: ShaderPass;
  private smaa: SMAAPass | null = null;

  constructor(
    renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera,
    width: number, height: number
  ) {
    // 注意: samples>0(MSAA RT)にすると ANGLE/D3D11 環境でシャドウマップの
    // 比較サンプラーが壊れる不具合を確認済み。AAはSMAAパスで行う。
    const pr = renderer.getPixelRatio();
    const q = new URLSearchParams(location.search);
    const rt = new THREE.WebGLRenderTarget(width * pr, height * pr, {
      type: THREE.HalfFloatType,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
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

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
  }

  render(dt: number) {
    this.composer.render(dt);
  }
}
