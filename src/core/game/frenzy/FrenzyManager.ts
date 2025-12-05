import { Game, Player, PlayerID, TerraNullius } from "../Game";
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

  constructor(
    private game: Game,
    config?: Partial<FrenzyConfig>,
  ) {
    this.config = { ...DEFAULT_FRENZY_CONFIG, ...config };
    this.spatialGrid = new SpatialHashGrid(50); // 50px cell size
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

    // Check for newly spawned players and create their HQs
    for (const player of this.game.players()) {
      const tiles = player.tiles();
      if (tiles.size > 0 && !this.coreBuildings.has(player.id())) {
        this.onPlayerSpawn(player.id());
      }
    }

    this.updateSpawnTimers(deltaTime);
    const territoryCache = this.buildTerritorySnapshots();
    this.updateUnits(deltaTime, territoryCache);
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

    // Add small random offset so units don't stack
    const offsetX = (Math.random() - 0.5) * 20;
    const offsetY = (Math.random() - 0.5) * 20;

    // Calculate health and fire interval based on unit type
    let health = this.config.unitHealth;
    let fireInterval = this.config.fireInterval;

    if (unitType === FrenzyUnitType.DefensePost) {
      health *= this.config.defensePostHealthMultiplier;
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

    for (const unit of this.units) {
      if (this.defeatedPlayers.has(unit.playerId)) {
        continue;
      }
      // Defense posts don't move
      if (unit.unitType === FrenzyUnitType.DefensePost) {
        continue;
      }
      const territory = territories.get(unit.playerId);
      if (!territory) {
        continue;
      }
      const { borderTiles, centroid } = territory;
      let targetPos: { x: number; y: number };

      if (borderTiles.length > 0) {
        // Compute centroid of player's territory to bias radial expansion
        const cx = centroid.x;
        const cy = centroid.y;

        // Find the best enemy/neutral neighbor tile that aligns with the unit's radial direction
        let bestTile: number | null = null;
        let bestScore = Infinity;

        const ux = unit.x - cx;
        const uy = unit.y - cy;
        const uLen = Math.hypot(ux, uy) || 1;

        for (const borderTile of borderTiles) {
          const neighbors = this.game.neighbors(borderTile);
          for (const neighbor of neighbors) {
            // Skip if we own this neighbor
            if (this.game.owner(neighbor).id() === unit.playerId) {
              continue;
            }
            // Skip water
            if (this.game.isWater(neighbor)) {
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

            const alignmentBoost = Math.max(
              0.1,
              1 + this.config.radialAlignmentWeight * alignment,
            );

            const score = dist / alignmentBoost;

            if (score < bestScore) {
              bestScore = score;
              bestTile = neighbor;
            }
          }
        }

        if (bestTile !== null) {
          const base = {
            x: this.game.x(bestTile),
            y: this.game.y(bestTile),
          };
          if (this.config.borderAdvanceDistance > 0) {
            const dirX = base.x - cx;
            const dirY = base.y - cy;
            const dirLen = Math.hypot(dirX, dirY) || 1;
            targetPos = {
              x: Math.max(
                0,
                Math.min(
                  this.game.width(),
                  base.x + (dirX / dirLen) * this.config.borderAdvanceDistance,
                ),
              ),
              y: Math.max(
                0,
                Math.min(
                  this.game.height(),
                  base.y + (dirY / dirLen) * this.config.borderAdvanceDistance,
                ),
              ),
            };
          } else {
            targetPos = base;
          }
        } else {
          // No valid enemy tiles found, move toward map center
          targetPos = {
            x: this.game.width() / 2,
            y: this.game.height() / 2,
          };
        }
      } else {
        // Fallback: move toward map center if no borders found
        targetPos = {
          x: this.game.width() / 2,
          y: this.game.height() / 2,
        };
      }

      const attackPlan = attackPlans.get(unit.playerId);
      if (attackPlan) {
        const assigned = attackAllocations.get(unit.playerId) ?? 0;
        if (assigned < attackPlan.quota) {
          attackAllocations.set(unit.playerId, assigned + 1);
          targetPos = attackPlan.target;
        }
      }

      const dx = targetPos.x - unit.x;
      const dy = targetPos.y - unit.y;
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
      const tiles = Array.from(player.tiles());
      if (tiles.length === 0) {
        continue;
      }

      let sumX = 0;
      let sumY = 0;
      for (const tile of tiles) {
        sumX += this.game.x(tile);
        sumY += this.game.y(tile);
      }

      const borderTiles = tiles.filter((tile) => {
        const neighbors = this.game.neighbors(tile);
        return neighbors.some(
          (neighbor) => this.game.owner(neighbor).id() !== player.id(),
        );
      });

      cache.set(player.id(), {
        borderTiles,
        centroid: {
          x: sumX / tiles.length,
          y: sumY / tiles.length,
        },
      });
    }
    return cache;
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
      const enemies = this.spatialGrid
        .getNearby(unit.x, unit.y, this.config.combatRange)
        .filter((u) => u.playerId !== unit.playerId);

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

        // Deal damage to enemy
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
    let captureCount = 0;
    let unitCount = 0;
    let outsideTerritory = 0;
    let borderingCount = 0;

    const captureRadius = Math.max(1, Math.floor(this.config.captureRadius));
    const radiusSquared = captureRadius * captureRadius;

    for (const unit of this.units) {
      if (this.defeatedPlayers.has(unit.playerId)) {
        continue;
      }
      unitCount++;
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

          if (this.game.isWater(tile)) {
            continue;
          }

          const currentOwner = this.game.owner(tile);

          if (currentOwner.id() === unit.playerId) {
            continue; // Already own this tile
          }

          if (dx === 0 && dy === 0) {
            outsideTerritory++;
          }

          // Check if ANY of our tiles border this tile
          const neighbors = this.game.neighbors(tile);
          const bordersOurTerritory = neighbors.some(
            (n) => this.game.owner(n).id() === unit.playerId,
          );

          if (bordersOurTerritory) {
            if (dx === 0 && dy === 0) {
              borderingCount++;
            }
            // Capture the tile
            player.conquer(tile);
            this.checkForHQCapture(currentOwner, tileX, tileY, unit.playerId);
            captureCount++;
          }
        }
      }
    }

    if (this.game.ticks() % 50 === 0 && unitCount > 0) {
      console.log(
        `[FrenzyManager] Units: ${unitCount}, Outside territory: ${outsideTerritory}, Bordering: ${borderingCount}, Captured: ${captureCount}`,
      );
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
