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
  Warship = "warship",
  Artillery = "artillery",
  ShieldGenerator = "shieldGenerator",
}

// Per-unit-type configuration
export interface UnitTypeConfig {
  health: number; // HP for this unit type
  speed: number; // Movement speed (pixels/sec), 0 for stationary
  dps: number; // Damage per second
  range: number; // Combat range in pixels
  fireInterval: number; // Seconds between shots
  projectileDamage?: number; // If set, deals instant damage instead of DPS
  areaRadius?: number; // Area of effect radius for splash damage
  shieldRadius?: number; // Shield protection radius
  shieldHealth?: number; // Shield HP (regenerates when not taking damage)
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
  tier: number; // Unit tier (1 = base, 2+ = upgraded)
  shieldHealth?: number; // Current shield HP (for shield generators)
  maxShieldHealth?: number; // Max shield HP
  shieldRegenTimer?: number; // Timer for shield regeneration
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
  isElite?: boolean; // True for elite soldier projectiles
  isArtillery?: boolean; // True for artillery shells (area damage)
  areaRadius?: number; // Splash damage radius
  damage?: number; // Damage to deal on impact
  startX?: number; // Beam origin X
  startY?: number; // Beam origin Y
  targetX?: number; // Target position X (for artillery)
  targetY?: number; // Target position Y (for artillery)
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

export interface PortSpawner {
  playerId: PlayerID;
  x: number;
  y: number;
  tile: TileRef;
  spawnTimer: number;
  spawnInterval: number;
  health: number;
  maxHealth: number;
  tier: number; // Port tier (1 = base, 2 = elite warships)
}

export interface CrystalCluster {
  id: number;
  x: number; // Pixel coordinates (center)
  y: number;
  tile: TileRef;
  crystalCount: number; // Number of crystals in this cluster (1-5)
  rotations: number[]; // Rotation angles in radians for each crystal (bottom anchored)
}

export interface FrenzyConfig {
  // Unit type configurations
  units: {
    soldier: UnitTypeConfig;
    eliteSoldier: UnitTypeConfig;
    defensePost: UnitTypeConfig;
    warship: UnitTypeConfig;
    artillery: UnitTypeConfig;
    shieldGenerator: UnitTypeConfig;
  };

  // Spawning
  spawnInterval: number; // Seconds between spawns (default: 4.0)
  maxUnitsPerPlayer: number; // Hard cap (default: 60)
  startingUnits: number; // Units at game start (default: 5)

  // Movement & Territory
  influenceRadius: number; // Territory control radius (default: 18px)
  separationRadius: number; // Personal space from friendlies (default: 10px)
  captureRadius: number; // Tiles around the unit that can be converted (default: 3)
  radialAlignmentWeight: number; // Strength of radial bias toward centroid (default: 0.75)
  borderAdvanceDistance: number; // How far past the border to push targets (default: 12px)
  stopDistance: number; // Distance to stop before reaching target (default: 2px)

  // Projectiles
  projectileSpeed: number; // Speed of visual shells (default: 140px/s)
  projectileSize: number; // Diameter of visual shells in pixels (default: 4px)

  // Buildings
  hqCaptureRadius: number; // Tiles around HQ that must fall before defeat (default: 2 tiles)
  mineHealth: number; // HP for mines/factories (default: 400)
  hqHealth: number; // HP for HQ (default: 1000)

  // Economy
  startingGold: number; // Gold at spawn (default: 150000)
  baseGoldPerMinute: number; // Base gold income per minute (default: 20000)
  mineGoldPerMinute: number; // Gold per mine per minute (default: 10000 for tier 1)
  mineCost: number; // Fixed cost for mines (default: 50000)
  mineUpgradeCost: number; // Cost to upgrade mine to tier 2 (default: 100000)
  factoryCost: number; // Fixed cost for factories (default: 100000)
  factoryUpgradeCost: number; // Cost to upgrade factory to tier 2 (default: 100000)

