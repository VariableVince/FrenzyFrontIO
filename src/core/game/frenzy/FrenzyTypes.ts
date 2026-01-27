import { PlayerID } from "../Game";
import { TileRef } from "../GameMap";

/**
 * Frenzy Mode: Strategic unit-based warfare with continuous movement
 * and flowing territory boundaries
 *
 * ALL buildings and units are managed by FrenzyManager as Frenzy structures/units.
 * This avoids confusion between game units and Frenzy units.
 */

/**
 * Projectile visual types for Frenzy units
 * - PlasmaOrb: Default cyan/blue plasma (soldiers)
 * - GreenOrb: Green plasma orb (defense posts)
 * - Laser: Red beam/laser (warships)
 * - GoldenOrb: Elite soldier projectile
 * - Artillery: Ballistic shell with arc
 * - Missile: Tier 2 warship missiles
 */
export enum ProjectileType {
  PlasmaOrb = "plasmaOrb", // Default cyan/blue (soldiers)
  GreenOrb = "greenOrb", // Green orb (defense posts)
  Laser = "laser", // Red beam (warships, tier 2 defense posts)
  GoldenOrb = "goldenOrb", // Elite soldiers
  Artillery = "artillery", // Ballistic arc
  Missile = "missile", // Tier 2 warship missiles
}

/**
 * Projectile configuration for visual rendering
 */
export interface ProjectileConfig {
  type: ProjectileType;
  // Core colors (for gradients)
  coreColor: string; // Inner bright color
  glowColor1: string; // First gradient stop
  glowColor2: string; // Second gradient stop
  glowColor3: string; // Outer gradient color (fades to transparent)
}

/**
 * Default projectile configurations for each type
 */
export const PROJECTILE_CONFIGS: Record<ProjectileType, ProjectileConfig> = {
  [ProjectileType.PlasmaOrb]: {
    type: ProjectileType.PlasmaOrb,
    coreColor: "#ffffff",
    glowColor1: "rgba(0, 255, 255, 0.9)", // Cyan
    glowColor2: "rgba(100, 200, 255, 0.7)", // Light blue
    glowColor3: "rgba(150, 100, 255, 0.4)", // Purple
  },
  [ProjectileType.GreenOrb]: {
    type: ProjectileType.GreenOrb,
    coreColor: "#ffffff",
    glowColor1: "rgba(0, 255, 100, 0.9)", // Bright green
    glowColor2: "rgba(100, 255, 150, 0.7)", // Light green
    glowColor3: "rgba(50, 200, 100, 0.4)", // Forest green
  },
  [ProjectileType.Laser]: {
    type: ProjectileType.Laser,
    coreColor: "rgba(255, 200, 200, 0.9)",
    glowColor1: "rgba(255, 0, 0, 0.3)", // Red outer
    glowColor2: "rgba(255, 50, 50, 0.6)", // Red middle
    glowColor3: "rgba(255, 100, 50, 0.6)", // Orange glow
  },
  [ProjectileType.GoldenOrb]: {
    type: ProjectileType.GoldenOrb,
    coreColor: "#ffffff",
    glowColor1: "rgba(255, 255, 150, 0.95)", // Bright gold
    glowColor2: "rgba(255, 220, 100, 0.8)", // Gold
    glowColor3: "rgba(255, 180, 50, 0.5)", // Dark gold
  },
  [ProjectileType.Artillery]: {
    type: ProjectileType.Artillery,
    coreColor: "#ffffcc",
    glowColor1: "rgba(255, 150, 50, 0.6)", // Orange
    glowColor2: "rgba(255, 80, 0, 0.3)", // Red-orange
    glowColor3: "rgba(255, 0, 0, 0)", // Fade out
  },
  [ProjectileType.Missile]: {
    type: ProjectileType.Missile,
    coreColor: "#f0f0f0",
    glowColor1: "rgba(255, 220, 120, 0.9)", // Engine glow
    glowColor2: "rgba(255, 150, 50, 0.6)", // Orange
    glowColor3: "rgba(255, 80, 20, 0.3)", // Red
  },
};

