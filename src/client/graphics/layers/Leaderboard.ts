import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { Layer } from "./Layer";
import { ClientID } from "../../../core/Schemas";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { EventBus, GameEvent } from "../../../core/EventBus";
import { renderNumber } from "../../Utils";
import { GameView, PlayerView } from "../../../core/game/GameView";

interface Entry {
  name: string;
  position: number;
  score: string;
  gold: string;
  isMyPlayer: boolean;
  player: PlayerView;
}

export class GoToPlayerEvent implements GameEvent {
  constructor(public player: PlayerView) {}
}

@customElement("leader-board")
export class Leaderboard extends LitElement implements Layer {
  public game: GameView;
  public clientID: ClientID;
  public eventBus: EventBus;

  init() {}

  tick() {
    if (this._hidden && !this.game.inSpawnPhase()) {
      this.showLeaderboard();
      this.updateLeaderboard();
    }
    if (this._hidden) {
      return;
    }

    if (this.game.ticks() % 10 == 0) {
      this.updateLeaderboard();
    }
  }

  private updateLeaderboard() {
    if (this.clientID == null) {
      return;
    }
    const myPlayer = this.game
      .playerViews()
      .find((p) => p.clientID() == this.clientID);

    const sorted = this.game
      .playerViews()
      .sort((a, b) => b.numTilesOwned() - a.numTilesOwned());

    const numTilesWithoutFallout =
      this.game.numLandTiles() - this.game.numTilesWithFallout();

    this.players = sorted.slice(0, 5).map((player, index) => ({
      name: player.displayName(),
      position: index + 1,
      score: formatPercentage(player.numTilesOwned() / numTilesWithoutFallout),
      gold: renderNumber(player.gold()),
      isMyPlayer: player == myPlayer,
      player: player,
    }));

    if (myPlayer != null && this.players.find((p) => p.isMyPlayer) == null) {
      let place = 0;
      for (const p of sorted) {
        place++;
        if (p == myPlayer) {
          break;
        }
      }

      this.players.pop();
      this.players.push({
        name: myPlayer.displayName(),
        position: place,
        score: formatPercentage(
          myPlayer.numTilesOwned() / this.game.numLandTiles(),
        ),
        gold: renderNumber(myPlayer.gold()),
        isMyPlayer: true,
        player: myPlayer,
      });
    }

    this.requestUpdate();
  }

  private handleRowClick(player: PlayerView) {
    this.eventBus.emit(new GoToPlayerEvent(player));
  }

  renderLayer(context: CanvasRenderingContext2D) {}
  shouldTransform(): boolean {
    return false;
  }

  static styles = css`
    :host {
      display: block;
    }
    img.emoji {
      height: 1em;
      width: auto;
    }
    .leaderboard {
      position: fixed;
      top: 10px;
      left: 10px;
      z-index: 9999;
      background-color: rgba(30, 30, 30, 0.7);
      padding: 10px;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
      border-radius: 10px;
      max-width: 300px;
      max-height: 80vh;
      overflow-y: auto;
      width: 300px;
      backdrop-filter: blur(5px);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      padding: 5px;
      text-align: center;
      border-bottom: 1px solid rgba(51, 51, 51, 0.2);
      color: white;
    }
    th {
      background-color: rgba(44, 44, 44, 0.5);
      color: white;
    }
    .myPlayer {
      font-weight: bold;
      font-size: 1.2em;
    }
    .otherPlayer {
      font-size: 1em;
    }
    tr:nth-child(even) {
      background-color: rgba(44, 44, 44, 0.5);
    }
    tbody tr {
      cursor: pointer;
      transition: background-color 0.2s;
    }
    tbody tr:hover {
      background-color: rgba(78, 78, 78, 0.8);
    }
    .hidden {
      display: none !important;
    }
    @media (max-width: 1000px) {
      .leaderboard {
        display: none !important;
      }
    }
  `;

  players: Entry[] = [];

  // createRenderRoot() {
  //   return this;
  // }
  @state()
  private _hidden = true;

  render() {
    // return html`
    //   <div class="bg-blue-500 p-4 rounded-lg text-white hover:bg-blue-600">
    //     Test Tailwind
    //   </div>
    // `;
    return html`
      <div
        class="leaderboard ${this._hidden ? "hidden" : ""}"
        @contextmenu=${(e) => e.preventDefault()}
      >
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Owned</th>
              <th>Gold</th>
            </tr>
          </thead>
          <tbody>
            ${this.players.map(
              (player) => html`
                <tr
                  class="${player.isMyPlayer ? "myPlayer" : "otherPlayer"}"
                  @click=${() => this.handleRowClick(player.player)}
                >
                  <td>${player.position}</td>
                  <td>${unsafeHTML(player.name)}</td>
                  <td>${player.score}</td>
                  <td>${player.gold}</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  hideLeaderboard() {
    this._hidden = true;
    this.requestUpdate();
  }

  showLeaderboard() {
    this._hidden = false;
    this.requestUpdate();
  }

  get isVisible() {
    return !this._hidden;
  }
}

function formatPercentage(value: number): string {
  const perc = value * 100;
  if (perc > 99.5) {
    return "100%";
  }
  if (perc < 0.01) {
    return "0%";
  }
  if (perc < 0.1) {
    return perc.toPrecision(1) + "%";
  }
  return perc.toPrecision(2) + "%";
}
