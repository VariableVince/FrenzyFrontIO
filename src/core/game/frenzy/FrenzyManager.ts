import { PseudoRandom } from "../../PseudoRandom";
import {
  Game,
  Player,
  PlayerID,
  PlayerType,
  TerraNullius,
  Unit,
  UnitType,
} from "../Game";
import { TileRef } from "../GameMap";
import {
  CoreBuilding,
  CrystalCluster,
  DEFAULT_FRENZY_CONFIG,
  FactorySpawner,
  FrenzyConfig,
  FrenzyProjectile,
  FrenzyStructure,
  FrenzyStructureType,
  FrenzyUnit,
  FrenzyUnitType,
  getUnitConfig,
  MineStructure,
  PortSpawner,
  STRUCTURE_UPGRADES,
  UnitTypeConfig,
} from "./FrenzyTypes";
import { SpatialHashGrid } from "./SpatialHashGrid";

/**
 * FrenzyManager handles all unit-based warfare logic for Frenzy mode
 * ALL structures (HQ, Mine, Factory, Port) and units are managed here.
 */
export class FrenzyManager {
  private units: FrenzyUnit[] = [];
  private coreBuildings: Map<PlayerID, CoreBuilding> = new Map(); // HQs
  private mines: Map<TileRef, MineStructure> = new Map(); // Mines
  private factories: Map<TileRef, FactorySpawner> = new Map(); // Factories
  private ports: Map<TileRef, PortSpawner> = new Map(); // Ports
  private crystals: CrystalCluster[] = [];
  private nextCrystalId = 1;
  private nextStructureId = 1;
  private spatialGrid: SpatialHashGrid;
  private nextUnitId = 1;
  private nextProjectileId = 1;
  private projectiles: FrenzyProjectile[] = [];
  private config: FrenzyConfig;
  private defeatedPlayers = new Set<PlayerID>();

  // Mine gold payout tracking
  private mineGoldTimer = 0; // Seconds until next mine gold payout
  private pendingGoldPayouts: Array<{
    playerId: PlayerID;
    x: number;
    y: number;
    gold: number;
    crystals?: Array<{ x: number; y: number; count: number }>;
    cellArea?: number;
  }> = [];

  // Defensive stance per player: 0 = stay near HQ, 0.5 = fire range, 1 = offensive (border)
  private playerDefensiveStance: Map<PlayerID, number> = new Map();

  // Performance: Cache territory data and only rebuild periodically
  private territoryCache: Map<PlayerID, PlayerTerritorySnapshot> = new Map();
  private territoryCacheTick = 0;
  private readonly TERRITORY_CACHE_INTERVAL = 5; // Rebuild every 5 ticks

  // Performance: Track tick count for staggered updates
  private tickCount = 0;

  // Performance profiling: stores last tick breakdown
  private lastTickBreakdown: Record<string, number> = {};

  // Deterministic random number generator (seeded for multiplayer sync)
  private random: PseudoRandom;

  constructor(
    private game: Game,
    config?: Partial<FrenzyConfig>,
  ) {
    // Deep merge for nested unit configs
    if (config?.units) {
      this.config = {
        ...DEFAULT_FRENZY_CONFIG,
        ...config,
        units: {
          // Mobile units
          soldier: {
            ...DEFAULT_FRENZY_CONFIG.units.soldier,
            ...config.units.soldier,
          },
          eliteSoldier: {
            ...DEFAULT_FRENZY_CONFIG.units.eliteSoldier,
            ...config.units.eliteSoldier,
          },
          warship: {
            ...DEFAULT_FRENZY_CONFIG.units.warship,
            ...config.units.warship,
          },
          eliteWarship: {
            ...DEFAULT_FRENZY_CONFIG.units.eliteWarship,
            ...config.units.eliteWarship,
          },
          // Towers
          defensePost: {
            ...DEFAULT_FRENZY_CONFIG.units.defensePost,
            ...config.units.defensePost,
          },
          eliteDefensePost: {
            ...DEFAULT_FRENZY_CONFIG.units.eliteDefensePost,
            ...config.units.eliteDefensePost,
          },
          samLauncher: {
            ...DEFAULT_FRENZY_CONFIG.units.samLauncher,
            ...config.units.samLauncher,
          },
          missileSilo: {
            ...DEFAULT_FRENZY_CONFIG.units.missileSilo,
            ...config.units.missileSilo,
          },
          shieldGenerator: {
            ...DEFAULT_FRENZY_CONFIG.units.shieldGenerator,
            ...config.units.shieldGenerator,
          },
          eliteShieldGenerator: {
            ...DEFAULT_FRENZY_CONFIG.units.eliteShieldGenerator,
            ...config.units.eliteShieldGenerator,
          },
          artillery: {
            ...DEFAULT_FRENZY_CONFIG.units.artillery,
            ...config.units.artillery,
          },
          eliteArtillery: {
            ...DEFAULT_FRENZY_CONFIG.units.eliteArtillery,
            ...config.units.eliteArtillery,
          },
        },
      };
    } else {
      this.config = { ...DEFAULT_FRENZY_CONFIG, ...config };
    }
    this.spatialGrid = new SpatialHashGrid(50); // 50px cell size
    // Use game ticks as seed for deterministic randomness in multiplayer
    this.random = new PseudoRandom(this.game.ticks());
    // Generate crystals immediately so they're visible during spawn selection
    this.generateCrystals();
  }

  /**
   * Get the current Frenzy configuration
   */
  getConfig(): FrenzyConfig {
    return this.config;
  }

  /**
   * Set the defensive stance for a player
   * @param playerId The player ID
   * @param stance 0 = defensive (near HQ), 0.5 = balanced (fire range), 1 = offensive (border)
   */
  setPlayerDefensiveStance(playerId: PlayerID, stance: number) {
    const newStance = Math.max(0, Math.min(1, stance));
    const oldStance = this.playerDefensiveStance.get(playerId);

    // Only update if stance actually changed
    if (oldStance !== undefined && Math.abs(oldStance - newStance) < 0.01) {
      return;
    }

    this.playerDefensiveStance.set(playerId, newStance);

    // Force all units of this player to retarget
    for (const unit of this.units) {
      if (
        unit.playerId === playerId &&
        unit.unitType !== FrenzyUnitType.DefensePost
      ) {
        // Reset target to force recalculation
        unit.targetX = unit.x;
        unit.targetY = unit.y;
      }
    }
  }

  /**
   * Get the max units cap for a player.
   * Bots get half the cap of humans and nations (FakeHumans).
   */
  getMaxUnitsForPlayer(playerId: PlayerID): number {
    const player = this.game.player(playerId);
    if (player && player.type() === PlayerType.Bot) {
      return Math.floor(this.config.maxUnitsPerPlayer / 2);
    }
    return this.config.maxUnitsPerPlayer;
  }

  /**
   * Get the max warship cap for a player.
   * Bots get half the cap.
   */
  getMaxWarshipsForPlayer(playerId: PlayerID): number {
    const player = this.game.player(playerId);
    if (player && player.type() === PlayerType.Bot) {
      return Math.floor(this.config.maxWarshipsPerPlayer / 2);
    }
    return this.config.maxWarshipsPerPlayer;
  }

