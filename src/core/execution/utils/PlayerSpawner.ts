import { Game, GameMapType, PlayerType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { PseudoRandom } from "../../PseudoRandom";
import { GameID } from "../../Schemas";
import { simpleHash } from "../../Util";
import { SpawnExecution } from "../SpawnExecution";

/**
 * Check if a tile is in the spawn exclusion zone for a given map.
 * For SquareMap, the center 50% of the map is excluded from spawning.
 * This zone contains the most crystals and is indicated by red stripes during spawn phase.
 */
export function isInSpawnExclusionZone(
  x: number,
  y: number,
  width: number,
  height: number,
  mapType: GameMapType,
): boolean {
  if (mapType !== GameMapType.SquareMap) {
    return false;
  }

  // For SquareMap: exclude center square (50% of map size - 0.25 on each side from center)
  const centerX = width / 2;
  const centerY = height / 2;
  const exclusionHalfSize = Math.min(width, height) * 0.25;

  const dx = Math.abs(x - centerX);
  const dy = Math.abs(y - centerY);

  return dx <= exclusionHalfSize && dy <= exclusionHalfSize;
}

export class PlayerSpawner {
  private random: PseudoRandom;
  private players: SpawnExecution[] = [];
  private static readonly MAX_SPAWN_TRIES = 10_000;
  private static readonly MIN_SPAWN_DISTANCE = 30;

  constructor(
    private gm: Game,
    gameID: GameID,
  ) {
    this.random = new PseudoRandom(simpleHash(gameID));
  }

  private randTile(): TileRef {
    const x = this.random.nextInt(0, this.gm.width());
    const y = this.random.nextInt(0, this.gm.height());

    return this.gm.ref(x, y);
  }

  private randomSpawnLand(): TileRef | null {
    let tries = 0;
    const mapType = this.gm.config().gameConfig().gameMap;

    while (tries < PlayerSpawner.MAX_SPAWN_TRIES) {
      tries++;

      const tile = this.randTile();

      if (
        !this.gm.isLand(tile) ||
        this.gm.hasOwner(tile) ||
        this.gm.isBorder(tile)
      ) {
        continue;
      }

      // Check spawn exclusion zone for SquareMap
      if (
        isInSpawnExclusionZone(
          this.gm.x(tile),
          this.gm.y(tile),
          this.gm.width(),
          this.gm.height(),
          mapType,
        )
      ) {
        continue;
      }

      let tooCloseToOtherPlayer = false;
      for (const spawn of this.players) {
        if (
          this.gm.manhattanDist(spawn.tile, tile) <
          PlayerSpawner.MIN_SPAWN_DISTANCE
        ) {
          tooCloseToOtherPlayer = true;
          break;
        }
      }

      if (tooCloseToOtherPlayer) {
        continue;
      }

      return tile;
    }

    return null;
  }

  spawnPlayers(): SpawnExecution[] {
    for (const player of this.gm.allPlayers()) {
      if (player.type() !== PlayerType.Human) {
        continue;
      }

      const spawnLand = this.randomSpawnLand();

      if (spawnLand === null) {
        // TODO: this should normally not happen, additional logic may be needed, if this occurs
        continue;
      }

      this.players.push(new SpawnExecution(player.info(), spawnLand));
    }

    return this.players;
  }
}
