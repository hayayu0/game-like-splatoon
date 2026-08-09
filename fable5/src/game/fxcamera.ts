import * as THREE from 'three';
import { clamp, damp, dirFromYawPitch, rightFromYaw } from '../core/utils';
import { CollisionWorld } from './collision';

/** 三人称カメラ: 追従スムージング / 壁回避 / FOV可変 / シェイク */
export class GameCamera {
  cam: THREE.PerspectiveCamera;
  yaw = Math.PI / 2;
  pitch = -0.14;
  aimPoint = new THREE.Vector3();
  private smoothEye = new THREE.Vector3();
  private trauma = 0;
  private fov = 64;
  private tmpDir = new THREE.Vector3();
  private tmpRight = new THREE.Vector3();
  private tmpDesired = new THREE.Vector3();
  private tmpClamped = new THREE.Vector3();
  private tmpLook = new THREE.Vector3();
  private t = 0;
  /** 0..1: 試合開始時の俯瞰→背後ブレンド */
  introBlend = 0;

  constructor(aspect: number) {
    // near を 0.1 まで下げると深度バッファの精度が落ち、GTAO が近距離で
    // 黒い矩形状のノイズを出す。三人称カメラは壁から0.3以上離れるので0.3で足りる。
    this.cam = new THREE.PerspectiveCamera(64, aspect, 0.3, 460);
  }

  addShake(a: number) {
    this.trauma = Math.min(1, this.trauma + a);
  }

  recoil() {
    this.pitch = clamp(this.pitch + 0.004, -1.15, 1.25);
    this.addShake(0.06);
  }

  applyMouse(dx: number, dy: number) {
    const s = 0.0023;
    this.yaw -= dx * s;
    this.pitch = clamp(this.pitch - dy * s, -1.15, 1.25);
  }

  snapBehind(targetPos: THREE.Vector3, yaw: number) {
    this.yaw = yaw;
    this.pitch = -0.14;
    this.smoothEye.copy(targetPos).add(new THREE.Vector3(0, 1.5, 0));
  }

  update(dt: number, world: CollisionWorld, targetPos: THREE.Vector3, swim: boolean) {
    this.t += dt;
    const eye = this.tmpLook.set(targetPos.x, targetPos.y + 1.5, targetPos.z);
    this.smoothEye.x = damp(this.smoothEye.x, eye.x, 20, dt);
    this.smoothEye.y = damp(this.smoothEye.y, eye.y, 12, dt);
    this.smoothEye.z = damp(this.smoothEye.z, eye.z, 20, dt);

    const dir = dirFromYawPitch(this.yaw, this.pitch, this.tmpDir);
    const right = rightFromYaw(this.yaw, this.tmpRight);
    this.tmpDesired.copy(this.smoothEye)
      .addScaledVector(dir, -3.9)
      .addScaledVector(right, 0.55);
    this.tmpDesired.y += 0.3;
    world.clampCamera(this.smoothEye, this.tmpDesired, 0.3, this.tmpClamped);

    // イントロ俯瞰ブレンド
    if (this.introBlend > 0.001) {
      const k = this.introBlend;
      const orbY = 26 * k + this.tmpClamped.y * (1 - k);
      const a = this.t * 0.15 + 2.2;
      this.tmpClamped.set(
        this.tmpClamped.x * (1 - k) + Math.cos(a) * 30 * k,
        orbY,
        this.tmpClamped.z * (1 - k) + Math.sin(a) * 24 * k
      );
    }

    this.cam.position.copy(this.tmpClamped);

    // シェイク
    this.trauma = Math.max(0, this.trauma - dt * 2.0);
    const sh = this.trauma * this.trauma;
    if (sh > 0.0001) {
      const t = this.t;
      this.cam.position.addScaledVector(right, Math.sin(t * 41) * sh * 0.28);
      this.cam.position.y += Math.cos(t * 47) * sh * 0.22;
    }

    const look = new THREE.Vector3().copy(this.smoothEye).addScaledVector(dir, 12);
    if (this.introBlend > 0.001) look.lerp(new THREE.Vector3(0, 1, 0), this.introBlend * 0.85);
    this.cam.lookAt(look);
    if (sh > 0.0001) this.cam.rotateZ(Math.sin(this.t * 33) * sh * 0.03);

    // FOV
    const targetFov = swim ? 75 : 64;
    if (Math.abs(this.fov - targetFov) > 0.05) {
      this.fov = damp(this.fov, targetFov, 7, dt);
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }

    // 照準点（クロスヘア中心のレイ）
    const from = new THREE.Vector3().copy(this.cam.position).addScaledVector(dir, 0.6);
    const to = new THREE.Vector3().copy(this.cam.position).addScaledVector(dir, 70);
    const hit = world.segmentHit(from, to, 0.02);
    this.aimPoint.copy(hit ? hit.point : to);
    this.cam.userData.dofFocusDistance = this.cam.position.distanceTo(this.aimPoint);
  }
}
