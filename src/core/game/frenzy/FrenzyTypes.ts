import { PlayerID } from "../Game";
import { TileRef } from "../GameMap";

/**
 * Frenzy Mode: Strategic unit-based warfare with continuous movement
 * and flowing territory boundaries
 */

export enum FrenzyUnitType {
  Soldier = "soldier",
  EliteSoldier = "eliteSoldier",
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
  isBeam?: boolean; // True for defense post red beam
  startX?: number; // Beam origin X
  startY?: number; // Beam origin Y
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
  tier: number; // HQ tier level (1 = base, 2+ = upgraded)
  health: number; // Current HP (default: 1000 for HQ)
  maxHealth: number; // Max HP (default: 1000 for HQ)
}

export interface FactorySpawner {
  playerId: PlayerID;
  x: number;
  y: number;
  tile: TileRef;
  spawnTimer: number;
  spawnInterval: number;
  health: number; // Current HP (default: 400 for factories/cities)
  maxHealth: number; // Max HP (default: 400 for factories/cities)
  tier: number; // Factory tier (1 = base, 2 = elite units)
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
  defensePostFireRateMultiplier: number; // Defense posts fire rate multiplier (default: 0.25 = slow like Obelisk)
  defensePostRangeMultiplier: number; // Defense posts have extended range (default: 1.5 = 50% more)
  defensePostDamage: number; // Defense post damage per shot (default: 100 = one-shot tier 1)
  startingGold: number; // Gold at spawn (default: 150000)
  baseGoldPerMinute: number; // Base gold income per minute (default: 20000)
  cityGoldPerMinute: number; // Gold per city per minute (default: 2000)
  cityCost: number; // Fixed cost for cities (default: 100000)
  factoryCost: number; // Fixed cost for factories (default: 100000)
  cityHealth: number; // HP for cities/factories (default: 400)
  hqHealth: number; // HP for HQ (default: 1000)
  eliteHealthMultiplier: number; // Elite soldier HP multiplier (default: 1.5)
  eliteRangeMultiplier: number; // Elite soldier range multiplier (default: 1.5)
  factoryUpgradeCost: number; // Cost to upgrade factory to tier 2 (default: 100000)
}

export const DEFAULT_FRENZY_CONFIG: FrenzyConfig = {
  spawnInterval: 4.0,
  maxUnitsPerPlayer: 60,
  startingUnits: 5,
  unitHealth: 100,
  unitSpeed: 2.5,          // Halved from 5
  unitDPS: 15,
  influenceRadius: 9,      // Halved from 18
  combatRange: 25,         // Doubled back to 25
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
  defensePostFireRateMultiplier: 0.25, // Slow fire rate like Obelisk
  defensePostRangeMultiplier: 1.5, // 50% more range
  defensePostDamage: 100, // One-shot tier 1 units
  startingGold: 150000, // 150k gold at spawn
  baseGoldPerMinute: 20000, // 20k gold per minute base income (doubled)
  cityGoldPerMinute: 20000, // 2k gold per city per minute (doubled)
  cityCost: 100000, // 100k fixed cost for cities
  factoryCost: 100000, // 100k fixed cost for factories
  cityHealth: 400, // Cities/factories have 400 HP
  hqHealth: 1000, // HQ has 1000 HP
  eliteHealthMultiplier: 1.5, // Elite soldiers have 1.5x HP
  eliteRangeMultiplier: 1.5, // Elite soldiers have 1.5x range
  factoryUpgradeCost: 100000, // 100k to upgrade factory
};

export enum Stance {
  ATTACK = "ATTACK",
  DEFEND = "DEFEND",
  NEUTRAL = "NEUTRAL",
}
