export type Side = 'px' | 'nx' | 'pz' | 'nz';

export interface BoxDef {
  x0: number; x1: number; z0: number; z1: number; y0: number; y1: number;
  c: string;
  top?: boolean;
  sides?: Side[];
  walk?: boolean;
}

export interface BarrelDef {
  x: number;
  z: number;
  color: string;
}

export interface StripDef {
  x0: number; x1: number; z0: number; z1: number; y: number;
}

export interface SpawnDef {
  x: number; y: number; z: number; yaw: number;
}

export interface PrepaintDef {
  team: number;
  x0: number; z0: number; x1: number; z1: number; y: number;
}

export type StageId = 'plaza' | 'docks' | 'yard';

export interface StageLayout {
  id: StageId;
  name: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  boxes: BoxDef[];
  barrels: BarrelDef[];
  strips: StripDef[];
  spawns: SpawnDef[][];
  prepaint: PrepaintDef[];
}

export interface StageDefinition {
  id: StageId;
  name: string;
  create(): StageLayout;
}

const ALL_SIDES: Side[] = ['px', 'nx', 'pz', 'nz'];

function createBase(id: StageId, name: string): StageLayout {
  const layout: StageLayout = {
    id,
    name,
    bounds: { minX: -30.4, maxX: 30.4, minZ: -22.3, maxZ: 22.3 },
    boxes: [],
    barrels: [],
    strips: [],
    spawns: [
      [
        { x: -27.8, y: 2.2, z: 0, yaw: Math.PI / 2 },
        { x: -27.8, y: 2.2, z: 3.2, yaw: Math.PI / 2 },
        { x: -27.8, y: 2.2, z: -3.2, yaw: Math.PI / 2 },
      ],
      [
        { x: 27.8, y: 2.2, z: 0, yaw: -Math.PI / 2 },
        { x: 27.8, y: 2.2, z: 3.2, yaw: -Math.PI / 2 },
        { x: 27.8, y: 2.2, z: -3.2, yaw: -Math.PI / 2 },
      ],
    ],
    prepaint: [
      { team: 0, x0: -30.2, z0: -9.8, x1: -25.4, z1: 9.8, y: 2.2 },
      { team: 1, x0: 25.4, z0: -9.8, x1: 30.2, z1: 9.8, y: 2.2 },
    ],
  };

  const B = (box: BoxDef) => layout.boxes.push(box);
  const S = (x0: number, x1: number, z0: number, z1: number, y: number) =>
    layout.strips.push({ x0, x1, z0, z1, y });

  // 全ステージ共通の床、スポーンデッキ、外周壁。
  B({ x0: -30.4, x1: 30.4, z0: -22.3, z1: 22.3, y0: -1.4, y1: 0, c: '#d3d7dc', top: true });
  B({ x0: -30.4, x1: -25.2, z0: -10, z1: 10, y0: 0, y1: 2.2, c: '#c8ccd2', top: true, sides: ['px', 'pz', 'nz'] });
  B({ x0: 25.2, x1: 30.4, z0: -10, z1: 10, y0: 0, y1: 2.2, c: '#c8ccd2', top: true, sides: ['nx', 'pz', 'nz'] });
  for (let i = 0; i < 3; i++) {
    const top = 1.65 - 0.55 * i;
    B({ x0: -25.2 + i * 0.8, x1: -24.4 + i * 0.8, z0: -5, z1: 5, y0: 0, y1: top, c: '#c8ccd2', top: true });
    B({ x0: 24.4 - i * 0.8, x1: 25.2 - i * 0.8, z0: -5, z1: 5, y0: 0, y1: top, c: '#c8ccd2', top: true });
  }
  B({ x0: -31.4, x1: -30.4, z0: -23.3, z1: 23.3, y0: -1, y1: 3.4, c: '#b7bdc7', sides: ['px'] });
  B({ x0: 30.4, x1: 31.4, z0: -23.3, z1: 23.3, y0: -1, y1: 3.4, c: '#b7bdc7', sides: ['nx'] });
  B({ x0: -31.4, x1: 31.4, z0: 22.3, z1: 23.3, y0: -1, y1: 3.4, c: '#b7bdc7', sides: ['nz'] });
  B({ x0: -31.4, x1: 31.4, z0: -23.3, z1: -22.3, y0: -1, y1: 3.4, c: '#b7bdc7', sides: ['pz'] });

  S(-25.33, -25.2, -10, 10, 2.2);
  S(25.2, 25.33, -10, 10, 2.2);
  S(-31.4, 31.4, 22.3, 23.3, 3.4);
  S(-31.4, 31.4, -23.3, -22.3, 3.4);
  S(-31.4, -30.4, -23.3, 23.3, 3.4);
  S(30.4, 31.4, -23.3, 23.3, 3.4);
  return layout;
}

