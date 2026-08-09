export interface TapInput {
  ndcX: number;
  ndcY: number;
  onAim: boolean;
  time: number;
}

interface TouchGesture {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startT: number;
  swiping: boolean;
}

const TOUCH_SWIPE_THRESHOLD = 10;
const TOUCH_LOOK_SCALE = 2.4;

/** キーボード / マウス / タッチ / ポインタロック管理 */
export class Input {
  keys = new Set<string>();
  buttons = [false, false, false];
  /** 押下を検知した時刻(ms)。フレームより短いクリックを取りこぼさないためのラッチ */
  private pressT = [0, 0, 0];
  private mDX = 0;
  private mDY = 0;
  private taps: TapInput[] = [];
  private touch: TouchGesture | null = null;
  locked = false;
  onLockLost: (() => void) | null = null;
  onKeyDown: ((code: string) => void) | null = null;

  constructor(private el: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.keys.add(e.code);
        this.onKeyDown?.(e.code);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons = [false, false, false];
      this.pressT = [0, 0, 0];
      this.taps = [];
      this.touch = null;
    });
    el.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons[e.button] = true;
      this.pressT[e.button] = performance.now();
    });
    window.addEventListener('mouseup', (e) => {
      this.buttons[e.button] = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mDX += e.movementX;
        this.mDY += e.movementY;
      }
    });
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || this.touch) return;
      e.preventDefault();
      this.touch = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        startT: performance.now(),
        swiping: false,
      };
      try { el.setPointerCapture(e.pointerId); } catch { /* pointer capture非対応 */ }
    }, { passive: false });
    el.addEventListener('pointermove', (e) => {
      const touch = this.touch;
      if (e.pointerType !== 'touch' || !touch || e.pointerId !== touch.pointerId) return;
      e.preventDefault();
      const totalX = e.clientX - touch.startX;
      const totalY = e.clientY - touch.startY;
      if (!touch.swiping && Math.hypot(totalX, totalY) >= TOUCH_SWIPE_THRESHOLD) {
        touch.swiping = true;
        this.mDX += totalX * TOUCH_LOOK_SCALE;
        this.mDY += totalY * TOUCH_LOOK_SCALE;
      } else if (touch.swiping) {
        this.mDX += (e.clientX - touch.lastX) * TOUCH_LOOK_SCALE;
        this.mDY += (e.clientY - touch.lastY) * TOUCH_LOOK_SCALE;
      }
      touch.lastX = e.clientX;
      touch.lastY = e.clientY;
    }, { passive: false });
    el.addEventListener('pointerup', (e) => {
      const touch = this.touch;
      if (e.pointerType !== 'touch' || !touch || e.pointerId !== touch.pointerId) return;
      e.preventDefault();
      if (!touch.swiping && performance.now() - touch.startT <= 500) {
        this.queueTap(e.clientX, e.clientY);
      }
      this.touch = null;
    }, { passive: false });
    el.addEventListener('pointercancel', (e) => {
      if (this.touch?.pointerId === e.pointerId) this.touch = null;
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === el;
      if (was && !this.locked) {
        this.buttons = [false, false, false];
        this.pressT = [0, 0, 0];
        this.keys.clear();
        this.taps = [];
        this.touch = null;
        this.onLockLost?.();
      }
    });
  }

  down(code: string) {
    return this.keys.has(code);
  }

  /**
   * ボタンが「押されている、または前回の問い合わせ以降に押された」か。
   * 1フレームより短いクリックでも必ず1回は true を返す。
   * 取りこぼした押下は200msで失効するので、ポーズ復帰後に暴発しない。
   */
  firePressed(button = 0) {
    if (this.buttons[button]) return true;
    const t = this.pressT[button];
    if (t && performance.now() - t < 200) {
      this.pressT[button] = 0;
      return true;
    }
    return false;
  }

  clearPresses() {
    this.pressT = [0, 0, 0];
    this.taps = [];
    this.touch = null;
  }

  consumeTap(): TapInput | null {
    const now = performance.now();
    while (this.taps.length > 0) {
      const tap = this.taps.shift()!;
      if (now - tap.time < 250) return tap;
    }
    return null;
  }

  private queueTap(clientX: number, clientY: number) {
    const rect = this.el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    this.taps.push({
      ndcX: x / rect.width * 2 - 1,
      ndcY: 1 - y / rect.height * 2,
      // 照準UIは120px四方。指でも狙えるよう全体をタップ対象にする。
      onAim: Math.hypot(x - (rect.width / 2 + 26), y - (rect.height / 2 + 52)) <= 60,
      time: performance.now(),
    });
  }

  /** 蓄積したマウス移動量を取り出してリセット */
  consumeMouse() {
    const r = { dx: this.mDX, dy: this.mDY };
    this.mDX = 0;
    this.mDY = 0;
    return r;
  }

  async lock() {
    try {
      // unadjustedMovement対応ブラウザでは高精度モードを使う
      await (this.el.requestPointerLock as unknown as (o?: object) => Promise<void>).call(this.el, {
        unadjustedMovement: true,
      });
    } catch {
      try {
        this.el.requestPointerLock();
      } catch {
        /* ロック不可環境（自動テスト等）は無視 */
      }
    }
  }

  unlock() {
    if (this.locked) document.exitPointerLock();
  }
}
