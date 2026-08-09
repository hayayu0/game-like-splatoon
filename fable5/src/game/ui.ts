import { AudioMan } from '../core/audio';
import { clamp } from '../core/utils';

const $ = (id: string) => document.getElementById(id)!;

/** DOMオーバーレイUI制御 */
export class UI {
  onStart: () => void = () => {};
  onRematch: () => void = () => {};
  onResume: () => void = () => {};
  onTitle: () => void = () => {};
  onWeaponSwitch: () => void = () => {};
  private howtoFrom: 'title' | 'pause' = 'title';
  private vigFlash = 0;
  private vigBase = 0;
  private colorFlash = false;
  private centerTimer = 0;

  private hud = $('hud');
  private title = $('title');
  private howto = $('howto');
  private pause = $('pause');
  private result = $('result');
  private timerEl = $('timer');
  private coverL = $('coverL');
  private coverR = $('coverR');
  private coverPctL = $('coverPctL');
  private coverPctR = $('coverPctR');
  private hpRing = $('hpRing') as unknown as SVGCircleElement;
  private chSpread = $('chSpread') as unknown as SVGCircleElement;
  private hitmark = $('hitmarker');
  private inkMeter = $('inkMeter');
  private inkFill = $('inkFill') as unknown as SVGRectElement;
  private inkPct = $('inkPct');
  private weaponName = $('weaponName');
  private killfeed = $('killfeed');
  private centerEl = $('centerMsg');
  private killPopEl = $('killPop');
  private respawnEl = $('respawnOverlay');
  private respawnCount = $('respawnCount');
  private vignette = $('dmgVignette');
  private lowInkEl = $('lowInk');