/**
 * Frenzy structure types (stationary buildings)
 * - HQ: Main building, spawns soldiers
 * - Mine: Generates gold from nearby crystals
 * - Factory: Spawns soldiers (tier 2: elite soldiers)
 * - Port: Spawns warships (tier 2: elite warships)
 * - Airport: Spawns transporters (1-minute rebuild time)
 */
export enum FrenzyStructureType {
  HQ = "hq",
  Mine = "mine",
  Factory = "factory",
  Port = "port",
  Airport = "airport",
  MiniHQ = "minihq",
}

/**
 * Frenzy unit types
 * - Mobile: soldier, eliteSoldier, warship, transporter (move and attack)
 * - Towers: defensePost, samLauncher, missileSilo, shieldGenerator, artillery (stationary defensive)
 */
export enum FrenzyUnitType {
  // Mobile units
  Soldier = "soldier",
  EliteSoldier = "eliteSoldier",
  Warship = "warship",
  Transporter = "transporter",
  // Towers (stationary)
  DefensePost = "defensePost",
  SAMLauncher = "samLauncher",
  MissileSilo = "missileSilo",
  ShieldGenerator = "shieldGenerator",
  Artillery = "artillery",
}

/**
 * Bar display configuration for structures
 * Defines when and how health/energy bars are shown
 */
export interface BarConfig {
  showHealthBar: boolean; // Whether to show health bar when damaged
  showEnergyBar: boolean; // Whether to show energy bar (shield/reload)
  energyBarType?: "shield" | "reload"; // Type of energy bar
}

/**
 * Unified structure configuration for all buildable structures
 * Centralizes all structure parameters: costs, health, construction, upgrades, selling
 */
export interface StructureConfig {
  // Building
  buildCost: number; // Gold cost to build
  constructionTime: number; // Ticks to construct (10 ticks = 1 second)
  health: number; // Base HP at tier 1

  // Visual & Placement
  size: number; // Visual size in pixels (half-width/radius for rendering)
  minDistance: number; // Minimum distance from other structures (calculated as size * 2 + buffer)

  // Upgrades
  maxTier: number; // Maximum tier (1 = not upgradable)
  upgradeCost: number; // Gold cost to upgrade to next tier
  upgradeHealthBonus: number; // Additional HP per tier upgrade
  requiredHQTier: number; // Minimum HQ tier required to upgrade

  // Selling
  sellRefundPercent: number; // Percentage of build cost refunded when selling (0-100)

  // Bar display
  bars: BarConfig; // Health and energy bar configuration

  // Special properties (optional)
  spawnInterval?: number; // For spawners (Factory, Port): seconds between spawns
  goldPerMinute?: number; // For Mine: gold generation per minute
  tier2GoldMultiplier?: number; // For Mine: multiplier for tier 2 gold generation

  // Missile Silo specific
  nukeCost?: number; // Cost of atom bomb (for missile silo)
  hydroCost?: number; // Cost of hydrogen bomb (for missile silo)

  // HQ and MiniHQ specific
  captureRadius?: number; // Territory capture radius on spawn (for MiniHQ)
  protectionRadius?: number; // Territory protection radius - tiles within this cannot be captured by enemies
}

/**
 * Structure type keys for configuration lookup
 */
export type StructureTypeKey =
  | "hq"
  | "mine"
  | "factory"
  | "port"
  | "airport"
  | "minihq"
  | "defensePost"
  | "samLauncher"
  | "missileSilo"
  | "shieldGenerator"
  | "artillery";

/**
 * Default structure configurations
 * All structures in one place for easy balancing
 */