  /**
   * Count the number of warships owned by a player.
   */
  getWarshipCount(playerId: PlayerID): number {
    let count = 0;
    for (const unit of this.units) {
      if (
        unit.playerId === playerId &&
        unit.unitType === FrenzyUnitType.Warship
      ) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get the defensive stance for a player.
   * For bots/FakeHumans, returns a random value if not explicitly set.
   * Bots: 10% under medium (0-0.5), 90% between medium and aggressive (0.5-1.0)
   * For human players, defaults to 1.0 (offensive).
   */
  getPlayerDefensiveStance(playerId: PlayerID): number {
    const existingStance = this.playerDefensiveStance.get(playerId);
    if (existingStance !== undefined) {
      return existingStance;
    }

    // For bots and fake humans, use random stance with distribution
    const player = this.game.player(playerId);
    if (
      player &&
      (player.type() === PlayerType.Bot ||
        player.type() === PlayerType.FakeHuman)
    ) {
      let randomStance: number;
      if (this.random.next() < 0.1) {
        // 10% chance: under medium (0 to 0.5)
        randomStance = this.random.next() * 0.5;
      } else {
        // 90% chance: medium to aggressive (0.5 to 1.0)
        randomStance = 0.5 + this.random.next() * 0.5;
      }
      this.playerDefensiveStance.set(playerId, randomStance);
      return randomStance;
    }

    // Default for human players
    return 1.0;
  }

  updateConfig(overrides: Partial<FrenzyConfig>) {
    // Deep merge for nested unit configs
    if (overrides.units) {
      this.config = {
        ...this.config,
        ...overrides,
        units: {
          // Mobile units
          soldier: { ...this.config.units.soldier, ...overrides.units.soldier },
          eliteSoldier: {
            ...this.config.units.eliteSoldier,
            ...overrides.units.eliteSoldier,
          },
          warship: {
            ...this.config.units.warship,
            ...overrides.units.warship,
          },
          eliteWarship: {
            ...this.config.units.eliteWarship,
            ...overrides.units.eliteWarship,
          },
          // Towers
          defensePost: {
            ...this.config.units.defensePost,
            ...overrides.units.defensePost,
          },
          eliteDefensePost: {
            ...this.config.units.eliteDefensePost,
            ...overrides.units.eliteDefensePost,
          },
          samLauncher: {
            ...this.config.units.samLauncher,
            ...overrides.units.samLauncher,
          },
          missileSilo: {
            ...this.config.units.missileSilo,
            ...overrides.units.missileSilo,
          },
          shieldGenerator: {
            ...this.config.units.shieldGenerator,
            ...overrides.units.shieldGenerator,
          },
          eliteShieldGenerator: {
            ...this.config.units.eliteShieldGenerator,
            ...overrides.units.eliteShieldGenerator,
          },
          artillery: {
            ...this.config.units.artillery,
            ...overrides.units.artillery,
          },
          eliteArtillery: {
            ...this.config.units.eliteArtillery,
            ...overrides.units.eliteArtillery,
          },
        },
      };
    } else {
      this.config = { ...this.config, ...overrides };
    }

    for (const building of this.coreBuildings.values()) {
      building.spawnInterval = this.config.spawnInterval;
      building.spawnTimer = Math.min(
        building.spawnTimer,
        building.spawnInterval,
      );
    }
    if (overrides.maxUnitsPerPlayer !== undefined) {
      this.enforceUnitCaps();
    }
  }

  /**
   * Initialize core buildings at player spawn positions
   */
  init() {
    console.log(
      `[FrenzyManager] Initialized, will place HQs when players spawn`,
    );
  }

  /**
   * Called when a player spawns to create their HQ
   */
  onPlayerSpawn(playerId: string) {
    // Check if already has HQ
    if (this.coreBuildings.has(playerId)) {
      return;
    }

    const player = this.game.player(playerId);
    const tiles = Array.from(player.tiles());

    if (tiles.length === 0) {
      console.warn(`[FrenzyManager] Player ${player.name()} has no tiles yet`);
      return;
    }

    // Place HQ at the center of player's starting territory
    const spawnTile = tiles[0];
    const spawnPos = {
      x: this.game.x(spawnTile),
      y: this.game.y(spawnTile),
    };

    console.log(
      `[FrenzyManager] Creating HQ for ${player.name()} at (${Math.round(spawnPos.x)}, ${Math.round(spawnPos.y)})`,
    );

    this.coreBuildings.set(playerId, {
      id: this.nextStructureId++,
      type: FrenzyStructureType.HQ,
      playerId: playerId,
      x: spawnPos.x,
      y: spawnPos.y,
      tile: spawnTile,
      spawnTimer: this.config.spawnInterval,
      spawnInterval: this.config.spawnInterval,
      unitCount: 0,
      tier: 1,
      health: this.config.hqHealth,
      maxHealth: this.config.hqHealth,
    });

    // Spawn initial units
    for (let i = 0; i < this.config.startingUnits; i++) {
      this.spawnUnit(playerId, spawnPos.x, spawnPos.y);
    }
  }

  /**
   * Main tick function called every game tick
   */
  tick(deltaTime: number) {
    // Only spawn units after spawn phase is complete
    if (this.game.inSpawnPhase()) {
      return;
    }

    this.tickCount++;

    // Profiling: always track time for each operation
    const times: Record<string, number> = {};
    const mark = (name: string) => {
      times[name] = performance.now();
    };

    mark("start");

    // Check for newly spawned players and create their HQs
    // Performance: Use numTilesOwned() instead of tiles() to avoid creating a Set copy
    for (const player of this.game.players()) {
      if (player.numTilesOwned() > 0 && !this.coreBuildings.has(player.id())) {
        this.onPlayerSpawn(player.id());
      }
    }

    mark("checkPlayers");

    this.updateSpawnTimers(deltaTime);
    mark("spawnTimers");

    this.updateMineGoldPayouts(deltaTime);
    mark("minePayouts");

    // Performance: Only rebuild territory cache periodically
    if (
      this.tickCount - this.territoryCacheTick >=
      this.TERRITORY_CACHE_INTERVAL
    ) {
      this.territoryCache = this.buildTerritorySnapshots();
      this.territoryCacheTick = this.tickCount;
    }
    mark("territoryCache");

    this.updateUnits(deltaTime, this.territoryCache);
    mark("updateUnits");

    this.updateCombat(deltaTime);
    mark("updateCombat");

    this.updateProjectiles(deltaTime);
    mark("projectiles");

    this.captureTerritory();
    mark("captureTerritory");

    // TODO: captureSurroundedWilderness disabled - needs rewrite with incremental approach
    // this.captureSurroundedWilderness();
    this.checkAllHQCaptures();
    mark("hqCaptures");

    this.removeDeadUnits();
    mark("removeDeadUnits");

    this.rebuildSpatialGrid();
    mark("rebuildSpatialGrid");

    // Store breakdown for performance overlay
    const keys = Object.keys(times);
    this.lastTickBreakdown = {};
    for (let i = 1; i < keys.length; i++) {
      this.lastTickBreakdown[keys[i]] = times[keys[i]] - times[keys[i - 1]];
    }
    // Calculate total
    this.lastTickBreakdown["_total"] =
      times[keys[keys.length - 1]] - times["start"];
  }

  /**
   * Get the breakdown of time spent in each tick operation
   */
  getTickBreakdown(): Record<string, number> {
    return this.lastTickBreakdown;
  }

  private updateSpawnTimers(deltaTime: number) {
    // Spawn from HQs
    for (const [playerId, building] of this.coreBuildings) {
      building.spawnTimer -= deltaTime;

      if (
        building.spawnTimer <= 0 &&
        building.unitCount < this.getMaxUnitsForPlayer(playerId)
      ) {
        this.spawnUnit(playerId, building.x, building.y);
        building.spawnTimer = building.spawnInterval;
      }
    }

    // Spawn from factories
    for (const [tile, factory] of this.factories) {
      // Check if factory still exists and is owned by same player
      const owner = this.game.owner(tile);
      if (!owner.isPlayer() || owner.id() !== factory.playerId) {
        this.factories.delete(tile);
        continue;
      }

      const building = this.coreBuildings.get(factory.playerId);
      if (!building) continue;

      factory.spawnTimer -= deltaTime;

      if (
        factory.spawnTimer <= 0 &&
        building.unitCount < this.getMaxUnitsForPlayer(factory.playerId)
      ) {
        // Tier 2 factories spawn elite soldiers
        const unitType =
          factory.tier >= 2
            ? FrenzyUnitType.EliteSoldier
            : FrenzyUnitType.Soldier;
        this.spawnUnit(factory.playerId, factory.x, factory.y, unitType);
        factory.spawnTimer = factory.spawnInterval;
      }
    }

    // Spawn warships from ports
    for (const [tile, port] of this.ports) {
      // Check if port still exists and is owned by same player
      const owner = this.game.owner(tile);
      if (!owner.isPlayer() || owner.id() !== port.playerId) {
        this.ports.delete(tile);
        continue;
      }

      const building = this.coreBuildings.get(port.playerId);
      if (!building) continue;

      port.spawnTimer -= deltaTime;

      // Check both total unit cap AND warship-specific cap
      const underUnitCap =
        building.unitCount < this.getMaxUnitsForPlayer(port.playerId);
      const underWarshipCap =
        this.getWarshipCount(port.playerId) <
        this.getMaxWarshipsForPlayer(port.playerId);

      if (port.spawnTimer <= 0 && underUnitCap && underWarshipCap) {
        // Find a water tile near the port to spawn the warship
        const waterSpawn = this.findWaterSpawnNearPort(port.x, port.y);
        if (waterSpawn) {
          // Use port tier from FrenzyManager's port object (set by upgradePort)
          const portTier = port.tier ?? 1;

          this.spawnUnit(
            port.playerId,
            waterSpawn.x,
            waterSpawn.y,
            FrenzyUnitType.Warship,
            portTier, // Tier 2 ports spawn tier 2 warships
          );
        }
        port.spawnTimer = port.spawnInterval;
      }
    }
  }

  /**
   * Generate crystal clusters on the map
   * Higher density toward the center of the map
   */
  private generateCrystals() {
    const mapWidth = this.game.width();
    const mapHeight = this.game.height();
    const centerX = mapWidth / 2;
    const centerY = mapHeight / 2;
    const maxRadius = Math.min(mapWidth, mapHeight) / 2;

    const count = this.config.crystalClusterCount;

    for (let i = 0; i < count; i++) {
      // Use gaussian-like distribution favoring center
      // Square root of random gives higher density toward center
      const distFactor = Math.sqrt(this.random.next()) * 0.85; // 0.85 to keep some space from edges
      const angle = this.random.next() * Math.PI * 2;

      const x = centerX + Math.cos(angle) * distFactor * maxRadius;
      const y = centerY + Math.sin(angle) * distFactor * maxRadius;

      // Only place on land
      const tile = this.game.ref(Math.floor(x), Math.floor(y));
      if (!tile || this.game.isWater(tile)) {
        continue;
      }

      // Random cluster size (1-5 crystals), higher chance for more crystals near center
      const centerBonus = 1 - distFactor; // 0-1, higher near center
      const crystalCount = Math.min(
        5,
        Math.max(1, Math.floor(1 + centerBonus * 3 + this.random.next() * 2)),
      );

      // Random rotations for each crystal in the cluster (bottom anchored, tilt up to 30 degrees each way)
      const rotations: number[] = [];
      for (let j = 0; j < crystalCount; j++) {
        rotations.push((this.random.next() - 0.5) * (Math.PI / 3));
      }

      this.crystals.push({
        id: this.nextCrystalId++,
        x,
        y,
        tile,
        crystalCount,
        rotations,
      });
    }
  }

  /**
   * Update mine gold payouts - every 10 seconds, mines pay gold based on their Voronoi territory.
   * Territory is: owned land within mineRadius, closer to this mine than any other.
   * Gold = base amount + (area of cell) + (crystals inside cell bonus)
   */
  private updateMineGoldPayouts(deltaTime: number) {
    this.mineGoldTimer -= deltaTime;

    // Clear pending payouts from previous tick
    this.pendingGoldPayouts = [];

    if (this.mineGoldTimer <= 0) {
      this.mineGoldTimer = this.config.mineGoldInterval;
      const mineRadius = this.config.mineRadius;

      // Collect all mines from FrenzyManager (not game units)
      const allMines: Array<{
        structure: FrenzyStructure;
        player: Player;
        x: number;
        y: number;
        tile: TileRef;
      }> = [];

      for (const mine of this.mines.values()) {
        const player = this.game.player(mine.playerId);
        if (!player) continue;
        allMines.push({
          structure: mine,
          player,
          x: mine.x,
          y: mine.y,
          tile: mine.tile,
        });
      }

      // Calculate gold for each mine based on Voronoi territory
      for (const mine of allMines) {
        let cellArea = 0; // Count of sampled points in cell
        const crystalsInCell: Array<{ x: number; y: number; count: number }> =
          [];

        // Check crystals - must be within mineRadius AND in Voronoi cell AND on owned territory
        for (const crystal of this.crystals) {
          const distToThis = Math.hypot(crystal.x - mine.x, crystal.y - mine.y);

          // Must be within mine radius
          if (distToThis > mineRadius) continue;

          // Must be on owned territory
          const crystalTile = this.game.ref(
            Math.floor(crystal.x),
            Math.floor(crystal.y),
          );
          if (!crystalTile) continue;
          const tileOwner = this.game.owner(crystalTile);
          if (!tileOwner || tileOwner.id() !== mine.player.id()) continue;

          // Must be closer to this mine than any other (Voronoi)
          let isClosest = true;
          for (const otherMine of allMines) {
            if (otherMine === mine) continue;
            const distToOther = Math.hypot(
              crystal.x - otherMine.x,
              crystal.y - otherMine.y,
            );
            if (distToOther < distToThis) {
              isClosest = false;
              break;
            }
          }

          if (isClosest) {
            crystalsInCell.push({
              x: crystal.x,
              y: crystal.y,
              count: crystal.crystalCount,
            });
          }
        }

        // Sample owned tiles within mineRadius to calculate cell area
        const sampleStep = 4; // Check every 4 pixels for better accuracy
        const ownerPlayer = mine.player;

        for (
          let sx = mine.x - mineRadius;
          sx <= mine.x + mineRadius;
          sx += sampleStep
        ) {
          for (
            let sy = mine.y - mineRadius;
            sy <= mine.y + mineRadius;
            sy += sampleStep
          ) {
            // Must be within circular radius
            const distToMine = Math.hypot(sx - mine.x, sy - mine.y);
            if (distToMine > mineRadius) continue;

            const tile = this.game.ref(Math.floor(sx), Math.floor(sy));
            if (!tile) continue;

            // Must be owned by this player
            const tileOwner = this.game.owner(tile);
            if (!tileOwner || tileOwner.id() !== ownerPlayer.id()) continue;

            // Must be in Voronoi cell (closest to this mine)
            let isClosest = true;
            for (const otherMine of allMines) {
              if (otherMine === mine) continue;
              const distToOther = Math.hypot(
                sx - otherMine.x,
                sy - otherMine.y,
              );
              if (distToOther < distToMine) {
                isClosest = false;
                break;
              }
            }

            if (isClosest) {
              cellArea++;
            }
          }
        }

        // Calculate gold: base income + area bonus + crystal bonus
        // Tier 2 mines double the gold generation
        const tierMultiplier = mine.structure.tier >= 2 ? 2 : 1;
        const baseGold = Math.round(
          (this.config.mineGoldPerMinute / 60) *
            this.config.mineGoldInterval *
            tierMultiplier,
        );
        // Each sampled point represents ~16 sq pixels (4x4 area)
        const areaGold = cellArea * 5 * tierMultiplier; // 5 gold per sampled point
        const crystalCount = crystalsInCell.reduce(
          (sum, c) => sum + c.count,
          0,
        );
        const crystalBonus =
          crystalCount * this.config.crystalGoldBonus * tierMultiplier;
        const totalGold = baseGold + areaGold + crystalBonus;

        if (totalGold > 0) {
          mine.player.addGold(BigInt(totalGold));

          // Queue floating text display with crystal positions for animation
          this.pendingGoldPayouts.push({
            playerId: mine.player.id(),
            x: mine.x,
            y: mine.y,
            gold: totalGold,
            crystals: crystalsInCell,
            cellArea,
          });
        }
      }
    }
  }

  /**
   * Count crystals within range of a position
   */
  countCrystalsInRange(x: number, y: number, range: number): number {
    let count = 0;
    for (const crystal of this.crystals) {
      const dist = Math.hypot(crystal.x - x, crystal.y - y);
      if (dist <= range) {
        count += crystal.crystalCount;
      }
    }
    return count;
  }

  private spawnUnit(
    playerId: PlayerID,
    x: number,
    y: number,
    unitType: FrenzyUnitType = FrenzyUnitType.Soldier,
    tier: number = 1,
  ) {
    const building = this.coreBuildings.get(playerId);
    if (!building) return;

    // Add small random offset so units don't stack (but not for defense posts or warships)
    const isDefensePost = unitType === FrenzyUnitType.DefensePost;
    const isWarship = unitType === FrenzyUnitType.Warship;
    const offsetX =
      isDefensePost || isWarship ? 0 : (this.random.next() - 0.5) * 20;
    const offsetY =
      isDefensePost || isWarship ? 0 : (this.random.next() - 0.5) * 20;

    const spawnX = x + offsetX;
    const spawnY = y + offsetY;

    // For warships, verify spawn position is on water
    if (isWarship) {
      const floorX = Math.floor(spawnX);
      const floorY = Math.floor(spawnY);
      if (!this.game.isValidCoord(floorX, floorY)) {
        console.warn(
          `[FrenzyManager] Warship spawn aborted - position out of bounds: ${spawnX}, ${spawnY}`,
        );
        return;
      }
      const tile = this.game.ref(floorX, floorY);
      if (!tile || !this.game.isWater(tile)) {
        console.warn(
          `[FrenzyManager] Warship spawn aborted - position not on water: ${spawnX}, ${spawnY}`,
        );
        return; // Don't spawn on land
      }
    }

    // Get unit-specific configuration
    const unitConfig = getUnitConfig(this.config, unitType);
    let health = unitConfig.health;
    const fireInterval = unitConfig.fireInterval;

    // Tier 2 warships get 50% more health
    if (unitType === FrenzyUnitType.Warship && tier >= 2) {
      health = Math.floor(health * 1.5);
    }

    const unit: FrenzyUnit = {
      id: this.nextUnitId++,
      playerId,
      x: spawnX,
      y: spawnY,
      vx: 0,
      vy: 0,
      health,
      maxHealth: health,
      targetX: spawnX,
      targetY: spawnY,
      weaponCooldown: this.random.next() * fireInterval,
      unitType,
      fireInterval,
      tier, // Use provided tier
    };

    // Initialize shield for shield generators
    if (
      unitType === FrenzyUnitType.ShieldGenerator &&
      unitConfig.shieldHealth
    ) {
      unit.shieldHealth = unitConfig.shieldHealth;
      unit.maxShieldHealth = unitConfig.shieldHealth;
      unit.shieldRegenTimer = 0;
    }

    this.units.push(unit);
    building.unitCount++;
  }

  private updateUnits(
    deltaTime: number,
    territories: Map<PlayerID, PlayerTerritorySnapshot>,
  ) {
    // Performance: Use squared distances to avoid sqrt calls
    const RETARGET_DISTANCE_SQ = 15 * 15; // Recalculate when within this distance of target
    const ATTACK_ORDER_ARRIVAL_DISTANCE_SQ = 20 * 20; // Clear attack order when this close to target

    for (const unit of this.units) {
      if (this.defeatedPlayers.has(unit.playerId)) {
        continue;
      }
      // Defense posts, artillery, and shield generators don't move
      if (
        unit.unitType === FrenzyUnitType.DefensePost ||
        unit.unitType === FrenzyUnitType.Artillery ||
        unit.unitType === FrenzyUnitType.ShieldGenerator ||
        unit.unitType === FrenzyUnitType.SAMLauncher ||
        unit.unitType === FrenzyUnitType.MissileSilo
      ) {
        continue;
      }

      // Warships have separate movement logic
      if (unit.unitType === FrenzyUnitType.Warship) {
        this.updateWarshipMovement(unit, deltaTime);
        continue;
      }

      const territory = territories.get(unit.playerId);

      // Check if unit has a per-unit attack order
      if (
        unit.hasAttackOrder &&
        unit.attackOrderX !== undefined &&
        unit.attackOrderY !== undefined
      ) {
        // Check if unit has arrived at attack order destination
        const dxAtk = unit.attackOrderX - unit.x;
        const dyAtk = unit.attackOrderY - unit.y;
        const distToAttackTargetSq = dxAtk * dxAtk + dyAtk * dyAtk;

        if (distToAttackTargetSq < ATTACK_ORDER_ARRIVAL_DISTANCE_SQ) {
          // Clear attack order - unit has arrived
          unit.hasAttackOrder = false;
          unit.attackOrderX = undefined;
          unit.attackOrderY = undefined;
        } else {
          // Keep moving toward attack order target
          unit.targetX = unit.attackOrderX;
          unit.targetY = unit.attackOrderY;
        }
      } else {
        // No attack order - use normal targeting logic
        const dxTgt = unit.targetX - unit.x;
        const dyTgt = unit.targetY - unit.y;
        const distToTargetSq = dxTgt * dxTgt + dyTgt * dyTgt;
        const needsNewTarget =
          distToTargetSq < RETARGET_DISTANCE_SQ ||
          (unit.targetX === 0 && unit.targetY === 0);

        if (needsNewTarget && territory) {
          // Calculate new target based on defensive stance
          const newTarget = this.calculateUnitTarget(
            unit,
            territory,
            undefined,
            false,
            undefined,
          );
          unit.targetX = newTarget.x;
          unit.targetY = newTarget.y;
        }
      }

      const dx = unit.targetX - unit.x;
      const dy = unit.targetY - unit.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const stopDistance = Math.max(0, this.config.stopDistance);
      if (dist > stopDistance) {
        // Get unit-specific speed
        const unitConfig = getUnitConfig(this.config, unit.unitType);
        const speed = unitConfig.speed;

        // Normalize direction
        unit.vx = (dx / dist) * speed;
        unit.vy = (dy / dist) * speed;

        // Apply separation from nearby friendlies
        this.applySeparation(unit);

        // Update position
        unit.x += unit.vx * deltaTime;
        unit.y += unit.vy * deltaTime;

        // Keep within map bounds
        unit.x = Math.max(0, Math.min(this.game.width(), unit.x));
        unit.y = Math.max(0, Math.min(this.game.height(), unit.y));
      } else {
        // At target, pick a new target on next tick
        unit.vx = 0;
        unit.vy = 0;
      }
    }
  }

  private calculateUnitTarget(
    unit: FrenzyUnit,
    territory: PlayerTerritorySnapshot,
    attackTargetPlayerId?: PlayerID,
    isAttackingUnit: boolean = false,
    clickPos?: { x: number; y: number },
  ): { x: number; y: number } {
    const { borderTiles, centroid } = territory;

    // Get player's HQ position for defensive stance calculations
    const playerHQ = this.coreBuildings.get(unit.playerId);
    const hqPos = playerHQ ? { x: playerHQ.x, y: playerHQ.y } : centroid;

    // Get defensive stance (0 = near HQ, 0.5 = fire range, 1 = offensive/border)
    // Attacking units always use offensive stance (1.0)
    const defensiveStance = isAttackingUnit
      ? 1.0
      : this.getPlayerDefensiveStance(unit.playerId);

    if (borderTiles.length === 0) {
      // Fallback: move toward map center if no borders found
      return {
        x: this.game.width() / 2,
        y: this.game.height() / 2,
      };
    }

    const unitPlayer = this.game.player(unit.playerId);

    // If attacking, get enemy HQ position for directional bias
    let enemyHQPos: { x: number; y: number } | null = null;
    if (attackTargetPlayerId) {
      const enemyHQ = this.coreBuildings.get(attackTargetPlayerId);
      if (enemyHQ) {
        enemyHQPos = { x: enemyHQ.x, y: enemyHQ.y };
      }
    }

    // Compute centroid of player's territory to bias radial expansion
    const cx = centroid.x;
    const cy = centroid.y;

    // Find the best enemy/neutral neighbor tile that aligns with the unit's radial direction
    let bestTile: number | null = null;
    let bestScore = Infinity;

    const ux = unit.x - cx;
    const uy = unit.y - cy;
    const uLen = Math.hypot(ux, uy) || 1;

    // Performance: Sample border tiles for faster calculation
    const MAX_TILES_TO_CHECK = 50;
    const tilesToCheck =
      borderTiles.length > MAX_TILES_TO_CHECK
        ? this.sampleArray(borderTiles, MAX_TILES_TO_CHECK)
        : borderTiles;

    for (const borderTile of tilesToCheck) {
      const neighbors = this.game.neighbors(borderTile);
      for (const neighbor of neighbors) {
        const neighborOwner = this.game.owner(neighbor);

        // Skip if we own this neighbor
        if (neighborOwner.id() === unit.playerId) {
          continue;
        }
        // Skip water
        if (this.game.isWater(neighbor)) {
          continue;
        }
        // Skip allied territory - units should not gather at allied borders
        if (
          neighborOwner.isPlayer() &&
          unitPlayer.isAlliedWith(neighborOwner)
        ) {
          continue;
        }

        const nx = this.game.x(neighbor);
        const ny = this.game.y(neighbor);

        // alignment with radial direction (higher is better)
        const vx = nx - cx;
        const vy = ny - cy;
        const vLen = Math.hypot(vx, vy) || 1;
        const alignment = (vx * ux + vy * uy) / (vLen * uLen); // -1..1

        const dist = Math.hypot(nx - unit.x, ny - unit.y);

        let alignmentBoost = Math.max(
          0.1,
          1 + this.config.radialAlignmentWeight * alignment,
        );

        // If attacking, add bonus for tiles in direction of enemy HQ
        if (enemyHQPos) {
          const hqDirX = enemyHQPos.x - unit.x;
          const hqDirY = enemyHQPos.y - unit.y;
          const hqDirLen = Math.hypot(hqDirX, hqDirY) || 1;
          const tileDirX = nx - unit.x;
          const tileDirY = ny - unit.y;
          const tileDirLen = Math.hypot(tileDirX, tileDirY) || 1;
          const hqAlignment =
            (hqDirX * tileDirX + hqDirY * tileDirY) / (hqDirLen * tileDirLen);
          // Boost score for tiles aligned with HQ direction
          alignmentBoost *= Math.max(0.5, 1 + hqAlignment * 0.5);
        }

        // If attacking with a click position, add bonus for tiles in that direction
        if (clickPos) {
          const clickDirX = clickPos.x - unit.x;
          const clickDirY = clickPos.y - unit.y;
          const clickDirLen = Math.hypot(clickDirX, clickDirY) || 1;
          const tileDirX = nx - unit.x;
          const tileDirY = ny - unit.y;
          const tileDirLen = Math.hypot(tileDirX, tileDirY) || 1;
          const clickAlignment =
            (clickDirX * tileDirX + clickDirY * tileDirY) /
            (clickDirLen * tileDirLen);
          // Boost score for tiles aligned with click direction
          alignmentBoost *= Math.max(0.5, 1 + clickAlignment * 0.5);
        }

        const score = dist / alignmentBoost;

        if (score < bestScore) {
          bestScore = score;
          bestTile = neighbor;
        }
      }
    }

    if (bestTile !== null) {
      // Calculate the offensive position (at or beyond border)
      const borderPos = {
        x: this.game.x(bestTile),
        y: this.game.y(bestTile),
      };

      let offensivePos: { x: number; y: number };
      if (this.config.borderAdvanceDistance > 0) {
        const dirX = borderPos.x - cx;
        const dirY = borderPos.y - cy;
        const dirLen = Math.hypot(dirX, dirY) || 1;
        offensivePos = {
          x: Math.max(
            0,
            Math.min(
              this.game.width(),
              borderPos.x + (dirX / dirLen) * this.config.borderAdvanceDistance,
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              this.game.height(),
              borderPos.y + (dirY / dirLen) * this.config.borderAdvanceDistance,
            ),
          ),
        };
      } else {
        offensivePos = borderPos;
      }

      // Calculate positions based on defensive stance
      // Stance 0: stay at fire range distance from all borders (defensive)
      // Stance 0.5: push into neutral territory, but stay at fire range from enemy borders
      // Stance 1: offensive position (at/beyond all borders)

      // Fire range position: pull back from border by combat range distance
      const fireRange = this.config.units.soldier.range;
      const dirToBorderX = borderPos.x - hqPos.x;
      const dirToBorderY = borderPos.y - hqPos.y;
      const dirToBorderLen = Math.hypot(dirToBorderX, dirToBorderY) || 1;

      // Fire range position is border position minus fire range in the direction from HQ
      const fireRangePos = {
        x: borderPos.x - (dirToBorderX / dirToBorderLen) * fireRange,
        y: borderPos.y - (dirToBorderY / dirToBorderLen) * fireRange,
      };

      // Check if the target tile is enemy or neutral (unoccupied)
      const targetOwner = this.game.owner(bestTile);
      const isEnemyTerritory = targetOwner.isPlayer();

      // Interpolate based on stance and target type
      let targetPos: { x: number; y: number };

      if (defensiveStance <= 0.5) {
        if (isEnemyTerritory) {
          // Against enemies: always stay at fire range for stance 0-0.5
          targetPos = fireRangePos;
        } else {
          // Against neutral: interpolate from fire range (0) to border (0.5)
          const t = defensiveStance * 2; // 0 to 1 for stance 0 to 0.5
          targetPos = {
            x: fireRangePos.x + (borderPos.x - fireRangePos.x) * t,
            y: fireRangePos.y + (borderPos.y - fireRangePos.y) * t,
          };
        }
      } else {
        // Stance 0.5 to 1: interpolate towards offensive position
        const t = (defensiveStance - 0.5) * 2; // 0 to 1 for stance 0.5 to 1
        if (isEnemyTerritory) {
          // Against enemies: interpolate from fire range to offensive
          targetPos = {
            x: fireRangePos.x + (offensivePos.x - fireRangePos.x) * t,
            y: fireRangePos.y + (offensivePos.y - fireRangePos.y) * t,
          };
        } else {
          // Against neutral: interpolate from border to offensive
          targetPos = {
            x: borderPos.x + (offensivePos.x - borderPos.x) * t,
            y: borderPos.y + (offensivePos.y - borderPos.y) * t,
          };
        }
      }

      return {
        x: Math.max(0, Math.min(this.game.width(), targetPos.x)),
        y: Math.max(0, Math.min(this.game.height(), targetPos.y)),
      };
    }

    // No valid enemy tiles found, move toward map center
    return {
      x: this.game.width() / 2,
      y: this.game.height() / 2,
    };
  }

  /**
   * Update warship movement using polar coordinates.
   * Since water forms a ring around the map center, we navigate by:
   * 1. Adjusting angle (theta) to rotate around the ring
   * 2. Adjusting radius (r) to move closer/further from center
   */
  private updateWarshipMovement(unit: FrenzyUnit, deltaTime: number) {
    const ATTACK_ORDER_ARRIVAL_DISTANCE = 3; // Tiles

    // Map center (water ring is around this point)
    const centerX = this.game.width() / 2;
    const centerY = this.game.height() / 2;

    // Determine target coordinates
    let destX: number = unit.targetX;
    let destY: number = unit.targetY;

    // Check if warship has a per-unit attack order
    if (
      unit.hasAttackOrder &&
      unit.attackOrderX !== undefined &&
      unit.attackOrderY !== undefined
    ) {
      destX = unit.attackOrderX;
      destY = unit.attackOrderY;
      const distToTarget = Math.hypot(destX - unit.x, destY - unit.y);

      if (distToTarget < ATTACK_ORDER_ARRIVAL_DISTANCE) {
        // Clear attack order - unit has arrived
        unit.hasAttackOrder = false;
        unit.attackOrderX = undefined;
        unit.attackOrderY = undefined;
        // Fall back to patrol target
        destX = unit.targetX;
        destY = unit.targetY;
      }
    } else {
      // Use patrol target
      const distToTarget = Math.hypot(destX - unit.x, destY - unit.y);

      // Check if needs new patrol target
      if (distToTarget < 2 || (unit.targetX === 0 && unit.targetY === 0)) {
        const newTarget = this.findWarshipTarget(unit);
        unit.targetX = newTarget.x;
        unit.targetY = newTarget.y;
        destX = newTarget.x;
        destY = newTarget.y;
      }
    }

    // Convert positions to polar coordinates relative to map center
    const unitR = Math.hypot(unit.x - centerX, unit.y - centerY);
    const unitTheta = Math.atan2(unit.y - centerY, unit.x - centerX);

    const destR = Math.hypot(destX - centerX, destY - centerY);
    const destTheta = Math.atan2(destY - centerY, destX - centerX);

    // Calculate deltas in polar space
    const deltaR = destR - unitR;

    // Calculate shortest angular distance (handle wrap-around)
    let deltaTheta = destTheta - unitTheta;
    while (deltaTheta > Math.PI) deltaTheta -= 2 * Math.PI;
    while (deltaTheta < -Math.PI) deltaTheta += 2 * Math.PI;

    // Get unit speed
    const unitConfig = getUnitConfig(this.config, unit.unitType);
    const speed = unitConfig.speed;

    // Convert polar velocity to cartesian
    // Angular velocity component (tangent to circle)
    const angularSpeed = deltaTheta > 0 ? speed : -speed;
    const tangentX = -Math.sin(unitTheta); // Perpendicular to radius
    const tangentY = Math.cos(unitTheta);

    // Radial velocity component (toward/away from center)
    const radialSpeed = deltaR > 0 ? speed : -speed;
    const radialX = Math.cos(unitTheta);
    const radialY = Math.sin(unitTheta);

    // Blend based on which delta is larger
    const absR = Math.abs(deltaR);
    const absTheta = Math.abs(deltaTheta) * unitR; // Convert to arc length
    const totalDelta = absR + absTheta;

    let vx = 0;
    let vy = 0;

    if (totalDelta > 0.5) {
      // Weight the movement by which direction needs more travel
      const radialWeight = absR / totalDelta;
      const angularWeight = absTheta / totalDelta;

      vx =
        radialX * radialSpeed * radialWeight +
        tangentX * angularSpeed * angularWeight;
      vy =
        radialY * radialSpeed * radialWeight +
        tangentY * angularSpeed * angularWeight;

      // Normalize to unit speed
      const vmag = Math.hypot(vx, vy);
      if (vmag > 0) {
        vx = (vx / vmag) * speed;
        vy = (vy / vmag) * speed;
      }
    }

    // Apply movement
    const nextX = unit.x + vx * deltaTime;
    const nextY = unit.y + vy * deltaTime;

    // Check if next position is water (with bounds checking)
    const floorNextX = Math.floor(nextX);
    const floorNextY = Math.floor(nextY);
    if (this.game.isValidCoord(floorNextX, floorNextY)) {
      const nextTile = this.game.ref(floorNextX, floorNextY);
      if (nextTile && this.game.isWater(nextTile)) {
        unit.x = nextX;
        unit.y = nextY;
        unit.vx = vx;
        unit.vy = vy;
        return;
      }
    }

    // Can't move in ideal direction - try just angular movement
    const altX = unit.x + tangentX * angularSpeed * deltaTime;
    const altY = unit.y + tangentY * angularSpeed * deltaTime;
    const floorAltX = Math.floor(altX);
    const floorAltY = Math.floor(altY);

    if (this.game.isValidCoord(floorAltX, floorAltY)) {
      const altTile = this.game.ref(floorAltX, floorAltY);
      if (altTile && this.game.isWater(altTile)) {
        unit.x = altX;
        unit.y = altY;
        unit.vx = tangentX * angularSpeed;
        unit.vy = tangentY * angularSpeed;
        return;
      }
    }

    // Try opposite angular direction
    const alt2X = unit.x - tangentX * angularSpeed * deltaTime;
    const alt2Y = unit.y - tangentY * angularSpeed * deltaTime;
    const floorAlt2X = Math.floor(alt2X);
    const floorAlt2Y = Math.floor(alt2Y);

    if (this.game.isValidCoord(floorAlt2X, floorAlt2Y)) {
      const alt2Tile = this.game.ref(floorAlt2X, floorAlt2Y);
      if (alt2Tile && this.game.isWater(alt2Tile)) {
        unit.x = alt2X;
        unit.y = alt2Y;
        unit.vx = -tangentX * angularSpeed;
        unit.vy = -tangentY * angularSpeed;
        return;
      }
    }

    // Can't move at all
    unit.vx = 0;
    unit.vy = 0;
  }

  /**
   * Find a good target position for a warship - water tiles near enemy territory
   */
  private findWarshipTarget(unit: FrenzyUnit): { x: number; y: number } {
    const searchRadius = 30;
    const unitPlayer = this.game.player(unit.playerId);

    // Look for water tiles near enemy/neutral land
    let bestTarget: { x: number; y: number } | null = null;
    let bestScore = Infinity;

    // Sample random positions around the unit
    for (let i = 0; i < 20; i++) {
      const angle = this.random.next() * Math.PI * 2;
      const dist = this.random.next() * searchRadius + 5;
      const checkX = Math.floor(unit.x + Math.cos(angle) * dist);
      const checkY = Math.floor(unit.y + Math.sin(angle) * dist);

      // Bounds check before ref
      if (!this.game.isValidCoord(checkX, checkY)) continue;
      const tile = this.game.ref(checkX, checkY);
      if (!tile || !this.game.isWater(tile)) continue;

      // Prefer water tiles near enemy coastlines
      let coastScore = 0;
      const neighbors = this.game.neighbors(tile);
      for (const neighbor of neighbors) {
        if (!this.game.isWater(neighbor)) {
          const owner = this.game.owner(neighbor);
          if (owner.isPlayer() && owner.id() !== unit.playerId) {
            if (!unitPlayer.isAlliedWith(owner)) {
              coastScore += 10; // Near enemy land
            }
          } else if (!owner.isPlayer()) {
            coastScore += 1; // Near neutral land
          }
        }
      }

      if (coastScore > 0) {
        const distToTile = Math.hypot(checkX - unit.x, checkY - unit.y);
        const score = distToTile / coastScore;
        if (score < bestScore) {
          bestScore = score;
          bestTarget = { x: checkX + 0.5, y: checkY + 0.5 };
        }
      }
    }

    // If no good coastal target found, just patrol randomly on water
    if (!bestTarget) {
      for (let i = 0; i < 10; i++) {
        const angle = this.random.next() * Math.PI * 2;
        const dist = this.random.next() * 15 + 5;
        const checkX = Math.floor(unit.x + Math.cos(angle) * dist);
        const checkY = Math.floor(unit.y + Math.sin(angle) * dist);

        // Bounds check before ref
        if (!this.game.isValidCoord(checkX, checkY)) continue;
        const tile = this.game.ref(checkX, checkY);
        if (tile && this.game.isWater(tile)) {
          return { x: checkX + 0.5, y: checkY + 0.5 };
        }
      }
      // Stay in place if no valid water found
      return { x: unit.x, y: unit.y };
    }

    return bestTarget;
  }

  queueAttackOrder(
    playerId: PlayerID,
    targetPlayerId: PlayerID | null,
    ratio: number,
    targetX?: number,
    targetY?: number,
  ) {
    // Require a target location
    if (targetX === undefined || targetY === undefined) {
      return;
    }
    if (this.defeatedPlayers.has(playerId)) {
      return;
    }

    const clampedRatio = Math.min(Math.max(ratio, 0), 1);
    if (clampedRatio <= 0) {
      return;
    }

    // Check if target is on water or land
    const targetTile = this.game.ref(Math.floor(targetX), Math.floor(targetY));
    const targetIsWater = targetTile && this.game.isWater(targetTile);

    // Get mobile units for this player based on target terrain
    // Water target = warships only, Land target = soldiers only
    const mobileUnits = this.units.filter((u) => {
      if (u.playerId !== playerId) return false;
      if (targetIsWater) {
        // Water target: only warships
        return u.unitType === FrenzyUnitType.Warship;
      } else {
        // Land target: only soldiers
        return (
          u.unitType === FrenzyUnitType.Soldier ||
          u.unitType === FrenzyUnitType.EliteSoldier
        );
      }
    });

    if (mobileUnits.length === 0) {
      return;
    }

    // Calculate how many units to assign
    const numToAssign = Math.max(
      1,
      Math.floor(mobileUnits.length * clampedRatio),
    );

    // Sort all units by distance to target
    const sortByDistance = (a: FrenzyUnit, b: FrenzyUnit) => {
      const distA = Math.hypot(a.x - targetX, a.y - targetY);
      const distB = Math.hypot(b.x - targetX, b.y - targetY);
      return distA - distB;
    };

    let sortedUnits: FrenzyUnit[];

    // At minimum ratio (0.01 = 1%), select 1 closest FREE unit only (don't overwrite)
    // At any other ratio, select closest X% regardless of order status (overwrite)
    const isMinimumRatio = clampedRatio <= 0.01;

    if (isMinimumRatio) {
      // Minimum ratio: pick closest free unit only
      const freeUnits = mobileUnits.filter((u) => !u.hasAttackOrder);
      if (freeUnits.length === 0) {
        // No free units available at minimum ratio - do nothing
        return;
      }
      freeUnits.sort(sortByDistance);
      sortedUnits = freeUnits;
    } else {
      // Any other ratio: pick closest units regardless of order status
      sortedUnits = mobileUnits.slice().sort(sortByDistance);
    }

    // Assign attack orders to the selected units
    for (let i = 0; i < numToAssign && i < sortedUnits.length; i++) {
      const unit = sortedUnits[i];
      unit.attackOrderX = targetX;
      unit.attackOrderY = targetY;
      unit.hasAttackOrder = true;
      // Set the unit's movement target directly
      unit.targetX = targetX;
      unit.targetY = targetY;
    }

    const unitType = targetIsWater ? "warships" : "soldiers";
    console.log(
      `[FrenzyManager] Attack order: ${playerId} sending ${numToAssign} ${unitType} to (${targetX.toFixed(0)}, ${targetY.toFixed(0)})`,
    );
  }

  private buildTerritorySnapshots(): Map<PlayerID, PlayerTerritorySnapshot> {
    const cache = new Map<PlayerID, PlayerTerritorySnapshot>();
    for (const player of this.game.players()) {
      // Performance: Use borderTiles() directly instead of filtering all tiles
      const borderTilesSet = player.borderTiles();
      const borderTiles = Array.from(borderTilesSet);

      if (borderTiles.length === 0) {
        continue;
      }

      // Performance: Sample tiles for centroid calculation instead of all tiles
      // Use border tiles as a proxy for territory shape
      let sumX = 0;
      let sumY = 0;
      for (const tile of borderTiles) {
        sumX += this.game.x(tile);
        sumY += this.game.y(tile);
      }

      // Performance: Limit border tiles to prevent O(n*m) in updateUnits
      const MAX_BORDER_TILES = 200;
      const sampledBorderTiles =
        borderTiles.length > MAX_BORDER_TILES
          ? this.sampleArray(borderTiles, MAX_BORDER_TILES)
          : borderTiles;

      cache.set(player.id(), {
        borderTiles: sampledBorderTiles,
        centroid: {
          x: sumX / borderTiles.length,
          y: sumY / borderTiles.length,
        },
      });
    }
    return cache;
  }

  private sampleArray<T>(arr: T[], count: number): T[] {
    if (arr.length <= count) return arr;
    const step = arr.length / count;
    const result: T[] = [];
    for (let i = 0; i < count; i++) {
      result.push(arr[Math.floor(i * step)]);
    }
    return result;
  }

  private applySeparation(unit: FrenzyUnit) {
    const separationRadius = this.config.separationRadius;
    const separationRadiusSq = separationRadius * separationRadius;
    const nearby = this.spatialGrid.getNearby(unit.x, unit.y, separationRadius);

    let sepX = 0;
    let sepY = 0;
    let count = 0;
    const unitX = unit.x;
    const unitY = unit.y;
    const unitId = unit.id;
    const unitPlayerId = unit.playerId;

    for (const other of nearby) {
      if (other.id !== unitId && other.playerId === unitPlayerId) {
        const dx = unitX - other.x;
        const dy = unitY - other.y;
        const distSq = dx * dx + dy * dy;

        if (distSq > 0 && distSq < separationRadiusSq) {
          // Performance: Use inverse square root approximation
          const invDist = 1 / Math.sqrt(distSq);
          sepX += dx * invDist;
          sepY += dy * invDist;
          count++;
        }
      }
    }

    if (count > 0) {
      // Blend separation with movement direction
      const separationStrength = 0.6; // stronger separation to avoid corridors
      const unitConfig = getUnitConfig(this.config, unit.unitType);
      unit.vx += (sepX / count) * unitConfig.speed * separationStrength;
      unit.vy += (sepY / count) * unitConfig.speed * separationStrength;
    }
  }

  private updateCombat(deltaTime: number) {
    // Track which units are in combat to apply mutual damage
    const combatPairs = new Map<number, number>();

    // Update shield regeneration
    for (const unit of this.units) {
      if (unit.unitType === FrenzyUnitType.ShieldGenerator) {
        if (unit.shieldRegenTimer !== undefined && unit.shieldRegenTimer > 0) {
          unit.shieldRegenTimer -= deltaTime;
        } else if (
          unit.shieldHealth !== undefined &&
          unit.maxShieldHealth !== undefined
        ) {
          // Regenerate shield at 50 HP/sec when not taking damage
          unit.shieldHealth = Math.min(
            unit.maxShieldHealth,
            unit.shieldHealth + 50 * deltaTime,
          );
        }
      }
    }

    for (const unit of this.units) {
      if (this.defeatedPlayers.has(unit.playerId)) {
        continue;
      }

      // Shield generators don't attack
      if (unit.unitType === FrenzyUnitType.ShieldGenerator) {
        continue;
      }

      unit.weaponCooldown = Math.max(0, unit.weaponCooldown - deltaTime);

      const unitPlayer = this.game.player(unit.playerId);

      // Get unit-specific combat range
      const unitConfig = getUnitConfig(this.config, unit.unitType);

      // Tier 2 defense posts get enhanced stats
      const isDefensePostT2 =
        unit.unitType === FrenzyUnitType.DefensePost && unit.tier >= 2;
      const isArtillery = unit.unitType === FrenzyUnitType.Artillery;
      const isWarshipT2 =
        unit.unitType === FrenzyUnitType.Warship && unit.tier >= 2;

      // Get combat range based on unit type and tier
      let combatRange = unitConfig.range;
      if (isDefensePostT2) {
        combatRange = 37.5; // Tier 2: 1.5x soldier range
      } else if (isWarshipT2) {
        combatRange = this.config.units.eliteWarship.range; // Tier 2: long range missiles
      }

      const effectiveFireInterval = isDefensePostT2 ? 4.0 : unit.fireInterval; // Tier 2: slow but powerful

      // Update fire interval for tier 2 defense posts
      if (isDefensePostT2 && unit.fireInterval !== effectiveFireInterval) {
        unit.fireInterval = effectiveFireInterval;
      }

      // Performance: Find nearest enemy without creating intermediate arrays
      const nearbyUnits = this.spatialGrid.getNearby(
        unit.x,
        unit.y,
        combatRange,
      );
      let nearest: FrenzyUnit | null = null;
      let nearestDistSq = Infinity;
      const unitX = unit.x;
      const unitY = unit.y;

      for (const other of nearbyUnits) {
        if (other.playerId === unit.playerId) continue;
        // Don't attack allies
        const otherPlayer = this.game.player(other.playerId);
        if (unitPlayer.isAlliedWith(otherPlayer)) continue;

        const dx = other.x - unitX;
        const dy = other.y - unitY;
        const distSq = dx * dx + dy * dy;
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearest = other;
        }
      }

      if (nearest !== null) {
        // Artillery fires at enemy position with area damage
        if (isArtillery) {
          if (unit.weaponCooldown <= 0) {
            this.spawnArtilleryProjectile(unit, nearest.x, nearest.y);
            unit.weaponCooldown = unit.fireInterval;
          }
        }
        // Tier 2 warships fire missile barrages (2x5 missiles, then reload)
        else if (unit.unitType === FrenzyUnitType.Warship && unit.tier >= 2) {
          this.handleTier2WarshipAttack(unit, nearest, deltaTime);
        }
        // Defense posts deal burst damage on shot, regular units deal DPS
        else if (unitConfig.projectileDamage !== undefined) {
          // Burst damage on shot (defense posts, warships)
          if (unit.weaponCooldown <= 0) {
            // Get effective damage based on tier for defense posts
            const isDefensePost = unit.unitType === FrenzyUnitType.DefensePost;
            let damage = unitConfig.projectileDamage;

            if (isDefensePost && unit.tier >= 2) {
              // Tier 2 defense posts: one-shot beam (100 damage)
              damage = 100;
              this.applyDamage(nearest, damage);
              this.spawnBeamProjectile(unit, nearest);
            } else {
              // Tier 1 defense posts or other units: regular projectile
              this.applyDamage(nearest, damage);
              this.spawnProjectile(unit, nearest);
            }
            unit.weaponCooldown = unit.fireInterval;
          }
        } else {
          // Regular unit DPS
          this.applyDamage(nearest, unitConfig.dps * deltaTime);

          // Track that this unit is in combat (for mutual damage)
          combatPairs.set(unit.id, nearest.id);

          if (unit.weaponCooldown <= 0) {
            this.spawnProjectile(unit, nearest);
            unit.weaponCooldown = unit.fireInterval;
          }
        }
      } else {
        // No Frenzy enemy units nearby - check for enemy structures
        // Tier 2 warships use missile barrages on structures too
        if (unit.unitType === FrenzyUnitType.Warship && unit.tier >= 2) {
          this.attackNearbyStructuresWithMissiles(unit, deltaTime, combatRange);
        } else {
          this.attackNearbyStructures(unit, deltaTime, unitConfig, combatRange);
        }
      }
    }
  }

  private spawnProjectile(attacker: FrenzyUnit, target: FrenzyUnit) {
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = this.config.projectileSpeed;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    const travelTime = Math.max(dist / speed, 0.15);

    this.projectiles.push({
      id: this.nextProjectileId++,
      playerId: attacker.playerId,
      x: attacker.x,
      y: attacker.y,
      vx,
      vy,
      age: 0,
      life: travelTime,
      isElite: attacker.unitType === FrenzyUnitType.EliteSoldier,
    });
  }

  private spawnBeamProjectile(attacker: FrenzyUnit, target: FrenzyUnit) {
    // Beam projectile for defense posts - instant hit, visual effect only
    const beamLife = 0.3; // Beam visible for 0.3 seconds

    this.projectiles.push({
      id: this.nextProjectileId++,
      playerId: attacker.playerId,
      x: target.x, // End point (target)
      y: target.y,
      vx: 0, // No movement
      vy: 0,
      age: 0,
      life: beamLife,
      isBeam: true,
      startX: attacker.x, // Start point (defense post)
      startY: attacker.y,
    });
  }

  private spawnArtilleryProjectile(
    attacker: FrenzyUnit,
    targetX: number,
    targetY: number,
  ) {
    const unitConfig = getUnitConfig(this.config, attacker.unitType);
    const dx = targetX - attacker.x;
    const dy = targetY - attacker.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = this.config.projectileSpeed * 1.5; // Faster projectile
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    const travelTime = Math.max(dist / speed, 0.3); // Shorter minimum travel time

    // Tier 2 artillery has 1.5x damage and radius
    const baseDamage = unitConfig.projectileDamage ?? 60;
    const baseRadius = unitConfig.areaRadius ?? 15;
    const tierMultiplier = attacker.tier >= 2 ? 1.5 : 1;

    this.projectiles.push({
      id: this.nextProjectileId++,
      playerId: attacker.playerId,
      x: attacker.x,
      y: attacker.y,
      vx,
      vy,
      age: 0,
      life: travelTime,
      isArtillery: true,
      areaRadius: baseRadius * tierMultiplier,
      damage: baseDamage * tierMultiplier,
      targetX,
      targetY,
      startX: attacker.x, // Store start position for ballistic arc
      startY: attacker.y,
    });
  }

  /**
   * Handle tier 2 warship missile barrage attack.
   * Fires 2 volleys of 5 missiles in quick succession, then reloads.
   * Missiles are non-guided with small AOE and massive range (25% of map width).
   */
  private handleTier2WarshipAttack(
    unit: FrenzyUnit,
    target: FrenzyUnit,
    deltaTime: number,
  ) {
    // Initialize barrage state if not set
    if (unit.barrageCount === undefined) {
      unit.barrageCount = 0;
      unit.barragePhase = 0;
      unit.barrageCooldown = 0;
    }

    // Decrement cooldowns
    unit.weaponCooldown = Math.max(0, unit.weaponCooldown - deltaTime);
    unit.barrageCooldown = Math.max(0, (unit.barrageCooldown ?? 0) - deltaTime);

    // If in reload phase (after 2 volleys of 5), wait for main cooldown
    if ((unit.barragePhase ?? 0) >= 2) {
      if (unit.weaponCooldown <= 0) {
        // Reset for next barrage cycle
        unit.barrageCount = 0;
        unit.barragePhase = 0;
        unit.barrageCooldown = 0;
      }
      return;
    }

    // Fire missiles in quick succession (short barrage cooldown)
    if ((unit.barrageCooldown ?? 0) <= 0 && (unit.barrageCount ?? 0) < 5) {
      // Fire a missile with some spread
      const spreadAngle = (this.random.next() - 0.5) * 0.1; // ~6 degree spread (reduced from 0.3)
      this.spawnWarshipMissile(unit, target.x, target.y, spreadAngle);
      unit.barrageCount = (unit.barrageCount ?? 0) + 1;
      unit.barrageCooldown = 0.15; // 150ms between missiles in a volley
    }

    // Check if volley is complete
    if ((unit.barrageCount ?? 0) >= 5) {
      unit.barrageCount = 0;
      unit.barragePhase = (unit.barragePhase ?? 0) + 1;

      if ((unit.barragePhase ?? 0) >= 2) {
        // Both volleys complete, start reload
        unit.weaponCooldown = 8.0; // Long reload after 2 volleys of 5
      } else {
        // Short pause between volleys
        unit.barrageCooldown = 1.0;
      }
    }
  }

  /**
   * Spawn a warship missile (non-guided, small AOE, massive range).
   * Range is 25% of map width.
   */
  private spawnWarshipMissile(
    attacker: FrenzyUnit,
    targetX: number,
    targetY: number,
    spreadAngle: number = 0,
  ) {
    const dx = targetX - attacker.x;
    const dy = targetY - attacker.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Apply spread to direction
    const baseAngle = Math.atan2(dy, dx);
    const finalAngle = baseAngle + spreadAngle;

    // Missile range is 25% of map width
    const mapWidth = this.game.width();
    const missileRange = mapWidth * 0.25;

    // Clamp target distance to range
    const effectiveDistance = Math.min(dist, missileRange);

    // Slower missile speed for tier 2 warships (half normal)
    const speed = this.config.projectileSpeed * 1.25;
    const vx = Math.cos(finalAngle) * speed;
    const vy = Math.sin(finalAngle) * speed;
    const travelTime = effectiveDistance / speed;

    // Calculate actual target position based on angle and distance
    const actualTargetX = attacker.x + Math.cos(finalAngle) * effectiveDistance;
    const actualTargetY = attacker.y + Math.sin(finalAngle) * effectiveDistance;

    this.projectiles.push({
      id: this.nextProjectileId++,
      playerId: attacker.playerId,
      x: attacker.x,
      y: attacker.y,
      vx,
      vy,
      age: 0,
      life: travelTime,
      isMissile: true,
      areaRadius: 8, // Small AOE
      damage: 25, // Moderate damage per missile (10 missiles = 250 total potential)
      targetX: actualTargetX,
      targetY: actualTargetY,
      startX: attacker.x,
      startY: attacker.y,
    });
  }

  /**
   * Tier 2 warship attacks structures with missile barrages
   */
  private attackNearbyStructuresWithMissiles(
    unit: FrenzyUnit,
    deltaTime: number,
    combatRange: number,
  ) {
    // Find nearest enemy Frenzy structure
    const nearestStructure = this.findNearestEnemyFrenzyStructure(
      unit,
      combatRange,
    );

    if (nearestStructure) {
      // Create a pseudo-target for the missile barrage
      this.handleTier2WarshipStructureAttack(unit, nearestStructure, deltaTime);
      return;
    }

    // No Frenzy structures - fall back to regular structure attack
    const unitConfig = getUnitConfig(this.config, unit.unitType);
    this.attackNearbyStructures(unit, deltaTime, unitConfig, combatRange);
  }

  /**
   * Handle tier 2 warship missile barrage attack on a structure.
   */
  private handleTier2WarshipStructureAttack(
    unit: FrenzyUnit,
    target: FrenzyStructure,
    deltaTime: number,
  ) {
    // Initialize barrage state if not set
    if (unit.barrageCount === undefined) {
      unit.barrageCount = 0;
      unit.barragePhase = 0;
      unit.barrageCooldown = 0;
    }

    // Decrement cooldowns
    unit.weaponCooldown = Math.max(0, unit.weaponCooldown - deltaTime);
    unit.barrageCooldown = Math.max(0, (unit.barrageCooldown ?? 0) - deltaTime);

    // If in reload phase (after 2 volleys of 5), wait for main cooldown
    if ((unit.barragePhase ?? 0) >= 2) {
      if (unit.weaponCooldown <= 0) {
        // Reset for next barrage cycle
        unit.barrageCount = 0;
        unit.barragePhase = 0;
        unit.barrageCooldown = 0;
      }
      return;
    }

    // Fire missiles in quick succession (short barrage cooldown)
    if ((unit.barrageCooldown ?? 0) <= 0 && (unit.barrageCount ?? 0) < 5) {
      // Fire a missile with some spread
      const spreadAngle = (this.random.next() - 0.5) * 0.1; // ~6 degree spread
      this.spawnWarshipMissile(unit, target.x, target.y, spreadAngle);
      unit.barrageCount = (unit.barrageCount ?? 0) + 1;
      unit.barrageCooldown = 0.15; // 150ms between missiles in a volley
    }

    // Check if volley is complete
    if ((unit.barrageCount ?? 0) >= 5) {
      unit.barrageCount = 0;
      unit.barragePhase = (unit.barragePhase ?? 0) + 1;

      if ((unit.barragePhase ?? 0) >= 2) {
        // Both volleys complete, start reload
        unit.weaponCooldown = 8.0; // Long reload after 2 volleys of 5
      } else {
        // Short pause between volleys
        unit.barrageCooldown = 1.0;
      }
    }
  }

  /**
   * Check if a unit is protected by a friendly shield generator
   * Returns the shield generator if protected, null otherwise
   */
  private getProtectingShield(unit: FrenzyUnit): FrenzyUnit | null {
    for (const other of this.units) {
      if (other.unitType !== FrenzyUnitType.ShieldGenerator) continue;
      if (other.playerId !== unit.playerId) continue;
      if (!other.shieldHealth || other.shieldHealth <= 0) continue;

      const unitConfig = getUnitConfig(this.config, other.unitType);
      // Tier 2 shields have 1.5x radius
      const baseRadius = unitConfig.shieldRadius ?? 30;
      const shieldRadius = other.tier >= 2 ? baseRadius * 1.5 : baseRadius;
      const dist = Math.hypot(unit.x - other.x, unit.y - other.y);

      if (dist <= shieldRadius) {
        return other;
      }
    }
    return null;
  }

  /**
   * Apply damage to a unit, accounting for shield protection
   */
  private applyDamage(target: FrenzyUnit, damage: number): void {
    const shield = this.getProtectingShield(target);
    if (shield && shield.shieldHealth && shield.shieldHealth > 0) {
      // Shield absorbs damage
      const absorbed = Math.min(shield.shieldHealth, damage);
      shield.shieldHealth -= absorbed;
      shield.shieldRegenTimer = 3.0; // Reset regen timer
      damage -= absorbed;
    }
    target.health -= damage;
  }

  /**
   * Attack enemy City/Factory structures if no FrenzyUnits are in range
   */
  private attackNearbyStructures(
    unit: FrenzyUnit,
    deltaTime: number,
    unitConfig: UnitTypeConfig,
    combatRange: number,
  ) {
    const unitPlayer = this.game.player(unit.playerId);

    // Convert pixel position to tile ref
    const tileX = Math.floor(unit.x);
    const tileY = Math.floor(unit.y);
    const tile = this.game.ref(tileX, tileY);
    if (!this.game.isValidRef(tile)) return;

    // First check for enemy Frenzy structures (mines, factories, ports)
    const nearestFrenzyStructure = this.findNearestEnemyFrenzyStructure(
      unit,
      combatRange,
    );

    if (nearestFrenzyStructure) {
      this.attackFrenzyStructure(
        unit,
        nearestFrenzyStructure,
        deltaTime,
        unitConfig,
      );
      return;
    }

    // Find nearby City/Factory structures
    const nearbyStructures = this.game.nearbyUnits(
      tile,
      combatRange, // Use same combat range
      [UnitType.City, UnitType.Factory],
      ({ unit: structure }) => {
        // Only attack enemy structures
        const structureOwner = structure.owner();
        if (!structureOwner.isPlayer()) return false;
        if (structureOwner.id() === unit.playerId) return false;
        // Don't attack allied structures
        const ownerPlayer = this.game.player(structureOwner.id());
        if (unitPlayer.isAlliedWith(ownerPlayer)) return false;
        // Only attack structures with health
        return structure.hasHealth();
      },
    );

    if (nearbyStructures.length === 0) {
      // No City/Factory nearby - check for enemy HQs
      this.attackNearbyHQ(unit, deltaTime, unitConfig, combatRange);
      return;
    }

    // Attack nearest structure
    const nearest = nearbyStructures.reduce((closest, current) =>
      current.distSquared < closest.distSquared ? current : closest,
    );
    const targetStructure = nearest.unit;

    // Calculate damage based on unit type
    if (unitConfig.projectileDamage !== undefined) {
      // Burst damage on shot (defense posts)
      if (unit.weaponCooldown <= 0) {
        targetStructure.modifyHealth(-unitConfig.projectileDamage, unitPlayer);
        this.spawnBeamProjectileToStructure(unit, targetStructure);
        unit.weaponCooldown = unit.fireInterval;
      }
    } else {
      // Regular unit DPS
      targetStructure.modifyHealth(-unitConfig.dps * deltaTime, unitPlayer);

      if (unit.weaponCooldown <= 0) {
        this.spawnProjectileToStructure(unit, targetStructure);
        unit.weaponCooldown = unit.fireInterval;
      }
    }
  }

  /**
   * Attack enemy HQ (CoreBuilding) if no other targets are in range
   */
  private attackNearbyHQ(
    unit: FrenzyUnit,
    deltaTime: number,
    unitConfig: UnitTypeConfig,
    combatRange: number,
  ) {
    const unitPlayer = this.game.player(unit.playerId);

    // Find nearest enemy HQ within combat range
    let nearestHQ: CoreBuilding | null = null;
    let nearestDistSquared = Infinity;

    for (const [playerId, building] of this.coreBuildings) {
      // Skip own HQ
      if (playerId === unit.playerId) continue;

      // Skip allied HQs
      const hqOwner = this.game.player(playerId);
      if (unitPlayer.isAlliedWith(hqOwner)) continue;

      // Check distance
      const dx = building.x - unit.x;
      const dy = building.y - unit.y;
      const distSquared = dx * dx + dy * dy;

      if (
        distSquared <= combatRange * combatRange &&
        distSquared < nearestDistSquared
      ) {
        nearestHQ = building;
        nearestDistSquared = distSquared;
      }
    }

    if (!nearestHQ) return;

    // Attack the HQ
    if (unitConfig.projectileDamage !== undefined) {
      // Burst damage (defense posts)
      if (unit.weaponCooldown <= 0) {
        nearestHQ.health -= unitConfig.projectileDamage;
        this.spawnBeamProjectileToHQ(unit, nearestHQ);
        unit.weaponCooldown = unit.fireInterval;
      }
    } else {
      // Regular unit DPS
      nearestHQ.health -= unitConfig.dps * deltaTime;

      if (unit.weaponCooldown <= 0) {
        this.spawnProjectileToHQ(unit, nearestHQ);
        unit.weaponCooldown = unit.fireInterval;
      }
    }

    // Check if HQ is destroyed by damage
    if (nearestHQ.health <= 0) {
      this.defeatPlayer(nearestHQ.playerId, unit.playerId);
    }
  }

  /**
   * Find nearest enemy Frenzy structure (mine, factory, port) within range
   */
  private findNearestEnemyFrenzyStructure(
    unit: FrenzyUnit,
    combatRange: number,
  ): FrenzyStructure | null {
    const unitPlayer = this.game.player(unit.playerId);
    let nearestStructure: FrenzyStructure | null = null;
    let nearestDistSquared = combatRange * combatRange;

    // Check mines
    for (const mine of this.mines.values()) {
      if (mine.playerId === unit.playerId) continue;
      const minePlayer = this.game.player(mine.playerId);
      if (unitPlayer.isAlliedWith(minePlayer)) continue;

      const dx = mine.x - unit.x;
      const dy = mine.y - unit.y;
      const distSquared = dx * dx + dy * dy;

      if (distSquared <= nearestDistSquared) {
        nearestStructure = mine;
        nearestDistSquared = distSquared;
      }
    }

    // Check factories
    for (const factory of this.factories.values()) {
      if (factory.playerId === unit.playerId) continue;
      const factoryPlayer = this.game.player(factory.playerId);
      if (unitPlayer.isAlliedWith(factoryPlayer)) continue;

      const dx = factory.x - unit.x;
      const dy = factory.y - unit.y;
      const distSquared = dx * dx + dy * dy;

      if (distSquared <= nearestDistSquared) {
        nearestStructure = factory;
        nearestDistSquared = distSquared;
      }
    }

    // Check ports
    for (const port of this.ports.values()) {
      if (port.playerId === unit.playerId) continue;
      const portPlayer = this.game.player(port.playerId);
      if (unitPlayer.isAlliedWith(portPlayer)) continue;

      const dx = port.x - unit.x;
      const dy = port.y - unit.y;
      const distSquared = dx * dx + dy * dy;

      if (distSquared <= nearestDistSquared) {
        nearestStructure = port;
        nearestDistSquared = distSquared;
      }
    }

    return nearestStructure;
  }

  /**
   * Attack a Frenzy structure (mine, factory, port)
   */
  private attackFrenzyStructure(
    unit: FrenzyUnit,
    structure: FrenzyStructure,
    deltaTime: number,
    unitConfig: UnitTypeConfig,
  ) {
    // Calculate damage based on unit type
    if (unitConfig.projectileDamage !== undefined) {
      // Burst damage (defense posts)
      if (unit.weaponCooldown <= 0) {
        structure.health -= unitConfig.projectileDamage;
        this.spawnBeamProjectileToFrenzyStructure(unit, structure);
        unit.weaponCooldown = unit.fireInterval;
      }
    } else {
      // Regular unit DPS
      structure.health -= unitConfig.dps * deltaTime;

      if (unit.weaponCooldown <= 0) {
        this.spawnProjectileToFrenzyStructure(unit, structure);
        unit.weaponCooldown = unit.fireInterval;
      }
    }

    // Check if structure is destroyed
    if (structure.health <= 0) {
      this.removeFrenzyStructure(structure);
    }
  }

  /**
   * Remove a destroyed Frenzy structure
   */
  private removeFrenzyStructure(structure: FrenzyStructure) {
    switch (structure.type) {
      case FrenzyStructureType.Mine:
        this.mines.delete(structure.tile);
        break;
      case FrenzyStructureType.Factory:
        this.factories.delete(structure.tile);
        break;
      case FrenzyStructureType.Port:
        this.ports.delete(structure.tile);
        break;
    }
  }

  /**
   * Spawn projectile toward a Frenzy structure
   */
  private spawnProjectileToFrenzyStructure(
    attacker: FrenzyUnit,
    target: FrenzyStructure,
  ) {
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = this.config.projectileSpeed;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    const travelTime = Math.max(dist / speed, 0.15);

    this.projectiles.push({
      id: this.nextProjectileId++,
      playerId: attacker.playerId,
      x: attacker.x,
      y: attacker.y,
      vx,
      vy,
      age: 0,
      life: travelTime,
      isElite: attacker.unitType === FrenzyUnitType.EliteSoldier,
    });
  }

  /**
   * Spawn beam projectile toward a Frenzy structure
   */
  private spawnBeamProjectileToFrenzyStructure(
    attacker: FrenzyUnit,
    target: FrenzyStructure,
  ) {
    const beamLife = 0.3;

    this.projectiles.push({
      id: this.nextProjectileId++,
      playerId: attacker.playerId,
      x: target.x,
      y: target.y,
      vx: 0,
      vy: 0,
      age: 0,
      life: beamLife,
      isBeam: true,
      startX: attacker.x,
      startY: attacker.y,
    });
  }

  /**
   * Spawn projectile toward an enemy HQ
   */
  private spawnProjectileToHQ(attacker: FrenzyUnit, target: CoreBuilding) {
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = this.config.projectileSpeed;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    const travelTime = Math.max(dist / speed, 0.15);

    this.projectiles.push({
      id: this.nextProjectileId++,
      playerId: attacker.playerId,
      x: attacker.x,
      y: attacker.y,
      vx,
      vy,
      age: 0,
      life: travelTime,
      isElite: attacker.unitType === FrenzyUnitType.EliteSoldier,
    });
  }

  /**
   * Spawn beam projectile toward an enemy HQ
   */
  private spawnBeamProjectileToHQ(attacker: FrenzyUnit, target: CoreBuilding) {
    const beamLife = 0.3;

    this.projectiles.push({
      id: this.nextProjectileId++,
      playerId: attacker.playerId,
      x: target.x,
      y: target.y,
      vx: 0,
      vy: 0,
      age: 0,
      life: beamLife,
      isBeam: true,
      startX: attacker.x,
      startY: attacker.y,
    });
  }

  /**
   * Spawn projectile toward a game structure (City/Factory)
   */
  private spawnProjectileToStructure(attacker: FrenzyUnit, target: Unit) {
    const targetTile = target.tile();
    const targetX = this.game.x(targetTile);
    const targetY = this.game.y(targetTile);

    const dx = targetX - attacker.x;
    const dy = targetY - attacker.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = this.config.projectileSpeed;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    const travelTime = Math.max(dist / speed, 0.15);

    this.projectiles.push({
      id: this.nextProjectileId++,
      playerId: attacker.playerId,
      x: attacker.x,
      y: attacker.y,
      vx,
      vy,
      age: 0,
      life: travelTime,
      isElite: attacker.unitType === FrenzyUnitType.EliteSoldier,
    });
  }

  /**
   * Spawn beam projectile toward a game structure (City/Factory)
   */
  private spawnBeamProjectileToStructure(attacker: FrenzyUnit, target: Unit) {
    const targetTile = target.tile();
    const targetX = this.game.x(targetTile);
    const targetY = this.game.y(targetTile);

    const beamLife = 0.3;

    this.projectiles.push({
      id: this.nextProjectileId++,
      playerId: attacker.playerId,
      x: targetX,
      y: targetY,
      vx: 0,
      vy: 0,
      age: 0,
      life: beamLife,
      isBeam: true,
      startX: attacker.x,
      startY: attacker.y,
    });
  }

  private updateProjectiles(deltaTime: number) {
    const active: FrenzyProjectile[] = [];
    for (const projectile of this.projectiles) {
      projectile.age += deltaTime;
      projectile.x += projectile.vx * deltaTime;
      projectile.y += projectile.vy * deltaTime;

      // Check if artillery projectile has reached target
      if (projectile.isArtillery && projectile.age >= projectile.life) {
        // Apply area damage at impact location
        this.applyArtilleryImpact(projectile);
      }

      // Check if missile has reached target (tier 2 warship)
      if (projectile.isMissile && projectile.age >= projectile.life) {
        // Apply small area damage at impact location
        this.applyMissileImpact(projectile);
      }

      if (projectile.age < projectile.life) {
        active.push(projectile);
      }
    }
    this.projectiles = active;
  }

  /**
   * Apply area damage when artillery shell lands
   */
  private applyArtilleryImpact(projectile: FrenzyProjectile) {
    const impactX = projectile.targetX ?? projectile.x;
    const impactY = projectile.targetY ?? projectile.y;
    const radius = projectile.areaRadius ?? 15;
    const damage = projectile.damage ?? 60;

    // Find all enemy units in the blast radius
    const unitsInRadius = this.spatialGrid.getNearby(impactX, impactY, radius);

    for (const unit of unitsInRadius) {
      // Don't damage friendly units
      if (unit.playerId === projectile.playerId) continue;

      // Check if allied
      const projectilePlayer = this.game.player(projectile.playerId);
      const unitPlayer = this.game.player(unit.playerId);
      if (projectilePlayer.isAlliedWith(unitPlayer)) continue;

      const dist = Math.hypot(unit.x - impactX, unit.y - impactY);
      if (dist <= radius) {
        // Damage falls off with distance (100% at center, 50% at edge)
        const falloff = 1 - (dist / radius) * 0.5;
        this.applyDamage(unit, damage * falloff);
      }
    }
  }

  /**
   * Apply small area damage when tier 2 warship missile lands
   */
  private applyMissileImpact(projectile: FrenzyProjectile) {
    const impactX = projectile.targetX ?? projectile.x;
    const impactY = projectile.targetY ?? projectile.y;
    const radius = projectile.areaRadius ?? 8;
    const damage = projectile.damage ?? 25;
    const projectilePlayer = this.game.player(projectile.playerId);

    // Find all enemy units in the blast radius
    const unitsInRadius = this.spatialGrid.getNearby(impactX, impactY, radius);

    for (const unit of unitsInRadius) {
      // Don't damage friendly units
      if (unit.playerId === projectile.playerId) continue;

      // Check if allied
      const unitPlayer = this.game.player(unit.playerId);
      if (projectilePlayer.isAlliedWith(unitPlayer)) continue;

      const dist = Math.hypot(unit.x - impactX, unit.y - impactY);
      if (dist <= radius) {
        // Damage falls off with distance (100% at center, 25% at edge)
        const falloff = 1 - (dist / radius) * 0.75;
        this.applyDamage(unit, damage * falloff);
      }
    }

    // Also damage enemy Frenzy structures (mines, factories, ports) in blast radius
    this.damageStructuresInRadius(
      impactX,
      impactY,
      radius,
      damage,
      projectile.playerId,
    );
  }

  /**
   * Damage enemy Frenzy structures (mines, factories, ports) within a radius
   */
  private damageStructuresInRadius(
    x: number,
    y: number,
    radius: number,
    damage: number,
    attackerPlayerId: PlayerID,
  ) {
    const attackerPlayer = this.game.player(attackerPlayerId);

    // Check mines
    for (const [tile, mine] of this.mines) {
      if (mine.playerId === attackerPlayerId) continue;
      const minePlayer = this.game.player(mine.playerId);
      if (attackerPlayer.isAlliedWith(minePlayer)) continue;

      const dist = Math.hypot(mine.x - x, mine.y - y);
      if (dist <= radius) {
        const falloff = 1 - (dist / radius) * 0.75;
        mine.health -= damage * falloff;
        if (mine.health <= 0) {
          this.mines.delete(tile);
        }
      }
    }

    // Check factories
    for (const [tile, factory] of this.factories) {
      if (factory.playerId === attackerPlayerId) continue;
      const factoryPlayer = this.game.player(factory.playerId);
      if (attackerPlayer.isAlliedWith(factoryPlayer)) continue;

      const dist = Math.hypot(factory.x - x, factory.y - y);
      if (dist <= radius) {
        const falloff = 1 - (dist / radius) * 0.75;
        factory.health -= damage * falloff;
        if (factory.health <= 0) {
          this.factories.delete(tile);
        }
      }
    }

    // Check ports
    for (const [tile, port] of this.ports) {
      if (port.playerId === attackerPlayerId) continue;
      const portPlayer = this.game.player(port.playerId);
      if (attackerPlayer.isAlliedWith(portPlayer)) continue;

      const dist = Math.hypot(port.x - x, port.y - y);
      if (dist <= radius) {
        const falloff = 1 - (dist / radius) * 0.75;
        port.health -= damage * falloff;
        if (port.health <= 0) {
          this.ports.delete(tile);
        }
      }
    }
  }

  /**
   * Units capture territory they're standing on and nearby tiles
   */
  private captureTerritory() {
    const captureRadius = Math.max(1, Math.floor(this.config.captureRadius));
    const radiusSquared = captureRadius * captureRadius;
    const mapWidth = this.game.width();
    const mapHeight = this.game.height();

    // Performance: Track tiles we've already checked this tick to avoid duplicate work
    const checkedTiles = new Set<number>();

    // Performance: Stagger unit captures - only process subset each tick
    const unitCount = this.units.length;
    const unitsPerTick = Math.max(50, Math.ceil(unitCount / 3));
    const startIdx = (this.tickCount * unitsPerTick) % unitCount;
    const endIdx = Math.min(startIdx + unitsPerTick, unitCount);

    for (let i = startIdx; i < endIdx; i++) {
      const unit = this.units[i];
      if (this.defeatedPlayers.has(unit.playerId)) {
        continue;
      }
      const player = this.game.player(unit.playerId);
      const playerId = unit.playerId;

      // Check tiles in a radius around the unit
      const centerX = Math.floor(unit.x);
      const centerY = Math.floor(unit.y);

      for (let dx = -captureRadius; dx <= captureRadius; dx++) {
        const tileX = centerX + dx;
        if (tileX < 0 || tileX >= mapWidth) continue;

        for (let dy = -captureRadius; dy <= captureRadius; dy++) {
          if (dx * dx + dy * dy > radiusSquared) {
            continue; // Skip tiles outside circular capture zone
          }
          const tileY = centerY + dy;
          if (tileY < 0 || tileY >= mapHeight) continue;

          const tile = this.game.ref(tileX, tileY);

          // Performance: Skip if already checked by this player this tick
          const tileKey = tile * 1000 + playerId.charCodeAt(0);
          if (checkedTiles.has(tileKey)) {
            continue;
          }
          checkedTiles.add(tileKey);

          if (this.game.isWater(tile)) {
            continue;
          }

          const currentOwner = this.game.owner(tile);
          const currentOwnerId = currentOwner.id();

          if (currentOwnerId === playerId) {
            continue; // Already own this tile
          }

          // Don't capture allied territory
          if (currentOwner.isPlayer() && player.isAlliedWith(currentOwner)) {
            continue;
          }

          // Performance: Inline neighbor check instead of calling game.neighbors()
          // Check if ANY of our tiles border this tile (4-connected)
          let bordersOurTerritory = false;
          // Check up
          if (tileY > 0) {
            const nTile = tile - mapWidth;
            if (this.game.owner(nTile).id() === playerId) {
              bordersOurTerritory = true;
            }
          }
          // Check down
          if (!bordersOurTerritory && tileY < mapHeight - 1) {
            const nTile = tile + mapWidth;
            if (this.game.owner(nTile).id() === playerId) {
              bordersOurTerritory = true;
            }
          }
          // Check left
          if (!bordersOurTerritory && tileX > 0) {
            const nTile = tile - 1;
            if (this.game.owner(nTile).id() === playerId) {
              bordersOurTerritory = true;
            }
          }
          // Check right
          if (!bordersOurTerritory && tileX < mapWidth - 1) {
            const nTile = tile + 1;
            if (this.game.owner(nTile).id() === playerId) {
              bordersOurTerritory = true;
            }
          }

          if (bordersOurTerritory) {
            // Capture the tile
            player.conquer(tile);

            // Capture structures on this tile
            this.captureStructuresOnTile(tile, playerId);

            this.checkForHQCapture(currentOwner, tileX, tileY, playerId);
          }
        }
      }
    }
  }

  /**
   * Capture wilderness (neutral land) that is completely surrounded by a single player's territory.
   * OPTIMIZED: Only captures small pockets (max 100 tiles) to avoid expensive full-map scans.
   */
  private captureSurroundedWilderness() {
    // Only run every 10 ticks for performance
    if (this.tickCount % 10 !== 0) return;

    // Max size of a pocket we'll capture - larger regions are skipped
    const MAX_POCKET_SIZE = 100;

    const visited = new Set<number>();
    const mapWidth = this.game.width();
    const mapHeight = this.game.height();

    // Iterate through all tiles looking for unvisited wilderness
    this.game.forEachTile((tile) => {
      if (visited.has(tile)) return;

      const owner = this.game.owner(tile);
      if (owner.isPlayer()) return; // Not wilderness
      if (this.game.isWater(tile)) return; // Skip water

      // Found a wilderness tile - flood fill to find the connected region
      const region: number[] = [];
      const queue: number[] = [tile];
      const surroundingPlayers = new Set<string>();
      let touchesMapEdge = false;
      let touchesWater = false;
      let tooBig = false;

      while (queue.length > 0 && !tooBig) {
        const current = queue.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const currentOwner = this.game.owner(current);

        if (currentOwner.isPlayer()) {
          // This is owned territory - record the owner
          surroundingPlayers.add(currentOwner.id());
          continue;
        }

        if (this.game.isWater(current)) {
          // Water boundary - region is open to water
          touchesWater = true;
          continue;
        }

        // This is wilderness - add to region
        region.push(current);

        // Check if region is too big to bother with
        if (region.length > MAX_POCKET_SIZE) {
          tooBig = true;
          continue;
        }

        // Check if on map edge
        const x = this.game.x(current);
        const y = this.game.y(current);
        if (x === 0 || x === mapWidth - 1 || y === 0 || y === mapHeight - 1) {
          touchesMapEdge = true;
        }

        // Add neighbors to queue
        const neighbors = this.game.neighbors(current);
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }

      // Skip large regions - they're expensive and unlikely to be enclosed
      if (tooBig) return;

      // If region doesn't touch map edge, doesn't touch water, and is surrounded by exactly one player, capture it
      if (
        !touchesMapEdge &&
        !touchesWater &&
        surroundingPlayers.size === 1 &&
        region.length > 0
      ) {
        const playerId = Array.from(surroundingPlayers)[0];
        if (
          !this.defeatedPlayers.has(playerId) &&
          this.game.hasPlayer(playerId)
        ) {
          const player = this.game.player(playerId);
          for (const wildTile of region) {
            player.conquer(wildTile);
            // Also capture any structures on this tile
            this.captureStructuresOnTile(wildTile, playerId);
          }
        }
      }
    });
  }

  private removeDeadUnits() {
    const deadUnits = this.units.filter((u) => u.health <= 0);

    for (const unit of deadUnits) {
      const building = this.coreBuildings.get(unit.playerId);
      if (building) {
        building.unitCount--;
      }
    }

    this.units = this.units.filter((u) => u.health > 0);
  }

  private enforceUnitCaps() {
    const counts = new Map<PlayerID, number>();
    const kept: FrenzyUnit[] = [];
    for (const unit of this.units) {
      const nextCount = (counts.get(unit.playerId) ?? 0) + 1;
      if (nextCount <= this.getMaxUnitsForPlayer(unit.playerId)) {
        counts.set(unit.playerId, nextCount);
        kept.push(unit);
      } else {
        const building = this.coreBuildings.get(unit.playerId);
        if (building) {
          building.unitCount = Math.max(building.unitCount - 1, 0);
        }
      }
    }
    this.units = kept;
  }

  /**
   * Capture structures on a tile when it changes ownership
   * Transfers mines, factories, ports, and towers to the new owner
   */
  private captureStructuresOnTile(tile: TileRef, newOwnerId: PlayerID) {
    // Check for mine at this tile
    const mine = this.mines.get(tile);
    if (mine && mine.playerId !== newOwnerId) {
      const oldOwner = mine.playerId;
      mine.playerId = newOwnerId;
      console.log(
        `[FrenzyManager] Mine captured by ${newOwnerId} from ${oldOwner}`,
      );
    }

    // Check for factory at this tile
    const factory = this.factories.get(tile);
    if (factory && factory.playerId !== newOwnerId) {
      const oldOwner = factory.playerId;
      factory.playerId = newOwnerId;
      console.log(
        `[FrenzyManager] Factory captured by ${newOwnerId} from ${oldOwner}`,
      );
    }

    // Check for port at this tile
    const port = this.ports.get(tile);
    if (port && port.playerId !== newOwnerId) {
      const oldOwner = port.playerId;
      port.playerId = newOwnerId;
      console.log(
        `[FrenzyManager] Port captured by ${newOwnerId} from ${oldOwner}`,
      );
    }

    // Check for tower units (DefensePost, SAM, Silo, Artillery, Shield) at or near this tile
    const towerTypes = [
      FrenzyUnitType.DefensePost,
      FrenzyUnitType.SAMLauncher,
      FrenzyUnitType.MissileSilo,
      FrenzyUnitType.ShieldGenerator,
      FrenzyUnitType.Artillery,
    ];

    const tileX = this.game.x(tile);
    const tileY = this.game.y(tile);

    for (const unit of this.units) {
      if (!towerTypes.includes(unit.unitType)) continue;
      if (unit.playerId === newOwnerId) continue;

      // Check if tower is on this tile (within 1 tile tolerance for positioning)
      const unitTileX = Math.floor(unit.x);
      const unitTileY = Math.floor(unit.y);

      if (unitTileX === tileX && unitTileY === tileY) {
        const oldOwner = unit.playerId;
        unit.playerId = newOwnerId;
        console.log(
          `[FrenzyManager] ${unit.unitType} captured by ${newOwnerId} from ${oldOwner}`,
        );
      }
    }
  }

  private checkForHQCapture(
    previousOwner: Player | TerraNullius,
    tileX: number,
    tileY: number,
    conquerorId: PlayerID,
  ) {
    if (!previousOwner.isPlayer()) {
      return;
    }
    const defenderId = previousOwner.id();
    if (!defenderId || this.defeatedPlayers.has(defenderId)) {
      return;
    }
    const building = this.coreBuildings.get(defenderId);
    if (!building) {
      return;
    }
    const buildingTileX = this.game.x(building.tile);
    const buildingTileY = this.game.y(building.tile);
    const radius = Math.max(0, Math.floor(this.config.hqCaptureRadius));
    const radiusSquared = radius * radius;
    const dx = tileX - buildingTileX;
    const dy = tileY - buildingTileY;

    // Only check if the captured tile is within the HQ radius
    if (dx * dx + dy * dy > radiusSquared) {
      return;
    }

    // Check if ALL tiles within the HQ radius are now NOT owned by the defender
    // The HQ is captured when the defender has no tiles left in the capture zone
    for (let checkDx = -radius; checkDx <= radius; checkDx++) {
      for (let checkDy = -radius; checkDy <= radius; checkDy++) {
        if (checkDx * checkDx + checkDy * checkDy > radiusSquared) {
          continue; // Skip tiles outside circular radius
        }
        const checkTileX = buildingTileX + checkDx;
        const checkTileY = buildingTileY + checkDy;

        if (!this.game.isValidCoord(checkTileX, checkTileY)) {
          continue;
        }

        const checkTile = this.game.ref(checkTileX, checkTileY);

        // Skip water tiles - they don't count toward HQ defense
        if (this.game.isWater(checkTile)) {
          continue;
        }

        const owner = this.game.owner(checkTile);
        // If the defender still owns any tile within the radius, the HQ survives
        if (owner.id() === defenderId) {
          return;
        }
      }
    }

    // All land tiles within radius are lost - HQ is captured
    this.defeatPlayer(defenderId, conquerorId);
  }

  /**
   * Check all HQs each tick to see if they should be captured
   * This handles cases where territory is captured via game mechanics
   * (e.g., surrounded clusters) rather than Frenzy unit capture
   */
  private checkAllHQCaptures() {
    const playersToDefeat: Array<{
      defenderId: PlayerID;
      conquerorId: PlayerID;
    }> = [];

    for (const [playerId, building] of this.coreBuildings) {
      if (this.defeatedPlayers.has(playerId)) {
        continue;
      }

      const buildingTileX = this.game.x(building.tile);
      const buildingTileY = this.game.y(building.tile);
      const radius = Math.max(0, Math.floor(this.config.hqCaptureRadius));
      const radiusSquared = radius * radius;

      // Check if all tiles within the HQ radius are NOT owned by the defender
      let defenderOwnsAnyTile = false;
      let conquerorId: PlayerID | null = null;

      for (let dx = -radius; dx <= radius && !defenderOwnsAnyTile; dx++) {
        for (let dy = -radius; dy <= radius && !defenderOwnsAnyTile; dy++) {
          if (dx * dx + dy * dy > radiusSquared) {
            continue;
          }
          const checkTileX = buildingTileX + dx;
          const checkTileY = buildingTileY + dy;

          if (!this.game.isValidCoord(checkTileX, checkTileY)) {
            continue;
          }

          const checkTile = this.game.ref(checkTileX, checkTileY);

          if (this.game.isWater(checkTile)) {
            continue;
          }

          const owner = this.game.owner(checkTile);
          if (owner.id() === playerId) {
            defenderOwnsAnyTile = true;
          } else if (owner.isPlayer() && conquerorId === null) {
            // Track a potential conqueror (the first enemy we find)
            conquerorId = owner.id();
          }
        }
      }

      // If defender owns no tiles in the HQ zone, mark for defeat
      if (!defenderOwnsAnyTile && conquerorId !== null) {
        playersToDefeat.push({ defenderId: playerId, conquerorId });
      }
    }

    // Defeat players after iteration to avoid modifying the map during iteration
    for (const { defenderId, conquerorId } of playersToDefeat) {
      this.defeatPlayer(defenderId, conquerorId);
    }
  }

  private defeatPlayer(loserId: PlayerID, winnerId: PlayerID) {
    if (this.defeatedPlayers.has(loserId)) {
      return;
    }
    this.defeatedPlayers.add(loserId);
    this.coreBuildings.delete(loserId);

    console.log(
      `[FrenzyManager] HQ captured: ${winnerId} eliminated ${loserId}`,
    );

    const loser = this.getPlayerIfExists(loserId);
    const winner = this.getPlayerIfExists(winnerId);
    if (loser && winner && loserId !== winnerId) {
      const tiles = Array.from(loser.tiles());
      for (const tile of tiles) {
        winner.conquer(tile);
        // Capture structures on this tile (mines, factories, ports, towers)
        this.captureStructuresOnTile(tile, winnerId);
      }
    }

    this.units = this.units.filter((unit) => unit.playerId !== loserId);
    this.projectiles = this.projectiles.filter(
      (projectile) => projectile.playerId !== loserId,
    );
  }

  private getPlayerIfExists(playerId: PlayerID): Player | null {
    if (!this.game.hasPlayer(playerId)) {
      return null;
    }
    return this.game.player(playerId);
  }

  private rebuildSpatialGrid() {
    this.spatialGrid.clear();
    for (const unit of this.units) {
      this.spatialGrid.insert(unit);
    }
  }

  /**
   * Minimum distance between static structures (defense posts, artillery, shield generators)
   */
  private readonly STATIC_STRUCTURE_MIN_DIST = 15;

  /**
   * Check if there's a static structure (defense post, artillery, shield generator) too close to the given position.
   * Returns true if the position is blocked by a nearby structure.
   */
  private hasNearbyStaticStructure(x: number, y: number): boolean {
    const minDistSquared = this.STATIC_STRUCTURE_MIN_DIST ** 2;
    for (const unit of this.units) {
      if (
        unit.unitType === FrenzyUnitType.DefensePost ||
        unit.unitType === FrenzyUnitType.Artillery ||
        unit.unitType === FrenzyUnitType.ShieldGenerator
      ) {
        const dx = unit.x - x;
        const dy = unit.y - y;
        const distSquared = dx * dx + dy * dy;
        if (distSquared < minDistSquared) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Spawn a defense post at the given location.
   * Note: No unit count check - structures always complete once building starts.
   */
  spawnDefensePost(playerId: PlayerID, x: number, y: number) {
    if (this.defeatedPlayers.has(playerId)) {
      return;
    }
    const building = this.coreBuildings.get(playerId);
    if (!building) {
      return;
    }
    // Check for nearby static structures
    if (this.hasNearbyStaticStructure(x, y)) {
      return;
    }
    this.spawnUnit(playerId, x, y, FrenzyUnitType.DefensePost);
  }

  /**
   * Spawn an artillery at the given location.
   * Note: No unit count check - structures always complete once building starts.
   */
  spawnArtillery(playerId: PlayerID, x: number, y: number) {
    if (this.defeatedPlayers.has(playerId)) {
      return;
    }
    const building = this.coreBuildings.get(playerId);
    if (!building) {
      return;
    }
    // Check for nearby static structures
    if (this.hasNearbyStaticStructure(x, y)) {
      return;
    }
    this.spawnUnit(playerId, x, y, FrenzyUnitType.Artillery);
  }

  /**
   * Spawn a shield generator at the given location.
   * Note: No unit count check - structures always complete once building starts.
   */
  spawnShieldGenerator(playerId: PlayerID, x: number, y: number) {
    if (this.defeatedPlayers.has(playerId)) {
      return;
    }
    const building = this.coreBuildings.get(playerId);
    if (!building) {
      return;
    }
    // Check for nearby static structures
    if (this.hasNearbyStaticStructure(x, y)) {
      return;
    }
    this.spawnUnit(playerId, x, y, FrenzyUnitType.ShieldGenerator);
  }

  /**
   * Spawn a SAM launcher at the given location.
   * Note: No unit count check - structures always complete once building starts.
   */
  spawnSAMLauncher(playerId: PlayerID, x: number, y: number) {
    if (this.defeatedPlayers.has(playerId)) {
      return;
    }
    const building = this.coreBuildings.get(playerId);
    if (!building) {
      return;
    }
    // Check for nearby static structures
    if (this.hasNearbyStaticStructure(x, y)) {
      return;
    }
    this.spawnUnit(playerId, x, y, FrenzyUnitType.SAMLauncher);
  }

  /**
   * Spawn a missile silo at the given location.
   * Note: No unit count check - structures always complete once building starts.
   */
  spawnMissileSilo(playerId: PlayerID, x: number, y: number) {
    if (this.defeatedPlayers.has(playerId)) {
      return;
    }
    const building = this.coreBuildings.get(playerId);
    if (!building) {
      return;
    }
    // Check for nearby static structures
    if (this.hasNearbyStaticStructure(x, y)) {
      return;
    }
    this.spawnUnit(playerId, x, y, FrenzyUnitType.MissileSilo);
  }

  /**
   * Register a factory as a unit spawner
   */
  registerFactory(playerId: PlayerID, tile: TileRef, x: number, y: number) {
    if (this.defeatedPlayers.has(playerId)) {
      return;
    }
    if (this.factories.has(tile)) {
      return; // Already registered
    }
    this.factories.set(tile, {
      id: this.nextStructureId++,
      type: FrenzyStructureType.Factory,
      playerId,
      x,
      y,
      tile,
      spawnTimer: this.config.spawnInterval,
      spawnInterval: this.config.spawnInterval,
      health: this.config.mineHealth,
      maxHealth: this.config.mineHealth,
      tier: 1,
    });
  }

  /**
   * Register a mine as a Frenzy structure for gold generation
   */
  registerMine(playerId: PlayerID, tile: TileRef, x: number, y: number) {
    if (this.defeatedPlayers.has(playerId)) {
      return;
    }
    if (this.mines.has(tile)) {
      return; // Already registered
    }
    this.mines.set(tile, {
      id: this.nextStructureId++,
      type: FrenzyStructureType.Mine,
      playerId,
      x,
      y,
      tile,
      health: this.config.mineHealth,
      maxHealth: this.config.mineHealth,
      tier: 1,
    });
  }

  /**
   * Register a port as a warship spawner
   */
  registerPort(playerId: PlayerID, tile: TileRef, x: number, y: number) {
    if (this.defeatedPlayers.has(playerId)) {
      return;
    }
    if (this.ports.has(tile)) {
      return; // Already registered
    }
    this.ports.set(tile, {
      id: this.nextStructureId++,
      type: FrenzyStructureType.Port,
      playerId,
      x,
      y,
      tile,
      spawnTimer: this.config.spawnInterval * 6, // Warships spawn slower (6x normal)
      spawnInterval: this.config.spawnInterval * 6,
      health: this.config.mineHealth,
      maxHealth: this.config.mineHealth,
      tier: 1,
    });
  }

  /**
   * Find a water tile near a port to spawn a warship
   */
  private findWaterSpawnNearPort(
    portX: number,
    portY: number,
  ): { x: number; y: number } | null {
    // Search in a spiral pattern around the port for water
    const searchRadius = 5;
    for (let r = 1; r <= searchRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // Only check perimeter
          const x = Math.floor(portX) + dx;
          const y = Math.floor(portY) + dy;
          // Check bounds before creating ref
          if (!this.game.isValidCoord(x, y)) continue;
          const tile = this.game.ref(x, y);
          if (tile && this.game.isWater(tile)) {
            return { x: x + 0.5, y: y + 0.5 }; // Center of tile
          }
        }
      }
    }
    return null;
  }

  /**
   * Apply area damage to all units within a radius (for nukes/bombs)
   */
  applyAreaDamage(
    centerX: number,
    centerY: number,
    radius: number,
    damage: number,
  ) {
    const radiusSquared = radius * radius;
    for (const unit of this.units) {
      const dx = unit.x - centerX;
      const dy = unit.y - centerY;
      const distSquared = dx * dx + dy * dy;
      if (distSquared <= radiusSquared) {
        unit.health -= damage;
      }
    }
  }

  /**
   * Get all units for rendering
   */
  getUnits(): readonly FrenzyUnit[] {
    return this.units;
  }

  /**
   * Get all core buildings for rendering
   */
  getCoreBuildings(): ReadonlyMap<PlayerID, CoreBuilding> {
    return this.coreBuildings;
  }

  /**
   * Get all mines
   */
  getMines(): ReadonlyMap<TileRef, MineStructure> {
    return this.mines;
  }

  /**
   * Get all factories
   */
  getFactories(): ReadonlyMap<TileRef, FactorySpawner> {
    return this.factories;
  }

  /**
   * Get all ports
   */
  getPorts(): ReadonlyMap<TileRef, PortSpawner> {
    return this.ports;
  }

  /**
   * Check if a player meets the HQ tier requirement for a structure upgrade
   */
  meetsHQTierRequirement(playerId: PlayerID, structureType: string): boolean {
    const upgradeInfo = STRUCTURE_UPGRADES[structureType];
    if (!upgradeInfo) return false;

    const hqTier = this.getHQTier(playerId);
    return hqTier >= upgradeInfo.requiredHQTier;
  }

  /**
   * Get the count of structures of a specific type for a player
   * Accepts both FrenzyStructureType and UnitType for compatibility
   */
  getStructureCountForPlayer(
    playerId: PlayerID,
    structureType: FrenzyStructureType | UnitType,
  ): number {
    // Map UnitType to FrenzyStructureType if needed
    let frenzyType: FrenzyStructureType | null = null;

    if (
      Object.values(FrenzyStructureType).includes(
        structureType as FrenzyStructureType,
      )
    ) {
      frenzyType = structureType as FrenzyStructureType;
    } else {
      // Map UnitType to FrenzyStructureType
      switch (structureType) {
        case UnitType.Port:
          frenzyType = FrenzyStructureType.Port;
          break;
        case UnitType.Factory:
          frenzyType = FrenzyStructureType.Factory;
          break;
        case UnitType.DefensePost:
          return this.units.filter(
            (u) =>
              u.playerId === playerId &&
              u.unitType === FrenzyUnitType.DefensePost,
          ).length;
        case UnitType.SAMLauncher:
          return this.units.filter(
            (u) =>
              u.playerId === playerId &&
              u.unitType === FrenzyUnitType.SAMLauncher,
          ).length;
        case UnitType.MissileSilo:
          return this.units.filter(
            (u) =>
              u.playerId === playerId &&
              u.unitType === FrenzyUnitType.MissileSilo,
          ).length;
        case UnitType.ShieldGenerator:
          return this.units.filter(
            (u) =>
              u.playerId === playerId &&
              u.unitType === FrenzyUnitType.ShieldGenerator,
          ).length;
        case UnitType.Artillery:
          return this.units.filter(
            (u) =>
              u.playerId === playerId &&
              u.unitType === FrenzyUnitType.Artillery,
          ).length;
        default:
          return 0;
      }
    }

    switch (frenzyType) {
      case FrenzyStructureType.HQ:
        return this.coreBuildings.has(playerId) ? 1 : 0;
      case FrenzyStructureType.Mine:
        return Array.from(this.mines.values()).filter(
          (m) => m.playerId === playerId,
        ).length;
      case FrenzyStructureType.Factory:
        return Array.from(this.factories.values()).filter(
          (f) => f.playerId === playerId,
        ).length;
      case FrenzyStructureType.Port:
        return Array.from(this.ports.values()).filter(
          (p) => p.playerId === playerId,
        ).length;
      default:
        return 0;
    }
  }

  /**
   * Get all tiles that contain structures of a specific type
   */
  getStructureTilesByType(structureType: FrenzyStructureType): TileRef[] {
    switch (structureType) {
      case FrenzyStructureType.HQ:
        return Array.from(this.coreBuildings.values()).map((b) => b.tile);
      case FrenzyStructureType.Mine:
        return Array.from(this.mines.keys());
      case FrenzyStructureType.Factory:
        return Array.from(this.factories.keys());
      case FrenzyStructureType.Port:
        return Array.from(this.ports.keys());
      default:
        return [];
    }
  }

  /**
   * Get all structure tiles for all types
   */
  getAllStructureTiles(): TileRef[] {
    const tiles: TileRef[] = [];
    for (const b of this.coreBuildings.values()) {
      tiles.push(b.tile);
    }
    for (const tile of this.mines.keys()) {
      tiles.push(tile);
    }
    for (const tile of this.factories.keys()) {
      tiles.push(tile);
    }
    for (const tile of this.ports.keys()) {
      tiles.push(tile);
    }
    return tiles;
  }

  /**
   * Get all tower tiles for a player (defense posts, artillery, SAM, silo, shield)
   */
  getTowerTilesForPlayer(playerId: PlayerID): TileRef[] {
    const tiles: TileRef[] = [];
    for (const unit of this.units) {
      if (unit.playerId !== playerId) continue;
      if (
        unit.unitType === FrenzyUnitType.DefensePost ||
        unit.unitType === FrenzyUnitType.Artillery ||
        unit.unitType === FrenzyUnitType.SAMLauncher ||
        unit.unitType === FrenzyUnitType.MissileSilo ||
        unit.unitType === FrenzyUnitType.ShieldGenerator
      ) {
        const tileX = Math.floor(unit.x);
        const tileY = Math.floor(unit.y);
        if (this.game.isValidCoord(tileX, tileY)) {
          tiles.push(this.game.ref(tileX, tileY));
        }
      }
    }
    return tiles;
  }

  /**
   * Get the HQ tier for a player
   */
  getHQTier(playerId: PlayerID): number {
    const building = this.coreBuildings.get(playerId);
    return building?.tier ?? 1;
  }

  /**
   * Upgrade the HQ for a player
   * @returns true if upgrade was successful, false otherwise
   */
  upgradeHQ(playerId: PlayerID): boolean {
    const building = this.coreBuildings.get(playerId);
    if (!building) {
      return false;
    }

    // Max HQ tier is 2
    if (building.tier >= 2) {
      return false;
    }

    const player = this.game.player(playerId);
    if (!player) {
      return false;
    }

    const upgradeCost = BigInt(100_000);
    if (player.gold() < upgradeCost) {
      return false;
    }

    // Deduct gold and upgrade tier
    player.removeGold(upgradeCost);
    building.tier += 1;

    console.log(
      `[FrenzyManager] Player ${player.name()} upgraded HQ to tier ${building.tier}`,
    );
    return true;
  }

  /**
   * Check if a factory can be upgraded (HQ tier must be >= 2)
   */
  canUpgradeFactory(playerId: PlayerID): boolean {
    return this.meetsHQTierRequirement(playerId, "factory");
  }

  /**
   * Upgrade a factory to tier 2
   * @returns true if upgrade was successful, false otherwise
   */
  upgradeFactory(playerId: PlayerID, tile: TileRef): boolean {
    const factory = this.factories.get(tile);
    if (!factory) {
      return false;
    }

    // Check if factory belongs to player
    if (factory.playerId !== playerId) {
      return false;
    }

    // Check if already tier 2+
    if (factory.tier >= 2) {
      return false;
    }

    // Check if HQ tier is >= 2 (required to upgrade factories)
    const building = this.coreBuildings.get(playerId);
    if (!building || building.tier < 2) {
      return false;
    }

    const player = this.game.player(playerId);
    if (!player) {
      return false;
    }

    const upgradeCost = BigInt(this.config.factoryUpgradeCost);
    if (player.gold() < upgradeCost) {
      return false;
    }

    // Deduct gold and upgrade tier
    player.removeGold(upgradeCost);
    factory.tier = 2;

    console.log(
      `[FrenzyManager] Player ${player.name()} upgraded factory to tier ${factory.tier}`,
    );
    return true;
  }

  /**
   * Check if a port can be upgraded (HQ tier must be >= 2)
   */
  canUpgradePort(playerId: PlayerID): boolean {
    return this.meetsHQTierRequirement(playerId, "port");
  }

  /**
   * Upgrade a port to tier 2
   * @returns true if upgrade was successful, false otherwise
   */
  upgradePort(playerId: PlayerID, tile: TileRef): boolean {
    const port = this.ports.get(tile);
    if (!port) {
      return false;
    }

    // Check if port belongs to player
    if (port.playerId !== playerId) {
      return false;
    }

    // Check if already tier 2+
    if (port.tier >= 2) {
      return false;
    }

    // Check if HQ tier is >= 2 (required to upgrade ports)
    const building = this.coreBuildings.get(playerId);
    if (!building || building.tier < 2) {
      return false;
    }

    const player = this.game.player(playerId);
    if (!player) {
      return false;
    }

    const upgradeInfo = STRUCTURE_UPGRADES["port"];
    const upgradeCost = BigInt(upgradeInfo?.upgradeCost ?? 100000);
    if (player.gold() < upgradeCost) {
      return false;
    }

    // Deduct gold and upgrade tier
    player.removeGold(upgradeCost);
    port.tier = 2;

    console.log(
      `[FrenzyManager] Player ${player.name()} upgraded port to tier ${port.tier}`,
    );
    return true;
  }

  /**
   * Check if a mine can be upgraded
   */
  canUpgradeMine(playerId: PlayerID, tile: TileRef): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    // Check HQ tier requirement
    if (!this.meetsHQTierRequirement(playerId, "mine")) return false;

    // Find the mine at this tile
    const mine = this.mines.get(tile);
    if (!mine || mine.playerId !== playerId) return false;

    // Check if already at max tier
    const upgradeInfo = STRUCTURE_UPGRADES["mine"];
    if (mine.tier >= upgradeInfo.maxTier) return false;

    // Check if player has enough gold
    const upgradeCost = BigInt(upgradeInfo.upgradeCost);
    return player.gold() >= upgradeCost;
  }

  /**
   * Upgrade a mine to tier 2 (doubles gold generation)
   * @returns true if upgrade was successful, false otherwise
   */
  upgradeMine(playerId: PlayerID, tile: TileRef): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    // Check HQ tier requirement
    if (!this.meetsHQTierRequirement(playerId, "mine")) return false;

    // Find the mine at this tile
    const mine = this.mines.get(tile);
    if (!mine || mine.playerId !== playerId) {
      return false;
    }

    // Check if already tier 2+
    if (mine.tier >= 2) {
      return false;
    }

    const upgradeCost = BigInt(this.config.mineUpgradeCost);
    if (player.gold() < upgradeCost) {
      return false;
    }

    // Deduct gold and upgrade tier
    player.removeGold(upgradeCost);
    mine.tier = 2;

    console.log(
      `[FrenzyManager] Player ${player.name()} upgraded mine to tier ${mine.tier}`,
    );
    return true;
  }

