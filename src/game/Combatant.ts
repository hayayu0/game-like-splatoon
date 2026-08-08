import * as THREE from 'three';

/** インク弾や爆発の攻撃対象になるキャラクターの共通情報 */
export interface Combatant {
  readonly team: number;
  readonly pos: THREE.Vector3;
  readonly hitRadius: number;
  readonly hitHeight: number;
  alive: boolean;

  takeDamage(amount: number, byTeam: number): void;
}