export const STRUCTURE_CONFIGS: Record<StructureTypeKey, StructureConfig> = {
  // === Buildings (economic/production) ===
  hq: {
    buildCost: 0, // Not buildable
    constructionTime: 0,
    health: 1000,
    size: 10,
    minDistance: 25, // HQ has larger exclusion zone
    maxTier: 2,
    upgradeCost: 500000,
    upgradeHealthBonus: 500,
    requiredHQTier: 1,
    sellRefundPercent: 0, // Cannot sell HQ
    spawnInterval: 4.0,
    protectionRadius: 20, // Territory protection radius - tiles within this cannot be captured
    bars: { showHealthBar: true, showEnergyBar: false },
  },
  mine: {
    buildCost: 50000,
    constructionTime: 50, // 5 seconds
    health: 400,
    size: 8,
    minDistance: 20, // size * 2 + 4
    maxTier: 2,
    upgradeCost: 100000,
    upgradeHealthBonus: 200,
    requiredHQTier: 2,
    sellRefundPercent: 50,
    goldPerMinute: 10000,
    tier2GoldMultiplier: 2,
    bars: { showHealthBar: true, showEnergyBar: false },
  },
  factory: {
    buildCost: 100000,
    constructionTime: 20, // 2 seconds
    health: 400,
    size: 8,
    minDistance: 20, // size * 2 + 4
    maxTier: 2,
    upgradeCost: 100000,
    upgradeHealthBonus: 200,
    requiredHQTier: 2,
    sellRefundPercent: 50,
    spawnInterval: 4.0,
    bars: { showHealthBar: true, showEnergyBar: false },
  },
  port: {
    buildCost: 100000,
    constructionTime: 20, // 2 seconds
    health: 400,
    size: 8,
    minDistance: 20, // size * 2 + 4
    maxTier: 2,
    upgradeCost: 100000,
    upgradeHealthBonus: 200,
    requiredHQTier: 2,
    sellRefundPercent: 50,
    spawnInterval: 4.0,
    bars: { showHealthBar: true, showEnergyBar: false },
  },

  // === Towers (military/defensive) ===
  defensePost: {
    buildCost: 35000,
    constructionTime: 50, // 5 seconds
    health: 200,
    size: 8,
    minDistance: 20, // size * 2 + 4
    maxTier: 2,
    upgradeCost: 100000,
    upgradeHealthBonus: 100,
    requiredHQTier: 2,
    sellRefundPercent: 50,
    bars: { showHealthBar: true, showEnergyBar: false }, // No energy bar for defense posts
  },
  samLauncher: {
    buildCost: 150000,
    constructionTime: 100, // 10 seconds
    health: 150,
    size: 6.4,
    minDistance: 17, // size * 2 + 4
    maxTier: 2,
    upgradeCost: 100000,
    upgradeHealthBonus: 75,
    requiredHQTier: 2,
    sellRefundPercent: 50,
    bars: { showHealthBar: true, showEnergyBar: false },
  },
  missileSilo: {
    buildCost: 200000,
    constructionTime: 100, // 10 seconds
    health: 300,
    size: 6,
    minDistance: 16, // size * 2 + 4
    maxTier: 2,
    upgradeCost: 400000,
    upgradeHealthBonus: 150,
    requiredHQTier: 2,
    sellRefundPercent: 50,
    nukeCost: 200000, // Atom bomb cost
    hydroCost: 1000000, // Hydrogen bomb cost
    bars: { showHealthBar: true, showEnergyBar: false },
  },
  shieldGenerator: {
    buildCost: 150000,
    constructionTime: 150, // 15 seconds
    health: 100,
    size: 6.4,
    minDistance: 17, // size * 2 + 4
    maxTier: 2,
    upgradeCost: 100000,
    upgradeHealthBonus: 50,
    requiredHQTier: 2,
    sellRefundPercent: 50,
    bars: { showHealthBar: true, showEnergyBar: true, energyBarType: "shield" }, // Shield HP bar
  },
  artillery: {
    buildCost: 200000,
    constructionTime: 100, // 10 seconds
    health: 150,
    size: 7,
    minDistance: 18, // size * 2 + 4
    maxTier: 2,
    upgradeCost: 100000,
    upgradeHealthBonus: 75,
    requiredHQTier: 2,
    sellRefundPercent: 50,
    bars: { showHealthBar: true, showEnergyBar: true, energyBarType: "reload" }, // Reload bar
  },

  // === Airport (spawns transporters) ===
  airport: {
    buildCost: 150000,
    constructionTime: 100, // 10 seconds
    health: 300,
    size: 8,
    minDistance: 20, // size * 2 + 4
    maxTier: 1, // Not upgradable
    upgradeCost: 0,
    upgradeHealthBonus: 0,
    requiredHQTier: 1,
    sellRefundPercent: 50,
    spawnInterval: 60.0, // 1 minute rebuild time
    bars: { showHealthBar: true, showEnergyBar: false },
  },

  // === MiniHQ (spawned by transporter landing) ===
  minihq: {
    buildCost: 0, // Cannot be built directly
    constructionTime: 0, // Instant spawn
    health: 200,
    size: 6,
    minDistance: 0, // No distance requirement
    maxTier: 1, // Not upgradable
    upgradeCost: 0,
    upgradeHealthBonus: 0,
    requiredHQTier: 1,
    sellRefundPercent: 0, // Cannot be sold
    captureRadius: 15, // Territory capture radius on spawn
    protectionRadius: 15, // Territory protection radius - tiles within this cannot be captured
    bars: { showHealthBar: true, showEnergyBar: false },
  },
};

