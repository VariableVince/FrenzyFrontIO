import {
  Execution,
  Game,
  GameFork,
  Player,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";

export class MissileSiloExecution implements Execution {
  private active = true;
  private mg: Game;
  private silo: Unit | null = null;

  constructor(
    private player: Player,
    private tile: TileRef,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (this.silo === null) {
      // In Frenzy mode, the FrenzyUnit is already at the tile, so skip canBuild check
      // and directly build the unit at the tile (needed for nuke launching)
      const isFrenzy =
        this.mg.config().gameConfig().gameFork === GameFork.Frenzy;
      let spawnTile: TileRef | false;

      if (isFrenzy) {
        // In Frenzy mode, use the tile directly since FrenzyUnit already occupies it
        spawnTile = this.tile;
      } else {
        spawnTile = this.player.canBuild(UnitType.MissileSilo, this.tile);
      }

      if (spawnTile === false) {
        console.warn(
          `player ${this.player} cannot build missile silo at ${this.tile}`,
        );
        this.active = false;
        return;
      }
      this.silo = this.player.buildUnit(UnitType.MissileSilo, spawnTile, {});

      if (this.player !== this.silo.owner()) {
        this.player = this.silo.owner();
      }
    }

    // frontTime is the time the earliest missile fired.
    const frontTime = this.silo.missileTimerQueue()[0];
    if (frontTime === undefined) {
      return;
    }

    const cooldown =
      this.mg.config().SiloCooldown() - (this.mg.ticks() - frontTime);

    if (cooldown <= 0) {
      this.silo.reloadMissile();
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
