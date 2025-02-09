import { PriorityQueue } from "@datastructures-js/priority-queue";
import {
  Cell,
  Execution,
  Game,
  Player,
  PlayerID,
  PlayerType,
  TerrainType,
  TerraNullius,
} from "../game/Game";
import { PseudoRandom } from "../PseudoRandom";
import { MessageType } from "../game/Game";
import { renderNumber } from "../../client/Utils";
import { TileRef } from "../game/GameMap";

export class AttackExecution implements Execution {
  private breakAlliance = false;
  private active: boolean = true;
  private toConquer: PriorityQueue<TileContainer> =
    new PriorityQueue<TileContainer>((a: TileContainer, b: TileContainer) => {
      if (a.priority == b.priority) {
        if (a.tick == b.tick) {
          return 0;
          // return this.random.nextInt(-1, 1)
        }
        return a.tick - b.tick;
      }
      return a.priority - b.priority;
    });
  private random = new PseudoRandom(123);

  private _owner: Player;
  private target: Player | TerraNullius;

  private mg: Game;

  private border = new Set<TileRef>();

  constructor(
    private troops: number | null,
    private _ownerID: PlayerID,
    private _targetID: PlayerID | null,
    private sourceTile: TileRef | null,
    private removeTroops: boolean = true
  ) {}