/**
 * Get structure config by type key
 */
export function getStructureConfig(type: StructureTypeKey): StructureConfig {
  return STRUCTURE_CONFIGS[type];
}

/**
 * Get structure type key from FrenzyStructureType
 */
export function structureTypeToKey(
  type: FrenzyStructureType,
): StructureTypeKey {
  switch (type) {
    case FrenzyStructureType.HQ:
      return "hq";
    case FrenzyStructureType.Mine:
      return "mine";
    case FrenzyStructureType.Factory:
      return "factory";
    case FrenzyStructureType.Port:
      return "port";
    case FrenzyStructureType.Airport:
      return "airport";
    case FrenzyStructureType.MiniHQ:
      return "minihq";
  }
}

/**
 * Get structure type key from FrenzyUnitType (for towers)
 */
export function unitTypeToStructureKey(
  type: FrenzyUnitType,
): StructureTypeKey | null {
  switch (type) {
    case FrenzyUnitType.DefensePost:
      return "defensePost";
    case FrenzyUnitType.SAMLauncher:
      return "samLauncher";
    case FrenzyUnitType.MissileSilo:
      return "missileSilo";
    case FrenzyUnitType.ShieldGenerator:
      return "shieldGenerator";
    case FrenzyUnitType.Artillery:
      return "artillery";
    default:
      return null; // Mobile units don't have structure configs
  }
}

/**
 * Calculate sell value for a structure
 */
export function getStructureSellValue(
  type: StructureTypeKey,
  tier: number = 1,
): number {
  const config = STRUCTURE_CONFIGS[type];
  const baseCost = config.buildCost;
  const upgradeCost = (tier - 1) * config.upgradeCost;
  const totalInvested = baseCost + upgradeCost;
  return Math.floor(totalInvested * (config.sellRefundPercent / 100));
}

/**
 * Check if a structure can be upgraded
 */
export function canUpgradeStructureConfig(
  type: StructureTypeKey,
  currentTier: number,
  hqTier: number,
  playerGold: bigint,
): boolean {
  const config = STRUCTURE_CONFIGS[type];
  if (currentTier >= config.maxTier) return false;
  if (hqTier < config.requiredHQTier) return false;
  if (playerGold < BigInt(config.upgradeCost)) return false;
  return true;
}

/**
 * Get health for a structure at a specific tier
 */
export function getStructureHealthForTier(
  type: StructureTypeKey,
  tier: number = 1,
): number {
  const config = STRUCTURE_CONFIGS[type];
  return config.health + (tier - 1) * config.upgradeHealthBonus;
}

