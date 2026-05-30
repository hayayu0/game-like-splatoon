// アリーナ・チーム・ゲーム進行の共通設定

export const ARENA = {
  half: 20, // フィールドは [-20, 20] x [-20, 20]
  wallHeight: 4,
};

export interface Box {
  x: number;
  z: number;
  w: number; // X方向の幅
  d: number; // Z方向の奥行き
  h: number; // 高さ
}

// 遮蔽物（床に置かれた箱）。塗れない＝カバーとして機能する。
export const OBSTACLES: Box[] = [
  { x: 0, z: 0, w: 4, d: 4, h: 2 },
  { x: 8, z: 8, w: 5, d: 2, h: 1.5 },
  { x: -8, z: -8, w: 5, d: 2, h: 1.5 },
  { x: -9, z: 9, w: 3, d: 3, h: 2.5 },
  { x: 9, z: -9, w: 3, d: 3, h: 2.5 },
  { x: 0, z: 12, w: 9, d: 2, h: 1.5 },
  { x: 0, z: -12, w: 9, d: 2, h: 1.5 },
];

export interface TeamDef {
  id: number;
  color: number; // 3D メッシュ / インク弾の色
  inkCss: string; // 床に塗るインクの色（Canvas用）
}

export const TEAMS: { player: TeamDef; enemy: TeamDef } = {
  player: { id: 0, color: 0xff7a1a, inkCss: '#ff8a2a' }, // オレンジ
  enemy: { id: 1, color: 0x2a7bff, inkCss: '#3a8bff' }, // ブルー
};

export const GAME = {
  duration: 90, // 制限時間（秒）
  enemyCount: 3,
};
