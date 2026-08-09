import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Input } from '../core/input';
import { AudioMan } from '../core/audio';
import { clamp, INK_COLORS, INK_HI_COLORS, INK_HI_HEX } from '../core/utils';
import { CollisionWorld } from './collision';
import { PaintSystem } from './paint';
import { buildStage, prepaintSpawns, StageData } from './stage';
import { selectStageDefinition } from './stageLayouts';
import { buildEnv, EnvData } from './env';
import { NavGrid } from './nav';
import { Particles } from './particles';
import { ProjectilePool } from './projectiles';
import { GameCamera } from './fxcamera';
import { PostFX } from './post';
import { UI } from './ui';
import { Agent, PlayerController } from './character';
import { AIController } from './ai';

type State = 'title' | 'pre' | 'play' | 'pause' | 'over' | 'result';

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  world = new CollisionWorld();
  paint = new PaintSystem();
  nav: NavGrid;
  stage: StageData;
  env: EnvData;
  particles: Particles;
  projectiles: ProjectilePool;
  camera: GameCamera;
  post: PostFX;
  input: Input;
  audio = new AudioMan();
  ui: UI;
  agents: Agent[] = [];
  player!: Agent;

  state: State = 'title';
  time = 0;
  timeLeft = 180;
  matchLen = 180;
  coverageCache: [number, number] = [0, 0];
  timeScale = 1;
  auto = false;

  private preT = 0;
  private overT = 0;
  private cinematicScale = 1;
  private lastCount = -1;
  private covT = 0;
  private clock = new THREE.Clock();
  private fpsN = 0;
  private fpsT = 0;
  private qualityLevel = 0;
  private hurryOn = false;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const params = new URLSearchParams(location.search);
    this.auto = params.get('auto') === '1';
    this.timeScale = Number(params.get('speed') ?? 1) || 1;
    this.matchLen = Number(params.get('t') ?? 180) || 180;
    const quick = params.get('quick') === '1' || this.auto;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.setSize(innerWidth, innerHeight);

    // 環境マップ(PBR反射)。シャドウ用ライトを作る前に生成する
    // (PMREMの内部レンダリングが既存ライトのシャドウ状態を壊すことがあるため先に行う)
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
      (this.scene as unknown as { environmentIntensity: number }).environmentIntensity = 0.32;
    } catch (e) {
      console.warn('env map failed', e);
    }

    const stageDefinition = selectStageDefinition(params.get('stage'));
    this.stage = buildStage(this.paint, this.world, stageDefinition);
    this.scene.add(this.stage.group);
    this.nav = this.stage.nav;
    this.env = buildEnv(this.scene);
    this.scene.add(this.env.group);

    this.particles = new Particles(this.scene);
    this.projectiles = new ProjectilePool(this.scene);
    this.camera = new GameCamera(innerWidth / innerHeight);
    this.post = new PostFX(this.renderer, this.scene, this.camera.cam, innerWidth, innerHeight);
    this.input = new Input(canvas);
    this.ui = new UI(this.audio);

    this.createAgents();

    // 初期ペイント（タイトル画面の背景用）
    this.paint.clearAll();
    prepaintSpawns(this.paint, this.stage);

    // UI配線
    this.ui.onStart = () => this.startMatch();
    this.ui.onRematch = () => this.startMatch();
    this.ui.onResume = () => this.resumeGame();
    this.ui.onTitle = () => this.gotoTitle();
    this.input.onLockLost = () => {
      if (this.state === 'play' || this.state === 'pre') this.pauseGame();
    };
    this.input.onKeyDown = (code) => {
      if (code === 'Escape' && this.state === 'pause') this.resumeGame();
    };
    // Escからの復帰などでロックが外れたままプレイ中になった場合、クリックで再ロック
    canvas.addEventListener('mousedown', () => {
      if (this.state === 'play' && !this.auto && !this.input.locked) void this.input.lock();
    });
    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.cam.aspect = innerWidth / innerHeight;
      this.camera.cam.updateProjectionMatrix();
      this.post.setSize(innerWidth, innerHeight);
    });

    this.ui.show('title');
    this.camera.introBlend = 1;

    if (quick) {
      // 自動テスト/クイック起動
      setTimeout(() => this.startMatch(), 400);
    }

    // 非表示タブでrAFが止まる環境向けフォールバック（自動テスト用）
    if (this.auto || params.get('bg') === '1') {
      setInterval(() => {
        if (performance.now() - this.lastStepMs > 40) this.step();
      }, 16);
    }

    requestAnimationFrame(this.loop);
  }

  /** デバッグ/QA用: 現フレームをJPEGデータURLで返す */
  snapshot(quality = 0.7): string {
    this.post.render(0.016);
    return this.renderer.domElement.toDataURL('image/jpeg', quality);
  }

  private createAgents() {
    const sp = this.stage.spawns;
    this.player = new Agent(
      0, 'あなた', 'squid', true, sp[0][0],
      this.auto ? new AIController(1.0, 0) : new PlayerController(this.input, this.camera)
    );
    const defs: [number, string, 'squid' | 'octo', number, number, number][] = [
      [0, 'スミカ', 'squid', 1, 0.8, 1],
      [0, 'ゲソタ', 'squid', 2, 0.85, -1],
      [1, 'タコミ', 'octo', 0, 0.95, 0],
      [1, 'オクタン', 'octo', 1, 0.75, 1],
      [1, 'デビラ', 'octo', 2, 1.1, -1],
    ];
    this.agents = [this.player];
    for (const [team, name, kind, slot, agg, lane] of defs) {
      this.agents.push(new Agent(team, name, kind, false, sp[team][slot], new AIController(agg, lane)));
    }
    for (const a of this.agents) {
      this.scene.add(a.rig.root);
      this.scene.add(a.trail.mesh);
      if (a.team === 0 && !a.isPlayer) {
        a.rig.root.add(makeNameTag(a.name, INK_HI_HEX[0]));
      }
    }
  }

  startMatch() {
    this.audio.ensure();
    this.paint.clearAll();
    prepaintSpawns(this.paint, this.stage);
    this.projectiles.clear();
    for (const a of this.agents) {
      a.resetState();
      a.resetStats();
    }
    this.timeLeft = this.matchLen;
    this.cinematicScale = 1;
    this.state = 'pre';
    this.preT = 3.5;
    this.lastCount = -1;
    this.hurryOn = false;
    this.camera.snapBehind(this.player.pos, this.player.spawn.yaw);
    this.camera.introBlend = 1;
    this.ui.show('hud');
    this.ui.hideRespawn();
    this.ui.clearKillFeed();
    this.canvas.classList.remove('dead');
    this.audio.setMusic('battle');
    this.input.clearPresses();
    if (!this.auto) void this.input.lock();
  }

  private pauseGame() {
    if (this.state !== 'play' && this.state !== 'pre') return;
    this.state = 'pause';
    this.ui.show('hud');
    this.ui.showHudOver();
    this.input.unlock();
  }

  private resumeGame() {
    if (this.state !== 'pause') return;
    this.state = 'play';
    this.ui.show('hud');
    this.input.clearPresses();
    if (!this.auto) void this.input.lock();
  }

  gotoTitle() {
    this.cinematicScale = 1;
    this.state = 'title';
    this.ui.show('title');
    this.camera.introBlend = 1;
    this.audio.setMusic('title');
    this.input.unlock();
    this.canvas.classList.remove('dead');
  }

  endMatch() {
    this.state = 'over';
    this.overT = 2.4;
    window.setTimeout(() => {
      if (this.state === 'over') this.showResultScreen();
    }, 2400);
    this.cinematicScale = 0.42;
    this.coverageCache = this.paint.coverage();
    const [c0, c1] = this.coverageCache;
    const draw = Math.abs(c0 - c1) < 0.05;
    const winner = draw ? -1 : c0 > c1 ? 0 : 1;
    const color = winner >= 0 ? INK_COLORS[winner] : INK_COLORS[0];
    const accent = winner >= 0 ? INK_HI_COLORS[winner] : INK_COLORS[1];
    this.particles.celebrate(this.camera.cam, color, accent, 420);
    this.ui.victoryFlash(`#${color.getHexString()}`);
    this.camera.addShake(0.22);
    this.audio.sfx('whistle');
    this.audio.setMusic('none');
    this.ui.centerMsg('タイムアップ!', 2200);
    this.input.unlock();
    this.canvas.classList.remove('dead');
    this.ui.hideRespawn();
  }

  private showResultScreen() {
    if (this.state === 'result') return;
    this.state = 'result';
    this.coverageCache = this.paint.coverage();
    const [c0, c1] = this.coverageCache;
    const draw = Math.abs(c0 - c1) < 0.05;
    const win = c0 > c1;
    this.ui.showResult(win, draw, c0, c1, {
      paint: this.player.paintScore,
      kills: this.player.kills,
      deaths: this.player.deaths,
    });
    this.cinematicScale = 1;
    this.audio.jingle(win && !draw);
  }

  onKill(killer: Agent, victim: Agent) {
    this.ui.addKillFeed(killer.name, killer.team, victim.name, victim.team);
    if (killer === this.player) this.ui.killPop();
    if (victim === this.player) this.canvas.classList.add('dead');
  }

  onPlayerRespawn() {
    this.ui.hideRespawn();
    this.canvas.classList.remove('dead');
    this.camera.snapBehind(this.player.pos, this.player.spawn.yaw);
  }

  private updateHud() {
    const [c0, c1] = this.coverageCache;
    this.ui.setCoverage(c0, c1);
    this.ui.setInk(this.player.energy / 100, this.player.energy < 8);
    this.ui.setHP(this.player.hp / 100);
    this.ui.setTimer(this.timeLeft);
    this.ui.setSpread(this.player.fireT < 0.2);
  }

  private update(dt: number) {
    const st = this.state;
    this.audio.listener = this.player.pos;

    if (st === 'title' || st === 'result') {
      this.camera.introBlend = 1;
      for (const a of this.agents) a.update(dt, this, false);
      this.camera.update(dt, this.world, new THREE.Vector3(0, 1.5, 0), false);
    } else if (st === 'pre') {
      this.preT -= dt;
      this.camera.introBlend = clamp((this.preT - 0.4) / 3.1, 0, 1);
      for (const a of this.agents) a.update(dt, this, false);
      const n = Math.ceil(this.preT - 0.4);
      if (n !== this.lastCount && n >= 1 && n <= 3) {
        this.lastCount = n;
        this.ui.centerMsg(String(n));
        this.audio.sfx('count');
      }
      if (this.preT <= 0) {
        this.state = 'play';
        this.camera.introBlend = 0;
        this.ui.centerMsg('GO!', 800);
        this.audio.sfx('go');
      }
      this.camera.update(dt, this.world, this.player.pos, false);
      this.updateHud();
    } else if (st === 'play') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 30 && !this.hurryOn) {
        this.hurryOn = true;
        this.audio.setMusic('hurry');
        this.ui.centerMsg('のこり30秒!', 1400);
      }
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.endMatch();
      }
      const m = this.input.consumeMouse();
      if (m.dx !== 0 || m.dy !== 0) this.camera.applyMouse(m.dx, m.dy);
      // カメラを先に更新して、この後の射撃が同じフレームの照準点を使えるようにする。
      // 逆順にすると旋回中に1フレーム古い照準点へ撃ってしまい弾が明後日へ飛ぶ。
      this.camera.update(dt, this.world, this.player.pos, this.player.swim);
      for (const a of this.agents) a.update(dt, this, true);
      this.separateAgents();
      this.projectiles.update(dt, this);
      if (!this.player.alive) {
        this.input.clearPresses();
        this.ui.showRespawn(Math.max(1, Math.ceil(this.player.respawnT)));
      }
      this.covT -= dt;
      if (this.covT <= 0) {
        this.covT = 0.25;
        this.coverageCache = this.paint.coverage();
      }
      this.updateHud();
    } else if (st === 'over') {
      this.overT -= dt;
      for (const a of this.agents) a.update(dt, this, false);
      this.projectiles.update(dt, this);
      this.camera.introBlend = clamp(1 - this.overT / 1.2, 0, 0.9);
      this.camera.update(dt, this.world, this.player.pos, false);
    }
    // pause中は何も更新しない（描画のみ）

    this.env.update(this.time, st === 'pause' ? 0 : dt);
    this.stage.decor.update(this.time, st === 'pause' ? 0 : dt);
    this.particles.update(st === 'pause' ? 0 : dt);
    this.ui.tick(dt);
  }

  /** キャラクター同士の重なりを押し出す */
  private separateAgents() {
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.agents.length; j++) {
        const b = this.agents[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const min = 0.8;
        if (d2 < min * min && d2 > 1e-6 && Math.abs(a.pos.y - b.pos.y) < 1.4) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
        }
      }
    }
  }

  private lastStepMs = 0;

  private loop = () => {
    requestAnimationFrame(this.loop);
    this.step();
  };

  private step() {
    this.lastStepMs = performance.now();
    const raw = Math.min(this.clock.getDelta(), 0.05);
    const dt = raw * this.timeScale * this.cinematicScale;
    this.cinematicScale += (1 - this.cinematicScale) * (1 - Math.exp(-2.2 * raw));
    this.time += dt;
    this.update(dt);
    this.paint.commit(this.time);
    this.post.render(raw);

    // FPS監視 → 自動品質調整（自動テスト/非表示タブでは誤検出するため停止）
    if (document.hidden || this.auto || this.timeScale !== 1) return;
    this.fpsN++;
    this.fpsT += raw;
    if (this.fpsT >= 2.5) {
      const fps = this.fpsN / this.fpsT;
      this.fpsN = 0;
      this.fpsT = 0;
      if (fps < 45 && this.qualityLevel < 4) {
        this.qualityLevel++;
        if (this.qualityLevel === 1) this.post.setDOF(false);
        if (this.qualityLevel === 2) this.post.setAO(false);
        if (this.qualityLevel === 3) {
          this.renderer.setPixelRatio(1.2);
          this.post.setSize(innerWidth, innerHeight);
        }
        if (this.qualityLevel === 4) {
          this.renderer.setPixelRatio(1.0);
          this.post.setSize(innerWidth, innerHeight);
        }
        console.info(`[perf] fps=${fps.toFixed(0)} → quality level ${this.qualityLevel}`);
      }
    }
  }
}

/** 味方の頭上ネームタグ */
function makeNameTag(name: string, colorHex: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = '900 italic 38px "Segoe UI", "Yu Gothic UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(10,8,20,0.9)';
  ctx.lineWidth = 7;
  ctx.strokeText(name, 128, 34);
  ctx.fillStyle = colorHex;
  ctx.fillText(name, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, opacity: 0.9,
  }));
  sprite.scale.set(1.5, 0.38, 1);
  sprite.position.y = 2.15;
  sprite.renderOrder = 50;
  return sprite;
}