// Per-unit-type configuration
export interface UnitTypeConfig {
  health: number; // HP for this unit type
  speed: number; // Movement speed (pixels/sec), 0 for stationary
  dps: number; // Damage per second
  range: number; // Combat range in pixels
  fireInterval: number; // Seconds between shots
  projectileDamage?: number; // If set, deals instant damage instead of DPS
  projectileType?: ProjectileType; // Visual type of projectile (default: PlasmaOrb)
  areaRadius?: number; // Area of effect radius for splash damage
  shieldRadius?: number; // Shield protection radius
  shieldHealth?: number; // Shield HP (regenerates when not taking damage)
  shieldRegenTime?: number; // Seconds to fully regenerate shield from 0 to max
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
  // Per-unit attack order (direct targeting)
  attackOrderX?: number; // Attack order target X
  attackOrderY?: number; // Attack order target Y
  hasAttackOrder?: boolean; // Whether unit has an active attack order
  // Boarding state for units heading to transporter
  isBoardingTransporter?: boolean; // True if unit is heading to board a transporter
  boardingTargetX?: number; // X position of transporter to board
  boardingTargetY?: number; // Y position of transporter to board
  boardingTransporterId?: number; // ID of transporter this unit is boarding
  // Tier 2 warship missile barrage state
  barrageCount?: number; // Current number of missiles fired in this barrage (0-5)
  barrageCooldown?: number; // Cooldown between barrage volleys (short, for rapid fire)
  barragePhase?: number; // 0 = first volley of 5, 1 = second volley of 5, then reload
  // Transporter-specific properties
  airportTile?: TileRef; // Which airport this transporter belongs to
  isFlying?: boolean; // Whether transporter is currently flying to destination
  heading?: number; // Direction transporter is facing (radians)
  // Boarding system for transporters
  boardingUnits?: number[]; // IDs of units currently moving toward this transporter
  boardedUnits?: number[]; // IDs of units that have boarded
  maxBoardingCapacity?: number; // Max units that can board (default 5)
  isWaitingForBoarding?: boolean; // True while waiting for units to board
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
  projectileType?: ProjectileType; // Visual type (replaces isBeam, isElite, etc.)
  areaRadius?: number; // Splash damage radius
  damage?: number; // Damage to deal on impact
  startX?: number; // Beam/laser origin X
  startY?: number; // Beam/laser origin Y
  targetX?: number; // Target position X (for artillery/missiles)
  targetY?: number; // Target position Y (for artillery/missiles)
}

/**
 * Base structure interface for all Frenzy buildings
 */
export interface FrenzyStructure {
  id: number; // Unique structure ID
  type: FrenzyStructureType;
  playerId: PlayerID;
  x: number; // Pixel coordinates
  y: number;
  tile: TileRef;
  tier: number; // Structure tier (1 = base, 2+ = upgraded)
  health: number; // Current HP
  maxHealth: number; // Max HP
  // Spawner properties (for HQ, Factory, Port)
  spawnTimer?: number; // Seconds until next spawn
  spawnInterval?: number; // Seconds between spawns
  unitCount?: number; // Only for HQ - total units spawned
  // Construction properties
  constructionProgress?: number; // 0-1 for buildings under construction
  isConstruction?: boolean; // True while building
}

/**
 * HQ building (spawns soldiers, main base)
 */
export interface CoreBuilding extends FrenzyStructure {
  type: FrenzyStructureType.HQ;
  spawnTimer: number;
  spawnInterval: number;
  unitCount: number;
}

/**
 * Factory building (spawns soldiers/elite soldiers)
 */
export interface FactorySpawner extends FrenzyStructure {
  type: FrenzyStructureType.Factory;
  spawnTimer: number;
  spawnInterval: number;
}

/**
 * Port building (spawns warships)
 */
export interface PortSpawner extends FrenzyStructure {
  type: FrenzyStructureType.Port;
  spawnTimer: number;
  spawnInterval: number;
}

/**
 * Airport building (spawns transporters)
 */
export interface AirportSpawner extends FrenzyStructure {
  type: FrenzyStructureType.Airport;
  spawnTimer: number;
  spawnInterval: number;
  hasTransporter: boolean; // Whether the airport currently has a transporter
}