  constructor(private audio: AudioMan) {
    const click = (id: string, fn: () => void) => {
      $(id).addEventListener('click', () => {
        this.audio.ensure();
        this.audio.sfx('uiClick');
        fn();
      });
    };
    click('btnStart', () => this.onStart());
    click('btnHowto', () => {
      this.howtoFrom = 'title';
      this.show('howto');
    });
    click('btnHowtoBack', () => this.show(this.howtoFrom));
    click('btnResume', () => this.onResume());
    click('btnPauseHowto', () => {
      this.howtoFrom = 'pause';
      this.show('howto');
    });
    click('btnPauseTitle', () => this.onTitle());
    click('btnRematch', () => this.onRematch());
    click('btnResultTitle', () => this.onTitle());
    click('weaponName', () => this.onWeaponSwitch());
    document.querySelectorAll('.btn').forEach((b) =>
      b.addEventListener('mouseenter', () => this.audio.sfx('uiHover'))
    );
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** 表示画面の切り替え */
  show(screen: 'title' | 'howto' | 'pause' | 'result' | 'hud' | 'none') {
    for (const [name, el] of [
      ['title', this.title], ['howto', this.howto], ['pause', this.pause], ['result', this.result],
    ] as const) {
      el.classList.toggle('hidden', name !== screen);
    }
    this.hud.classList.toggle('hidden', screen !== 'hud');
  }

  showHudOver() {
    // ポーズはHUDの上に重ねる
    this.pause.classList.remove('hidden');
  }

  setTimer(sec: number) {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    this.timerEl.textContent = `${m}:${String(s % 60).padStart(2, '0')}`;
    this.timerEl.classList.toggle('warn', sec <= 30 && sec > 10);
    this.timerEl.classList.toggle('critical', sec <= 10);
  }

  setCoverage(a: number, b: number) {
    const total = Math.max(1, a + b);
    // バーは相対比率、%表示は絶対値
    this.coverL.style.width = `${(a / Math.max(total, 40)) * 100}%`;
    this.coverR.style.width = `${(b / Math.max(total, 40)) * 100}%`;
    this.coverPctL.textContent = `${a.toFixed(1)}%`;
    this.coverPctR.textContent = `${b.toFixed(1)}%`;
  }

  setInk(v01: number, low: boolean) {
    this.inkFill.style.transform = `translateY(${(1 - clamp(v01, 0, 1)) * 130}px)`;
    this.inkPct.textContent = String(Math.round(v01 * 100));
    this.inkMeter.classList.toggle('low', low);
    this.lowInkEl.classList.toggle('hidden', !low);
  }

  setHP(hp01: number) {
    const c = 163.4;
    this.hpRing.style.strokeDashoffset = String(c * (1 - clamp(hp01, 0, 1)));
    this.hpRing.style.stroke = hp01 > 0.55 ? '#7dffb2' : hp01 > 0.28 ? '#ffd23e' : '#ff5252';
    this.vigBase = hp01 < 0.34 && hp01 > 0 ? 0.4 : 0;
  }

  setSpread(firing: boolean) {
    this.chSpread.setAttribute('r', firing ? '19' : '14');
  }

  setWeapon(name: string) {
    this.weaponName.textContent = name;
  }

  hitmarker() {
    this.hitmark.classList.remove('hit');
    void this.hitmark.offsetWidth;
    this.hitmark.classList.add('hit');
    this.audio.sfx('hit');
  }

  killPop() {
    this.killPopEl.classList.remove('hidden');
    this.killPopEl.style.animation = 'none';
    void this.killPopEl.offsetWidth;
    this.killPopEl.style.animation = '';
    window.setTimeout(() => this.killPopEl.classList.add('hidden'), 900);
  }

  addKillFeed(kName: string, kTeam: number, vName: string, vTeam: number) {
    const div = document.createElement('div');
    div.className = 'kf-item';
    div.innerHTML =
      `<span class="kf-name${kTeam}">${kName}</span>` +
      `<span class="kf-x">▶▶</span>` +
      `<span class="kf-name${vTeam}">${vName}</span>`;
    this.killfeed.appendChild(div);
    while (this.killfeed.children.length > 5) this.killfeed.firstChild?.remove();
    window.setTimeout(() => div.classList.add('out'), 3200);
    window.setTimeout(() => div.remove(), 3900);
  }

  centerMsg(text: string, hideMs = 0) {
    this.centerEl.textContent = text;
    this.centerEl.classList.remove('hidden');
    this.centerEl.style.animation = 'none';
    void this.centerEl.offsetWidth;
    this.centerEl.style.animation = '';
    if (this.centerTimer) window.clearTimeout(this.centerTimer);
    if (hideMs > 0) {
      this.centerTimer = window.setTimeout(() => this.centerEl.classList.add('hidden'), hideMs);
    }
  }

  hideCenter() {
    this.centerEl.classList.add('hidden');
  }

  showRespawn(count: number) {
    this.respawnEl.classList.remove('hidden');
    this.respawnCount.textContent = String(count);
  }

  hideRespawn() {
    this.respawnEl.classList.add('hidden');
  }

  damageFlash() {
    if (this.colorFlash) return;
    this.vignette.style.removeProperty('background-color');
    this.vignette.style.removeProperty('box-shadow');
    this.vignette.style.removeProperty('mix-blend-mode');
    this.vigFlash = 0.9;
  }

  /** 勝敗確定の瞬間だけHUD全面をチームカラーで発光させる */
  victoryFlash(color: string) {
    this.vigBase = 0;
    this.vigFlash = 1;
    this.colorFlash = true;
    this.vignette.style.backgroundColor = color;
    this.vignette.style.boxShadow = 'inset 0 0 180px 45px rgba(255,255,255,0.82)';
    this.vignette.style.mixBlendMode = 'screen';
  }

  /** 毎フレーム: ビネットのフェード */
  tick(dt: number) {
    this.vigFlash = Math.max(0, this.vigFlash - dt * 3.2);
    const v = Math.max(this.vigBase + Math.sin(performance.now() * 0.006) * 0.06 * (this.vigBase > 0 ? 1 : 0), this.vigFlash);
    this.vignette.style.opacity = String(clamp(v, 0, 1));
    if (this.colorFlash && this.vigFlash <= 0) {
      this.colorFlash = false;
      this.vignette.style.removeProperty('background-color');
      this.vignette.style.removeProperty('box-shadow');
      this.vignette.style.removeProperty('mix-blend-mode');
    }
  }

  clearKillFeed() {
    this.killfeed.innerHTML = '';
  }

  showResult(win: boolean, draw: boolean, p0: number, p1: number, stats: { paint: number; kills: number; deaths: number }) {
    this.show('result');
    const stamp = $('resultStamp');
    stamp.textContent = draw ? 'DRAW' : win ? 'WIN!' : 'LOSE...';
    stamp.className = win && !draw ? 'win' : 'lose';
    stamp.id = 'resultStamp';
    $('statPaint').textContent = String(stats.paint);
    $('statKill').textContent = String(stats.kills);
    $('statDeath').textContent = String(stats.deaths);
    const rbarL = $('rbarL');
    const rbarR = $('rbarR');
    rbarL.style.transition = 'none';
    rbarR.style.transition = 'none';
    rbarL.style.width = '0%';
    rbarR.style.width = '0%';
    const total = Math.max(1, p0 + p1);
    window.setTimeout(() => {
      rbarL.style.transition = '';
      rbarR.style.transition = '';
      rbarL.style.width = `${(p0 / total) * 100}%`;
      rbarR.style.width = `${(p1 / total) * 100}%`;
    }, 250);
    // %テキストのカウントアップ
    const t0 = performance.now();
    const dur = 1700;
    const tick = () => {
      const k = clamp((performance.now() - t0 - 250) / dur, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      $('rpctL').textContent = `${(p0 * e).toFixed(1)}%`;
      $('rpctR').textContent = `${(p1 * e).toFixed(1)}%`;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
