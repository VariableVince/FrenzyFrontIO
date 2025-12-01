import { PlayerID } from "../Game";

/**
 * Frenzy Mode: Strategic unit-based warfare with continuous movement
 * and flowing territory boundaries
 */

export interface FrenzyUnit {
  id: number;
  playerId: PlayerID;
  x: number; // Pixel coordinates
  y: number;
  vx: number; // Velocity
  vy: number;
  health: number;
  targetX: number;
  targetY: number;
}

export interface CoreBuilding {
  playerId: PlayerID;
  x: number;
  y: number;
  spawnTimer: number; // Seconds until next spawn
  spawnInterval: number;
  unitCount: number;
}

export interface FrenzyConfig {
  spawnInterval: number; // Seconds between spawns (default: 4.0)
  maxUnitsPerPlayer: number; // Hard cap (default: 60)
  startingUnits: number; // Units at game start (default: 5)
  unitHealth: number; // HP per unit (default: 100)
  unitSpeed: number; // Pixels per second (default: 25)
  unitDPS: number; // Damage per second (default: 15)
  influenceRadius: number; // Territory control radius (default: 18px)
  combatRange: number; // Damage dealing range (default: 25px)
  separationRadius: number; // Personal space from friendlies (default: 10px)
}

export const DEFAULT_FRENZY_CONFIG: FrenzyConfig = {
  spawnInterval: 4.0,
  maxUnitsPerPlayer: 60,
  startingUnits: 5,
  unitHealth: 100,
  unitSpeed: 25,
  unitDPS: 15,
  influenceRadius: 18,
  combatRange: 25,
  separationRadius: 10,
};

export enum Stance {
  ATTACK = "ATTACK",
  DEFEND = "DEFEND",
  NEUTRAL = "NEUTRAL",
}
