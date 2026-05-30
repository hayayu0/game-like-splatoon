import * as THREE from 'three';
import { ARENA, OBSTACLES } from './config';
import { Input } from './Input';
import { PaintSystem } from './PaintSystem';
import { Weapon } from './Weapon';
import { createSquid } from './Characters';

const RADIUS = 0.5;
const WALK_SPEED = 6;
const SQUID_SPEED = 10;
const ENEMY_INK_SPEED = 3;
const JUMP_VEL = 7;
const GRAVITY = 20;
const INK_PER_SHOT = 1.5;
const INK_MAX = 100;
const SENS = 0.0022;

/** 三人称プレイヤー。移動・視点・射撃・イカ潜伏・インクタンクを管理。 */
export class Player {
  readonly pos = new THREE.Vector3();
  ink = INK_MAX;
  isSquid = false;

  private group = new THREE.Group();
  private character: THREE.Group;
  private velY = 0;
  private onGround = true;
  private yaw = 0;
  private pitch = -0.15;
  private camDistance = 6;

  constructor(
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private input: Input,
    private paint: PaintSystem,
    private weapon: Weapon,
    private team: number,
    teamColor: number,
    spawn: THREE.Vector3,
  ) {
    this.pos.copy(spawn);

    // イカ型キャラ（ローカル +Z が前方）
    this.character = createSquid(teamColor);
    this.group.add(this.character);

    this.group.position.copy(this.pos);
    scene.add(this.group);
  }

  update(dt: number) {
    // --- 視点 ---
    const [mdx, mdy] = this.input.consumeMouse();
    this.yaw -= mdx * SENS;
    this.pitch -= mdy * SENS;
    this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch));

    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    // 照準（カメラの向く方向＝弾が飛ぶ方向）
    const forward = new THREE.Vector3(
      -Math.sin(this.yaw) * cp,
      sp,
      -Math.cos(this.yaw) * cp,
    );
    const horiz = new THREE.Vector3(forward.x, 0, forward.z).normalize();
    const right = new THREE.Vector3(-horiz.z, 0, horiz.x);

    // --- 足元のインク状態 ---
    const ground = this.paint.ownerAt(this.pos.x, this.pos.z);
    const onOwnInk = ground === this.team + 1;
    const onEnemyInk = ground !== 0 && ground !== 3 && ground !== this.team + 1;

    // --- イカ潜伏 ---
    this.isSquid = this.input.squidPressed && onOwnInk && this.onGround;

    // --- 移動 ---
    const mf = (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0);
    const ms = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0);
    const move = new THREE.Vector3()
      .addScaledVector(horiz, mf)
      .addScaledVector(right, ms);
    if (move.lengthSq() > 0) move.normalize();

    let speed = WALK_SPEED;
    if (this.isSquid) speed = SQUID_SPEED;
    else if (onEnemyInk) speed = ENEMY_INK_SPEED;

    this.pos.x += move.x * speed * dt;
    this.pos.z += move.z * speed * dt;

    // --- ジャンプ＆重力 ---
    if (this.input.isDown('Space') && this.onGround && !this.isSquid) {
      this.velY = JUMP_VEL;
      this.onGround = false;
    }
    this.velY -= GRAVITY * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.velY = 0;
      this.onGround = true;
    }

    this.resolveCollisions();

    // --- インク回復 ---
    this.ink = Math.min(INK_MAX, this.ink + (this.isSquid ? 40 : 8) * dt);

    // --- 射撃 ---
    if (this.input.firing && !this.isSquid && this.ink >= INK_PER_SHOT) {
      const muzzle = new THREE.Vector3(this.pos.x, 1.2, this.pos.z).addScaledVector(
        forward,
        0.7,
      );
      if (this.weapon.tryFire(muzzle, forward, this.team)) this.ink -= INK_PER_SHOT;
    }

    // --- 見た目（潜伏時はイカを平たく沈める） ---
    this.character.scale.set(1, this.isSquid ? 0.45 : 1, 1);
    this.group.position.copy(this.pos);
    this.group.rotation.y = Math.atan2(forward.x, forward.z);

    // --- カメラ（三人称） ---
    const target = new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z);
    const camPos = target.clone().addScaledVector(forward, -this.camDistance);
    camPos.y = Math.max(0.6, camPos.y);
    const lim = ARENA.half - 0.5;
    camPos.x = Math.max(-lim, Math.min(lim, camPos.x));
    camPos.z = Math.max(-lim, Math.min(lim, camPos.z));
    this.camera.position.copy(camPos);
    this.camera.lookAt(target);
  }

  private resolveCollisions() {
    const lim = ARENA.half - RADIUS - 0.2;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));

    for (const o of OBSTACLES) {
      const minX = o.x - o.w / 2 - RADIUS;
      const maxX = o.x + o.w / 2 + RADIUS;
      const minZ = o.z - o.d / 2 - RADIUS;
      const maxZ = o.z + o.d / 2 + RADIUS;
      if (
        this.pos.x > minX &&
        this.pos.x < maxX &&
        this.pos.z > minZ &&
        this.pos.z < maxZ
      ) {
        const penL = this.pos.x - minX;
        const penR = maxX - this.pos.x;
        const penT = this.pos.z - minZ;
        const penB = maxZ - this.pos.z;
        const m = Math.min(penL, penR, penT, penB);
        if (m === penL) this.pos.x = minX;
        else if (m === penR) this.pos.x = maxX;
        else if (m === penT) this.pos.z = minZ;
        else this.pos.z = maxZ;
      }
    }
  }
}
