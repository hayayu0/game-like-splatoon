import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INK_COLORS, INK_HI_COLORS, clamp, damp, lerp } from '../core/utils';

/**
 * プロシージャルキャラクター
 * squid: イカを擬人化した少年少女。とがった耳ヒレと、頭頂で結った触手ヘア。
 * octo:  タコを擬人化した兵隊。ドーム状の頭髪と発光バイザー。
 *
 * 見た目の部品は「動く関節ごと」にマテリアル単位でジオメトリ結合し、
 * 1キャラのドローコールを抑えている。
 */

export interface AnimInput {
  t: number;
  dt: number;
  speed: number;
  runBlend: number;
  grounded: boolean;
  vy: number;
  aimPitch: number;
  fireT: number;
  landT: number;
  swim: boolean;
  hurtT: number;
  turnVel: number;
  energy: number; // 0..1
}

export interface CharacterRig {
  root: THREE.Group;
  muzzle: THREE.Object3D;
  update(a: AnimInput): void;
  setFlash(v: number): void;
}

/* ---------------- プロポーション ---------------- */
const HIP_Y = 0.74;
const THIGH = 0.32;
const SHIN = 0.3;
const SHOULDER_Y = 0.38; // torso ローカル
const UPPER_ARM = 0.24;
const FOREARM = 0.22;
const HEAD_Y = 0.62; // torso ローカル
const HEAD_R = 0.215;

/* ---------------- ジオメトリ小物 ---------------- */
const sph = (r: number, sx = 1, sy = 1, sz = 1, seg = 12) => {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, (seg * 0.7) | 0));
  g.scale(sx, sy, sz);
  return g;
};
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r: number, h: number, seg = 10) => new THREE.ConeGeometry(r, h, seg);
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => (g.translate(x, y, z), g);
const rotX = (g: THREE.BufferGeometry, a: number) => (g.rotateX(a), g);
const rotY = (g: THREE.BufferGeometry, a: number) => (g.rotateY(a), g);
const rotZ = (g: THREE.BufferGeometry, a: number) => (g.rotateZ(a), g);

/** 動く関節ひとつぶん。マテリアルごとにジオメトリを溜めて最後に結合する */
class Part {
  readonly group = new THREE.Group();
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(mat: THREE.Material, ...geos: THREE.BufferGeometry[]) {
    const arr = this.buckets.get(mat);
    if (arr) arr.push(...geos);
    else this.buckets.set(mat, [...geos]);
    return this;
  }

  build(cast = true) {
    for (const [mat, geos] of this.buckets) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)!;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast;
      this.group.add(mesh);
    }
    this.buckets.clear();
    return this.group;
  }
}

interface Tentacle {
  joints: THREE.Group[];
  baseX: number[];
  baseY: number[];
}

/** 数珠つなぎの関節でできた触手。関節を順に少しずつ回すと波打つ */
function makeTentacle(
  parent: THREE.Object3D,
  mat: THREE.Material,
  o: {
    pos: [number, number, number];
    yaw: number;
    pitch: number;
    segs: number;
    len: number;
    r0: number;
    taper: number;
    droop: number;
    fat?: number;
    flat?: number;
  }
): Tentacle {
  const joints: THREE.Group[] = [];
  const baseX: number[] = [];
  const baseY: number[] = [];
  const base = new THREE.Group();
  base.position.set(...o.pos);
  base.rotation.set(o.pitch, o.yaw, 0, 'YXZ');
  parent.add(base);
  joints.push(base);
  baseX.push(o.pitch);
  baseY.push(o.yaw);

  let cur: THREE.Group = base;
  let r = o.r0;
  for (let i = 0; i < o.segs; i++) {
    const segLen = o.len * Math.pow(0.9, i);
    const p = new Part();
    p.add(mat, at(sph(r, 1, o.flat ?? 1, o.fat ?? 1.2, 10), 0, 0, segLen * 0.5));
    const seg = p.build();
    cur.add(seg);
    const next = new THREE.Group();
    next.position.set(0, 0, segLen);
    next.rotation.x = o.droop;
    cur.add(next);
    joints.push(next);
    baseX.push(o.droop);
    baseY.push(0);
    cur = next;
    r *= o.taper;
  }
  return { joints, baseX, baseY };
}