  public targetID(): PlayerID {
    return this._targetID;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  init(mg: Game, ticks: number) {
    if (!this.active) {
      return;
    }
    this.mg = mg;

    this._owner = mg.player(this._ownerID);
    this.target =
      this._targetID == this.mg.terraNullius().id()
        ? mg.terraNullius()
        : mg.player(this._targetID);

    if (this._owner == this.target) {
      throw new Error(`Player ${this._owner} cannot attack itself`);
    }

    if (
      this.target.isPlayer() &&
      this.mg.config().numSpawnPhaseTurns() +
        this.mg.config().spawnImmunityDuration() >
        this.mg.ticks()
    ) {
      console.warn("cannot attack player during immunity phase");
      this.active = false;
      return;
    }

    if (this.troops == null) {
      this.troops = this.mg.config().attackAmount(this._owner, this.target);
    }
    this.troops = Math.min(this._owner.troops(), this.troops);
    if (this.removeTroops) {
      this._owner.removeTroops(this.troops);
    }

    for (const exec of mg.executions()) {
      if (exec.isActive() && exec instanceof AttackExecution && exec != this) {
        const otherAttack = exec as AttackExecution;
        // Target has opposing attack, cancel them out
        if (
          this.target.isPlayer() &&
          otherAttack._targetID == this._ownerID &&
          this._targetID == otherAttack._ownerID
        ) {
          if (otherAttack.troops > this.troops) {
            otherAttack.troops -= this.troops;
            // otherAttack.calculateToConquer()
            this.active = false;
            return;
          } else {
            this.troops -= otherAttack.troops;
            otherAttack.active = false;
          }
        }
        // Existing attack on same target, add troops
        if (
          otherAttack._owner == this._owner &&
          otherAttack._targetID == this._targetID &&
          this.sourceTile == otherAttack.sourceTile
        ) {
          otherAttack.troops += this.troops;
          otherAttack.refreshToConquer();
          this.active = false;
          return;
        }
      }
    }
    if (
      this._owner.type() != PlayerType.Bot &&
      this.target.isPlayer() &&
      this.target.type() == PlayerType.Human
    ) {
      mg.displayMessage(
        `You are being attacked by ${this._owner.displayName()}`,
        MessageType.ERROR,
        this._targetID
      );
    }
    if (this.sourceTile != null) {
      this.addNeighbors(this.sourceTile);
    } else {
      this.refreshToConquer();
    }

    if (this.target.isPlayer()) {
      if (this._owner.isAlliedWith(this.target)) {
        // No updates should happen in init.
        this.breakAlliance = true;
      }
      this.target.updateRelation(this._owner, -80);
    }
  }

  private refreshToConquer() {
    this.toConquer.clear();
    this.border.clear();
    for (const tile of this._owner.borderTiles()) {
      this.addNeighbors(tile);
    }
  }

  tick(ticks: number) {
    if (!this.active) {
      return;
    }
    const alliance = this._owner.allianceWith(this.target as Player);
    if (this.breakAlliance && alliance != null) {
      this.breakAlliance = false;
      this._owner.breakAlliance(alliance);
    }
    if (this.target.isPlayer() && this._owner.isAlliedWith(this.target)) {
      // In this case a new alliance was created AFTER the attack started.
      this._owner.addTroops(this.troops);
      this.active = false;
      return;
    }

    let numTilesPerTick = this.mg
      .config()
      .attackTilesPerTick(
        this.troops,
        this._owner,
        this.target,
        this.border.size + this.random.nextInt(0, 5)
      );
    // consolex.log(`num tiles per tick: ${numTilesPerTick}`)
    // consolex.log(`num execs: ${this.mg.executions().length}`)

    while (numTilesPerTick > 0) {
      if (this.troops < 1) {
        this.active = false;
        return;
      }

      if (this.toConquer.size() == 0) {
        this.refreshToConquer();
        this.active = false;
        this._owner.addTroops(this.troops);
        return;
      }

      const tileToConquer = this.toConquer.dequeue().tile;
      this.border.delete(tileToConquer);

      const onBorder =
        this.mg
          .neighbors(tileToConquer)
          .filter((t) => this.mg.owner(t) == this._owner).length > 0;
      if (this.mg.owner(tileToConquer) != this.target || !onBorder) {
        continue;
      }
      this.addNeighbors(tileToConquer);
      const { attackerTroopLoss, defenderTroopLoss, tilesPerTickUsed } = this.mg
        .config()
        .attackLogic(
          this.mg,
          this.troops,
          this._owner,
          this.target,
          tileToConquer
        );
      numTilesPerTick -= tilesPerTickUsed;
      this.troops -= attackerTroopLoss;
      if (this.target.isPlayer()) {
        this.target.removeTroops(defenderTroopLoss);
      }
      this._owner.conquer(tileToConquer);
      this.handleDeadDefender();
    }
  }

  private addNeighbors(tile: TileRef) {
    for (const neighbor of this.mg.neighbors(tile)) {
      if (this.mg.isWater(neighbor) || this.mg.owner(neighbor) != this.target) {
        continue;
      }
      this.border.add(neighbor);
      let numOwnedByMe = this.mg
        .neighbors(neighbor)
        .filter((t) => this.mg.owner(t) == this._owner).length;
      let dist = 0;
      if (numOwnedByMe > 2) {
        numOwnedByMe = 10;
      }
      let mag = 0;
      switch (this.mg.terrainType(tile)) {
        case TerrainType.Plains:
          mag = 1;
          break;
        case TerrainType.Highland:
          mag = 1.5;
          break;
        case TerrainType.Mountain:
          mag = 2;
          break;
      }
      this.toConquer.enqueue(
        new TileContainer(
          neighbor,
          dist / 100 + this.random.nextInt(0, 2) - numOwnedByMe + mag,
          this.mg.ticks()
        )
      );
    }
  }

  private handleDeadDefender() {
    if (this.target.isPlayer() && this.target.numTilesOwned() < 100) {
      const gold = this.target.gold();
      this.mg.displayMessage(
        `Conquered ${this.target.displayName()} received ${renderNumber(
          gold
        )} gold`,
        MessageType.SUCCESS,
        this._owner.id()
      );
      this.target.removeGold(gold);
      this._owner.addGold(gold);

      for (let i = 0; i < 10; i++) {
        for (const tile of this.target.tiles()) {
          const borders = this.mg
            .neighbors(tile)
            .some((t) => this.mg.owner(t) == this._owner);
          if (borders) {
            this._owner.conquer(tile);
          } else {
            for (const neighbor of this.mg.neighbors(tile)) {
              const no = this.mg.owner(neighbor);
              if (no.isPlayer() && no != this.target) {
                this.mg.player(no.id()).conquer(tile);
                break;
              }
            }
          }
        }
      }
    }
  }

  owner(): Player {
    return this._owner;
  }

  isActive(): boolean {
    return this.active;
  }
}

class TileContainer {
  constructor(
    public readonly tile: TileRef,
    public readonly priority: number,
    public readonly tick: number
  ) {}
}