  /**
   * Check if a defense post can be upgraded (must be tier 1)
   */
  canUpgradeDefensePost(playerId: PlayerID, unitId: number): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    // Check HQ tier requirement
    if (!this.meetsHQTierRequirement(playerId, "defensePost")) return false;

    // Find the defense post
    const defensePost = this.units.find(
      (u) =>
        u.id === unitId &&
        u.playerId === playerId &&
        u.unitType === FrenzyUnitType.DefensePost,
    );
    if (!defensePost) return false;

    // Check if already at max tier
    const upgradeInfo = STRUCTURE_UPGRADES["defensePost"];
    if (defensePost.tier >= upgradeInfo.maxTier) return false;

    // Check if player has enough gold
    const upgradeCost = BigInt(upgradeInfo.upgradeCost);
    return player.gold() >= upgradeCost;
  }

  /**
   * Unified method to upgrade any Frenzy unit (tower)
   * @returns true if upgrade was successful, false otherwise
   */
  upgradeUnitUnified(playerId: PlayerID, unitId: number): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    const unit = this.units.find(
      (u) => u.id === unitId && u.playerId === playerId,
    );
    if (!unit) return false;

    // Get the structure type key for this unit
    let structureKey: string;
    switch (unit.unitType) {
      case FrenzyUnitType.DefensePost:
        structureKey = "defensePost";
        break;
      case FrenzyUnitType.SAMLauncher:
        structureKey = "sam";
        break;
      case FrenzyUnitType.MissileSilo:
        structureKey = "silo";
        break;
      case FrenzyUnitType.ShieldGenerator:
        structureKey = "shield";
        break;
      case FrenzyUnitType.Artillery:
        structureKey = "artillery";
        break;
      default:
        return false; // Mobile units can't be upgraded this way
    }

    const upgradeInfo = STRUCTURE_UPGRADES[structureKey];
    if (!upgradeInfo) return false;

    const currentTier = unit.tier ?? 1;
    if (currentTier >= upgradeInfo.maxTier) return false;

    // Check HQ tier requirement
    if (!this.meetsHQTierRequirement(playerId, structureKey)) return false;

    // Check gold
    const upgradeCost = BigInt(upgradeInfo.upgradeCost);
    if (player.gold() < upgradeCost) return false;

    // Deduct gold and upgrade
    player.removeGold(upgradeCost);
    unit.tier = currentTier + 1;

    // Increase health on upgrade
    const healthBonus = Math.floor(unit.maxHealth * 0.5); // 50% health bonus
    unit.maxHealth += healthBonus;
    unit.health = unit.maxHealth; // Heal to full on upgrade

    console.log(
      `[FrenzyManager] Player ${player.name()} upgraded ${unit.unitType} to tier ${unit.tier}`,
    );
    return true;
  }

  /**
   * Generic method to upgrade a Frenzy unit based on its type
   * Dispatches to the unified upgrade method
   */
  upgradeFrenzyUnit(
    playerId: PlayerID,
    unitId: number,
    unitType: string,
  ): boolean {
    return this.upgradeUnitUnified(playerId, unitId);
  }

  /**
   * Upgrade a defense post to tier 2 (beam attack, longer range)
   * @returns true if upgrade was successful, false otherwise
   */
  upgradeDefensePost(playerId: PlayerID, unitId: number): boolean {
    return this.upgradeUnitUnified(playerId, unitId);
  }

  /**
   * Upgrade Artillery by ID (for Frenzy units)
   */
  upgradeArtilleryById(playerId: PlayerID, unitId: number): boolean {
    return this.upgradeUnitUnified(playerId, unitId);
  }

  /**
   * Upgrade Shield Generator by ID (for Frenzy units)
   */
  upgradeShieldGeneratorById(playerId: PlayerID, unitId: number): boolean {
    return this.upgradeUnitUnified(playerId, unitId);
  }

  /**
   * Upgrade SAM launcher by ID
   */
  upgradeSAMById(playerId: PlayerID, unitId: number): boolean {
    return this.upgradeUnitUnified(playerId, unitId);
  }

  /**
   * Upgrade Missile Silo by ID
   */
  upgradeSiloById(playerId: PlayerID, unitId: number): boolean {
    return this.upgradeUnitUnified(playerId, unitId);
  }

  /**
   * Create an update containing current Frenzy state for syncing to client
   */
  createUpdate() {
    // Build unified structures array
    const structures: Array<{
      id: number;
      type: string;
      playerId: string;
      x: number;
      y: number;
      tile: number;
      tier: number;
      health: number;
      maxHealth: number;
      spawnTimer?: number;
      spawnInterval?: number;
      unitCount?: number;
      maxUnits?: number;
    }> = [];

    // Add HQs
    for (const b of this.coreBuildings.values()) {
      structures.push({
        id: b.id ?? 0,
        type: FrenzyStructureType.HQ,
        playerId: b.playerId,
        x: b.x,
        y: b.y,
        tile: b.tile,
        tier: b.tier,
        health: b.health,
        maxHealth: b.maxHealth,
        spawnTimer: b.spawnTimer,
        spawnInterval: b.spawnInterval,
        unitCount: b.unitCount,
        maxUnits: this.getMaxUnitsForPlayer(b.playerId),
      });
    }

    // Add mines
    for (const m of this.mines.values()) {
      structures.push({
        id: m.id,
        type: FrenzyStructureType.Mine,
        playerId: m.playerId,
        x: m.x,
        y: m.y,
        tile: m.tile,
        tier: m.tier,
        health: m.health,
        maxHealth: m.maxHealth,
      });
    }

    // Add factories
    for (const f of this.factories.values()) {
      structures.push({
        id: f.id ?? 0,
        type: FrenzyStructureType.Factory,
        playerId: f.playerId,
        x: f.x,
        y: f.y,
        tile: f.tile,
        tier: f.tier,
        health: f.health,
        maxHealth: f.maxHealth,
        spawnTimer: f.spawnTimer,
        spawnInterval: f.spawnInterval,
      });
    }

    // Add ports
    for (const p of this.ports.values()) {
      structures.push({
        id: p.id ?? 0,
        type: FrenzyStructureType.Port,
        playerId: p.playerId,
        x: p.x,
        y: p.y,
        tile: p.tile,
        tier: p.tier,
        health: p.health,
        maxHealth: p.maxHealth,
        spawnTimer: p.spawnTimer,
        spawnInterval: p.spawnInterval,
      });
    }

    return {
      units: this.units.map((u) => ({
        id: u.id,
        playerId: u.playerId,
        x: u.x,
        y: u.y,
        health: u.health,
        unitType: u.unitType,
        tier: u.tier,
        shieldHealth: u.shieldHealth,
        maxShieldHealth: u.maxShieldHealth,
        // Attack order data for rendering
        hasAttackOrder: u.hasAttackOrder,
        attackOrderX: u.attackOrderX,
        attackOrderY: u.attackOrderY,
      })),
      // Unified structures array (new)
      structures,
      // Legacy fields for backwards compatibility
      coreBuildings: Array.from(this.coreBuildings.values()).map((b) => ({
        playerId: b.playerId,
        x: b.x,
        y: b.y,
        spawnTimer: b.spawnTimer,
        spawnInterval: b.spawnInterval,
        unitCount: b.unitCount,
        tier: b.tier,
        maxUnits: this.getMaxUnitsForPlayer(b.playerId),
        warshipCount: this.getWarshipCount(b.playerId),
        maxWarships: this.getMaxWarshipsForPlayer(b.playerId),
        health: b.health,
        maxHealth: b.maxHealth,
      })),
      factories: Array.from(this.factories.entries()).map(([tile, f]) => ({
        tile,
        playerId: f.playerId,
        x: f.x,
        y: f.y,
        tier: f.tier,
        health: f.health,
        maxHealth: f.maxHealth,
      })),
      projectiles: this.projectiles.map((p) => ({
        id: p.id,
        playerId: p.playerId,
        x: p.x,
        y: p.y,
        isBeam: p.isBeam,
        isElite: p.isElite,
        startX: p.startX,
        startY: p.startY,
        isArtillery: p.isArtillery,
        isMissile: p.isMissile,
        targetX: p.targetX,
        targetY: p.targetY,
        areaRadius: p.areaRadius,
        progress: p.life > 0 ? p.age / p.life : 1,
      })),
      projectileSize: this.config.projectileSize,
      maxUnitsPerPlayer: this.config.maxUnitsPerPlayer,
      maxWarshipsPerPlayer: this.config.maxWarshipsPerPlayer,
      crystals: this.crystals.map((c) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        crystalCount: c.crystalCount,
        rotations: c.rotations,
      })),
      pendingGoldPayouts: [...this.pendingGoldPayouts],
    };
  }
}

interface PlayerTerritorySnapshot {
  borderTiles: TileRef[];
  centroid: { x: number; y: number };
}