/**
 * Mine building (generates gold from crystals)
 */
export interface MineStructure extends FrenzyStructure {
  type: FrenzyStructureType.Mine;
}

/**
 * MiniHQ building - spawned by transporter landing
 * Captures territory around it and prevents annexation.
 * If destroyed/captured, all territory not connected to main HQ is lost.
 */
export interface MiniHQStructure extends FrenzyStructure {
  type: FrenzyStructureType.MiniHQ;
  capturedTiles: Set<TileRef>; // Tiles captured by this MiniHQ
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
    // Mobile units
    soldier: UnitTypeConfig;
    eliteSoldier: UnitTypeConfig;
    warship: UnitTypeConfig;
    eliteWarship: UnitTypeConfig;
    transporter: UnitTypeConfig;
    // Towers
    defensePost: UnitTypeConfig;
    eliteDefensePost: UnitTypeConfig;
    samLauncher: UnitTypeConfig;
    missileSilo: UnitTypeConfig;
    shieldGenerator: UnitTypeConfig;
    eliteShieldGenerator: UnitTypeConfig;
    artillery: UnitTypeConfig;
    eliteArtillery: UnitTypeConfig;
  };

  // Spawning
  spawnInterval: number; // Seconds between spawns (default: 4.0)
  maxUnitsPerPlayer: number; // Hard cap (default: 60)
  maxWarshipsPerPlayer: number; // Ship cap (default: 20)
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

  // Buildings - DEPRECATED: Use STRUCTURE_CONFIGS instead
  // Kept for backward compatibility
  hqCaptureRadius: number; // Tiles around HQ that must fall before defeat (default: 2 tiles)
  mineHealth: number; // HP for mines/factories (default: 400)
  hqHealth: number; // HP for HQ (default: 1000)

  // Economy - DEPRECATED: Use STRUCTURE_CONFIGS instead for costs
  // Kept for backward compatibility
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
    case FrenzyUnitType.Warship:
      return config.units.warship;
    case FrenzyUnitType.Transporter:
      return config.units.transporter;
    case FrenzyUnitType.DefensePost:
      return config.units.defensePost;
    case FrenzyUnitType.SAMLauncher:
      return config.units.samLauncher;
    case FrenzyUnitType.MissileSilo:
      return config.units.missileSilo;
    case FrenzyUnitType.ShieldGenerator:
      return config.units.shieldGenerator;
    case FrenzyUnitType.Artillery:
      return config.units.artillery;
    default:
      return config.units.soldier;
  }
}

