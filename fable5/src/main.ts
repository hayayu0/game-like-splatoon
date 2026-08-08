import './style.css';
import { Game } from './game/game';

const canvas = document.getElementById('gl') as HTMLCanvasElement;

try {
  const game = new Game(canvas);
  (window as unknown as { __game: Game }).__game = game;
} catch (e) {
  console.error(e);
  const div = document.createElement('div');
  div.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;background:#14101f;font-size:20px;font-weight:700;text-align:center;padding:24px;';
  div.textContent = 'WebGLの初期化に失敗しました。ハードウェアアクセラレーションが有効なブラウザでお試しください。';
  document.body.appendChild(div);
}
