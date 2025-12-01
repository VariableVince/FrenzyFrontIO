import { Game, PlayerID } from "../Game";
import {
  CoreBuilding,
  DEFAULT_FRENZY_CONFIG,
  FrenzyConfig,
  FrenzyUnit,
} from "./FrenzyTypes";
import { SpatialHashGrid } from "./SpatialHashGrid";

/**
 * FrenzyManager handles all unit-based warfare logic for Frenzy mode
 */
export class FrenzyManager {
  private units: FrenzyUnit[] = [];
  private coreBuildings: Map<PlayerID, CoreBuilding> = new Map();
  private spatialGrid: SpatialHashGrid;
  private nextUnitId = 1;
  private config: FrenzyConfig;

  constructor(
    private game: Game,
    config?: Partial<FrenzyConfig>,
  ) {
    this.config = { ...DEFAULT_FRENZY_CONFIG, ...config };
    this.spatialGrid = new SpatialHashGrid(50); // 50px cell size
  }

  /**
   * Initialize core buildings at player spawn positions
   */
  init() {
    const players = this.game.players();

    for (const player of players) {
      // Get spawn position from player's first tile (center of territory)
      const tiles = Array.from(player.tiles());
      if (tiles.length === 0) {
        console.warn(
          `[FrenzyManager] Player ${player.name()} has no tiles yet`,
        );
        continue;
      }

      // Use first tile as spawn position (in classic mode this is where they spawned)
      const spawnTile = tiles[0];
      const spawnPos = {
        x: this.game.x(spawnTile),
        y: this.game.y(spawnTile),
      };

      this.coreBuildings.set(player.id(), {
        playerId: player.id(),
        x: spawnPos.x,
        y: spawnPos.y,
        spawnTimer: this.config.spawnInterval,
        spawnInterval: this.config.spawnInterval,
        unitCount: 0,
      });

      // Spawn initial units
      for (let i = 0; i < this.config.startingUnits; i++) {
        this.spawnUnit(player.id(), spawnPos.x, spawnPos.y);
      }
    }

    console.log(
      `[FrenzyManager] Initialized ${this.coreBuildings.size} core buildings`,
    );
  }

  /**
   * Main tick function called every game tick
   */
  tick(deltaTime: number) {
    this.updateSpawnTimers(deltaTime);
    this.updateUnits(deltaTime);
    this.updateCombat(deltaTime);
    this.removeDeadUnits();
    this.rebuildSpatialGrid();
  }

  private updateSpawnTimers(deltaTime: number) {
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
  }

  private spawnUnit(playerId: PlayerID, x: number, y: number) {
    const building = this.coreBuildings.get(playerId);
    if (!building) return;

    // Add small random offset so units don't stack
    const offsetX = (Math.random() - 0.5) * 20;
    const offsetY = (Math.random() - 0.5) * 20;

    const unit: FrenzyUnit = {
      id: this.nextUnitId++,
      playerId,
      x: x + offsetX,
      y: y + offsetY,
      vx: 0,
      vy: 0,
      health: this.config.unitHealth,
      targetX: x,
      targetY: y,
    };

    this.units.push(unit);
    building.unitCount++;
  }

  private updateUnits(deltaTime: number) {
    for (const unit of this.units) {
      // Find target (move toward map center for now - will improve AI later)
      const mapCenter = {
        x: this.game.width() / 2,
        y: this.game.height() / 2,
      };

      const dx = mapCenter.x - unit.x;
      const dy = mapCenter.y - unit.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 10) {
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
      }
    }
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
      const separationStrength = 0.3;
      unit.vx += (sepX / count) * this.config.unitSpeed * separationStrength;
      unit.vy += (sepY / count) * this.config.unitSpeed * separationStrength;
    }
  }

  private updateCombat(deltaTime: number) {
    for (const unit of this.units) {
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

        nearest.health -= this.config.unitDPS * deltaTime;
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

  private rebuildSpatialGrid() {
    this.spatialGrid.clear();
    for (const unit of this.units) {
      this.spatialGrid.insert(unit);
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
      })),
      coreBuildings: Array.from(this.coreBuildings.values()).map((b) => ({
        playerId: b.playerId,
        x: b.x,
        y: b.y,
      })),
    };
  }
}