export const DEFAULT_FRENZY_CONFIG: FrenzyConfig = {
  // Unit configurations
  units: {
    // Mobile units
    soldier: {
      health: 100,
      speed: 2.5,
      dps: 15,
      range: 25,
      fireInterval: 1,
      projectileType: ProjectileType.PlasmaOrb,
    },
    eliteSoldier: {
      health: 150, // 1.5x soldier health
      speed: 2.25, // 10% slower than soldier
      dps: 15,
      range: 37.5, // 1.5x soldier range
      fireInterval: 1,
      projectileType: ProjectileType.GoldenOrb,
    },
    warship: {
      health: 250, // Tough naval unit
      speed: 2.0, // Slower than land units
      dps: 20, // Strong damage
      range: 50, // Long range - can hit land from water
      fireInterval: 1.5, // Moderate fire rate
      projectileDamage: 50, // Good projectile damage
      projectileType: ProjectileType.Laser, // Always use lasers
    },
    eliteWarship: {
      health: 375, // 1.5x warship health (250 * 1.5)
      speed: 2.0, // Same speed as tier 1
      dps: 30, // 1.5x warship dps
      range: 300, // 2x warship range (45 * 2) - long range missiles
      fireInterval: 8.0, // Slow reload (fires barrages)
      projectileDamage: 30, // Per-missile damage (fires 2x5 = 10 missiles)
      areaRadius: 5, // Small AOE per missile
      projectileType: ProjectileType.Missile, // Missile barrages
    },
    transporter: {
      health: 150, // Moderate health
      speed: 10.0, // Double soldier speed (2.5 * 2)
      dps: 0, // No attack
      range: 0, // No attack range
      fireInterval: 0, // No firing
    },
    // Towers - health values come from STRUCTURE_CONFIGS
    defensePost: {
      health: STRUCTURE_CONFIGS.defensePost.health,
      speed: 0, // Stationary
      dps: 0, // Uses projectileDamage instead
      range: 30, // Same as soldier (tier 2: 37.5)
      fireInterval: 0.5, // Double soldier fire rate (tier 2: 4.0)
      projectileDamage: 20, // Same as soldier damage (tier 2: 100, one-shots units)
      projectileType: ProjectileType.GreenOrb, // Always use green orbs
    },
    eliteDefensePost: {
      health:
        STRUCTURE_CONFIGS.defensePost.health +
        STRUCTURE_CONFIGS.defensePost.upgradeHealthBonus, // tier 2 health
      speed: 0, // Stationary
      dps: 0, // Uses projectileDamage instead
      range: 50, // 1.5x defense post range
      fireInterval: 4.0, // Slower but one-shots
      projectileDamage: 100, // One-shots most units
      projectileType: ProjectileType.Laser, // Tier 2: red beam
    },
    samLauncher: {
      health: STRUCTURE_CONFIGS.samLauncher.health,
      speed: 0, // Stationary
      dps: 0, // Uses projectileDamage instead
      range: 60, // Good anti-air range
      fireInterval: 2.0, // Moderate fire rate
      projectileDamage: 100, // High damage to aircraft
      projectileType: ProjectileType.Missile,
    },
    missileSilo: {
      health: STRUCTURE_CONFIGS.missileSilo.health,
      speed: 0, // Stationary
      dps: 0, // Uses missiles
      range: 0, // Global range via missiles
      fireInterval: 0, // Manual launching
    },
    shieldGenerator: {
      health: STRUCTURE_CONFIGS.shieldGenerator.health,
      speed: 0, // Stationary
      dps: 0, // No attack
      range: 0, // No attack range
      fireInterval: 0, // No firing
      shieldRadius: 30, // Protection radius
      shieldHealth: 1500, // Shield absorbs 500 damage before breaking
      shieldRegenTime: 10, // 10 seconds to fully regenerate
    },
    eliteShieldGenerator: {
      health:
        STRUCTURE_CONFIGS.shieldGenerator.health +
        STRUCTURE_CONFIGS.shieldGenerator.upgradeHealthBonus, // tier 2 health
      speed: 0, // Stationary
      dps: 0, // No attack
      range: 0, // No attack range
      fireInterval: 0, // No firing
      shieldRadius: 45, // 1.5x protection radius
      shieldHealth: 3000, // 2x shield HP
      shieldRegenTime: 12, // Faster regen (12 seconds)
    },
    artillery: {
      health: STRUCTURE_CONFIGS.artillery.health,
      speed: 0, // Stationary
      dps: 0, // Uses projectileDamage instead
      range: 80, // Very long range
      fireInterval: 8.0, // Very slow firing, long cooldown
      projectileDamage: 100, // High damage
      areaRadius: 15, // Splash damage radius
      projectileType: ProjectileType.Artillery,
    },
    eliteArtillery: {
      health:
        STRUCTURE_CONFIGS.artillery.health +
        STRUCTURE_CONFIGS.artillery.upgradeHealthBonus, // tier 2 health
      speed: 0, // Stationary
      dps: 0, // Uses projectileDamage instead
      range: 120, // 1.5x range
      fireInterval: 8.0, // Faster firing
      projectileDamage: 150, // 1.5x damage
      areaRadius: 30, // Larger splash radius (~1.5x)
      projectileType: ProjectileType.Artillery,
    },
  },

  // Spawning
  spawnInterval: 4.0,
  maxUnitsPerPlayer: 150,
  maxWarshipsPerPlayer: 20,
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

  // Buildings - values now come from STRUCTURE_CONFIGS
  hqCaptureRadius: 2,
  mineHealth: STRUCTURE_CONFIGS.mine.health,
  hqHealth: STRUCTURE_CONFIGS.hq.health,

  // Economy - values now come from STRUCTURE_CONFIGS
  startingGold: 150000,
  baseGoldPerMinute: 20000,
  mineGoldPerMinute: STRUCTURE_CONFIGS.mine.goldPerMinute!,
  mineCost: STRUCTURE_CONFIGS.mine.buildCost,
  mineUpgradeCost: STRUCTURE_CONFIGS.mine.upgradeCost,
  factoryCost: STRUCTURE_CONFIGS.factory.buildCost,
  factoryUpgradeCost: STRUCTURE_CONFIGS.factory.upgradeCost,

  // Crystals (resources)
  crystalClusterCount: 50,
  crystalGoldBonus: 1000,
  mineGoldInterval: 10,
  mineRadius: 40,
};

