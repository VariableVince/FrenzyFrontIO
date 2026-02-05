import { Game, PlayerInfo, PlayerType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { PseudoRandom } from "../PseudoRandom";
import { GameID } from "../Schemas";
import { simpleHash } from "../Util";
import { SpawnExecution } from "./SpawnExecution";
import { BOT_NAME_PREFIXES, BOT_NAME_SUFFIXES } from "./utils/BotNames";
import { isInSpawnExclusionZone } from "./utils/PlayerSpawner";

export class BotSpawner {
  private random: PseudoRandom;
  private bots: SpawnExecution[] = [];

  private static readonly MIN_BOT_SPAWN_DISTANCE = 30;

  constructor(
    private gs: Game,
    gameID: GameID,
  ) {
    this.random = new PseudoRandom(simpleHash(gameID));
  }

  spawnBots(numBots: number): SpawnExecution[] {
    let tries = 0;
    while (this.bots.length < numBots) {
      if (tries > 10000) {
        console.log("too many retries while spawning bots, giving up");
        return this.bots;
      }
      const botName = this.randomBotName();
      const spawn = this.spawnBot(botName);
      if (spawn !== null) {
        this.bots.push(spawn);
      } else {
        tries++;
      }
    }
    return this.bots;
  }

  spawnBot(botName: string): SpawnExecution | null {
    const tile = this.chooseSpawnTile();
    if (tile === null) return null;

    return new SpawnExecution(
      new PlayerInfo(botName, PlayerType.Bot, null, this.random.nextID()),
      tile,
    );
  }

  private randomBotName(): string {
    const prefixIndex = this.random.nextInt(0, BOT_NAME_PREFIXES.length);
    const suffixIndex = this.random.nextInt(0, BOT_NAME_SUFFIXES.length);
    return `${BOT_NAME_PREFIXES[prefixIndex]} ${BOT_NAME_SUFFIXES[suffixIndex]}`;
  }

  private randTile(): TileRef {
    return this.gs.ref(
      this.random.nextInt(0, this.gs.width()),
      this.random.nextInt(0, this.gs.height()),
    );
  }

  private chooseSpawnTile(): TileRef | null {
    const mapType = this.gs.config().gameConfig().gameMap;
    const samples = 80;

    let bestTile: TileRef | null = null;
    let bestMinDist = -1;

    for (let i = 0; i < samples; i++) {
      const tile = this.randTile();
      if (!this.gs.isLand(tile)) continue;

      if (
        isInSpawnExclusionZone(
          this.gs.x(tile),
          this.gs.y(tile),
          this.gs.width(),
          this.gs.height(),
          mapType,
        )
      ) {
        continue;
      }

      let minDist = Infinity;
      for (const spawn of this.bots) {
        const d = this.gs.manhattanDist(spawn.tile, tile);
        if (d < minDist) minDist = d;
        if (minDist <= bestMinDist) break;
      }

      // First bot: take the first valid tile.
      if (this.bots.length === 0) {
        return tile;
      }

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestTile = tile;
      }
    }

    if (bestTile === null) return null;
    if (bestMinDist < BotSpawner.MIN_BOT_SPAWN_DISTANCE) return null;
    return bestTile;
  }
}
