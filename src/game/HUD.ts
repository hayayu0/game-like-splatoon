/** DOM オーバーレイ（タイマー・塗り割合・各種ゲージ・開始/結果画面）の管理 */
export class HUD {
  private timer = document.getElementById('timer')!;
  private turf0 = document.getElementById('turf0')!;
  private turf1 = document.getElementById('turf1')!;
  private pct0 = document.getElementById('pct0')!;
  private pct1 = document.getElementById('pct1')!;
  private inkFill = document.getElementById('ink-fill')!;
  private healthFill = document.getElementById('health-fill')!;
  private specialFill = document.getElementById('special-fill')!;
  private specialReady = document.getElementById('special-ready')!;
  private respawnOverlay = document.getElementById('respawn-overlay')!;
  private respawnTime = document.getElementById('respawn-time')!;
  private startOverlay = document.getElementById('start-overlay')!;
  private endOverlay = document.getElementById('end-overlay')!;
  private result = document.getElementById('result')!;
  private endDetail = document.getElementById('end-detail')!;
  private startBtn = document.getElementById('start-btn')!;
  private restartBtn = document.getElementById('restart-btn')!;

  onStart(cb: () => void) {
    this.startBtn.addEventListener('click', cb);
  }
  onRestart(cb: () => void) {
    this.restartBtn.addEventListener('click', cb);
  }

  hideStart() {
    this.startOverlay.classList.add('hidden');
  }

  setTimer(sec: number) {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    this.timer.textContent = `${m}:${r.toString().padStart(2, '0')}`;
  }

  setTurf(p0: number, p1: number) {
    this.turf0.style.width = `${(p0 * 100).toFixed(1)}%`;
    this.turf1.style.width = `${(p1 * 100).toFixed(1)}%`;
    this.pct0.textContent = `${Math.round(p0 * 100)}%`;
    this.pct1.textContent = `${Math.round(p1 * 100)}%`;
  }

  setInk(frac: number) {
    this.inkFill.style.height = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  setHealth(frac: number) {
    this.healthFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  setSpecial(frac: number, ready: boolean) {
    this.specialFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    this.specialReady.classList.toggle('visible', ready);
  }

  showRespawn(sec: number) {
    this.respawnTime.textContent = Math.max(1, Math.ceil(sec)).toString();
    this.respawnOverlay.classList.remove('hidden');
  }

  hideRespawn() {
    this.respawnOverlay.classList.add('hidden');
  }

  showEnd(p0: number, p1: number) {
    let title: string;
    let cls: string;
    if (Math.abs(p0 - p1) < 0.001) {
      title = '引き分け';
      cls = '';
    } else if (p0 > p1) {
      title = 'WIN! 勝ち！';
      cls = 'p0';
    } else {
      title = 'LOSE… 負け';
      cls = 'p1';
    }
    this.result.textContent = title;
    this.result.className = cls === 'p0' ? 'accent' : '';
    this.endDetail.innerHTML =
      `<span class="pct p0">あなた ${Math.round(p0 * 100)}%</span>` +
      ' &nbsp;vs&nbsp; ' +
      `<span class="pct p1">敵 ${Math.round(p1 * 100)}%</span>`;
    this.endOverlay.classList.remove('hidden');
  }
}