  // Crystals (resources)
  crystalClusterCount: number; // Number of crystal clusters to spawn (default: 50)
  crystalGoldBonus: number; // Extra gold per crystal per 10s interval (default: 1000)
  mineGoldInterval: number; // Seconds between mine gold payouts (default: 10)
  mineRadius: number; // Max radius of mine Voronoi territory in pixels (default: 40)
}

// Helper to get unit config by type
export function getUnitConfig(
  config: FrenzyConfig,
  unitType: FrenzyUnitType,
): UnitTypeConfig {
  switch (unitType) {
    case FrenzyUnitType.Soldier:
      return config.units.soldier;
    case FrenzyUnitType.EliteSoldier:
      return config.units.eliteSoldier;
    case FrenzyUnitType.DefensePost:
      return config.units.defensePost;
    case FrenzyUnitType.Warship:
      return config.units.warship;
    case FrenzyUnitType.Artillery:
      return config.units.artillery;
    case FrenzyUnitType.ShieldGenerator:
      return config.units.shieldGenerator;
    default:
      return config.units.soldier;
  }
}

export const DEFAULT_FRENZY_CONFIG: FrenzyConfig = {
  // Unit configurations
  units: {
    soldier: {
      health: 100,
      speed: 2.5,
      dps: 15,
      range: 25,
      fireInterval: 1,
    },
    eliteSoldier: {
      health: 150, // 1.5x soldier health
      speed: 2.25, // 10% slower than soldier
      dps: 15,
      range: 37.5, // 1.5x soldier range
      fireInterval: 1,
    },
    defensePost: {
      health: 200, // 2x soldier health
      speed: 0, // Stationary
      dps: 0, // Uses projectileDamage instead
      range: 25, // Same as soldier (tier 2: 37.5)
      fireInterval: 0.5, // Double soldier fire rate (tier 2: 4.0)
      projectileDamage: 15, // Same as soldier damage (tier 2: 100, one-shots units)
    },
    warship: {
      health: 250, // Tough naval unit
      speed: 2.0, // Slower than land units
      dps: 20, // Strong damage
      range: 45, // Long range - can hit land from water
      fireInterval: 1.5, // Moderate fire rate
      projectileDamage: 50, // Good projectile damage
    },
    artillery: {
      health: 150, // Fragile
      speed: 0, // Stationary
      dps: 0, // Uses projectileDamage instead
      range: 80, // Very long range
      fireInterval: 8.0, // Very slow firing, long cooldown
      projectileDamage: 60, // High damage
      areaRadius: 15, // Splash damage radius
    },
    shieldGenerator: {
      health: 100, // Low HP
      speed: 0, // Stationary
      dps: 0, // No attack
      range: 0, // No attack range
      fireInterval: 0, // No firing
      shieldRadius: 30, // Protection radius
      shieldHealth: 500, // Shield absorbs 500 damage before breaking
    },
  },

  // Spawning
  spawnInterval: 4.0,
  maxUnitsPerPlayer: 100,
  startingUnits: 5,

  // Movement & Territory
  influenceRadius: 9,
  separationRadius: 5,
  captureRadius: 10,
  radialAlignmentWeight: 0.75,
  borderAdvanceDistance: 0.5,
  stopDistance: 1,

  // Projectiles
  projectileSpeed: 10,
  projectileSize: 1,

  // Buildings
  hqCaptureRadius: 2,
  mineHealth: 400,
  hqHealth: 1000,

  // Economy
  startingGold: 150000,
  baseGoldPerMinute: 20000,
  mineGoldPerMinute: 10000, // Tier 1 mine gold (tier 2 doubles this)
  mineCost: 50000,
  mineUpgradeCost: 100000, // Upgrade to tier 2 doubles gold generation
  factoryCost: 100000,
  factoryUpgradeCost: 100000,

  // Crystals (resources)
  crystalClusterCount: 50,
  crystalGoldBonus: 1000,
  mineGoldInterval: 10,
  mineRadius: 40,
};

export enum Stance {
  ATTACK = "ATTACK",
  DEFEND = "DEFEND",
  NEUTRAL = "NEUTRAL",
}
