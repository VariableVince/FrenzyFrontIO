import { placeName } from "../client/graphics/NameBoxCalculator";
import { getConfig } from "./configuration/ConfigLoader";
import { Executor } from "./execution/ExecutionManager";
import { WinCheckExecution } from "./execution/WinCheckExecution";
import { FrenzyConfig } from "./game/frenzy/FrenzyTypes";
import {
  AllPlayers,
  Attack,
  Cell,
  Game,
  GameMapType,
  GameUpdates,
  NameViewData,
  Nation,
  Player,
  PlayerActions,
  PlayerBorderTiles,
  PlayerID,
  PlayerInfo,
  PlayerProfile,
  PlayerType,
} from "./game/Game";
import { createGame } from "./game/GameImpl";
import { GameMap, TileRef } from "./game/GameMap";
import { GameMapLoader } from "./game/GameMapLoader";
import {
  ErrorUpdate,
  GameUpdateType,
  GameUpdateViewData,
} from "./game/GameUpdates";
import { loadTerrainMap as loadGameMap } from "./game/TerrainMapLoader";
import { PseudoRandom } from "./PseudoRandom";
import { ClientID, GameStartInfo, Turn } from "./Schemas";
import { sanitize, simpleHash } from "./Util";
import { fixProfaneUsername } from "./validations/username";

export async function createGameRunner(
  gameStart: GameStartInfo,
  clientID: ClientID,
  mapLoader: GameMapLoader,
  callBack: (gu: GameUpdateViewData | ErrorUpdate) => void,
): Promise<GameRunner> {
  const config = await getConfig(gameStart.config, null);
  const gameMap = await loadGameMap(
    gameStart.config.gameMap,
    gameStart.config.gameMapSize,
    mapLoader,
  );
  const random = new PseudoRandom(simpleHash(gameStart.gameID));

  const humans = gameStart.players.map(
    (p) =>
      new PlayerInfo(
        p.clientID === clientID
          ? sanitize(p.username)
          : fixProfaneUsername(sanitize(p.username)),
        PlayerType.Human,
        p.clientID,
        random.nextID(),
      ),
  );

  const manifestNations = gameStart.config.disableNPCs ? [] : gameMap.nations;
  const shouldEvenizeNationSpawns =
    gameStart.config.gameMap === GameMapType.World ||
    gameStart.config.gameMap === GameMapType.GiantWorldMap ||
    gameStart.config.gameMap === GameMapType.Europe;

  const evenizedNationSpawnTiles = shouldEvenizeNationSpawns
    ? computeEvenSpawnTiles(
        manifestNations.length,
        gameMap.gameMap,
        new PseudoRandom(simpleHash(`${gameStart.gameID}:nation-spawns`)),
      )
    : null;

  const nations = manifestNations.map((n, index) => {
    const spawnTile = evenizedNationSpawnTiles?.[index];
    const spawnCell = spawnTile
      ? new Cell(gameMap.gameMap.x(spawnTile), gameMap.gameMap.y(spawnTile))
      : new Cell(n.coordinates[0], n.coordinates[1]);

    return new Nation(
      spawnCell,
      new PlayerInfo(
        n.name,
        PlayerType.FakeHuman,
        null,
        random.nextID(),
        n.strength,
      ),
    );
  });

  const game: Game = createGame(
    humans,
    nations,
    gameMap.gameMap,
    gameMap.miniGameMap,
    config,
  );

  const gr = new GameRunner(
    game,
    new Executor(game, gameStart.gameID, clientID),
    callBack,
    humans.length,
  );
  gr.init();
  return gr;
}

function computeEvenSpawnTiles(
  count: number,
  gm: GameMap,
  random: PseudoRandom,
): TileRef[] {
  if (count <= 0) return [];

  const chosen: TileRef[] = [];
  const MAX_CANDIDATE_SAMPLES = 250;
  const MAX_INITIAL_TRIES = 50_000;

  // Pick an initial land tile.
  for (let tries = 0; tries < MAX_INITIAL_TRIES; tries++) {
    const tile = gm.ref(
      random.nextInt(0, gm.width()),
      random.nextInt(0, gm.height()),
    );
    if (gm.isLand(tile) && !gm.isBorder(tile)) {
      chosen.push(tile);
      break;
    }
  }

  if (chosen.length === 0) {
    return [];
  }

  while (chosen.length < count) {
    let bestTile: TileRef | null = null;
    let bestMinDist = -1;

    for (let sample = 0; sample < MAX_CANDIDATE_SAMPLES; sample++) {
      const candidate = gm.ref(
        random.nextInt(0, gm.width()),
        random.nextInt(0, gm.height()),
      );
      if (
        !gm.isLand(candidate) ||
        gm.isBorder(candidate) ||
        gm.hasOwner(candidate)
      ) {
        continue;
      }

      let minDist = Infinity;
      for (const existing of chosen) {
        const d = gm.manhattanDist(existing, candidate);
        if (d < minDist) minDist = d;
        if (minDist <= bestMinDist) break;
      }

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestTile = candidate;
      }
    }

    if (bestTile === null) {
      break;
    }

    chosen.push(bestTile);
  }

  return chosen;
}

export class GameRunner {
  private turns: Turn[] = [];
  private currTurn = 0;
  private isExecuting = false;

  private playerViewData: Record<PlayerID, NameViewData> = {};

  constructor(
    public game: Game,
    private execManager: Executor,
    private callBack: (gu: GameUpdateViewData | ErrorUpdate) => void,
    private numHumanPlayers: number = 0,
  ) {}