function createPlaza(): StageLayout {
  const layout = createBase('plaza', 'ネオンプラザ');
  const B = (box: BoxDef) => layout.boxes.push(box);
  const S = (x0: number, x1: number, z0: number, z1: number, y: number) =>
    layout.strips.push({ x0, x1, z0, z1, y });

  // 中央プラザ（既存ステージ）。
  B({ x0: -8.4, x1: 8.4, z0: -8.4, z1: 8.4, y0: 0, y1: 0.5, c: '#bcd0d8', top: true, sides: ALL_SIDES });
  B({ x0: -7.2, x1: 7.2, z0: -7.2, z1: 7.2, y0: 0, y1: 1.0, c: '#aec6cf', top: true });
  B({ x0: -6, x1: 6, z0: -6, z1: 6, y0: 0, y1: 1.5, c: '#9fbecb', top: true, sides: ALL_SIDES });
  B({ x0: -1.4, x1: 1.4, z0: -1.4, z1: 1.4, y0: 0, y1: 3.5, c: '#e8b34c', top: true, sides: ALL_SIDES });
  B({ x0: 2.0, x1: 3.6, z0: 2.0, z1: 3.6, y0: 0, y1: 2.5, c: '#e0b955', top: true, sides: ALL_SIDES });
  B({ x0: -3.6, x1: -2.0, z0: -3.6, z1: -2.0, y0: 0, y1: 2.5, c: '#e0b955', top: true, sides: ALL_SIDES });
  B({ x0: -14, x1: 14, z0: 11.2, z1: 13.6, y0: 0, y1: 2.0, c: '#c9a877', top: true, sides: ['nz', 'pz'] });
  B({ x0: -14, x1: 14, z0: -13.6, z1: -11.2, y0: 0, y1: 2.0, c: '#c9a877', top: true, sides: ['pz', 'nz'] });
  for (let i = 0; i < 3; i++) {
    const top = 1.5 - 0.5 * i;
    for (const zs of [[11.2, 13.6], [-13.6, -11.2]]) {
      B({ x0: 14 + i * 0.8, x1: 14.8 + i * 0.8, z0: zs[0], z1: zs[1], y0: 0, y1: top, c: '#c4a071', top: true });
      B({ x0: -14.8 - i * 0.8, x1: -14 - i * 0.8, z0: zs[0], z1: zs[1], y0: 0, y1: top, c: '#b99aaa', top: true });
    }
  }
  B({ x0: 9, x1: 10.8, z0: -4.8, z1: -3, y0: 0, y1: 1.6, c: '#e0b955', top: true, sides: ALL_SIDES });
  B({ x0: -10.8, x1: -9, z0: 3, z1: 4.8, y0: 0, y1: 1.6, c: '#e0b955', top: true, sides: ALL_SIDES });
  B({ x0: 2.5, x1: 4.1, z0: 9.5, z1: 11.1, y0: 0, y1: 1.6, c: '#6fc2b6', top: true, sides: ALL_SIDES });
  B({ x0: -4.1, x1: -2.5, z0: -11.1, z1: -9.5, y0: 0, y1: 1.6, c: '#6fc2b6', top: true, sides: ALL_SIDES });
  B({ x0: 16, x1: 17.6, z0: -8, z1: -1, y0: 0, y1: 2.6, c: '#d17d68', sides: ['px', 'nx'] });
  B({ x0: -17.6, x1: -16, z0: 1, z1: 8, y0: 0, y1: 2.6, c: '#aa7896', sides: ['px', 'nx'] });
  for (const zs of [[16.2, 17.2], [-17.2, -16.2]]) {
    for (const xs of [[-24, -14], [-6, 6], [14, 24]]) {
      const color = xs[0] >= 14 ? '#7195a5' : xs[1] <= -14 ? '#8d829d' : '#7f8fa6';
      B({ x0: xs[0], x1: xs[1], z0: zs[0], z1: zs[1], y0: 0, y1: 2.4, c: color, sides: ['pz', 'nz'] });
    }
  }
  B({ x0: 10, x1: 11.4, z0: 14.4, z1: 15.8, y0: 0, y1: 1.1, c: '#63bfb8', top: true, sides: ALL_SIDES });
  B({ x0: -11.4, x1: -10, z0: -15.8, z1: -14.4, y0: 0, y1: 1.1, c: '#9a87b7', top: true, sides: ALL_SIDES });
  layout.barrels.push(
    { x: 7, z: -9.5, color: '#6fc2b6' },
    { x: -7, z: 9.5, color: '#6fc2b6' },
    { x: 18.5, z: 9, color: '#e8955c' },
    { x: -18.5, z: -9, color: '#e8955c' },
  );

  S(-14, 14, 11.2, 11.33, 2.0); S(-14, 14, 13.47, 13.6, 2.0);
  S(-14, 14, -11.33, -11.2, 2.0); S(-14, 14, -13.6, -13.47, 2.0);
  S(-6, 6, -6, -5.88, 1.5); S(-6, 6, 5.88, 6, 1.5);
  S(-6, -5.88, -6, 6, 1.5); S(5.88, 6, -6, 6, 1.5);
  for (const zs of [[16.2, 17.2], [-17.2, -16.2]]) {
    for (const xs of [[-24, -14], [-6, 6], [14, 24]]) {
      if (xs[0] < 14) {
        S(xs[0], xs[1], zs[0], zs[1], 2.4);
        continue;
      }
      // 東側だけ発光面を分節し、地形を変えずに高架のシルエットを見分けやすくする。
      for (let x = xs[0]; x < xs[1]; x += 2) S(x, Math.min(x + 1.15, xs[1]), zs[0], zs[1], 2.4);
    }
  }
  return layout;
}

