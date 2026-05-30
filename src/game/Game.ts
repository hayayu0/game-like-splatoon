import * as THREE from 'three';
import { GAME, TEAMS } from './config';
import { Arena } from './Arena';
import { PaintSystem } from './PaintSystem';
import { Weapon } from './Weapon';
import { Player } from './Player';
import { EnemyAI } from './EnemyAI';
import { Input } from './Input';
import { HUD } from './HUD';

type State = 'ready' | 'playing' | 'finished';

/** ゲーム全体の統括: 初期化・進行・タイマー・勝敗判定 */
export class Game {
  private input: Input;
  private hud: HUD;
  private paint: PaintSystem;
  private weapon: Weapon;
  private player: Player;
  private enemies: EnemyAI;

  private state: State = 'ready';
  private timeLeft = GAME.duration;
  private coverageTimer = 0;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    private canvas: HTMLCanvasElement,
  ) {
    this.input = new Input(canvas);
    this.hud = new HUD();

    this.paint = new PaintSystem([TEAMS.player.inkCss, TEAMS.enemy.inkCss]);
    new Arena(scene, this.paint.texture);
    this.weapon = new Weapon(scene, this.paint, [TEAMS.player.color, TEAMS.enemy.color]);

    this.player = new Player(
      scene,
      camera,
      this.input,
      this.paint,
      this.weapon,
      TEAMS.player.id,
      TEAMS.player.color,
      new THREE.Vector3(0, 0, -16),
    );

    this.enemies = new EnemyAI(
      scene,
      this.paint,
      this.weapon,
      TEAMS.enemy.id,
      TEAMS.enemy.color,
      GAME.enemyCount,
      [
        new THREE.Vector3(-4, 0, 16),
        new THREE.Vector3(0, 0, 16),
        new THREE.Vector3(4, 0, 16),
      ],
    );

    // 開始前のカメラ位置（オーバーレイ背景用）
    camera.position.set(0, 10, -26);
    camera.lookAt(0, 0, 0);

    this.hud.setTimer(GAME.duration);
    this.hud.setInk(1);

    this.hud.onStart(() => this.start());
    this.hud.onRestart(() => location.reload());
  }

  private start() {
    this.input.requestLock();
    this.hud.hideStart();
    this.state = 'playing';
    this.timeLeft = GAME.duration;
  }

  update(dt: number) {
    if (this.state !== 'playing') return;

    this.timeLeft -= dt;

    this.player.update(dt);
    this.enemies.update(dt);
    this.weapon.update(dt);
    this.paint.update();

    this.coverageTimer -= dt;
    if (this.coverageTimer <= 0) {
      this.coverageTimer = 0.25;
      this.paint.computeCoverage();
      this.hud.setTurf(this.paint.pct0, this.paint.pct1);
    }

    this.hud.setTimer(this.timeLeft);
    this.hud.setInk(this.player.ink / 100);

    if (this.timeLeft <= 0) this.finish();
  }

  private finish() {
    this.state = 'finished';
    this.paint.computeCoverage();
    const p0 = this.paint.pct0;
    const p1 = this.paint.pct1;
    this.hud.setTurf(p0, p1);
    this.hud.setTimer(0);
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.showEnd(p0, p1);
  }
}
