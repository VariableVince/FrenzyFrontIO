import { Execution, Game, GameFork, Player, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { PseudoRandom } from "../PseudoRandom";
import { simpleHash } from "../Util";
import { ConstructionExecution } from "./ConstructionExecution";
import { structureSpawnTileValue } from "./nation/structureSpawnTileValue";
import { BotBehavior } from "./utils/BotBehavior";

export class BotExecution implements Execution {
  private active = true;
  private random: PseudoRandom;
  private mg: Game;
  private neighborsTerraNullius = true;

  private behavior: BotBehavior | null = null;
  private attackRate: number;
  private attackTick: number;
  private triggerRatio: number;
  private reserveRatio: number;
  private expandRatio: number;

  // Frenzy mode: cached mine limit based on territory size
  // Bots get 2x the base limit (territory / TILES_PER_MINE)
  private static readonly TILES_PER_MINE = 2500;
  private static readonly MINE_LIMIT_MULTIPLIER = 2;
  private static readonly MINE_LIMIT_UPDATE_INTERVAL = 100;
  private cachedMaxMines = 0;
  private lastMineLimitUpdateTick = -1000; // Force update on first check

  constructor(private bot: Player) {
    this.random = new PseudoRandom(simpleHash(bot.id()));
    this.attackRate = this.random.nextInt(40, 80);
    this.attackTick = this.random.nextInt(0, this.attackRate);
    this.triggerRatio = this.random.nextInt(50, 60) / 100;
    this.reserveRatio = this.random.nextInt(30, 40) / 100;
    this.expandRatio = this.random.nextInt(10, 20) / 100;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  init(mg: Game) {
    this.mg = mg;
  }

  tick(ticks: number) {
    const isFrenzyMode =
      this.mg.config().gameConfig().gameFork === GameFork.Frenzy;

    if (ticks % this.attackRate !== this.attackTick) return;

    if (!this.bot.isAlive()) {
      this.active = false;
      return;
    }

    if (this.behavior === null) {
      this.behavior = new BotBehavior(
        this.random,
        this.mg,
        this.bot,
        this.triggerRatio,
        this.reserveRatio,
        this.expandRatio,
      );

      // Send an attack on the first tick (not in Frenzy mode)
      if (!isFrenzyMode) {
        this.behavior.sendAttack(this.mg.terraNullius());
      }
      return;
    }

    this.behavior.handleAllianceRequests();
    this.behavior.handleAllianceExtensionRequests();

    // In Frenzy mode, build structures based on defensive stance
    if (isFrenzyMode) {
      this.handleFrenzyUnits();
      return;
    }

    this.maybeAttack();
  }

  private maybeAttack() {
    if (this.behavior === null) {
      throw new Error("not initialized");
    }
    const toAttack = this.behavior.getNeighborTraitorToAttack();
    if (toAttack !== null) {
      const odds = this.bot.isFriendly(toAttack) ? 6 : 3;
      if (this.random.chance(odds)) {
        // Check and break alliance before attacking if needed
        const alliance = this.bot.allianceWith(toAttack);

        if (alliance !== null) {
          this.bot.breakAlliance(alliance);
        }

        this.behavior.sendAttack(toAttack);
        return;
      }
    }

    if (this.neighborsTerraNullius) {
      if (this.bot.sharesBorderWith(this.mg.terraNullius())) {
        this.behavior.sendAttack(this.mg.terraNullius());
        return;
      }
      this.neighborsTerraNullius = false;
    }

    this.behavior.forgetOldEnemies();
    const enemy = this.behavior.selectRandomEnemy();
    if (!enemy) return;
    if (!this.bot.sharesBorderWith(enemy)) return;
    this.behavior.sendAttack(enemy);
  }

  isActive(): boolean {
    return this.active;
  }

  /**
   * Handle structure building in Frenzy mode for bots.
   * Uses defensive stance to determine priority.
   *
   * Multiplier formula: Higher multiplier = higher perceived cost = builds fewer of that type
   * We use (num + X) where X controls how many are built before cost becomes prohibitive
   */
  private handleFrenzyUnits(): boolean {
    if (!this.mg.frenzyManager()) return false;

    const stance = this.mg
      .frenzyManager()!
      .getPlayerDefensiveStance(this.bot.id());

    // In Frenzy: UnitType.City = Mine (gold generation)

    if (stance < 0.5) {
      // Defensive: Prioritize defense, then economy
      // Lower base multiplier = will build more before moving to next type
      return (
        this.maybeSpawnStructure(UnitType.DefensePost, (num) => num + 1) ||
        this.maybeSpawnStructure(UnitType.ShieldGenerator, (num) => num + 1) ||
        this.maybeSpawnStructure(UnitType.SAMLauncher, (num) => num + 2) ||
        this.maybeSpawnStructure(UnitType.Artillery, (num) => num + 1) ||
        this.maybeSpawnStructure(UnitType.City, (num) => num + 1) || // Mine
        this.maybeSpawnStructure(UnitType.Factory, (num) => num + 2) ||
        this.maybeSpawnStructure(UnitType.Port, (num) => num + 2) ||
        this.maybeSpawnStructure(UnitType.MissileSilo, (num) => num + 3)
      );
    } else {
      // Offensive: Prioritize economy/offense, then defense
      return (
        this.maybeSpawnStructure(UnitType.City, (num) => num + 1) || // Mine
        this.maybeSpawnStructure(UnitType.Factory, (num) => num + 1) ||
        this.maybeSpawnStructure(UnitType.Port, (num) => num + 1) ||
        this.maybeSpawnStructure(UnitType.DefensePost, (num) => num + 3) ||
        this.maybeSpawnStructure(UnitType.ShieldGenerator, (num) => num + 3) ||
        this.maybeSpawnStructure(UnitType.SAMLauncher, (num) => num + 2) ||
        this.maybeSpawnStructure(UnitType.Artillery, (num) => num + 3) ||
        this.maybeSpawnStructure(UnitType.MissileSilo, (num) => num + 2)
      );
    }
  }

  private maybeSpawnStructure(
    type: UnitType,
    multiplier: (num: number) => number,
  ): boolean {
    // In Frenzy mode, use FrenzyManager's structure count instead of game units
    const frenzyManager = this.mg.frenzyManager();
    const owned = frenzyManager
      ? frenzyManager.getStructureCountForPlayer(this.bot.id(), type)
      : this.bot.unitsOwned(type);

    // Limit mines for bots based on territory size (City = Mine in Frenzy)
    // Bots get 2x the base limit
    if (frenzyManager && type === UnitType.City) {
      const currentTick = this.mg.ticks();
      if (
        currentTick - this.lastMineLimitUpdateTick >=
        BotExecution.MINE_LIMIT_UPDATE_INTERVAL
      ) {
        const baseLimit =
          this.bot.numTilesOwned() / BotExecution.TILES_PER_MINE;
        this.cachedMaxMines = Math.max(
          1,
          Math.floor(baseLimit * BotExecution.MINE_LIMIT_MULTIPLIER),
        );
        this.lastMineLimitUpdateTick = currentTick;
      }
      if (owned >= this.cachedMaxMines) {
        return false;
      }
    }

    const perceivedCostMultiplier = multiplier(owned + 1);
    const realCost = this.mg.unitInfo(type).cost(this.bot);
    const perceivedCost = realCost * BigInt(perceivedCostMultiplier);
    if (this.bot.gold() < perceivedCost) {
      return false;
    }
    const tile = this.structureSpawnTile(type);
    if (tile === null) {
      return false;
    }
    const canBuild = this.bot.canBuild(type, tile);
    if (canBuild === false) {
      return false;
    }
    this.mg.addExecution(new ConstructionExecution(this.bot, type, tile));
    return true;
  }

  private structureSpawnTile(type: UnitType): TileRef | null {
    const tiles =
      type === UnitType.Port
        ? this.randCoastalTileArray(25)
        : this.randTerritoryTileArray(25);
    if (tiles.length === 0) return null;
    const valueFunction = structureSpawnTileValue(this.mg, this.bot, type);
    let bestTile: TileRef | null = null;
    let bestValue = 0;
    for (const t of tiles) {
      const v = valueFunction(t);
      if (v <= bestValue && bestTile !== null) continue;
      if (!this.bot.canBuild(type, t)) continue;
      bestTile = t;
      bestValue = v;
    }
    return bestTile;
  }

  private randCoastalTileArray(numTiles: number): TileRef[] {
    const tiles = Array.from(this.bot.borderTiles()).filter((t) =>
      this.mg.isOceanShore(t),
    );
    return Array.from(this.arraySampler(tiles, numTiles));
  }

  private randTerritoryTileArray(numTiles: number): TileRef[] {
    const tiles = Array.from(this.bot.tiles());
    return Array.from(this.arraySampler(tiles, numTiles));
  }

  private *arraySampler<T>(a: T[], sampleSize: number): Generator<T> {
    if (a.length <= sampleSize) {
      yield* a;
    } else {
      const remaining = new Set<T>(a);
      while (sampleSize--) {
        const t = this.random.randFromSet(remaining);
        remaining.delete(t);
        yield t;
      }
    }
  }
}
