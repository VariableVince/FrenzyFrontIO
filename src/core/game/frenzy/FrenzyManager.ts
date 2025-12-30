import { PseudoRandom } from "../../PseudoRandom";
import { PathFindResultType } from "../../pathfinding/AStar";
import { MiniAStar } from "../../pathfinding/MiniAStar";
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

  // Deterministic random number generator (seeded for multiplayer sync)
  private random: PseudoRandom;

  // Warship pathfinding - compute full path, store on unit, process one at a time
  private warshipPathfindQueue: number[] = []; // Unit IDs needing pathfinding
  private activePathfind: { unitId: number; aStar: MiniAStar } | null = null;

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
          // Towers
          defensePost: {
            ...DEFAULT_FRENZY_CONFIG.units.defensePost,
            ...config.units.defensePost,
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
          artillery: {
            ...DEFAULT_FRENZY_CONFIG.units.artillery,
            ...config.units.artillery,
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
          // Towers
          defensePost: {
            ...this.config.units.defensePost,
            ...overrides.units.defensePost,
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
          artillery: {
            ...this.config.units.artillery,
            ...overrides.units.artillery,
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

    // Check for newly spawned players and create their HQs
    for (const player of this.game.players()) {
      const tiles = player.tiles();
      if (tiles.size > 0 && !this.coreBuildings.has(player.id())) {
        this.onPlayerSpawn(player.id());
      }
    }

    this.updateSpawnTimers(deltaTime);
    this.updateMineGoldPayouts(deltaTime);

    // Process warship pathfinding queue (one per tick)
    this.processWarshipPathfindQueue();

    // Performance: Only rebuild territory cache periodically
    if (
      this.tickCount - this.territoryCacheTick >=
      this.TERRITORY_CACHE_INTERVAL
    ) {
      this.territoryCache = this.buildTerritorySnapshots();
      this.territoryCacheTick = this.tickCount;
    }

    this.updateUnits(deltaTime, this.territoryCache);
    this.updateCombat(deltaTime);
    this.updateProjectiles(deltaTime);
    this.captureTerritory();
    this.checkAllHQCaptures();
    this.removeDeadUnits();
    this.rebuildSpatialGrid();
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

      if (
        port.spawnTimer <= 0 &&
        building.unitCount < this.getMaxUnitsForPlayer(port.playerId)
      ) {
        // Find a water tile near the port to spawn the warship
        const waterSpawn = this.findWaterSpawnNearPort(port.x, port.y);
        if (waterSpawn) {
          this.spawnUnit(
            port.playerId,
            waterSpawn.x,
            waterSpawn.y,
            FrenzyUnitType.Warship,
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
      const tile = this.game.ref(Math.floor(spawnX), Math.floor(spawnY));
      if (!tile || !this.game.isWater(tile)) {
        console.warn(
          `[FrenzyManager] Warship spawn aborted - position not on water: ${spawnX}, ${spawnY}`,
        );
        return; // Don't spawn on land
      }
    }

    // Get unit-specific configuration
    const unitConfig = getUnitConfig(this.config, unitType);
    const health = unitConfig.health;
    const fireInterval = unitConfig.fireInterval;

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
      tier: 1, // Units start at tier 1
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
    // Performance: Only recalculate targets for a subset of units each tick
    const RETARGET_DISTANCE = 15; // Recalculate when within this distance of target
    const ATTACK_ORDER_ARRIVAL_DISTANCE = 20; // Clear attack order when this close to target

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
      if (unit.hasAttackOrder && unit.attackOrderX !== undefined && unit.attackOrderY !== undefined) {
        // Check if unit has arrived at attack order destination
        const distToAttackTarget = Math.hypot(
          unit.attackOrderX - unit.x,
          unit.attackOrderY - unit.y,
        );
        
        if (distToAttackTarget < ATTACK_ORDER_ARRIVAL_DISTANCE) {
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
        const distToTarget = Math.hypot(
          unit.targetX - unit.x,
          unit.targetY - unit.y,
        );
        const needsNewTarget =
          distToTarget < RETARGET_DISTANCE ||
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
   * Update warship movement - warships patrol on water near enemy coastlines
   * Uses pre-computed paths for smooth movement
   */
  private updateWarshipMovement(unit: FrenzyUnit, deltaTime: number) {
    const WAYPOINT_ARRIVAL_DISTANCE = 0.5; // Tiles
    const ATTACK_ORDER_ARRIVAL_DISTANCE = 3; // Tiles

    // Current tile position
    const currentTileX = Math.floor(unit.x);
    const currentTileY = Math.floor(unit.y);
    const currentTile = this.game.ref(currentTileX, currentTileY);
    if (!currentTile) {
      unit.vx = 0;
      unit.vy = 0;
      return;
    }

    // Determine target coordinates
    let destX: number = unit.targetX;
    let destY: number = unit.targetY;
    let hasAttackOrderTarget = false;

    // Check if warship has a per-unit attack order
    if (unit.hasAttackOrder && unit.attackOrderX !== undefined && unit.attackOrderY !== undefined) {
      destX = unit.attackOrderX;
      destY = unit.attackOrderY;
      const distToTarget = Math.hypot(destX - unit.x, destY - unit.y);
      
      if (distToTarget < ATTACK_ORDER_ARRIVAL_DISTANCE) {
        // Clear attack order - unit has arrived
        unit.hasAttackOrder = false;
        unit.attackOrderX = undefined;
        unit.attackOrderY = undefined;
        unit.path = undefined;
        unit.pathIndex = undefined;
        // Fall back to patrol target
        destX = unit.targetX;
        destY = unit.targetY;
      } else {
        hasAttackOrderTarget = true;
      }
    }

    // If no attack order, use patrol target
    if (!hasAttackOrderTarget) {
      destX = unit.targetX;
      destY = unit.targetY;
      const distToTarget = Math.hypot(destX - unit.x, destY - unit.y);
      
      // Check if needs new patrol target
      if (distToTarget < 2 || (unit.targetX === 0 && unit.targetY === 0)) {
        const newTarget = this.findWarshipTarget(unit);
        unit.targetX = newTarget.x;
        unit.targetY = newTarget.y;
        destX = newTarget.x;
        destY = newTarget.y;
        unit.path = undefined;
        unit.pathIndex = undefined;
      }
    }

    // Check if destination changed - need new path
    if (unit.path && unit.pathDestX !== undefined && unit.pathDestY !== undefined) {
      const destChanged = Math.abs(destX - unit.pathDestX) > 3 || Math.abs(destY - unit.pathDestY) > 3;
      if (destChanged) {
        unit.path = undefined;
        unit.pathIndex = undefined;
      }
    }

    // If we have a path, follow it
    if (unit.path && unit.pathIndex !== undefined && unit.pathIndex < unit.path.length) {
      const waypoint = unit.path[unit.pathIndex];
      const waypointX = waypoint.x + 0.5;
      const waypointY = waypoint.y + 0.5;
      const dx = waypointX - unit.x;
      const dy = waypointY - unit.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < WAYPOINT_ARRIVAL_DISTANCE) {
        // Advance to next waypoint
        unit.pathIndex++;
        // Don't return - continue moving toward next waypoint this frame
      }

      if (unit.pathIndex < unit.path.length) {
        const nextWaypoint = unit.path[unit.pathIndex];
        const nextX = nextWaypoint.x + 0.5;
        const nextY = nextWaypoint.y + 0.5;
        const ndx = nextX - unit.x;
        const ndy = nextY - unit.y;
        const ndist = Math.sqrt(ndx * ndx + ndy * ndy);

        if (ndist > 0.05) {
          const unitConfig = getUnitConfig(this.config, unit.unitType);
          const speed = unitConfig.speed;
          unit.vx = (ndx / ndist) * speed;
          unit.vy = (ndy / ndist) * speed;
          unit.x += unit.vx * deltaTime;
          unit.y += unit.vy * deltaTime;
          unit.x = Math.max(0, Math.min(this.game.width(), unit.x));
          unit.y = Math.max(0, Math.min(this.game.height(), unit.y));
          return;
        }
      } else {
        // Finished path
        unit.path = undefined;
        unit.pathIndex = undefined;
      }
    }

    // No path - request one if not already queued
    if (!unit.path && !this.warshipPathfindQueue.includes(unit.id)) {
      if (!this.activePathfind || this.activePathfind.unitId !== unit.id) {
        this.warshipPathfindQueue.push(unit.id);
      }
    }

    // Move directly toward target while waiting for path (if water)
    const unitConfig = getUnitConfig(this.config, unit.unitType);
    const speed = unitConfig.speed;
    const dx = destX - unit.x;
    const dy = destY - unit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0.5) {
      const moveX = (dx / dist) * speed * deltaTime;
      const moveY = (dy / dist) * speed * deltaTime;
      const nextX = unit.x + moveX;
      const nextY = unit.y + moveY;
      const nextTile = this.game.ref(Math.floor(nextX), Math.floor(nextY));
      
      if (nextTile && this.game.isWater(nextTile)) {
        unit.x = nextX;
        unit.y = nextY;
        unit.vx = (dx / dist) * speed;
        unit.vy = (dy / dist) * speed;
        return;
      }
    }

    unit.vx = 0;
    unit.vy = 0;
  }

  /**
   * Process the warship pathfinding queue - compute paths incrementally
   * Called once per tick, does limited work per tick
   */
  private processWarshipPathfindQueue() {
    const ITERATIONS_PER_TICK = 2000; // Iterations of A* to run per tick

    // Continue computing active pathfind
    if (this.activePathfind) {
      const result = this.activePathfind.aStar.compute();
      
      if (result === PathFindResultType.Completed) {
        // Got the path - store it on the unit
        const unit = this.units.find(u => u.id === this.activePathfind!.unitId);
        if (unit) {
          const pathTiles = this.activePathfind.aStar.reconstructPath();
          unit.path = pathTiles.map(t => ({ x: this.game.x(t), y: this.game.y(t) }));
          unit.pathIndex = 1; // Skip first tile (current position)
          const destX = unit.hasAttackOrder ? unit.attackOrderX : unit.targetX;
          const destY = unit.hasAttackOrder ? unit.attackOrderY : unit.targetY;
          unit.pathDestX = destX;
          unit.pathDestY = destY;
        }
        this.activePathfind = null;
      } else if (result === PathFindResultType.PathNotFound) {
        // No path - pick new target for this unit
        const unit = this.units.find(u => u.id === this.activePathfind!.unitId);
        if (unit) {
          if (unit.hasAttackOrder) {
            unit.hasAttackOrder = false;
            unit.attackOrderX = undefined;
            unit.attackOrderY = undefined;
          } else {
            const newTarget = this.findWarshipTarget(unit);
            unit.targetX = newTarget.x;
            unit.targetY = newTarget.y;
          }
        }
        this.activePathfind = null;
      }
      // If Pending, continue next tick
      return;
    }

    // Start next pathfind from queue
    while (this.warshipPathfindQueue.length > 0) {
      const unitId = this.warshipPathfindQueue.shift()!;
      const unit = this.units.find(u => u.id === unitId && u.unitType === "warship");
      if (!unit) continue; // Unit died

      // Skip if unit already has a path
      if (unit.path && unit.pathIndex !== undefined && unit.pathIndex < unit.path.length) {
        continue;
      }

      const currentTile = this.game.ref(Math.floor(unit.x), Math.floor(unit.y));
      const destX = unit.hasAttackOrder ? unit.attackOrderX! : unit.targetX;
      const destY = unit.hasAttackOrder ? unit.attackOrderY! : unit.targetY;
      const destTile = this.game.ref(Math.floor(destX), Math.floor(destY));

      if (!currentTile || !destTile) continue;

      // Create A* instance - use high iterations since we control per-tick work
      const aStar = new MiniAStar(
        this.game.map(),
        this.game.miniMap(),
        currentTile,
        destTile,
        ITERATIONS_PER_TICK,
        50, // maxTries
        true, // waterPath
      );

      this.activePathfind = { unitId, aStar };
      return; // Will compute on next call
    }
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
    const numToAssign = Math.max(1, Math.floor(mobileUnits.length * clampedRatio));

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
    const nearby = this.spatialGrid.getNearby(
      unit.x,
      unit.y,
      this.config.separationRadius,
    );

    let sepX = 0;
    let sepY = 0;
    let count = 0;

    for (const other of nearby) {
      if (other.id !== unit.id && other.playerId === unit.playerId) {
        const dx = unit.x - other.x;
        const dy = unit.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0 && dist < this.config.separationRadius) {
          sepX += dx / dist;
          sepY += dy / dist;
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
      const combatRange = isDefensePostT2 ? 37.5 : unitConfig.range; // Tier 2: 1.5x soldier range
      const effectiveFireInterval = isDefensePostT2 ? 4.0 : unit.fireInterval; // Tier 2: slow but powerful

      // Update fire interval for tier 2 defense posts
      if (isDefensePostT2 && unit.fireInterval !== effectiveFireInterval) {
        unit.fireInterval = effectiveFireInterval;
      }

      const enemies = this.spatialGrid
        .getNearby(unit.x, unit.y, combatRange)
        .filter((u) => {
          if (u.playerId === unit.playerId) return false;
          // Don't attack allies
          const otherPlayer = this.game.player(u.playerId);
          if (unitPlayer.isAlliedWith(otherPlayer)) return false;
          return true;
        });

      if (enemies.length > 0) {
        // Attack nearest enemy
        const nearest = enemies.reduce((closest, enemy) => {
          const distToEnemy = Math.hypot(enemy.x - unit.x, enemy.y - unit.y);
          const distToClosest = Math.hypot(
            closest.x - unit.x,
            closest.y - unit.y,
          );
          return distToEnemy < distToClosest ? enemy : closest;
        }, enemies[0]);

        // Artillery fires at enemy position with area damage
        if (isArtillery) {
          if (unit.weaponCooldown <= 0) {
            this.spawnArtilleryProjectile(unit, nearest.x, nearest.y);
            unit.weaponCooldown = unit.fireInterval;
          }
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
        // No Frenzy enemy units nearby - check for enemy City/Factory structures
        this.attackNearbyStructures(unit, deltaTime, unitConfig, combatRange);
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
      // Burst damage (defense posts)
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
   * Units capture territory they're standing on and nearby tiles
   */
  private captureTerritory() {
    const captureRadius = Math.max(1, Math.floor(this.config.captureRadius));
    const radiusSquared = captureRadius * captureRadius;

    // Performance: Track tiles we've already checked this tick to avoid duplicate work
    const checkedTiles = new Set<number>();

    for (const unit of this.units) {
      if (this.defeatedPlayers.has(unit.playerId)) {
        continue;
      }
      const player = this.game.player(unit.playerId);

      // Check tiles in a radius around the unit
      const centerX = Math.floor(unit.x);
      const centerY = Math.floor(unit.y);

      for (let dx = -captureRadius; dx <= captureRadius; dx++) {
        for (let dy = -captureRadius; dy <= captureRadius; dy++) {
          if (dx * dx + dy * dy > radiusSquared) {
            continue; // Skip tiles outside circular capture zone
          }
          const tileX = centerX + dx;
          const tileY = centerY + dy;

          // Check if tile is valid
          if (!this.game.isValidCoord(tileX, tileY)) {
            continue;
          }

          const tile = this.game.ref(tileX, tileY);

          // Performance: Skip if already checked by this player this tick
          const tileKey = tile * 1000 + unit.playerId.charCodeAt(0);
          if (checkedTiles.has(tileKey)) {
            continue;
          }
          checkedTiles.add(tileKey);

          if (this.game.isWater(tile)) {
            continue;
          }

          const currentOwner = this.game.owner(tile);

          if (currentOwner.id() === unit.playerId) {
            continue; // Already own this tile
          }

          // Don't capture allied territory
          if (currentOwner.isPlayer() && player.isAlliedWith(currentOwner)) {
            continue;
          }

          // Check if ANY of our tiles border this tile
          const neighbors = this.game.neighbors(tile);
          const bordersOurTerritory = neighbors.some(
            (n) => this.game.owner(n).id() === unit.playerId,
          );

          if (bordersOurTerritory) {
            // Capture the tile
            player.conquer(tile);

            // Capture structures on this tile
            this.captureStructuresOnTile(tile, unit.playerId);

            this.checkForHQCapture(currentOwner, tileX, tileY, unit.playerId);
          }
        }
      }
    }
  }

  private removeDeadUnits() {
    const deadUnits = this.units.filter((u) => u.health <= 0);

    for (const unit of deadUnits) {
      const building = this.coreBuildings.get(unit.playerId);
      if (building) {
        building.unitCount--;
      }
      // Clean up pathfinding queue for dead warships
      if (unit.unitType === "warship") {
        const queueIdx = this.warshipPathfindQueue.indexOf(unit.id);
        if (queueIdx >= 0) {
          this.warshipPathfindQueue.splice(queueIdx, 1);
        }
        if (this.activePathfind && this.activePathfind.unitId === unit.id) {
          this.activePathfind = null;
        }
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

    // Clean up pathfinding for defeated player's warships
    for (const unit of this.units) {
      if (unit.playerId === loserId && unit.unitType === "warship") {
        const queueIdx = this.warshipPathfindQueue.indexOf(unit.id);
        if (queueIdx >= 0) {
          this.warshipPathfindQueue.splice(queueIdx, 1);
        }
        if (this.activePathfind && this.activePathfind.unitId === unit.id) {
          this.activePathfind = null;
        }
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
      spawnTimer: this.config.spawnInterval * 3, // Warships spawn slower (double normal)
      spawnInterval: this.config.spawnInterval * 3,
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
   * Get factory at a tile
   */
  getFactory(tile: TileRef): FactorySpawner | undefined {
    return this.factories.get(tile);
  }

  /**
   * Get port at a tile
   */
  getPort(tile: TileRef): PortSpawner | undefined {
    return this.ports.get(tile);
  }

  /**
   * Get factory tier at a tile
   */
  getFactoryTier(tile: TileRef): number {
    const factory = this.factories.get(tile);
    return factory?.tier ?? 1;
  }

  /**
   * Get all structure tiles (mines, factories, ports) for spacing calculations
   * Used by FakeHuman to avoid clustering structures
   */
  getAllStructureTiles(): TileRef[] {
    const tiles: TileRef[] = [];
    for (const tile of this.mines.keys()) {
      tiles.push(tile);
    }
    for (const tile of this.factories.keys()) {
      tiles.push(tile);
    }
    for (const tile of this.ports.keys()) {
      tiles.push(tile);
    }
    // Add HQ tiles
    for (const [, building] of this.coreBuildings) {
      tiles.push(building.tile);
    }
    return tiles;
  }

  /**
   * Get structure tiles of a specific type for spacing calculations
   */
  getStructureTilesByType(type: FrenzyStructureType): TileRef[] {
    switch (type) {
      case FrenzyStructureType.Mine:
        return Array.from(this.mines.keys());
      case FrenzyStructureType.Factory:
        return Array.from(this.factories.keys());
      case FrenzyStructureType.Port:
        return Array.from(this.ports.keys());
      case FrenzyStructureType.HQ:
        return Array.from(this.coreBuildings.values()).map((b) => b.tile);
      default:
        return [];
    }
  }

  /**
   * Get tower units (DefensePost, Artillery, etc.) for a player
   * Used for spacing calculations
   */
  getTowerTilesForPlayer(playerId: PlayerID): TileRef[] {
    const towerTypes = [
      FrenzyUnitType.DefensePost,
      FrenzyUnitType.SAMLauncher,
      FrenzyUnitType.MissileSilo,
      FrenzyUnitType.ShieldGenerator,
      FrenzyUnitType.Artillery,
    ];
    return this.units
      .filter((u) => u.playerId === playerId && towerTypes.includes(u.unitType))
      .map((u) => this.game.ref(Math.floor(u.x), Math.floor(u.y)));
  }

  /**
   * Check if player meets HQ tier requirement for a structure upgrade
   */
  private meetsHQTierRequirement(
    playerId: PlayerID,
    structureKey: string,
  ): boolean {
    const upgradeInfo = STRUCTURE_UPGRADES[structureKey];
    if (!upgradeInfo) return false;

    const hqTier = this.getHQTier(playerId);
    return hqTier >= upgradeInfo.requiredHQTier;
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
   * Upgrade a defense post to tier 2 (beam attack, longer range)
   * @returns true if upgrade was successful, false otherwise
   */
  upgradeDefensePost(playerId: PlayerID, unitId: number): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    // Find the defense post
    const defensePost = this.units.find(
      (u) =>
        u.id === unitId &&
        u.playerId === playerId &&
        u.unitType === FrenzyUnitType.DefensePost,
    );
    if (!defensePost) return false;

    // Check if already tier 2+
    if (defensePost.tier >= 2) return false;

    const upgradeCost = BigInt(this.config.factoryUpgradeCost);
    if (player.gold() < upgradeCost) return false;

    // Deduct gold and upgrade tier
    player.removeGold(upgradeCost);
    defensePost.tier = 2;
    // Fire interval will be updated in combat loop

    console.log(
      `[FrenzyManager] Player ${player.name()} upgraded defense post to tier 2`,
    );
    return true;
  }

  /**
   * Check if a port can be upgraded
   */
  canUpgradePort(playerId: PlayerID, tile: TileRef): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    // Check HQ tier requirement
    if (!this.meetsHQTierRequirement(playerId, "port")) return false;

    const ports = player.units(UnitType.Port);
    const port = ports.find((p) => p.tile() === tile);
    if (!port) return false;

    // Check if already at max tier
    const upgradeInfo = STRUCTURE_UPGRADES["port"];
    if (port.level() >= upgradeInfo.maxTier) return false;

    // Check if player has enough gold
    const upgradeCost = BigInt(upgradeInfo.upgradeCost);
    return player.gold() >= upgradeCost;
  }

  /**
   * Upgrade a port to tier 2 (spawns elite warships)
   */
  upgradePort(playerId: PlayerID, tile: TileRef): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    const ports = player.units(UnitType.Port);
    const port = ports.find((p) => p.tile() === tile);
    if (!port) return false;

    if (port.level() >= 2) return false;

    const upgradeCost = BigInt(this.config.factoryUpgradeCost);
    if (player.gold() < upgradeCost) return false;

    player.removeGold(upgradeCost);
    port.increaseLevel();

    console.log(
      `[FrenzyManager] Player ${player.name()} upgraded port to tier ${port.level()}`,
    );
    return true;
  }

  /**
   * Check if a SAM launcher can be upgraded
   */
  canUpgradeSAM(playerId: PlayerID, tile: TileRef): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    // Check HQ tier requirement
    if (!this.meetsHQTierRequirement(playerId, "sam")) return false;

    const sams = player.units(UnitType.SAMLauncher);
    const sam = sams.find((s) => s.tile() === tile);
    if (!sam) return false;

    const upgradeInfo = STRUCTURE_UPGRADES["sam"];
    if (sam.level() >= upgradeInfo.maxTier) return false;

    const upgradeCost = BigInt(upgradeInfo.upgradeCost);
    return player.gold() >= upgradeCost;
  }

  /**
   * Upgrade a SAM launcher to tier 2 (can shoot hydrogen bombs)
   */
  upgradeSAM(playerId: PlayerID, tile: TileRef): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    const sams = player.units(UnitType.SAMLauncher);
    const sam = sams.find((s) => s.tile() === tile);
    if (!sam) return false;

    if (sam.level() >= 2) return false;

    const upgradeCost = BigInt(this.config.factoryUpgradeCost);
    if (player.gold() < upgradeCost) return false;

    player.removeGold(upgradeCost);
    sam.increaseLevel();

    console.log(
      `[FrenzyManager] Player ${player.name()} upgraded SAM launcher to tier ${sam.level()}`,
    );
    return true;
  }

  /**
   * Check if a shield generator can be upgraded
   */
  canUpgradeShield(playerId: PlayerID, tile: TileRef): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    // Check HQ tier requirement
    if (!this.meetsHQTierRequirement(playerId, "shield")) return false;

    const shields = player.units(UnitType.ShieldGenerator);
    const shield = shields.find((s) => s.tile() === tile);
    if (!shield) return false;

    const upgradeInfo = STRUCTURE_UPGRADES["shield"];
    if (shield.level() >= upgradeInfo.maxTier) return false;

    const upgradeCost = BigInt(upgradeInfo.upgradeCost);
    return player.gold() >= upgradeCost;
  }

  /**
   * Upgrade a shield generator to tier 2 (bigger radius)
   */
  upgradeShield(playerId: PlayerID, tile: TileRef): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    const shields = player.units(UnitType.ShieldGenerator);
    const shield = shields.find((s) => s.tile() === tile);
    if (!shield) return false;

    if (shield.level() >= 2) return false;

    const upgradeCost = BigInt(this.config.factoryUpgradeCost);
    if (player.gold() < upgradeCost) return false;

    player.removeGold(upgradeCost);
    shield.increaseLevel();

    console.log(
      `[FrenzyManager] Player ${player.name()} upgraded shield generator to tier ${shield.level()}`,
    );
    return true;
  }

  /**
   * Check if artillery can be upgraded
   */
  canUpgradeArtillery(playerId: PlayerID, tile: TileRef): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    // Check HQ tier requirement
    if (!this.meetsHQTierRequirement(playerId, "artillery")) return false;

    const artilleries = player.units(UnitType.Artillery);
    const artillery = artilleries.find((a) => a.tile() === tile);
    if (!artillery) return false;

    const upgradeInfo = STRUCTURE_UPGRADES["artillery"];
    if (artillery.level() >= upgradeInfo.maxTier) return false;

    const upgradeCost = BigInt(upgradeInfo.upgradeCost);
    return player.gold() >= upgradeCost;
  }

  /**
   * Upgrade artillery to tier 2 (more damage, bigger radius)
   */
  upgradeArtillery(playerId: PlayerID, tile: TileRef): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    const artilleries = player.units(UnitType.Artillery);
    const artillery = artilleries.find((a) => a.tile() === tile);
    if (!artillery) return false;

    if (artillery.level() >= 2) return false;

    const upgradeCost = BigInt(this.config.factoryUpgradeCost);
    if (player.gold() < upgradeCost) return false;

    player.removeGold(upgradeCost);
    artillery.increaseLevel();

    console.log(
      `[FrenzyManager] Player ${player.name()} upgraded artillery to tier ${artillery.level()}`,
    );
    return true;
  }

  /**
   * Check if a missile silo can be upgraded
   */
  canUpgradeSilo(playerId: PlayerID, tile: TileRef): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    // Check HQ tier requirement
    if (!this.meetsHQTierRequirement(playerId, "silo")) return false;

    const silos = player.units(UnitType.MissileSilo);
    const silo = silos.find((s) => s.tile() === tile);
    if (!silo) return false;

    const upgradeInfo = STRUCTURE_UPGRADES["silo"];
    if (silo.level() >= upgradeInfo.maxTier) return false;

    const upgradeCost = BigInt(upgradeInfo.upgradeCost);
    return player.gold() >= upgradeCost;
  }

  /**
   * Upgrade missile silo to tier 2 (can launch hydrogen bombs)
   */
  upgradeSilo(playerId: PlayerID, tile: TileRef): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    const silos = player.units(UnitType.MissileSilo);
    const silo = silos.find((s) => s.tile() === tile);
    if (!silo) return false;

    if (silo.level() >= 2) return false;

    const upgradeCost = BigInt(this.config.factoryUpgradeCost);
    if (player.gold() < upgradeCost) return false;

    player.removeGold(upgradeCost);
    silo.increaseLevel();

    console.log(
      `[FrenzyManager] Player ${player.name()} upgraded missile silo to tier ${silo.level()}`,
    );
    return true;
  }

  /**
   * Get unit count for a player
   */
  getUnitCount(playerId: PlayerID): number {
    return this.units.filter((u) => u.playerId === playerId).length;
  }

  /**
   * Generic method to upgrade a Frenzy unit based on its type
   * Dispatches to the appropriate upgrade method
   */
  upgradeFrenzyUnit(
    playerId: PlayerID,
    unitId: number,
    unitType: string,
  ): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    // Find the unit in our units list
    const unit = this.units.find(
      (u) => u.id === unitId && u.playerId === playerId,
    );
    if (!unit) return false;

    switch (unitType) {
      case FrenzyUnitType.DefensePost:
        return this.upgradeDefensePost(playerId, unitId);
      case FrenzyUnitType.Artillery:
        return this.upgradeArtilleryById(playerId, unitId);
      case FrenzyUnitType.ShieldGenerator:
        return this.upgradeShieldGeneratorById(playerId, unitId);
      case FrenzyUnitType.SAMLauncher:
        return this.upgradeSAMById(playerId, unitId);
      case FrenzyUnitType.MissileSilo:
        return this.upgradeSiloById(playerId, unitId);
      default:
        console.warn(
          `[FrenzyManager] Unknown unit type for upgrade: ${unitType}`,
        );
        return false;
    }
  }

  /**
   * Upgrade Artillery by ID (for Frenzy units)
   */
  upgradeArtilleryById(playerId: PlayerID, unitId: number): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    // Check HQ tier requirement
    if (!this.meetsHQTierRequirement(playerId, "artillery")) return false;

    const artillery = this.units.find(
      (u) =>
        u.id === unitId &&
        u.playerId === playerId &&
        u.unitType === FrenzyUnitType.Artillery,
    );
    if (!artillery) return false;

    if ((artillery.tier ?? 1) >= 2) return false;

    const upgradeCost = BigInt(this.config.factoryUpgradeCost);
    if (player.gold() < upgradeCost) return false;

    player.removeGold(upgradeCost);
    artillery.tier = 2;

    console.log(
      `[FrenzyManager] Player ${player.name()} upgraded artillery to tier 2`,
    );
    return true;
  }

  /**
   * Upgrade Shield Generator by ID (for Frenzy units)
   */
  upgradeShieldGeneratorById(playerId: PlayerID, unitId: number): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    // Check HQ tier requirement
    if (!this.meetsHQTierRequirement(playerId, "shield")) return false;

    const shield = this.units.find(
      (u) =>
        u.id === unitId &&
        u.playerId === playerId &&
        u.unitType === FrenzyUnitType.ShieldGenerator,
    );
    if (!shield) return false;

    if ((shield.tier ?? 1) >= 2) return false;

    const upgradeCost = BigInt(this.config.factoryUpgradeCost);
    if (player.gold() < upgradeCost) return false;

    player.removeGold(upgradeCost);
    shield.tier = 2;

    console.log(
      `[FrenzyManager] Player ${player.name()} upgraded shield generator to tier 2`,
    );
    return true;
  }

  /**
   * Upgrade SAM launcher by ID
   */
  upgradeSAMById(playerId: PlayerID, unitId: number): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    // Check HQ tier requirement
    if (!this.meetsHQTierRequirement(playerId, "sam")) return false;

    const sam = this.units.find(
      (u) =>
        u.id === unitId &&
        u.playerId === playerId &&
        u.unitType === FrenzyUnitType.SAMLauncher,
    );
    if (!sam) return false;

    if ((sam.tier ?? 1) >= 2) return false;

    const upgradeCost = BigInt(this.config.factoryUpgradeCost);
    if (player.gold() < upgradeCost) return false;

    player.removeGold(upgradeCost);
    sam.tier = 2;

    console.log(
      `[FrenzyManager] Player ${player.name()} upgraded SAM launcher to tier 2`,
    );
    return true;
  }

  /**
   * Upgrade Missile Silo by ID
   */
  upgradeSiloById(playerId: PlayerID, unitId: number): boolean {
    const player = this.game.player(playerId);
    if (!player) return false;

    // Check HQ tier requirement
    if (!this.meetsHQTierRequirement(playerId, "silo")) return false;

    const silo = this.units.find(
      (u) =>
        u.id === unitId &&
        u.playerId === playerId &&
        u.unitType === FrenzyUnitType.MissileSilo,
    );
    if (!silo) return false;

    if ((silo.tier ?? 1) >= 2) return false;

    const upgradeCost = BigInt(this.config.factoryUpgradeCost);
    if (player.gold() < upgradeCost) return false;

    player.removeGold(upgradeCost);
    silo.tier = 2;

    console.log(
      `[FrenzyManager] Player ${player.name()} upgraded missile silo to tier 2`,
    );
    return true;
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
        targetX: p.targetX,
        targetY: p.targetY,
        areaRadius: p.areaRadius,
        progress: p.life > 0 ? p.age / p.life : 1,
      })),
      projectileSize: this.config.projectileSize,
      maxUnitsPerPlayer: this.config.maxUnitsPerPlayer,
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

