import * as THREE from 'three';
import { ARENA, OBSTACLES } from './config';

/** 床・壁・遮蔽物・ライトを生成する */
export class Arena {
  constructor(scene: THREE.Scene, paintTexture: THREE.Texture) {
    const size = 2 * ARENA.half;

    // 床（塗りテクスチャを貼る）
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({
        map: paintTexture,
        roughness: 0.95,
        metalness: 0.0,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // 外周の壁
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a5160, roughness: 0.85 });
    const h = ARENA.wallHeight;
    const t = 1; // 厚み
    const walls: [number, number, number, number][] = [
      [0, ARENA.half, size, t], // 奥(+Z)
      [0, -ARENA.half, size, t], // 手前(-Z)
      [ARENA.half, 0, t, size], // 右(+X)
      [-ARENA.half, 0, t, size], // 左(-X)
    ];
    for (const [x, z, w, d] of walls) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      wall.position.set(x, h / 2, z);
      scene.add(wall);
    }

    // 遮蔽物
    const obsMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.8 });
    for (const o of OBSTACLES) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), obsMat);
      box.position.set(o.x, o.h / 2, o.z);
      scene.add(box);
    }

    // ライト
    const hemi = new THREE.HemisphereLight(0xffffff, 0x35404f, 1.05);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(18, 36, 12);
    scene.add(dir);
  }
}
