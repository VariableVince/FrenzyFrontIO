import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import {
  Cell,
  Game,
  Player,
  PlayerActions,
  UnitType,
} from "../../../core/game/Game";
import { BuildUnitIntentEvent } from "../../Transport";
import atomBombIcon from "../../../../resources/images/NukeIconWhite.svg";
import hydrogenBombIcon from "../../../../resources/images/MushroomCloudIconWhite.svg";
import warshipIcon from "../../../../resources/images/BattleshipIconWhite.svg";
import missileSiloIcon from "../../../../resources/images/MissileSiloIconWhite.svg";
import goldCoinIcon from "../../../../resources/images/GoldCoinIcon.svg";
import portIcon from "../../../../resources/images/PortIcon.svg";
import cityIcon from "../../../../resources/images/CityIconWhite.svg";
import shieldIcon from "../../../../resources/images/ShieldIconWhite.svg";
import { renderNumber } from "../../Utils";
import { GameView, PlayerView } from "../../../core/game/GameView";

interface BuildItemDisplay {
  unitType: UnitType;
  icon: string;
}

const buildTable: BuildItemDisplay[][] = [
  [
    { unitType: UnitType.AtomBomb, icon: atomBombIcon },
    { unitType: UnitType.MIRV, icon: hydrogenBombIcon },
    { unitType: UnitType.Warship, icon: warshipIcon },
    { unitType: UnitType.Port, icon: portIcon },
    { unitType: UnitType.MissileSilo, icon: missileSiloIcon },
    { unitType: UnitType.DefensePost, icon: shieldIcon },
    { unitType: UnitType.City, icon: cityIcon },
  ],
];

@customElement("build-menu")
export class BuildMenu extends LitElement {
  public game: GameView;
  public eventBus: EventBus;
  private myPlayer: PlayerView;
  private clickedCell: Cell;
  private playerActions: PlayerActions | null;

  static styles = css`
    :host {
      display: block;
    }
    .build-menu {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 9999;
      background-color: #1e1e1e;
      padding: 15px;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      max-width: 95vw;
      max-height: 95vh;
      overflow-y: auto;
    }
    .build-row {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      width: 100%;
    }
    .build-button {
      width: 120px;
      height: 120px;
      border: 2px solid #444;
      background-color: #2c2c2c;
      color: white;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      margin: 8px;
      padding: 10px;
    }
    .build-button:not(:disabled):hover {
      background-color: #3a3a3a;
      transform: scale(1.05);
      border-color: #666;
    }
    .build-button:not(:disabled):active {
      background-color: #4a4a4a;
      transform: scale(0.95);
    }
    .build-button:disabled {
      background-color: #1a1a1a;
      border-color: #333;
      cursor: not-allowed;
      opacity: 0.7;
    }
    .build-button:disabled img {
      opacity: 0.5;
    }
    .build-button:disabled .build-cost {
      color: #ff4444;
    }
    .build-icon {
      font-size: 40px;
      margin-bottom: 5px;
    }
    .build-name {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 5px;
      text-align: center;
    }
    .build-cost {
      font-size: 14px;
    }
    .hidden {
      display: none !important;
    }

    @media (max-width: 768px) {
      .build-menu {
        padding: 10px;
        max-height: 80vh;
      }
      .build-button {
        width: 90px;
        height: 90px;
        margin: 4px;
        padding: 6px;
      }
      .build-icon {
        font-size: 28px;
      }
      .build-name {
        font-size: 12px;
        margin-bottom: 3px;
      }
      .build-cost {
        font-size: 11px;
      }
      .build-button img {
        width: 32px;
        height: 32px;
      }
    }

    @media (max-width: 480px) {
      .build-menu {
        padding: 8px;
        max-height: 70vh;
      }
      .build-button {
        width: 70px;
        height: 70px;
        margin: 3px;
        padding: 4px;
        border-width: 1px;
      }
      .build-icon {
        font-size: 24px;
      }
      .build-name {
        font-size: 10px;
        margin-bottom: 2px;
      }
      .build-cost {
        font-size: 9px;
      }
      .build-button img {
        width: 24px;
        height: 24px;
      }
      .build-cost img {
        width: 10px;
        height: 10px;
      }
    }
  `;

  @state()
  private _hidden = true;

  private canBuild(item: BuildItemDisplay): boolean {
    if (this.myPlayer == null || this.playerActions == null) {
      return false;
    }
    return this.playerActions.buildableUnits.some((u) => u == item.unitType);
  }

  public onBuildSelected = (item: BuildItemDisplay) => {
    this.eventBus.emit(
      new BuildUnitIntentEvent(item.unitType, this.clickedCell)
    );
    this.hideMenu();
  };

  render() {
    return html`
      <div
        class="build-menu ${this._hidden ? "hidden" : ""}"
        @contextmenu=${(e) => e.preventDefault()}
      >
        ${buildTable.map(
          (row) => html`
            <div class="build-row">
              ${row.map(
                (item) => html`
                  <button
                    class="build-button"
                    @click=${() => this.onBuildSelected(item)}
                    ?disabled=${!this.canBuild(item)}
                    title=${!this.canBuild(item) ? "Not enough money" : ""}
                  >
                    <img
                      src=${item.icon}
                      alt="${item.unitType}"
                      width="40"
                      height="40"
                    />
                    <span class="build-name">${item.unitType}</span>
                    <span class="build-cost">
                      ${renderNumber(
                        this.game && this.myPlayer
                          ? this.game
                              .unitInfo(item.unitType)
                              .cost(this.myPlayer)
                          : 0
                      )}
                      <img
                        src=${goldCoinIcon}
                        alt="gold"
                        width="12"
                        height="12"
                        style="vertical-align: middle;"
                      />
                    </span>
                  </button>
                `
              )}
            </div>
          `
        )}
      </div>
    `;
  }

  hideMenu() {
    this._hidden = true;
    this.requestUpdate();
  }

  showMenu(player: PlayerView, clickedCell: Cell) {
    player
      .actions(this.game.ref(clickedCell.x, clickedCell.y))
      .then((actions) => {
        console.log(`got actions: ${JSON.stringify(actions)}`);
        this.playerActions = actions;
        this.myPlayer = player;
        this.clickedCell = clickedCell;
        this._hidden = false;
        this.requestUpdate();
      });
  }

  get isVisible() {
    return !this._hidden;
  }
}
