import {
  Cell,
  Execution,
  Game,
  Player,
  PlayerInfo,
  TerraNullius,
  PlayerType,
  Alliance,
  UnitType,
} from "../game/Game";
import {
  AttackIntent,
  BoatAttackIntentSchema,
  ClientID,
  GameID,
  Intent,
  Turn,
} from "../Schemas";
import { AttackExecution } from "./AttackExecution";
import { SpawnExecution } from "./SpawnExecution";
import { BotSpawner } from "./BotSpawner";
import { TransportShipExecution } from "./TransportShipExecution";
import { PseudoRandom } from "../PseudoRandom";
import { FakeHumanExecution } from "./FakeHumanExecution";
import { sanitize, simpleHash } from "../Util";
import { AllianceRequestExecution } from "./alliance/AllianceRequestExecution";
import { AllianceRequestReplyExecution } from "./alliance/AllianceRequestReplyExecution";
import { BreakAllianceExecution } from "./alliance/BreakAllianceExecution";
import { TargetPlayerExecution } from "./TargetPlayerExecution";
import { EmojiExecution } from "./EmojiExecution";
import { DonateExecution } from "./DonateExecution";
import { SetTargetTroopRatioExecution } from "./SetTargetTroopRatioExecution";
import { ConstructionExecution } from "./ConstructionExecution";
import { fixProfaneUsername, isProfaneUsername } from "../validations/username";

export class Executor {
  // private random = new PseudoRandom(999)
  private random: PseudoRandom = null;

  constructor(
    private mg: Game,
    private gameID: GameID,
    private clientID: ClientID
  ) {
    // Add one to avoid id collisions with bots.
    this.random = new PseudoRandom(simpleHash(gameID) + 1);
  }

  createExecs(turn: Turn): Execution[] {
    return turn.intents.map((i) => this.createExec(i));
  }

  createExec(intent: Intent): Execution {
    switch (intent.type) {
      case "attack": {
        return new AttackExecution(
          intent.troops,
          intent.attackerID,
          intent.targetID,
          null
        );
      }
      case "spawn":
        return new SpawnExecution(
          new PlayerInfo(
            intent.flag,
            // Players see their original name, others see a sanitized version
            intent.clientID == this.clientID
              ? sanitize(intent.name)
              : fixProfaneUsername(sanitize(intent.name)),
            intent.playerType,
            intent.clientID,
            intent.playerID
          ),
          this.mg.ref(intent.x, intent.y)
        );
      case "boat":
        return new TransportShipExecution(
          intent.attackerID,
          intent.targetID,
          this.mg.ref(intent.x, intent.y),
          intent.troops
        );
      case "allianceRequest":
        return new AllianceRequestExecution(intent.requestor, intent.recipient);
      case "allianceRequestReply":
        return new AllianceRequestReplyExecution(
          intent.requestor,
          intent.recipient,
          intent.accept
        );
      case "breakAlliance":
        return new BreakAllianceExecution(intent.requestor, intent.recipient);
      case "targetPlayer":
        return new TargetPlayerExecution(intent.requestor, intent.target);
      case "emoji":
        return new EmojiExecution(
          intent.sender,
          intent.recipient,
          intent.emoji
        );
      case "donate":
        return new DonateExecution(
          intent.sender,
          intent.recipient,
          intent.troops
        );
      case "troop_ratio":
        return new SetTargetTroopRatioExecution(intent.player, intent.ratio);
      case "build_unit":
        return new ConstructionExecution(
          intent.player,
          this.mg.ref(intent.x, intent.y),
          intent.unit
        );
      default:
        throw new Error(`intent type ${intent} not found`);
    }
  }

  spawnBots(numBots: number): Execution[] {
    return new BotSpawner(this.mg, this.gameID)
      .spawnBots(numBots)
      .map((i) => this.createExec(i));
  }

  fakeHumanExecutions(): Execution[] {
    const execs = [];
    for (const nation of this.mg.nations()) {
      execs.push(
        new FakeHumanExecution(
          this.gameID,
          new PlayerInfo(
            nation.flag || "",
            nation.name,
            PlayerType.FakeHuman,
            null,
            this.random.nextID(),
            nation
          )
        )
      );
    }
    return execs;
  }
}
