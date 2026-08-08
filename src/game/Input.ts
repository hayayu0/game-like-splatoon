/** キーボード・マウス・ポインタロックの入力管理 */
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  firing = false; // 左ボタン押下中
  rightMouse = false; // 右ボタン押下中（イカ潜伏）
  locked = false;

  private mouseDX = 0;
  private mouseDY = 0;

  constructor(private domElement: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.firing = true;
      if (e.button === 2) this.rightMouse = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.rightMouse = false;
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.domElement;
      if (!this.locked) {
        // ロック解除時は押しっぱなし状態をリセット
        this.firing = false;
        this.rightMouse = false;
        this.keys.clear();
        this.pressed.clear();
      }
    });

    // ロックされていない状態でゲーム画面をクリックしたら再ロック
    this.domElement.addEventListener('click', () => {
      if (!this.locked) this.requestLock();
    });
  }

  requestLock() {
    this.domElement.requestPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** キーを押した瞬間だけ true を返す */
  consumePressed(code: string): boolean {
    const wasPressed = this.pressed.has(code);
    this.pressed.delete(code);
    return wasPressed;
  }

  get squidPressed(): boolean {
    return this.rightMouse || this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }

  /** 蓄積したマウス移動量を取り出してリセット */
  consumeMouse(): [number, number] {
    const d: [number, number] = [this.mouseDX, this.mouseDY];
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }
}
