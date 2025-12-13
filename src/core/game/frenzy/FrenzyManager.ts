import { Game, Player, PlayerID, PlayerType, TerraNullius } from "../Game";
import { TileRef } from "../GameMap";
import {
  CoreBuilding,
  DEFAULT_FRENZY_CONFIG,
  FactorySpawner,
  FrenzyConfig,
  FrenzyProjectile,
  FrenzyUnit,
  FrenzyUnitType,
} from "./FrenzyTypes";
import { SpatialHashGrid } from "./SpatialHashGrid";

const ATTACK_ORDER_TTL_TICKS = 150; // ~15 seconds at 10 ticks/sec

/**
 * FrenzyManager handles all unit-based warfare logic for Frenzy mode
 */
export class FrenzyManager {
  private units: FrenzyUnit[] = [];
  private coreBuildings: Map<PlayerID, CoreBuilding> = new Map();
  private factories: Map<TileRef, FactorySpawner> = new Map();
  private spatialGrid: SpatialHashGrid;
  private nextUnitId = 1;
  private nextProjectileId = 1;
  private projectiles: FrenzyProjectile[] = [];
  private config: FrenzyConfig;
  private defeatedPlayers = new Set<PlayerID>();
  private attackOrders: Map<PlayerID, FrenzyAttackOrder> = new Map();
  
  // Defensive stance per player: 0 = stay near HQ, 0.5 = fire range, 1 = offensive (border)
  private playerDefensiveStance: Map<PlayerID, number> = new Map();

  // Performance: Cache territory data and only rebuild periodically
  private territoryCache: Map<PlayerID, PlayerTerritorySnapshot> = new Map();
  private territoryCacheTick = 0;
  private readonly TERRITORY_CACHE_INTERVAL = 5; // Rebuild every 5 ticks

  // Performance: Track tick count for staggered updates
  private tickCount = 0;

