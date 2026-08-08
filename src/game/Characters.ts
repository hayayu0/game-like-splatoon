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
    const mask = new THREE.Mesh(new THREE.SphereGeometry(size * 1.45, 12, 10), black);
    mask.position.set(sx, y, frontZ - size * 0.08);
    mask.scale.set(1.05, 1.25, 0.32);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 12), white);
    eye.position.set(sx, y, frontZ);
    eye.scale.set(0.8, 1.2, 0.55);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 8, 8), black);
    pupil.position.set(sx, y, frontZ + size * 0.7);
    pupil.scale.set(0.75, 1.15, 0.5);
    group.add(mask, eye, pupil);
  }
}

/** 頭身と足元位置を揃えた共通の二足歩行ボディを作る */
function addHumanoidBody(
  group: THREE.Group,
  teamMat: THREE.Material,
  skinMat: THREE.Material,
  pantsMat: THREE.Material,
  shoeMat: THREE.Material,
  sleeveless: boolean,
) {
  // スニーカー（つま先がローカル +Z）
  const soleMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.7 });
  const shoeGeo = new THREE.BoxGeometry(0.28, 0.18, 0.42);
  const soleGeo = new THREE.BoxGeometry(0.3, 0.05, 0.44);
  for (const sx of [-1, 1]) {
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(sx * 0.19, 0.11, 0.07);
    const sole = new THREE.Mesh(soleGeo, soleMat);
    sole.position.set(sx * 0.19, 0.025, 0.07);
    group.add(shoe, sole);
  }

  // 2本の脚とショートパンツ
  const legGeo = new THREE.CylinderGeometry(0.1, 0.11, 0.5, 8);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, skinMat);
    leg.position.set(sx * 0.18, 0.46, 0);
    group.add(leg);
  }
  const shorts = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.27, 0.34), pantsMat);
  shorts.position.y = 0.77;
  group.add(shorts);

  // Tシャツ / タンクトップ風の胴体
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(sleeveless ? 0.58 : 0.68, 0.58, 0.32),
    teamMat,
  );
  torso.position.y = 1.12;
  group.add(torso);

  const armGeo = new THREE.CylinderGeometry(0.07, 0.085, 0.5, 8);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, skinMat);
    arm.position.set(sx * 0.43, 1.06, 0);
    arm.rotation.z = -sx * 0.12;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), skinMat);
    hand.position.set(sx * 0.46, 0.79, 0);
    group.add(arm, hand);

    if (!sleeveless) {
      const sleeve = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), teamMat);
      sleeve.scale.set(1, 0.75, 1);
      sleeve.position.set(sx * 0.4, 1.3, 0);
      group.add(sleeve);
    }
  }

  // 首と顔。全高は約2ユニットに収める
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), skinMat);
  neck.position.y = 1.43;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 14), skinMat);
  head.scale.set(0.92, 1, 0.86);
  head.position.set(0, 1.66, 0.02);
  group.add(neck, head);
  addEyes(group, 0.32, 1.68, 0.12, 0.095);
}

/** 自キャラ: 触手ヘアとTシャツを合わせたインクリング風ストリートキャラ。 */
export function createSquid(color: number): THREE.Group {
  const g = new THREE.Group();
  const teamMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2b38d, roughness: 0.65 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x252934, roughness: 0.8 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.55 });
  addHumanoidBody(g, teamMat, skinMat, pantsMat, shoeMat, false);

  // 後頭部のインクキャップと、後ろ・横へ流れる細い触手ヘア
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), teamMat);
  hairCap.scale.set(1.02, 0.86, 0.95);
  hairCap.position.set(0, 1.73, -0.13);
  g.add(hairCap);

  const rearHairGeo = new THREE.CylinderGeometry(0.12, 0.045, 0.7, 10);
  for (const sx of [-1, 1]) {
    const hair = new THREE.Mesh(rearHairGeo, teamMat);
    hair.position.set(sx * 0.16, 1.47, -0.24);
    hair.rotation.x = 0.52;
    hair.rotation.z = sx * 0.1;
    g.add(hair);
  }
  const sideHairGeo = new THREE.CylinderGeometry(0.1, 0.04, 0.48, 10);
  for (const sx of [-1, 1]) {
    const hair = new THREE.Mesh(sideHairGeo, teamMat);
    hair.position.set(sx * 0.3, 1.55, -0.08);
    hair.rotation.x = 0.2;
    hair.rotation.z = -sx * 0.48;
    g.add(hair);
  }

  // Tシャツ前面のワンポイント
  const logo = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.025), shoeMat);
  logo.position.set(0, 1.14, 0.175);
  logo.rotation.z = 0.2;
  g.add(logo);
  return g;
}

/** 敵: 太いタコ足ヘアとタンクトップのオクタリング風ストリートキャラ。 */
export function createOctopus(color: number): THREE.Group {
  const g = new THREE.Group();
  const teamMat = new THREE.MeshStandardMaterial({ color, roughness: 0.48 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd99a78, roughness: 0.65 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x343044, roughness: 0.78 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x171923, roughness: 0.6 });
  addHumanoidBody(g, teamMat, skinMat, pantsMat, shoeMat, true);

  // 丸いインクキャップから、太めのタコ足ヘアを扇状に垂らす
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), teamMat);
  hairCap.scale.set(1.04, 0.82, 0.98);
  hairCap.position.set(0, 1.73, -0.13);
  g.add(hairCap);

  const tentacleGeo = new THREE.CylinderGeometry(0.12, 0.065, 0.52, 10);
  const tentacles: [number, number, number, number][] = [
    [-0.24, -0.16, 0.4, 0.24],
    [0, -0.25, 0.55, 0],
    [0.24, -0.16, 0.4, -0.24],
    [-0.32, -0.03, 0.14, 0.55],
    [0.32, -0.03, 0.14, -0.55],
  ];
  for (const [x, z, rx, rz] of tentacles) {
    const hair = new THREE.Mesh(tentacleGeo, teamMat);
    hair.position.set(x, 1.5, z);
    hair.rotation.x = rx;
    hair.rotation.z = rz;
    g.add(hair);
  }

  // 黒い靴にチームカラーのストラップを入れる
  const strapGeo = new THREE.BoxGeometry(0.22, 0.04, 0.15);
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(strapGeo, teamMat);
    strap.position.set(sx * 0.19, 0.2, 0.14);
    g.add(strap);
  }
  return g;
}
