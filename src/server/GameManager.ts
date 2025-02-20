import { Config, ServerConfig } from "../core/configuration/Config";
import { ClientID, GameConfig, GameID } from "../core/Schemas";
import { v4 as uuidv4 } from "uuid";
import { Client } from "./Client";
import { GamePhase, GameServer } from "./GameServer";
import { Difficulty, GameMapType, GameType } from "../core/game/Game";
import { generateID } from "../core/Util";
import { PseudoRandom } from "../core/PseudoRandom";

export class GameManager {
  private lastNewLobby: number = 0;
  private mapsPlaylist: GameMapType[] = [];

  private games: GameServer[] = [];

  private random = new PseudoRandom(123);

  constructor(private config: ServerConfig) {}

  public game(id: GameID): GameServer | null {
    return this.games.find((g) => g.id == id);
  }

  gamesByPhase(phase: GamePhase): GameServer[] {
    return this.games.filter((g) => g.phase() == phase);
  }

  addClient(client: Client, gameID: GameID, lastTurn: number): boolean {
    const game = this.games.find((g) => g.id == gameID);
    if (game) {
      game.addClient(client, lastTurn);
      return true;
    }
    return false;
  }

  updateGameConfig(gameID: GameID, gameConfig: GameConfig) {
    const game = this.games.find((g) => g.id == gameID);
    if (game == null) {
      console.warn(`game ${gameID} not found`);
      return;
    }
    game.updateGameConfig(gameConfig);
  }

  createPrivateGame(): string {
    const id = generateID();
    this.games.push(
      new GameServer(id, Date.now(), false, this.config, {
        gameMap: GameMapType.World,
        gameType: GameType.Private,
        difficulty: Difficulty.Medium,
        disableBots: false,
        disableNPCs: false,
        creativeMode: false,
      }),
    );
    return id;
  }

  hasActiveGame(gameID: GameID): boolean {
    const game = this.games
      .filter(
        (g) => g.phase() == GamePhase.Lobby || g.phase() == GamePhase.Active,
      )
      .find((g) => g.id == gameID);
    return game != null;
  }

  // TODO: stop private games to prevent memory leak.
  startPrivateGame(gameID: GameID) {
    const game = this.games.find((g) => g.id == gameID);
    console.log(`found game ${game}`);
    if (game) {
      game.start();
    } else {
      throw new Error(`cannot start private game, game ${gameID} not found`);
    }
  }

  private getNextMap(): GameMapType {
    if (this.mapsPlaylist.length > 0) {
      return this.mapsPlaylist.shift();
    }
    while (true) {
      const ignoreMaps = ["Mars"];
      this.mapsPlaylist = Object.values(GameMapType).filter(
        (map) => !ignoreMaps.includes(map),
      );
      this.mapsPlaylist.push(GameMapType.World);
      this.mapsPlaylist.push(GameMapType.Europe);
      this.random.shuffleArray(this.mapsPlaylist);
      if (this.allNonConsecutive(this.mapsPlaylist)) {
        return this.mapsPlaylist.shift();
      }
    }
  }

  private allNonConsecutive(maps: GameMapType[]): boolean {
    // Check for consecutive duplicates in the maps array
    for (let i = 0; i < maps.length - 1; i++) {
      if (maps[i] === maps[i + 1]) {
        return false;
      }
    }
    return true;
  }

  tick() {
    const lobbies = this.gamesByPhase(GamePhase.Lobby);
    const active = this.gamesByPhase(GamePhase.Active);
    const finished = this.gamesByPhase(GamePhase.Finished);

    const now = Date.now();
    if (now > this.lastNewLobby + this.config.gameCreationRate()) {
      this.lastNewLobby = now;
      lobbies.push(
        new GameServer(generateID(), now, true, this.config, {
          gameMap: this.getNextMap(),
          gameType: GameType.Public,
          difficulty: Difficulty.Medium,
          disableBots: false,
          disableNPCs: false,
          creativeMode: false,
        }),
      );
    }

    active
      .filter((g) => !g.hasStarted() && g.isPublic)
      .forEach((g) => {
        g.start();
      });
    finished.map((g) => g.endGame()); // Fire and forget
    this.games = [...lobbies, ...active];
  }
}