let flashTex: THREE.CanvasTexture | null = null;
function getFlashTex() {
  if (flashTex) return flashTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,240,180,0.85)');
  g.addColorStop(1, 'rgba(255,180,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  flashTex = new THREE.CanvasTexture(c);
  return flashTex;
}

export function buildCharacter(team: number, kind: 'squid' | 'octo'): CharacterRig {
  const isSquid = kind === 'squid';
  const ink = INK_COLORS[team];
  const inkHi = INK_HI_COLORS[team];

  /* ---------------- マテリアル ---------------- */
  const mats: { m: THREE.MeshStandardMaterial; e: THREE.Color; i: number }[] = [];
  const M = (
    color: THREE.ColorRepresentation,
    rough = 0.62,
    opts: { metal?: number; emissive?: THREE.ColorRepresentation; ei?: number; opacity?: number } = {}
  ) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: opts.metal ?? 0,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.ei ?? 1,
      transparent: opts.opacity !== undefined,
      opacity: opts.opacity ?? 1,
    });
    mats.push({ m, e: new THREE.Color(opts.emissive ?? 0x000000), i: opts.ei ?? 1 });
    return m;
  };

  const skinM = M(isSquid ? '#ffdcb0' : '#efbf97', 0.58);
  const inkM = M(ink, 0.34, { emissive: ink, ei: 0.1 });
  const inkHiM = M(inkHi, 0.42);
  const darkM = M(isSquid ? '#1b1a28' : '#15121f', 0.5);
  const whiteM = M('#fbfcfe', 0.45);
  const topM = M(isSquid ? '#f2f5f8' : '#3b2d55', isSquid ? 0.7 : 0.62);
  const pantsM = M(isSquid ? '#2b3050' : '#241c38', 0.72);
  const eyeM = M('#241f3d', 0.28);
  const gunM = M('#e9edf2', 0.4, { metal: 0.15 });
  const glassM = M('#cfe6ff', 0.1, { opacity: 0.22 });

  const root = new THREE.Group();
  const human = new THREE.Group();
  root.add(human);

  /* ---------------- 脚 ---------------- */
  const mkLeg = (sx: number) => {
    const hip = new THREE.Group();
    hip.position.set(0.105 * sx, HIP_Y, 0);
    const thighP = new Part();
    thighP.add(pantsM, at(sph(0.098, 1, 0.9, 1, 10), 0, -0.02, 0));
    thighP.add(pantsM, at(cyl(0.094, 0.08, THIGH * 0.6), 0, -THIGH * 0.3, 0));
    thighP.add(skinM, at(cyl(0.074, 0.066, THIGH * 0.5), 0, -THIGH * 0.78, 0));
    hip.add(thighP.build());

    const knee = new THREE.Group();
    knee.position.set(0, -THIGH, 0);
    hip.add(knee);
    const shinP = new Part();
    shinP.add(skinM, at(sph(0.068, 1, 0.9, 1, 10), 0, 0, 0));
    shinP.add(skinM, at(cyl(0.064, 0.05, SHIN * 0.7), 0, -SHIN * 0.38, 0));
    // スニーカー: 本体 + つま先 + ソール
    shinP.add(whiteM, at(box(0.128, 0.088, 0.21), 0, -SHIN + 0.05, 0.03));
    shinP.add(whiteM, at(sph(0.07, 1, 0.82, 1.15, 10), 0, -SHIN + 0.078, -0.028));
    shinP.add(inkHiM, at(box(0.136, 0.038, 0.226), 0, -SHIN + 0.001, 0.032));
    knee.add(shinP.build());
    human.add(hip);
    return { hip, knee };
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  /* ---------------- 胴 ---------------- */
  const torso = new THREE.Group();
  torso.position.set(0, HIP_Y, 0);
  human.add(torso);

  const torsoP = new Part();
  // 腰・ショートパンツ
  torsoP.add(pantsM, at(sph(0.168, 1.1, 0.78, 0.92, 12), 0, 0.03, 0));
  // 上半身（トップス）: 肩幅のある台形シルエット
  torsoP.add(topM, at(cyl(0.185, 0.158, 0.33, 12), 0, 0.27, 0));
  torsoP.add(topM, at(sph(0.184, 1.04, 0.76, 0.84, 12), 0, 0.4, 0));
  if (isSquid) {
    // 襟と裾のライン + 胸のワンポイント
    torsoP.add(inkHiM, at(cyl(0.098, 0.098, 0.034, 12), 0, 0.5, 0));
    torsoP.add(inkHiM, at(cyl(0.19, 0.19, 0.028, 12), 0, 0.115, 0));
    torsoP.add(inkM, at(sph(0.058, 1, 1, 0.26, 10), 0, 0.32, 0.152));
  } else {
    // 装甲ベスト + 肩パッド
    torsoP.add(darkM, at(box(0.25, 0.25, 0.23), 0, 0.31, 0.01));
    for (const sx of [-1, 1]) {
      torsoP.add(darkM, at(sph(0.1, 1.15, 0.8, 1.05, 10), 0.2 * sx, 0.42, 0));
    }
    torsoP.add(inkHiM, at(box(0.06, 0.06, 0.02), 0, 0.35, 0.13));
  }
  // 首
  torsoP.add(skinM, at(cyl(0.052, 0.06, 0.11, 10), 0, 0.5, 0));
  torso.add(torsoP.build());

  // インクタンク（背中）
  const tankP = new Part();
  tankP.add(glassM, at(cyl(0.09, 0.09, 0.26, 12), 0, 0, 0));
  tankP.add(darkM, at(sph(0.075, 1.2, 0.5, 1.2, 10), 0, 0.15, 0));
  tankP.add(darkM, at(sph(0.078, 1.2, 0.4, 1.2, 10), 0, -0.14, 0));
  tankP.add(darkM, at(rotZ(cyl(0.015, 0.015, 0.19, 6), 1.1), 0.055, 0.16, 0.035));
  const tank = tankP.build();
  tank.position.set(0, 0.28, -0.185);
  torso.add(tank);
  const inkLevel = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.23, 12), inkM);
  inkLevel.position.set(0, 0.28, -0.185);
  torso.add(inkLevel);

  /* ---------------- 腕 ---------------- */
  const mkArm = (sx: number) => {
    const sh = new THREE.Group();
    sh.position.set(0.192 * sx, SHOULDER_Y, 0);
    const upP = new Part();
    upP.add(topM, at(sph(0.078, 1.1, 1, 1, 10), 0, 0.012, 0));
    upP.add(topM, at(cyl(0.07, 0.06, UPPER_ARM * 0.52), 0, -UPPER_ARM * 0.26, 0));
    upP.add(skinM, at(cyl(0.055, 0.05, UPPER_ARM * 0.55), 0, -UPPER_ARM * 0.72, 0));
    sh.add(upP.build());

    const elbow = new THREE.Group();
    elbow.position.set(0, -UPPER_ARM, 0);
    sh.add(elbow);
    const foreP = new Part();
    foreP.add(skinM, at(sph(0.052, 1, 0.9, 1, 10), 0, 0, 0));
    foreP.add(skinM, at(cyl(0.05, 0.042, FOREARM * 0.8), 0, -FOREARM * 0.4, 0));
    foreP.add(darkM, at(sph(0.058, 1, 0.85, 1, 10), 0, -FOREARM * 0.88, 0));
    foreP.add(skinM, at(sph(0.06, 1, 1.1, 0.9, 10), 0, -FOREARM - 0.025, 0.012));
    elbow.add(foreP.build());
    torso.add(sh);
    return { sh, elbow };
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  /* ---------------- 武器（右手に追従） ---------------- */
  const weaponRoot = new THREE.Group();
  weaponRoot.position.set(0, -FOREARM - 0.03, 0.03);
  armR.elbow.add(weaponRoot);
  const wp = new Part();
  wp.add(gunM, at(box(isSquid ? 0.075 : 0.098, 0.088, 0.26), 0, 0.02, 0.11));
  wp.add(gunM, at(sph(0.053, 1, 1, 1.1, 10), 0, 0.045, -0.02));
  wp.add(inkM, at(rotX(cyl(0.034, 0.034, 0.22, 8), Math.PI / 2), 0, -0.04, 0.14));
  wp.add(darkM, at(rotX(cone(isSquid ? 0.043 : 0.054, 0.095, 10), Math.PI / 2), 0, 0.02, 0.27));
  wp.add(darkM, at(box(0.034, 0.1, 0.05), 0, -0.075, 0.0));
  wp.add(darkM, at(box(0.026, 0.045, 0.035), 0, -0.03, 0.05));
  weaponRoot.add(wp.build());
  const wTank = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), glassM);
  wTank.position.set(0, 0.095, 0.02);
  weaponRoot.add(wTank);
  const wInk = new THREE.Mesh(new THREE.SphereGeometry(0.033, 10, 8), inkM);
  wInk.position.set(0, 0.095, 0.02);
  weaponRoot.add(wInk);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, 0.34);
  weaponRoot.add(muzzle);
  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getFlashTex(),
      color: inkHi,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })
  );
  flash.position.set(0, 0.02, 0.45);
  flash.scale.set(0.42, 0.42, 1);
  flash.visible = false;
  weaponRoot.add(flash);

  /* ---------------- 頭 ---------------- */
  const head = new THREE.Group();
  head.position.set(0, HEAD_Y, 0);
  torso.add(head);

  const headP = new Part();
  headP.add(skinM, sph(HEAD_R, 1, 1.02, 0.98, 16));
  // あご下のシャープさを出す小さめの面取り
  headP.add(skinM, at(sph(HEAD_R * 0.82, 1, 0.8, 1, 12), 0, -0.06, 0.012));

  if (isSquid) {
    // 大きな目 + 上まぶたの濃いライン
    for (const sx of [-1, 1]) {
      const ex = 0.085 * sx;
      headP.add(whiteM, at(sph(0.066, 1.0, 1.22, 0.52, 12), ex, -0.008, HEAD_R * 0.83));
      headP.add(eyeM, at(sph(0.045, 1.0, 1.12, 0.48, 12), ex, -0.014, HEAD_R * 0.9));
      headP.add(whiteM, at(sph(0.015, 1, 1, 0.5, 8), ex + 0.018 * sx, 0.028, HEAD_R * 0.94));
      const lid = sph(0.068, 1.0, 0.24, 0.5, 12);
      rotZ(lid, -0.16 * sx);
      at(lid, ex, 0.05, HEAD_R * 0.81);
      headP.add(darkM, lid);
    }
  } else {
    // タコ: 目元をゴーグルで覆う
    headP.add(darkM, at(rotX(new THREE.TorusGeometry(HEAD_R * 0.99, 0.032, 6, 20), 1.45), 0, -0.005, -0.005));
    for (const sx of [-1, 1]) {
      const ex = 0.088 * sx;
      headP.add(darkM, at(sph(0.072, 1.0, 0.92, 0.42, 12), ex, -0.005, HEAD_R * 0.82));
      headP.add(
        M('#120a1c', 0.18, { emissive: inkHi, ei: 2.4 }),
        at(sph(0.055, 1.0, 0.88, 0.34, 12), ex, -0.005, HEAD_R * 0.9)
      );
    }
  }
  // 口（小さく、わずかに笑った形）
  headP.add(darkM, at(sph(0.017, 1.7, 0.36, 0.4, 8), 0, -0.088, HEAD_R * 0.9));

  if (isSquid) {
    // とがった耳ヒレ: 外向きに大きく張り出す（シルエットの要）
    for (const sx of [-1, 1]) {
      const fin = rotZ(cone(0.07, 0.38, 10), (-Math.PI / 2) * sx);
      rotY(fin, 0.42 * sx);
      rotZ(fin, 0.12 * sx);
      at(fin, 0.33 * sx, -0.015, -0.05);
      headP.add(inkM, fin);
      const tip = rotZ(cone(0.032, 0.1, 8), (-Math.PI / 2) * sx);
      rotY(tip, 0.42 * sx);
      rotZ(tip, 0.12 * sx);
      at(tip, 0.5 * sx, -0.045, -0.108);
      headP.add(darkM, tip);
    }
    // 後頭部を覆う髪の量感
    headP.add(inkM, at(sph(HEAD_R * 1.04, 1.0, 0.97, 0.94, 14), 0, 0.03, -0.05));
    headP.add(inkM, at(sph(HEAD_R * 0.94, 1.02, 0.62, 0.72, 12), 0, 0.135, 0.015));
    // 頭頂で結んだ束 + 結び目のバンド
    headP.add(darkM, at(rotX(new THREE.TorusGeometry(0.072, 0.025, 6, 14), 1.35), 0, 0.19, -0.075));
    headP.add(inkM, at(sph(0.125, 1.15, 0.85, 1.0, 12), 0, 0.25, -0.115));
  } else {
    // タコ: 兜のようなドーム状の頭髪
    headP.add(inkM, at(sph(HEAD_R * 1.16, 1.08, 1.0, 1.04, 14), 0, 0.07, -0.025));
    headP.add(inkM, at(sph(HEAD_R * 1.05, 1.06, 0.55, 0.8, 12), 0, -0.02, -0.075));
    for (const sx of [-1, 1]) {
      headP.add(inkM, at(sph(0.055, 1, 1.6, 1, 8), 0.21 * sx, -0.02, -0.035));
    }
  }
  head.add(headP.build());

  /* ---------------- 触手ヘア（揺れる） ---------------- */
  const tentacles: Tentacle[] = [];
  if (isSquid) {
    // 結んだ束から、背中へ長く垂れる後ろ髪を3本
    // 中央の1本は背骨に沿って、外側2本はインクタンクを避けて左右に垂らす
    for (const [i, yaw] of [-0.5, 0, 0.5].entries()) {
      tentacles.push(
        makeTentacle(head, inkM, {
          pos: [yaw * 0.34, 0.225 - Math.abs(yaw) * 0.06, -0.185],
          yaw: Math.PI + yaw * 1.55,
          pitch: 1.18 + Math.abs(yaw) * 0.12,
          segs: i === 1 ? 5 : 4,
          len: 0.178,
          r0: 0.068 - (i === 1 ? 0 : 0.008),
          taper: 0.87,
          droop: 0.11,
          flat: 0.92,
        })
      );
    }
    // 顔の横に沿う短いサイドの房。厚みを潰して「房」に見せる
    for (const sx of [-1, 1]) {
      tentacles.push(
        makeTentacle(head, inkM, {
          pos: [0.175 * sx, 0.075, 0.045],
          yaw: 1.15 * sx,
          pitch: 1.05,
          segs: 3,
          len: 0.115,
          r0: 0.055,
          taper: 0.85,
          droop: 0.2,
          flat: 0.66,
          fat: 1.3,
        })
      );
    }
  } else {
    // タコ: 太い触手を肩越しに前へ2本、後ろへ2本
    for (const sx of [-1, 1]) {
      tentacles.push(
        makeTentacle(head, inkM, {
          pos: [0.15 * sx, 0.02, 0.09],
          yaw: 0.62 * sx,
          pitch: 1.2,
          segs: 4,
          len: 0.14,
          r0: 0.058,
          taper: 0.85,
          droop: 0.22,
        })
      );
      tentacles.push(
        makeTentacle(head, inkM, {
          pos: [0.11 * sx, 0.12, -0.18],
          yaw: Math.PI + 0.3 * sx,
          pitch: 0.45,
          segs: 4,
          len: 0.15,
          r0: 0.062,
          taper: 0.85,
          droop: 0.32,
        })
      );
    }
  }

  /* ---------------- スイム形態 ---------------- */
  const swimForm = new THREE.Group();
  swimForm.visible = false;
  root.add(swimForm);
  const swP = new Part();
  if (isSquid) {
    swP.add(inkM, at(rotX(cone(0.28, 0.9, 14), Math.PI / 2), 0, 0.24, 0.16));
    for (const sx of [-1, 1]) {
      const fin = rotZ(cone(0.13, 0.46, 8), 2.1 * sx);
      rotY(fin, 0.3 * sx);
      at(fin, 0.21 * sx, 0.24, -0.04);
      swP.add(inkM, fin);
      swP.add(inkM, at(rotX(cone(0.045, 0.28, 8), -Math.PI / 2), 0.09 * sx, 0.22, -0.3));
      swP.add(whiteM, at(sph(0.05, 1, 1, 0.7, 10), 0.12 * sx, 0.3, -0.1));
      swP.add(eyeM, at(sph(0.028, 1, 1, 0.7, 8), 0.13 * sx, 0.3, -0.06));
    }
  } else {
    swP.add(inkM, at(sph(0.3, 1, 0.92, 1, 14), 0, 0.3, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const leg = rotZ(cone(0.055, 0.26, 8), Math.cos(a) * 0.9);
      rotX(leg, -Math.sin(a) * 0.9);
      at(leg, Math.cos(a) * 0.22, 0.1, Math.sin(a) * 0.22);
      swP.add(inkM, leg);
    }
    for (const sx of [-1, 1]) {
      swP.add(whiteM, at(sph(0.05, 1, 1, 0.7, 10), 0.13 * sx, 0.35, 0.24));
      swP.add(eyeM, at(sph(0.028, 1, 1, 0.7, 8), 0.13 * sx, 0.35, 0.28));
    }
  }
  swimForm.add(swP.build());

  /* ---------------- アニメーション ---------------- */
  let phase = 0;
  let airPose = 0;
  let swimBlend = 0;

  const update = (a: AnimInput) => {
    phase += a.speed * a.dt * 2.0 + a.dt * 1.5 * a.runBlend;
    airPose = damp(airPose, a.grounded ? 0 : 1, 12, a.dt);
    swimBlend = damp(swimBlend, a.swim ? 1 : 0, 16, a.dt);
    const run = a.runBlend;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const fireK = Math.max(0, 1 - a.fireT / 0.13);
    const landK = Math.max(0, 1 - a.landT / 0.17);
    const hurtK = Math.max(0, 1 - a.hurtT / 0.3);
    const p = a.aimPitch;

    human.visible = swimBlend < 0.5;
    swimForm.visible = !human.visible;

    if (human.visible) {
      // 脚: 股関節の振り + ひざは後ろにだけ曲がる
      legL.hip.rotation.x = lerp(s * 0.85 * run, -0.62 + Math.sin(a.t * 3) * 0.05, airPose);
      legR.hip.rotation.x = lerp(-s * 0.85 * run, 0.42, airPose);
      legL.knee.rotation.x = lerp(Math.max(0, -s) * 1.1 * run, 0.95, airPose);
      legR.knee.rotation.x = lerp(Math.max(0, s) * 1.1 * run, 0.35, airPose);

      // 腕: 武器を両手で構える
      // 胸の高さで前方に構える。3つの回転の和が0のとき銃口が真正面を向く
      armR.sh.rotation.x = -1.62 - p * 0.62 - fireK * 0.12;
      armR.sh.rotation.z = -0.16;
      armR.elbow.rotation.x = 0.36 + p * 0.1;
      armL.sh.rotation.x = -1.5 - p * 0.6;
      armL.sh.rotation.z = 0.78 + Math.sin(a.t * 1.6) * 0.02;
      armL.elbow.rotation.x = 0.52 + p * 0.1;
      armL.elbow.rotation.y = -0.78;
      weaponRoot.rotation.x = 1.26 - p * 0.24 - fireK * 0.22;
      weaponRoot.position.z = 0.03 - fireK * 0.045;

      // 胴と頭
      torso.rotation.x = 0.11 * run + fireK * 0.05 - airPose * 0.1;
      torso.rotation.z = clamp(-a.turnVel * 0.05, -0.26, 0.26);
      torso.rotation.y = s * 0.07 * run;
      head.rotation.x = p * 0.42 - 0.09 * run - torso.rotation.x * 0.7;
      head.rotation.y = -torso.rotation.y * 0.6;
      head.rotation.z = hurtK * Math.sin(a.t * 55) * 0.14;

      // 上下動 + 着地スカッシュ + 空中ストレッチ
      const bob = Math.abs(s) * 0.045 * run + Math.sin(a.t * 2.3) * 0.006;
      human.position.y = bob;
      const stretch = airPose * clamp(Math.abs(a.vy) * 0.008, 0, 0.09);
      human.scale.set(
        1 + landK * 0.14 - stretch * 0.5,
        1 - landK * 0.2 + stretch,
        1 + landK * 0.14 - stretch * 0.5
      );

      // 触手: 関節を順に遅らせて波打たせる
      const swayAmp = 0.1 + run * 0.16 + airPose * 0.16;
      for (let ti = 0; ti < tentacles.length; ti++) {
        const t = tentacles[ti];
        for (let j = 0; j < t.joints.length; j++) {
          const w = Math.sin(a.t * 2.6 - j * 0.75 + ti * 1.3);
          // 根元の向き(baseX/baseY)を必ず足す。上書きすると触手の生える向きが壊れる
          t.joints[j].rotation.x = t.baseX[j] + w * swayAmp * (0.4 + j * 0.22) - airPose * 0.18;
          t.joints[j].rotation.y =
            t.baseY[j] +
            Math.cos(a.t * 2.1 - j * 0.6 + ti) * swayAmp * 0.5 +
            clamp(-a.turnVel * 0.07, -0.3, 0.3) * (j === 0 ? 1 : 0.35);
        }
      }

      flash.visible = a.fireT < 0.05;
      if (flash.visible) {
        const fs = 0.34 + Math.random() * 0.28;
        flash.scale.set(fs, fs, 1);
        (flash.material as THREE.SpriteMaterial).rotation = Math.random() * Math.PI;
      }
    } else {
      swimForm.rotation.z = Math.sin(a.t * 13) * 0.16;
      swimForm.rotation.x = clamp(-a.vy * 0.06, -0.5, 0.5);
      const pulse = 1 + Math.sin(a.t * 11) * 0.06;
      swimForm.scale.set(pulse, 2 - pulse, pulse);
      swimForm.position.y = 0.02;
      flash.visible = false;
    }

    // インク残量をタンクに反映
    const e = clamp(a.energy, 0.04, 1);
    inkLevel.scale.y = e;
    inkLevel.position.y = 0.28 - 0.115 * (1 - e);
    wInk.scale.setScalar(0.55 + e * 0.45);
  };

  const setFlash = (v: number) => {
    for (const { m, e, i } of mats) {
      if (v <= 0.001) {
        m.emissive.copy(e);
        m.emissiveIntensity = i;
      } else {
        m.emissive.copy(e).lerp(WHITE, clamp(v, 0, 1));
        m.emissiveIntensity = i + v * 1.6;
      }
    }
  };

  return { root, muzzle, update, setFlash };
}

const WHITE = new THREE.Color('#ffffff');