function createDocks(): StageLayout {
  const layout = createBase('docks', 'ツインドック');
  const B = (box: BoxDef) => layout.boxes.push(box);
  const S = (x0: number, x1: number, z0: number, z1: number, y: number) =>
    layout.strips.push({ x0, x1, z0, z1, y });

  // 南北の大型ドックと中央の低い交戦エリア。
  const docks = [
    { zs: [8.4, 13.4] as const, color: '#7faebb' },
    { zs: [-13.4, -8.4] as const, color: '#96bcc3' },
  ];
  for (const dock of docks) {
    const zs = dock.zs;
    B({ x0: -15, x1: 15, z0: zs[0], z1: zs[1], y0: 0, y1: 1.1, c: dock.color, top: true, sides: ['pz', 'nz'] });
    for (let i = 0; i < 2; i++) {
      const top = 0.73 - i * 0.36;
      B({ x0: 15 + i * 0.8, x1: 15.8 + i * 0.8, z0: zs[0], z1: zs[1], y0: 0, y1: top, c: dock.color, top: true });
      B({ x0: -15.8 - i * 0.8, x1: -15 - i * 0.8, z0: zs[0], z1: zs[1], y0: 0, y1: top, c: dock.color, top: true });
    }
    S(-15, 15, zs[0], zs[0] + 0.13, 1.1);
    S(-15, 15, zs[1] - 0.13, zs[1], 1.1);
  }
  // 北ドックだけに荷役レーンの短い発光マーカーを置き、衝突や塗装面は変えずに方角を判別しやすくする。
  for (let x = -12.6; x <= 11.4; x += 4.8) S(x, x + 1.2, 8.62, 8.76, 1.1);
  B({ x0: -6.5, x1: 6.5, z0: -2.8, z1: 2.8, y0: 0, y1: 0.55, c: '#b9ccd2', top: true, sides: ALL_SIDES });
  B({ x0: -1.1, x1: 1.1, z0: -2.8, z1: 2.8, y0: 0, y1: 1.5, c: '#e3a74b', top: true, sides: ALL_SIDES });
  B({ x0: 8, x1: 9.3, z0: -7.8, z1: -3.2, y0: 0, y1: 2.4, c: '#5f8799', sides: ['px', 'nx'] });
  B({ x0: -9.3, x1: -8, z0: 3.2, z1: 7.8, y0: 0, y1: 2.4, c: '#5f8799', sides: ['px', 'nx'] });
  B({ x0: 9.5, x1: 15.5, z0: 3.1, z1: 4.2, y0: 0, y1: 2.0, c: '#d67f68', sides: ['pz', 'nz'] });
  B({ x0: -15.5, x1: -9.5, z0: -4.2, z1: -3.1, y0: 0, y1: 2.0, c: '#d67f68', sides: ['pz', 'nz'] });
  B({ x0: 3.8, x1: 5.4, z0: 4.6, z1: 6.2, y0: 0, y1: 1.5, c: '#e3bb56', top: true, sides: ALL_SIDES });
  B({ x0: -5.4, x1: -3.8, z0: -6.2, z1: -4.6, y0: 0, y1: 1.5, c: '#e3bb56', top: true, sides: ALL_SIDES });
  B({ x0: 17.5, x1: 19.2, z0: -12.8, z1: -11.1, y0: 0, y1: 1.2, c: '#67b9ad', top: true, sides: ALL_SIDES });
  B({ x0: -19.2, x1: -17.5, z0: 11.1, z1: 12.8, y0: 0, y1: 1.2, c: '#67b9ad', top: true, sides: ALL_SIDES });
  layout.barrels.push(
    { x: 6.8, z: -11, color: '#67b9ad' },
    { x: -6.8, z: 11, color: '#67b9ad' },
    { x: 18, z: 6.5, color: '#e8955c' },
    { x: -18, z: -6.5, color: '#e8955c' },
  );
  S(-6.5, 6.5, -2.8, -2.67, 0.55); S(-6.5, 6.5, 2.67, 2.8, 0.55);
  return layout;
}