  constructor(
    private game: Game,
    config?: Partial<FrenzyConfig>,
  ) {
    this.config = { ...DEFAULT_FRENZY_CONFIG, ...config };
    this.spatialGrid = new SpatialHashGrid(50); // 50px cell size
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
      if (unit.playerId === playerId && unit.unitType !== FrenzyUnitType.DefensePost) {
        // Reset target to force recalculation
        unit.targetX = unit.x;
        unit.targetY = unit.y;
      }
    }
  }

  /**
   * Get the defensive stance for a player.
   * For bots/FakeHumans, returns a random value if not explicitly set.
   * For human players, defaults to 1.0 (offensive).
   */
  getPlayerDefensiveStance(playerId: PlayerID): number {
    const existingStance = this.playerDefensiveStance.get(playerId);
    if (existingStance !== undefined) {
      return existingStance;
    }
    
    // For bots and fake humans, use random stance
    const player = this.game.player(playerId);
    if (player && (player.type() === PlayerType.Bot || player.type() === PlayerType.FakeHuman)) {
      const randomStance = Math.random();
      this.playerDefensiveStance.set(playerId, randomStance);
      return randomStance;
    }
    
    // Default for human players
    return 1.0;
  }

  updateConfig(overrides: Partial<FrenzyConfig>) {
    this.config = { ...this.config, ...overrides };
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
      playerId: playerId,
      x: spawnPos.x,
      y: spawnPos.y,
      tile: spawnTile,
      tileX: this.game.x(spawnTile),
      tileY: this.game.y(spawnTile),
      spawnTimer: this.config.spawnInterval,
      spawnInterval: this.config.spawnInterval,
      unitCount: 0,
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
    
    // Performance: Only rebuild territory cache periodically
    if (this.tickCount - this.territoryCacheTick >= this.TERRITORY_CACHE_INTERVAL) {
      this.territoryCache = this.buildTerritorySnapshots();
      this.territoryCacheTick = this.tickCount;
    }
    
    this.updateUnits(deltaTime, this.territoryCache);
    this.updateCombat(deltaTime);
    this.updateProjectiles(deltaTime);
    this.captureTerritory();
    this.removeDeadUnits();
    this.rebuildSpatialGrid();
  }

  private updateSpawnTimers(deltaTime: number) {
    // Spawn from HQs
    for (const [playerId, building] of this.coreBuildings) {
      building.spawnTimer -= deltaTime;

      if (
        building.spawnTimer <= 0 &&
        building.unitCount < this.config.maxUnitsPerPlayer
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
        building.unitCount < this.config.maxUnitsPerPlayer
      ) {
        this.spawnUnit(factory.playerId, factory.x, factory.y);
        factory.spawnTimer = factory.spawnInterval;
      }
    }
  }

  private spawnUnit(
    playerId: PlayerID,
    x: number,
    y: number,
    unitType: FrenzyUnitType = FrenzyUnitType.Soldier,
  ) {
    const building = this.coreBuildings.get(playerId);
    if (!building) return;

    // Add small random offset so units don't stack (but not for defense posts)
    const isDefensePost = unitType === FrenzyUnitType.DefensePost;
    const offsetX = isDefensePost ? 0 : (Math.random() - 0.5) * 20;
    const offsetY = isDefensePost ? 0 : (Math.random() - 0.5) * 20;

    // Calculate health and fire interval based on unit type
    let health = this.config.unitHealth;
    let fireInterval = this.config.fireInterval;

    if (unitType === FrenzyUnitType.DefensePost) {
      health *= this.config.defensePostHealthMultiplier;
      // Slower fire rate for defense posts (like Obelisk from C&C)
      fireInterval /= this.config.defensePostFireRateMultiplier;
    }

    const unit: FrenzyUnit = {
      id: this.nextUnitId++,
      playerId,
      x: x + offsetX,
      y: y + offsetY,
      vx: 0,
      vy: 0,
      health,
      maxHealth: health,
      targetX: x,
      targetY: y,
      weaponCooldown: Math.random() * fireInterval,
      unitType,
      fireInterval,
    };

    this.units.push(unit);
    building.unitCount++;
  }

  private updateUnits(
    deltaTime: number,
    territories: Map<PlayerID, PlayerTerritorySnapshot>,
  ) {
    const unitCounts = this.buildUnitCounts();
    this.cleanupAttackOrders(unitCounts);
    const attackPlans = this.buildAttackPlans(unitCounts, territories);
    const attackAllocations = new Map<PlayerID, number>();

    // Performance: Only recalculate targets for a subset of units each tick
    const RETARGET_DISTANCE = 15; // Recalculate when within this distance of target

    for (const unit of this.units) {
      if (this.defeatedPlayers.has(unit.playerId)) {
        continue;
      }
      // Defense posts don't move
      if (unit.unitType === FrenzyUnitType.DefensePost) {
        continue;
      }
      
      const territory = territories.get(unit.playerId);
      
      // Check if unit needs a new target
      const distToTarget = Math.hypot(unit.targetX - unit.x, unit.targetY - unit.y);
      const needsNewTarget = distToTarget < RETARGET_DISTANCE || 
        (unit.targetX === 0 && unit.targetY === 0);
      
      // Check for attack orders - units assigned to attack get HQ-biased targeting
      const attackOrder = this.attackOrders.get(unit.playerId);
      const attackPlan = attackPlans.get(unit.playerId);
      let isAttackingUnit = false;
      
      if (attackPlan) {
        const assigned = attackAllocations.get(unit.playerId) ?? 0;
        if (assigned < attackPlan.quota) {
          attackAllocations.set(unit.playerId, assigned + 1);
          isAttackingUnit = true;
        }
      }
      
      if (needsNewTarget && territory) {
        // Calculate new target with attack target bias if attacking
        const attackTargetId = isAttackingUnit ? attackOrder?.targetPlayerId : undefined;
        const newTarget = this.calculateUnitTarget(unit, territory, attackTargetId ?? undefined);
        unit.targetX = newTarget.x;
        unit.targetY = newTarget.y;
      }

      const dx = unit.targetX - unit.x;
      const dy = unit.targetY - unit.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const stopDistance = Math.max(0, this.config.stopDistance);
      if (dist > stopDistance) {
        // Normalize direction
        unit.vx = (dx / dist) * this.config.unitSpeed;
        unit.vy = (dy / dist) * this.config.unitSpeed;

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
  ): { x: number; y: number } {
    const { borderTiles, centroid } = territory;

    // Get player's HQ position for defensive stance calculations
    const playerHQ = this.coreBuildings.get(unit.playerId);
    const hqPos = playerHQ ? { x: playerHQ.x, y: playerHQ.y } : centroid;
    
    // Get defensive stance (0 = near HQ, 0.5 = fire range, 1 = offensive/border)
    const defensiveStance = this.getPlayerDefensiveStance(unit.playerId);

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
    const tilesToCheck = borderTiles.length > MAX_TILES_TO_CHECK
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
        if (neighborOwner.isPlayer() && unitPlayer.isAlliedWith(neighborOwner)) {
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
          const hqAlignment = (hqDirX * tileDirX + hqDirY * tileDirY) / (hqDirLen * tileDirLen);
          // Boost score for tiles aligned with HQ direction
          alignmentBoost *= Math.max(0.5, 1 + hqAlignment * 0.5);
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
      const fireRange = this.config.combatRange ?? 25;
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

  queueAttackOrder(
    playerId: PlayerID,
    targetPlayerId: PlayerID | null,
    ratio: number,
  ) {
    if (!targetPlayerId) {
      return;
    }
    if (targetPlayerId === playerId) {
      return;
    }
    if (!this.game.hasPlayer(targetPlayerId)) {
      return;
    }
    if (this.defeatedPlayers.has(playerId)) {
      return;
    }

    const clampedRatio = Math.min(Math.max(ratio, 0), 1);
    if (clampedRatio <= 0) {
      this.attackOrders.delete(playerId);
      return;
    }
    this.attackOrders.set(playerId, {
      playerId,
      targetPlayerId,
      ratio: clampedRatio,
      createdAtTick: this.game.ticks(),
    });
  }

  private buildUnitCounts(): Map<PlayerID, number> {
    const counts = new Map<PlayerID, number>();
    for (const unit of this.units) {
      if (this.defeatedPlayers.has(unit.playerId)) {
        continue;
      }
      counts.set(unit.playerId, (counts.get(unit.playerId) ?? 0) + 1);
    }
    return counts;
  }

  private cleanupAttackOrders(unitCounts: Map<PlayerID, number>) {
    for (const [playerId, order] of this.attackOrders) {
      const aliveUnits = unitCounts.get(playerId) ?? 0;
      if (aliveUnits === 0 || this.defeatedPlayers.has(playerId)) {
        this.attackOrders.delete(playerId);
        continue;
      }
      if (
        order.targetPlayerId &&
        (this.defeatedPlayers.has(order.targetPlayerId) ||
          !this.game.hasPlayer(order.targetPlayerId))
      ) {
        this.attackOrders.delete(playerId);
        continue;
      }
      if (this.game.ticks() - order.createdAtTick > ATTACK_ORDER_TTL_TICKS) {
        this.attackOrders.delete(playerId);
      }
    }
  }

  private buildAttackPlans(
    unitCounts: Map<PlayerID, number>,
    territories: Map<PlayerID, PlayerTerritorySnapshot>,
  ): Map<PlayerID, FrenzyAttackPlan> {
    const plans = new Map<PlayerID, FrenzyAttackPlan>();
    for (const [playerId, order] of this.attackOrders) {
      const units = unitCounts.get(playerId) ?? 0;
      if (units === 0) {
        continue;
      }
      const target = this.resolveAttackTarget(playerId, order, territories);
      if (!target) {
        this.attackOrders.delete(playerId);
        continue;
      }
      const desired = Math.floor(units * order.ratio);
      const quota = Math.min(units, Math.max(1, desired));
      if (quota === 0) {
        continue;
      }
      plans.set(playerId, {
        target,
        quota,
      });
    }
    return plans;
  }

  private resolveAttackTarget(
    attackerId: PlayerID,
    order: FrenzyAttackOrder,
    territories: Map<PlayerID, PlayerTerritorySnapshot>,
  ): { x: number; y: number } | null {
    if (!order.targetPlayerId) {
      return null;
    }

    const targetTerritory = territories.get(order.targetPlayerId);
    if (!targetTerritory) {
      return null;
    }

    const attackerTerritory = territories.get(attackerId);
    if (attackerTerritory && targetTerritory.borderTiles.length > 0) {
      const origin = attackerTerritory.centroid;
      let closestTile: TileRef | null = null;
      let closestDist = Infinity;

      for (const tile of targetTerritory.borderTiles) {
        const tileX = this.game.x(tile);
        const tileY = this.game.y(tile);
        const dist = Math.hypot(tileX - origin.x, tileY - origin.y);
        if (dist < closestDist) {
          closestDist = dist;
          closestTile = tile;
        }
      }

      if (closestTile !== null) {
        return {
          x: this.game.x(closestTile),
          y: this.game.y(closestTile),
        };
      }
    }

    return targetTerritory.centroid;
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
      const sampledBorderTiles = borderTiles.length > MAX_BORDER_TILES
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
      unit.vx += (sepX / count) * this.config.unitSpeed * separationStrength;
      unit.vy += (sepY / count) * this.config.unitSpeed * separationStrength;
    }
  }

  private updateCombat(deltaTime: number) {
    // Track which units are in combat to apply mutual damage
    const combatPairs = new Map<number, number>();

    for (const unit of this.units) {
      if (this.defeatedPlayers.has(unit.playerId)) {
        continue;
      }
      unit.weaponCooldown = Math.max(0, unit.weaponCooldown - deltaTime);
      
      const unitPlayer = this.game.player(unit.playerId);
      const isDefensePost = unit.unitType === FrenzyUnitType.DefensePost;
      
      // Defense posts have extended range
      const combatRange = isDefensePost 
        ? this.config.combatRange * this.config.defensePostRangeMultiplier
        : this.config.combatRange;
        
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

        // Defense posts deal burst damage on shot, regular units deal DPS
        if (isDefensePost) {
          // Defense post damage is dealt when weapon fires (burst damage)
          if (unit.weaponCooldown <= 0) {
            nearest.health -= this.config.defensePostDamage;
            this.spawnBeamProjectile(unit, nearest);
            unit.weaponCooldown = unit.fireInterval;
          }
        } else {
          // Regular unit DPS
          nearest.health -= this.config.unitDPS * deltaTime;

          // Track that this unit is in combat (for mutual damage)
          combatPairs.set(unit.id, nearest.id);

          if (unit.weaponCooldown <= 0) {
            this.spawnProjectile(unit, nearest);
            unit.weaponCooldown = unit.fireInterval;
          }
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

  private updateProjectiles(deltaTime: number) {
    const active: FrenzyProjectile[] = [];
    for (const projectile of this.projectiles) {
      projectile.age += deltaTime;
      projectile.x += projectile.vx * deltaTime;
      projectile.y += projectile.vy * deltaTime;
      if (projectile.age < projectile.life) {
        active.push(projectile);
      }
    }
    this.projectiles = active;
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
    }

    this.units = this.units.filter((u) => u.health > 0);
  }

  private enforceUnitCaps() {
    const counts = new Map<PlayerID, number>();
    const kept: FrenzyUnit[] = [];
    for (const unit of this.units) {
      const nextCount = (counts.get(unit.playerId) ?? 0) + 1;
      if (nextCount <= this.config.maxUnitsPerPlayer) {
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
    const radius = Math.max(0, Math.floor(this.config.hqCaptureRadius));
    const radiusSquared = radius * radius;
    const dx = tileX - building.tileX;
    const dy = tileY - building.tileY;

    if (dx * dx + dy * dy > radiusSquared) {
      return;
    }

    this.defeatPlayer(defenderId, conquerorId);
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
   * Spawn a defense post at the given location
   */
  spawnDefensePost(playerId: PlayerID, x: number, y: number) {
    if (this.defeatedPlayers.has(playerId)) {
      return;
    }
    const building = this.coreBuildings.get(playerId);
    if (!building) {
      return;
    }
    if (building.unitCount >= this.config.maxUnitsPerPlayer) {
      return;
    }
    this.spawnUnit(playerId, x, y, FrenzyUnitType.DefensePost);
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
      playerId,
      x,
      y,
      tile,
      spawnTimer: this.config.spawnInterval,
      spawnInterval: this.config.spawnInterval,
    });
  }

  /**
   * Apply area damage to all units within a radius (for nukes/bombs)
   */
  applyAreaDamage(centerX: number, centerY: number, radius: number, damage: number) {
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
   * Get unit count for a player
   */
  getUnitCount(playerId: PlayerID): number {
    return this.units.filter((u) => u.playerId === playerId).length;
  }

  /**
   * Create an update containing current Frenzy state for syncing to client
   */
  createUpdate() {
    return {
      units: this.units.map((u) => ({
        id: u.id,
        playerId: u.playerId,
        x: u.x,
        y: u.y,
        health: u.health,
        unitType: u.unitType,
      })),
      coreBuildings: Array.from(this.coreBuildings.values()).map((b) => ({
        playerId: b.playerId,
        x: b.x,
        y: b.y,
        spawnTimer: b.spawnTimer,
        spawnInterval: b.spawnInterval,
        unitCount: b.unitCount,
      })),
      projectiles: this.projectiles.map((p) => ({
        id: p.id,
        playerId: p.playerId,
        x: p.x,
        y: p.y,
        isBeam: p.isBeam,
        startX: p.startX,
        startY: p.startY,
      })),
      projectileSize: this.config.projectileSize,
    };
  }
}

interface PlayerTerritorySnapshot {
  borderTiles: TileRef[];
  centroid: { x: number; y: number };
}

interface FrenzyAttackOrder {
  playerId: PlayerID;
  targetPlayerId: PlayerID | null;
  ratio: number;
  createdAtTick: number;
}

interface FrenzyAttackPlan {
  target: { x: number; y: number };
  quota: number;
}
