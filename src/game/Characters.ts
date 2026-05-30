import * as THREE from 'three';

// プリミティブを組み合わせてキャラを作る。
// いずれも原点が足元(y=0)、ローカル +Z が前方、高さ約2ユニット。

function addEyes(
  group: THREE.Group,
  frontZ: number,
  y: number,
  spread: number,
  size: number,
) {
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const black = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.4 });
  for (const sx of [-spread, spread]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 12), white);
    eye.position.set(sx, y, frontZ);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 8, 8), black);
    pupil.position.set(sx, y, frontZ + size * 0.7);
    group.add(eye, pupil);
  }
}

/** 自キャラ: イカ。とがった頭＋ヒレ＋触手。 */
export function createSquid(color: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });

  // 胴体（下half、丸み）
  const lower = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 16), mat);
  lower.scale.set(1, 1.25, 1);
  lower.position.y = 0.95;
  g.add(lower);

  // とがった頭（上のコーン）
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.0, 16), mat);
  top.position.y = 1.7;
  g.add(top);

  // ヒレ（左右）
  const finGeo = new THREE.ConeGeometry(0.28, 0.5, 12);
  for (const sx of [-1, 1]) {
    const fin = new THREE.Mesh(finGeo, mat);
    fin.scale.set(0.4, 1, 1);
    fin.position.set(sx * 0.5, 1.75, -0.05);
    fin.rotation.z = sx * 0.9; // 外側に倒す
    g.add(fin);
  }

  // 目
  addEyes(g, 0.46, 1.05, 0.3, 0.17);

  // 触手（前下に数本）
  const tentGeo = new THREE.CylinderGeometry(0.09, 0.04, 0.7, 6);
  for (const tx of [-0.28, -0.14, 0, 0.14, 0.28]) {
    const t = new THREE.Mesh(tentGeo, mat);
    t.position.set(tx, 0.3, 0.25);
    t.rotation.x = -0.25;
    g.add(t);
  }

  return g;
}

/** 敵: タコ。丸い頭＋8本の触手。 */
export function createOctopus(color: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });

  // 丸い頭（マント）
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.72, 18, 16), mat);
  head.scale.set(1, 0.95, 1);
  head.position.y = 1.25;
  g.add(head);

  // 目（大きめ・上の方）
  addEyes(g, 0.55, 1.4, 0.3, 0.19);

  // 8本の触手（放射状に下へ広がる）
  const tentGeo = new THREE.CylinderGeometry(0.15, 0.05, 0.95, 8);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const arm = new THREE.Group();
    arm.rotation.y = angle;
    const tilt = new THREE.Group();
    tilt.position.set(0, 0.7, 0.32);
    tilt.rotation.x = -0.55; // 先端を外＆下へ
    const mesh = new THREE.Mesh(tentGeo, mat);
    mesh.position.y = -0.45;
    tilt.add(mesh);
    arm.add(tilt);
    g.add(arm);
  }

  return g;
}
