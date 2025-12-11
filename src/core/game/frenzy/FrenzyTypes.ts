import { PlayerID } from "../Game";
import { TileRef } from "../GameMap";

/**
 * Frenzy Mode: Strategic unit-based warfare with continuous movement
 * and flowing territory boundaries
 */

export enum FrenzyUnitType {
  Soldier = "soldier",
  DefensePost = "defensePost",
}

export interface FrenzyUnit {
  id: number;
  playerId: PlayerID;
  x: number; // Pixel coordinates
  y: number;
  vx: number; // Velocity
  vy: number;
  health: number;
  maxHealth: number;
  targetX: number;
  targetY: number;
  weaponCooldown: number;
  unitType: FrenzyUnitType;
  fireInterval: number; // Unit-specific fire interval
}

export interface FrenzyProjectile {
  id: number;
  playerId: PlayerID;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

export interface CoreBuilding {
  playerId: PlayerID;
  x: number;
  y: number;
  tile: TileRef;
  tileX: number;
  tileY: number;
  spawnTimer: number; // Seconds until next spawn
  spawnInterval: number;
  unitCount: number;
}

export interface FactorySpawner {
  playerId: PlayerID;
  x: number;
  y: number;
  tile: TileRef;
  spawnTimer: number;
  spawnInterval: number;
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
  captureRadius: number; // Tiles around the unit that can be converted (default: 3)
  radialAlignmentWeight: number; // Strength of radial bias toward centroid (default: 0.75)
  borderAdvanceDistance: number; // How far past the border to push targets (default: 12px)
  stopDistance: number; // Distance to stop before reaching target (default: 2px)
  projectileSpeed: number; // Speed of visual shells (default: 140px/s)
  fireInterval: number; // Seconds between volleys per unit (default: 0.5s)
  projectileSize: number; // Diameter of visual shells in pixels (default: 4px)
  hqCaptureRadius: number; // Tiles around HQ that must fall before defeat (default: 2 tiles)
  defensePostHealthMultiplier: number; // Defense posts have multiplied HP (default: 2.0)
  defensePostFireRateMultiplier: number; // Defense posts fire faster (default: 2.0)
}

export const DEFAULT_FRENZY_CONFIG: FrenzyConfig = {
  spawnInterval: 4.0,
  maxUnitsPerPlayer: 60,
  startingUnits: 5,
  unitHealth: 100,
  unitSpeed: 2.5,          // Halved from 5
  unitDPS: 15,
  influenceRadius: 9,      // Halved from 18
  combatRange: 12.5,       // Halved from 25
  separationRadius: 5,     // Halved from 10
  captureRadius: 10,       // Keep unchanged
  radialAlignmentWeight: 0.75,
  borderAdvanceDistance: 0.5, // Halved from 1
  stopDistance: 1,         // Halved from 2
  projectileSpeed: 10,     // Halved from 20
  fireInterval: 1,
  projectileSize: 1,       // Halved from 2
  hqCaptureRadius: 2,
  defensePostHealthMultiplier: 2.0,
  defensePostFireRateMultiplier: 2.0,
};

export enum Stance {
  ATTACK = "ATTACK",
  DEFEND = "DEFEND",
  NEUTRAL = "NEUTRAL",
}
