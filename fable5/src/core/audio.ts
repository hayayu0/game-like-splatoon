/** Web Audio 全合成のサウンドマネージャ（外部音源なし） */
export type SfxName =
  | 'shoot' | 'splat' | 'jump' | 'land' | 'damage' | 'ko' | 'death' | 'respawn'
  | 'uiClick' | 'uiHover' | 'dry' | 'hit' | 'count' | 'go' | 'whistle' | 'swim';

type MusicMode = 'none' | 'title' | 'battle' | 'hurry' | 'result';

const NOTE: Record<string, number> = {};
{
  const names = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
  for (let oct = 0; oct <= 6; oct++)
    names.forEach((n, i) => (NOTE[`${n}${oct}`] = 440 * Math.pow(2, (oct * 12 + i - 57) / 12)));
}

export class AudioMan {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private mode: MusicMode = 'none';
  private step = 0;
  private nextT = 0;
  listener = { x: 0, y: 0, z: 0 };

  /** ユーザー操作後に呼ぶ（autoplay制限対策） */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(comp);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.3;
    this.musicBus.connect(this.master);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.nextT = ctx.currentTime + 0.1;
    window.setInterval(() => this.schedule(), 50);
  }

  get ready() {
    return !!this.ctx;
  }

  private osc(
    type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number,
    dest?: AudioNode, curve: 'exp' | 'lin' = 'exp'
  ) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(f0, 1), t0);
    if (f1 !== f0) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
      else o.frequency.linearRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(dest ?? this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
    return g;
  }

  private noise(
    t0: number, dur: number, vol: number,
    opt: { hp?: number; lp?: number; q?: number; dest?: AudioNode } = {}
  ) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    let node: AudioNode = src;
    if (opt.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opt.lp;
      f.Q.value = opt.q ?? 0.8;
      node.connect(f);
      node = f;
    }
    if (opt.hp) {
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = opt.hp;
      f.Q.value = opt.q ?? 0.8;
      node.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    node.connect(g).connect(opt.dest ?? this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  /** 距離減衰つき効果音再生 */
  sfx(name: SfxName, pos?: { x: number; y: number; z: number }) {
    if (!this.ctx) return;
    let vol = 1;
    if (pos) {
      const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z;
      const d = Math.hypot(dx, dz);
      vol = 1 / (1 + d * 0.09);
      if (vol < 0.04) return;
    }
    const t = this.ctx.currentTime;
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    switch (name) {
      case 'shoot':
        this.osc('square', r(760, 900), r(340, 420), t, 0.07, 0.1 * vol);
        this.noise(t, 0.05, 0.12 * vol, { hp: 1800 });
        break;
      case 'splat':
        this.noise(t, 0.1, 0.16 * vol, { lp: 1100 });
        this.osc('sine', r(220, 300), 80, t, 0.09, 0.1 * vol);
        break;
      case 'jump':
        this.osc('sine', 260, 540, t, 0.14, 0.14 * vol, undefined, 'lin');
        break;
      case 'land':
        this.noise(t, 0.09, 0.2 * vol, { lp: 380 });
        break;
      case 'damage':
        this.osc('sawtooth', 240, 100, t, 0.16, 0.22 * vol);
        this.noise(t, 0.1, 0.14 * vol, { lp: 2500 });
        break;
      case 'ko':
        this.noise(t, 0.22, 0.24 * vol, { lp: 1400 });
        this.osc('sine', 660, 660, t + 0.03, 0.09, 0.16 * vol);
        this.osc('sine', 990, 990, t + 0.13, 0.14, 0.16 * vol);
        break;
      case 'death':
        this.osc('sawtooth', 330, 70, t, 0.5, 0.24 * vol);
        this.noise(t, 0.35, 0.2 * vol, { lp: 900 });
        break;
      case 'respawn':
        [523, 659, 784, 1047].forEach((f, i) => this.osc('sine', f, f, t + i * 0.06, 0.12, 0.12 * vol));
        break;
      case 'uiClick':
        this.osc('square', 520, 520, t, 0.05, 0.1);
        this.noise(t, 0.03, 0.06, { hp: 3000 });
        break;
      case 'uiHover':
        this.osc('sine', 700, 700, t, 0.04, 0.05);
        break;
      case 'dry':
        this.osc('square', 200, 160, t, 0.04, 0.06);
        break;
      case 'hit':
        this.osc('sine', 1250, 1100, t, 0.045, 0.1);
        break;
      case 'count':
        this.osc('square', 440, 440, t, 0.14, 0.16);
        break;
      case 'go':
        this.osc('square', 880, 880, t, 0.4, 0.18);
        this.osc('sawtooth', 220, 220, t, 0.4, 0.12);
        this.osc('sawtooth', 277, 277, t, 0.4, 0.1);
        break;
      case 'whistle':
        this.osc('square', 1568, 1568, t, 0.16, 0.12);
        this.osc('square', 1568, 1568, t + 0.22, 0.16, 0.12);
        this.osc('square', 1568, 1520, t + 0.44, 0.7, 0.12);
        break;
      case 'swim':
        this.osc('sine', r(300, 700), r(500, 900), t, 0.05, 0.04 * vol);
        break;
    }
  }

  jingle(win: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    if (win) {
      const seq = ['C5', 'E5', 'G5', 'C6'];
      seq.forEach((n, i) => {
        this.osc('square', NOTE[n], NOTE[n], t + i * 0.13, 0.16, 0.12, this.musicBus);
        this.osc('triangle', NOTE[n] / 2, NOTE[n] / 2, t + i * 0.13, 0.2, 0.1, this.musicBus);
      });
      ['C5', 'E5', 'G5'].forEach((n) =>
        this.osc('sawtooth', NOTE[n], NOTE[n], t + 0.58, 0.9, 0.07, this.musicBus)
      );
      this.noise(t + 0.58, 0.5, 0.12, { hp: 5000, dest: this.musicBus });
    } else {
      const seq = ['E4', 'Ds4', 'C4', 'A3'];
      seq.forEach((n, i) =>
        this.osc('triangle', NOTE[n], NOTE[n], t + i * 0.24, 0.4, 0.12, this.musicBus)
      );
      ['A3', 'C4', 'E4'].forEach((n) =>
        this.osc('sawtooth', NOTE[n], NOTE[n], t + 1.0, 1.4, 0.05, this.musicBus)
      );
    }
  }

  setMusic(mode: MusicMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.step = 0;
    if (this.ctx) this.nextT = Math.max(this.nextT, this.ctx.currentTime + 0.06);
  }

  /* ---------------- BGM シーケンサ ---------------- */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.nextT < ctx.currentTime) this.nextT = ctx.currentTime + 0.02;
    while (this.nextT < ctx.currentTime + 0.15) {
      this.scheduleStep(this.step, this.nextT);
      this.step++;
      this.nextT += this.stepDur();
    }
  }

  private stepDur() {
    switch (this.mode) {
      case 'battle': return 60 / 132 / 4;
      case 'hurry': return 60 / 152 / 4;
      case 'title': return 60 / 96 / 4;
      default: return 0.12;
    }
  }

  private scheduleStep(step: number, t: number) {
    if (this.mode === 'none' || this.mode === 'result') return;
    const m = this.musicBus;
    const s16 = step % 16;
    const s32 = step % 32;
    if (this.mode === 'title') {
      // ゆったりしたコードパッド
      const chords = [['C3', 'E3', 'G3', 'B3'], ['A2', 'C3', 'E3', 'G3'], ['F2', 'A2', 'C3', 'E3'], ['G2', 'B2', 'D3', 'F3']];
      if (s16 === 0) {
        const ch = chords[Math.floor(step / 16) % 4];
        ch.forEach((n, i) => {
          const g = this.osc('sawtooth', NOTE[n] * (i === 1 ? 1.003 : 1), NOTE[n], t, 2.6, 0.028, m);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.028, t + 0.5);
          g.gain.linearRampToValueAtTime(0.0008, t + 2.6);
        });
        this.osc('sine', NOTE[ch[0]] / 2, NOTE[ch[0]] / 2, t, 1.8, 0.09, m);
      }
      if (s16 === 8) this.noise(t, 0.2, 0.02, { hp: 6000, dest: m });
      return;
    }
    // バトル / ラスト30秒
    const hurry = this.mode === 'hurry';
    const bassPat = [
      'A1', '', 'A1', '', 'C2', '', 'A1', '', 'E2', '', 'D2', '', 'C2', '', 'G1', '',
      'A1', '', 'A1', '', 'C2', '', 'D2', '', 'E2', '', 'G2', '', 'E2', '', 'D2', '',
    ];
    const leadPat = [
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      'A4', '', 'C5', '', 'E5', '', 'D5', '', 'C5', '', 'A4', '', 'G4', '', 'A4', '',
    ];
    // キック
    if (s16 % 4 === 0) this.osc('sine', 150, 46, t, 0.13, 0.3, m);
    // スネア
    if (s16 === 4 || s16 === 12) this.noise(t, 0.12, 0.14, { hp: 1300, lp: 6000, dest: m });
    // ハイハット
    if (s16 % 2 === 1 || hurry) this.noise(t, 0.03, 0.05, { hp: 8000, dest: m });
    // ベース
    const bn = bassPat[s32];
    if (bn) {
      const f = NOTE[bn] * (hurry ? 2 : 1);
      const ctx = this.ctx!;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(1100, t);
      filt.frequency.exponentialRampToValueAtTime(280, t + 0.16);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
      o.connect(filt).connect(g).connect(m);
      o.start(t);
      o.stop(t + 0.2);
    }
    // リード
    const ln = leadPat[s32];
    if (ln && (hurry || Math.floor(step / 32) % 2 === 1)) {
      const f = NOTE[ln] * (hurry ? 1.5 : 1);
      this.osc('triangle', f, f, t, 0.1, 0.06, m);
      this.osc('triangle', f, f, t + this.stepDur() * 1.5, 0.08, 0.03, m);
    }
  }
}