function createYard(): StageLayout {
  const layout = createBase('yard', 'フォレストグレン');
  const forestBaseColors = [
    '#697466',
    '#6b6250', '#536b60',
    '#695f4d', '#566d61', '#6f6653', '#5b7165', '#756c58', '#61766a',
    '#46584c', '#4b5d50', '#53624e', '#4a5a4d',
  ];
  layout.boxes.forEach((box, index) => { box.c = forestBaseColors[index] ?? box.c; });
  const B = (box: BoxDef) => layout.boxes.push(box);
  const S = (x0: number, x1: number, z0: number, z1: number, y: number) =>
    layout.strips.push({ x0, x1, z0, z1, y });
  const rustLine = '#66784a';
  const harborBlue = '#587269';
  const signalGold = '#806a4b';
  const deepTeal = '#335c4c';

  // 衝突形状は点対称のまま、物流会社ごとの色と識別灯だけを非対称にする。
  B({ x0: -5.2, x1: 5.2, z0: -5.2, z1: 5.2, y0: 0, y1: 0.5, c: '#6d796d', top: true, sides: ALL_SIDES });
  B({ x0: -1.1, x1: 1.1, z0: -5.2, z1: 5.2, y0: 0, y1: 2.3, c: '#655744', sides: ['px', 'nx'] });
  B({ x0: 7, x1: 14, z0: -10.2, z1: -7.2, y0: 0, y1: 2.5, c: rustLine, sides: ALL_SIDES });
  B({ x0: -14, x1: -7, z0: 7.2, z1: 10.2, y0: 0, y1: 2.5, c: harborBlue, sides: ALL_SIDES });
  B({ x0: 10, x1: 17, z0: 4.2, z1: 7.2, y0: 0, y1: 2.5, c: deepTeal, sides: ALL_SIDES });
  B({ x0: -17, x1: -10, z0: -7.2, z1: -4.2, y0: 0, y1: 2.5, c: signalGold, sides: ALL_SIDES });
  B({ x0: 17, x1: 21, z0: -2.2, z1: 2.2, y0: 0, y1: 1.1, c: '#725f43', top: true, sides: ALL_SIDES });
  B({ x0: -21, x1: -17, z0: -2.2, z1: 2.2, y0: 0, y1: 1.1, c: '#536b60', top: true, sides: ALL_SIDES });
  for (let i = 0; i < 2; i++) {
    const top = 0.73 - i * 0.36;
    B({ x0: 16.2 - i * 0.8, x1: 17 - i * 0.8, z0: -2.2, z1: 2.2, y0: 0, y1: top, c: '#725f43', top: true });
    B({ x0: -17 + i * 0.8, x1: -16.2 + i * 0.8, z0: -2.2, z1: 2.2, y0: 0, y1: top, c: '#536b60', top: true });
  }
  B({ x0: 5.8, x1: 7.4, z0: 10.7, z1: 12.3, y0: 0, y1: 1.55, c: signalGold, top: true, sides: ALL_SIDES });
  B({ x0: -7.4, x1: -5.8, z0: -12.3, z1: -10.7, y0: 0, y1: 1.55, c: harborBlue, top: true, sides: ALL_SIDES });
  B({ x0: 4.8, x1: 6.2, z0: -15, z1: -13.6, y0: 0, y1: 1.1, c: deepTeal, top: true, sides: ALL_SIDES });
  B({ x0: -6.2, x1: -4.8, z0: 13.6, z1: 15, y0: 0, y1: 1.1, c: rustLine, top: true, sides: ALL_SIDES });
  layout.barrels.push(
    { x: 7.2, z: -3.8, color: deepTeal },
    { x: -7.2, z: 3.8, color: harborBlue },
    { x: 19, z: 9.5, color: rustLine },
    { x: -19, z: -9.5, color: signalGold },
    { x: 2.8, z: 14.8, color: signalGold },
    { x: -2.8, z: -14.8, color: rustLine },
  );
  S(-5.2, 5.2, -5.2, -5.07, 0.5); S(-5.2, 5.2, 5.07, 5.2, 0.5);
  S(17, 21, -2.2, -2.07, 1.1); S(-21, -17, 2.07, 2.2, 1.1);
  // 赤錆側は三本の荷役マーカー、青側は分割された会社識別帯。
  for (let i = 0; i < 3; i++) S(9.15 + i * 0.5, 9.27 + i * 0.5, -10.2, -7.2, 2.5);
  S(-13.4, -10.8, 10.07, 10.2, 2.5); S(-10.2, -7.6, 10.07, 10.2, 2.5);
  return layout;
}

export const STAGE_DEFINITIONS: readonly StageDefinition[] = [
  { id: 'plaza', name: 'ネオンプラザ', create: createPlaza },
  { id: 'docks', name: 'ツインドック', create: createDocks },
  { id: 'yard', name: 'コンテナヤード', create: createYard },
];

/** URL指定が有効なら固定し、それ以外は3ステージから均等に選ぶ。 */
export function selectStageDefinition(requested?: string | null): StageDefinition {
  const fixed = requested ? STAGE_DEFINITIONS.find((stage) => stage.id === requested) : undefined;
  return fixed ?? STAGE_DEFINITIONS[(Math.random() * STAGE_DEFINITIONS.length) | 0];
}
