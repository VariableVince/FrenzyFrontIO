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

// CircleMap-only playlist with max 20 players
// Bots are set to 10 here; the actual number spawned will be 10 - numRealPlayers
// (calculated in GameRunner.init())
const CIRCLE_MAP_MAX_PLAYERS = 20;
const FRENZY_BOT_TARGET = 10;

export class MapPlaylist {
  constructor(private disableTeams: boolean = false) {}

  public gameConfig(): GameConfig {
    // Always use CircleMap in FFA mode with 20 max players
    return {
      donateGold: false,
      donateTroops: false,
      gameMap: GameMapType.CircleMap,
      maxPlayers: CIRCLE_MAP_MAX_PLAYERS,
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
