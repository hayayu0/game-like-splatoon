/** キーボード / マウス / ポインタロック管理 */
export class Input {
  keys = new Set<string>();
  buttons = [false, false, false];
  /** 押下を検知した時刻(ms)。フレームより短いクリックを取りこぼさないためのラッチ */
  private pressT = [0, 0, 0];
  private mDX = 0;
  private mDY = 0;
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
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === el;
      if (was && !this.locked) {
        this.buttons = [false, false, false];
        this.pressT = [0, 0, 0];
        this.keys.clear();
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