/**
 * Structure upgrade configuration - DEPRECATED
 * Use STRUCTURE_CONFIGS instead
 * Kept for backward compatibility
 */
export interface StructureUpgradeInfo {
  requiredHQTier: number; // Minimum HQ tier required to upgrade this structure
  upgradeCost: number; // Gold cost for upgrade
  maxTier: number; // Maximum tier for this structure
}

/**
 * DEPRECATED: Use STRUCTURE_CONFIGS instead
 * Structure upgrade configurations for all upgradable structures
 */
export const STRUCTURE_UPGRADES: Record<string, StructureUpgradeInfo> = {
  // Buildings
  mine: {
    requiredHQTier: STRUCTURE_CONFIGS.mine.requiredHQTier,
    upgradeCost: STRUCTURE_CONFIGS.mine.upgradeCost,
    maxTier: STRUCTURE_CONFIGS.mine.maxTier,
  },
  factory: {
    requiredHQTier: STRUCTURE_CONFIGS.factory.requiredHQTier,
    upgradeCost: STRUCTURE_CONFIGS.factory.upgradeCost,
    maxTier: STRUCTURE_CONFIGS.factory.maxTier,
  },
  port: {
    requiredHQTier: STRUCTURE_CONFIGS.port.requiredHQTier,
    upgradeCost: STRUCTURE_CONFIGS.port.upgradeCost,
    maxTier: STRUCTURE_CONFIGS.port.maxTier,
  },
  // Towers
  defensePost: {
    requiredHQTier: STRUCTURE_CONFIGS.defensePost.requiredHQTier,
    upgradeCost: STRUCTURE_CONFIGS.defensePost.upgradeCost,
    maxTier: STRUCTURE_CONFIGS.defensePost.maxTier,
  },
  sam: {
    requiredHQTier: STRUCTURE_CONFIGS.samLauncher.requiredHQTier,
    upgradeCost: STRUCTURE_CONFIGS.samLauncher.upgradeCost,
    maxTier: STRUCTURE_CONFIGS.samLauncher.maxTier,
  },
  shield: {
    requiredHQTier: STRUCTURE_CONFIGS.shieldGenerator.requiredHQTier,
    upgradeCost: STRUCTURE_CONFIGS.shieldGenerator.upgradeCost,
    maxTier: STRUCTURE_CONFIGS.shieldGenerator.maxTier,
  },
  artillery: {
    requiredHQTier: STRUCTURE_CONFIGS.artillery.requiredHQTier,
    upgradeCost: STRUCTURE_CONFIGS.artillery.upgradeCost,
    maxTier: STRUCTURE_CONFIGS.artillery.maxTier,
  },
  silo: {
    requiredHQTier: STRUCTURE_CONFIGS.missileSilo.requiredHQTier,
    upgradeCost: STRUCTURE_CONFIGS.missileSilo.upgradeCost,
    maxTier: STRUCTURE_CONFIGS.missileSilo.maxTier,
  },
};

export enum Stance {
  ATTACK = "ATTACK",
  DEFEND = "DEFEND",
  NEUTRAL = "NEUTRAL",
}
