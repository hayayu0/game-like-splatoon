export interface WeaponDef {
  id: string;
  name: string;
  kind: 'projectile' | 'spin';
  fireCd: number;
  fireCost: number;
  spreadPlayer: number;
  spreadAI: number;
  projectileSpeed: number;
  gravity: number;
  paintRadius: [number, number];
  damage: [number, number];
  damageAI: [number, number];
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 'shooter',
    name: 'シューター',
    kind: 'projectile',
    fireCd: 0.135,
    fireCost: 1.9,
    spreadPlayer: 0.02,
    spreadAI: 0.05,
    projectileSpeed: 27,
    gravity: 20,
    paintRadius: [0.7, 1.015],
    damage: [24, 29],
    damageAI: [16, 21],
  },
  {
    id: 'sweeper',
    name: 'スウィーパー',
    kind: 'spin',
    fireCd: 0.3,
    fireCost: 4.0,
    spreadPlayer: 0,
    spreadAI: 0,
    projectileSpeed: 0,
    gravity: 0,
    paintRadius: [4.2, 5.2],
    damage: [46, 54],
    damageAI: [30, 36],
  },
  {
    id: 'blaster',
    name: 'ブラスター',
    kind: 'projectile',
    fireCd: 0.5,
    fireCost: 3.4,
    spreadPlayer: 0.05,
    spreadAI: 0.08,
    projectileSpeed: 17,
    gravity: 26,
    paintRadius: [2.52, 3.12],
    damage: [30, 36],
    damageAI: [20, 25],
  },
];

export const WEAPON_COUNT = WEAPONS.length;
