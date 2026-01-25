import {
  Difficulty,
  GameFork,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
  UnitType,
} from "../core/game/Game";
import { GameConfig } from "../core/Schemas";

// Frenzy map rotation (CircleMap and SquareMap) with max 20 players
// Bots are set to 10 here; the actual number spawned will be 10 - numRealPlayers
// (calculated in GameRunner.init())
const FRENZY_MAP_MAX_PLAYERS = 20;
const FRENZY_BOT_TARGET = 10;
const FRENZY_MAPS = [GameMapType.CircleMap, GameMapType.SquareMap];

export class MapPlaylist {
  private currentMapIndex = 0;

  constructor(private disableTeams: boolean = false) {}

  public getCurrentMapIndex(): number {
    return this.currentMapIndex;
  }

  public setMapIndex(index: number): void {
    this.currentMapIndex =
      ((index % FRENZY_MAPS.length) + FRENZY_MAPS.length) % FRENZY_MAPS.length;
  }

  public nextMap(): void {
    this.currentMapIndex = (this.currentMapIndex + 1) % FRENZY_MAPS.length;
  }

  public previousMap(): void {
    this.currentMapIndex =
      (this.currentMapIndex - 1 + FRENZY_MAPS.length) % FRENZY_MAPS.length;
  }

  public getMapList(): typeof FRENZY_MAPS {
    return FRENZY_MAPS;
  }

  public gameConfig(): GameConfig {
    // Use the current map from the playlist
    const selectedMap = FRENZY_MAPS[this.currentMapIndex];
    return {
      donateGold: false,
      donateTroops: false,
      gameMap: selectedMap,
      maxPlayers: FRENZY_MAP_MAX_PLAYERS,
      gameType: GameType.Public,
      gameFork: GameFork.Frenzy,
      gameMapSize: GameMapSize.Normal,
      difficulty: Difficulty.Medium,
      infiniteGold: false,
      infiniteTroops: false,
      maxTimerValue: undefined,
      instantBuild: false,
      randomSpawn: false,
      disableNPCs: false,
      gameMode: GameMode.FFA,
      playerTeams: undefined,
      bots: FRENZY_BOT_TARGET, // Actual bots = 10 - numRealPlayers (calculated in GameRunner)
      disabledUnits: [UnitType.MIRV, UnitType.MIRVWarhead], // MIRVs removed from Frenzy
    } satisfies GameConfig;
  }
}