  init() {
    if (this.game.config().isRandomSpawn()) {
      this.game.addExecution(...this.execManager.spawnPlayers());
    }
    if (this.game.config().bots() > 0) {
      // Calculate actual bots: configured bots minus human players
      // For CircleMap: bots = 20, so actual = 20 - numHumanPlayers
      const configuredBots = this.game.config().numBots();
      const actualBots = Math.max(0, configuredBots - this.numHumanPlayers);
      if (actualBots > 0) {
        this.game.addExecution(...this.execManager.spawnBots(actualBots));
      }
    }
    if (this.game.config().spawnNPCs()) {
      this.game.addExecution(...this.execManager.fakeHumanExecutions());
    }
    this.game.addExecution(new WinCheckExecution());
  }

  public addTurn(turn: Turn): void {
    this.turns.push(turn);
  }

  public executeNextTick() {
    if (this.isExecuting) {
      return;
    }
    if (this.currTurn >= this.turns.length) {
      return;
    }
    this.isExecuting = true;

    this.game.addExecution(
      ...this.execManager.createExecs(this.turns[this.currTurn]),
    );
    this.currTurn++;

    let updates: GameUpdates;
    let tickExecutionDuration: number = 0;

    try {
      const startTime = performance.now();
      updates = this.game.executeNextTick();
      const endTime = performance.now();
      tickExecutionDuration = endTime - startTime;
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("Game tick error:", error.message);
        this.callBack({
          errMsg: error.message,
          stack: error.stack,
        } as ErrorUpdate);
      } else {
        console.error("Game tick error:", error);
      }
      return;
    }

    if (this.game.inSpawnPhase() && this.game.ticks() % 2 === 0) {
      this.game
        .players()
        .filter(
          (p) =>
            p.type() === PlayerType.Human || p.type() === PlayerType.FakeHuman,
        )
        .forEach(
          (p) => (this.playerViewData[p.id()] = placeName(this.game, p)),
        );
    }

    if (this.game.ticks() < 3 || this.game.ticks() % 30 === 0) {
      this.game.players().forEach((p) => {
        this.playerViewData[p.id()] = placeName(this.game, p);
      });
    }

    // Many tiles are updated to pack it into an array
    const packedTileUpdates = updates[GameUpdateType.Tile].map((u) => u.update);
    updates[GameUpdateType.Tile] = [];

    // Get frenzy tick breakdown if available
    const frenzyBreakdown = this.game.frenzyManager()?.getTickBreakdown();

    this.callBack({
      tick: this.game.ticks(),
      packedTileUpdates: new BigUint64Array(packedTileUpdates),
      updates: updates,
      playerNameViewData: this.playerViewData,
      tickExecutionDuration: tickExecutionDuration,
      frenzyTickBreakdown: frenzyBreakdown,
    });
    this.isExecuting = false;
  }

  public playerActions(
    playerID: PlayerID,
    x?: number,
    y?: number,
  ): PlayerActions {
    const player = this.game.player(playerID);
    const tile =
      x !== undefined && y !== undefined ? this.game.ref(x, y) : null;
    const actions = {
      canAttack: tile !== null && player.canAttack(tile),
      buildableUnits: player.buildableUnits(tile),
      canSendEmojiAllPlayers: player.canSendEmoji(AllPlayers),
      canEmbargoAll: player.canEmbargoAll(),
    } as PlayerActions;

    if (tile !== null && this.game.hasOwner(tile)) {
      const other = this.game.owner(tile) as Player;
      actions.interaction = {
        sharedBorder: player.sharesBorderWith(other),
        canSendEmoji: player.canSendEmoji(other),
        canTarget: player.canTarget(other),
        canSendAllianceRequest: player.canSendAllianceRequest(other),
        canBreakAlliance: player.isAlliedWith(other),
        canDonateGold: player.canDonateGold(other),
        canDonateTroops: player.canDonateTroops(other),
        canEmbargo: !player.hasEmbargoAgainst(other),
      };
      const alliance = player.allianceWith(other as Player);
      if (alliance) {
        actions.interaction.allianceExpiresAt = alliance.expiresAt();
      }
    }

    return actions;
  }

  public playerProfile(playerID: number): PlayerProfile {
    const player = this.game.playerBySmallID(playerID);
    if (!player.isPlayer()) {
      throw new Error(`player with id ${playerID} not found`);
    }
    return player.playerProfile();
  }
  public playerBorderTiles(playerID: PlayerID): PlayerBorderTiles {
    const player = this.game.player(playerID);
    if (!player.isPlayer()) {
      throw new Error(`player with id ${playerID} not found`);
    }
    return {
      borderTiles: player.borderTiles(),
    } as PlayerBorderTiles;
  }

  public attackAveragePosition(
    playerID: number,
    attackID: string,
  ): Cell | null {
    const player = this.game.playerBySmallID(playerID);
    if (!player.isPlayer()) {
      throw new Error(`player with id ${playerID} not found`);
    }

    const condition = (a: Attack) => a.id() === attackID;
    const attack =
      player.outgoingAttacks().find(condition) ??
      player.incomingAttacks().find(condition);
    if (attack === undefined) {
      return null;
    }

    return attack.averagePosition();
  }

  public bestTransportShipSpawn(
    playerID: PlayerID,
    targetTile: TileRef,
  ): TileRef | false {
    const player = this.game.player(playerID);
    if (!player.isPlayer()) {
      throw new Error(`player with id ${playerID} not found`);
    }
    return player.bestTransportShipSpawn(targetTile);
  }

  public updateFrenzyConfig(config: Partial<FrenzyConfig>) {
    this.game.frenzyManager()?.updateConfig(config);
  }
}
