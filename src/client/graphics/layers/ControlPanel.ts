import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { translateText } from "../../../client/Utils";
import { EventBus } from "../../../core/EventBus";
import { GameFork, Gold } from "../../../core/game/Game";
import { GameView } from "../../../core/game/GameView";
import { ClientID } from "../../../core/Schemas";
import { AttackRatioEvent } from "../../InputHandler";
import { SendDefensiveStanceIntentEvent } from "../../Transport";
import { renderNumber, renderTroops } from "../../Utils";
import { UIState } from "../UIState";
import { Layer } from "./Layer";

@customElement("control-panel")
export class ControlPanel extends LitElement implements Layer {
  public game: GameView;
  public clientID: ClientID;
  public eventBus: EventBus;
  public uiState: UIState;

  @state()
  private attackRatio: number = 0.2;

  @state()
  private defensiveStance: number = 1.0; // 0 = stay near HQ, 0.5 = fire range, 1 = offensive

  @state()
  private _maxTroops: number;

  @state()
  private troopRate: number;

  @state()
  private _troops: number;

  @state()
  private _isVisible = false;

  @state()
  private _gold: Gold;

  @state()
  private _unitCount: number = 0;

  @state()
  private _landSize: number = 0;

  @state()
  private _isFrenzy: boolean = false;

  private _troopRateIsIncreasing: boolean = true;

  private _lastTroopIncreaseRate: number;

  init() {
    this.attackRatio = Number(
      localStorage.getItem("settings.attackRatio") ?? "0.2",
    );
    this.uiState.attackRatio = this.attackRatio;

    this.defensiveStance = Number(
      localStorage.getItem("settings.defensiveStance") ?? "1.0",
    );
    this.uiState.defensiveStance = this.defensiveStance;
    // Send initial stance to server
    this.eventBus.emit(new SendDefensiveStanceIntentEvent(this.defensiveStance));

    this.eventBus.on(AttackRatioEvent, (event) => {
      let newAttackRatio =
        (parseInt(
          (document.getElementById("attack-ratio") as HTMLInputElement).value,
        ) +
          event.attackRatio) /
        100;

      if (newAttackRatio < 0.01) {
        newAttackRatio = 0.01;
      }

      if (newAttackRatio > 1) {
        newAttackRatio = 1;
      }

      if (newAttackRatio === 0.11 && this.attackRatio === 0.01) {
        // If we're changing the ratio from 1%, then set it to 10% instead of 11% to keep a consistency
        newAttackRatio = 0.1;
      }

      this.attackRatio = newAttackRatio;
      this.onAttackRatioChange(this.attackRatio);
    });
  }

  tick() {
    if (!this._isVisible && !this.game.inSpawnPhase()) {
      this.setVisibile(true);
    }

    const player = this.game.myPlayer();
    if (player === null || !player.isAlive()) {
      this.setVisibile(false);
      return;
    }

    if (this.game.ticks() % 5 === 0) {
      this.updateTroopIncrease();
    }

    const isFrenzy =
      this.game.config().gameConfig().gameFork === GameFork.Frenzy;
    this._isFrenzy = isFrenzy;

    if (isFrenzy) {
      const frenzy = this.game.frenzyManager();
      const myId = player.id();
      // Count only mobile units (soldiers), not defense posts
      this._unitCount = frenzy
        ? frenzy.units.filter(
            (u) => u.playerId === myId && u.unitType !== "defensePost",
          ).length
        : 0;
      this._landSize = player.numTilesOwned();
      this._gold = player.gold();
      this._troops = this._unitCount;
      // Get max units from the player's core building in frenzy state
      const myBuilding = frenzy?.coreBuildings.find((b) => b.playerId === myId);
      this._maxTroops = myBuilding?.maxUnits ?? frenzy?.maxUnitsPerPlayer ?? 60;
      this.troopRate = 0;
    } else {
      this._maxTroops = this.game.config().maxTroops(player);
      this._gold = player.gold();
      this._troops = player.troops();
      this.troopRate = this.game.config().troopIncreaseRate(player) * 10;
    }
    this.requestUpdate();
  }

  private updateTroopIncrease() {
    const player = this.game?.myPlayer();
    if (player === null) return;
    const troopIncreaseRate = this.game.config().troopIncreaseRate(player);
    this._troopRateIsIncreasing =
      troopIncreaseRate >= this._lastTroopIncreaseRate;
    this._lastTroopIncreaseRate = troopIncreaseRate;
  }

  onAttackRatioChange(newRatio: number) {
    this.uiState.attackRatio = newRatio;
  }

  onDefensiveStanceChange(newStance: number) {
    this.uiState.defensiveStance = newStance;
    localStorage.setItem("settings.defensiveStance", newStance.toString());
    // Send to server so units update immediately
    this.eventBus.emit(new SendDefensiveStanceIntentEvent(newStance));
  }

  /**
   * Returns a label for the current defensive stance
   */
  private getDefensiveStanceLabel(): string {
    if (this.defensiveStance <= 0.25) {
      return translateText("control_panel.stance_defensive");
    } else if (this.defensiveStance <= 0.75) {
      return translateText("control_panel.stance_balanced");
    } else {
      return translateText("control_panel.stance_offensive");
    }
  }

  renderLayer(context: CanvasRenderingContext2D) {
    // Render any necessary canvas elements
  }

  shouldTransform(): boolean {
    return false;
  }

  setVisibile(visible: boolean) {
    this._isVisible = visible;
    this.requestUpdate();
  }

  render() {
    return html`
      <style>
        input[type="range"] {
          -webkit-appearance: none;
          background: transparent;
          outline: none;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          background: white;
          border-width: 2px;
          border-style: solid;
          border-radius: 50%;
          cursor: pointer;
        }
        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: white;
          border-width: 2px;
          border-style: solid;
          border-radius: 50%;
          cursor: pointer;
        }
        .targetTroopRatio::-webkit-slider-thumb {
          border-color: rgb(59 130 246);
        }
        .targetTroopRatio::-moz-range-thumb {
          border-color: rgb(59 130 246);
        }
        .attackRatio::-webkit-slider-thumb {
          border-color: rgb(239 68 68);
        }
        .attackRatio::-moz-range-thumb {
          border-color: rgb(239 68 68);
        }
        .defensiveStance::-webkit-slider-thumb {
          border-color: rgb(34 197 94);
        }
        .defensiveStance::-moz-range-thumb {
          border-color: rgb(34 197 94);
        }
      </style>
      <div
        class="${this._isVisible
          ? "w-full sm:max-w-[320px] text-sm sm:text-base bg-gray-800/70 p-2 pr-3 sm:p-4 shadow-lg sm:rounded-lg backdrop-blur"
          : "hidden"}"
        @contextmenu=${(e: MouseEvent) => e.preventDefault()}
      >
        <div class="block bg-black/30 text-white mb-4 p-2 rounded">
          <div class="flex justify-between mb-1">
            <span class="font-bold"
              >${translateText(this._isFrenzy ? "control_panel.units" : "control_panel.troops")}:</span
            >
            <span translate="no"
              >${this._isFrenzy ? this._troops : renderTroops(this._troops)} / ${this._isFrenzy ? this._maxTroops : renderTroops(this._maxTroops)}
              ${this._isFrenzy
                ? ""
                : html`<span
                    class="${this._troopRateIsIncreasing
                      ? "text-green-500"
                      : "text-yellow-500"}"
                    translate="no"
                    >(+${renderTroops(this.troopRate)})</span
                  >`}</span
            >
          </div>
          <div class="flex justify-between">
            <span class="font-bold"
              >${translateText("control_panel.gold")}:</span
            >
            <span translate="no">${renderNumber(this._gold)}</span>
          </div>
        </div>

        <!-- Defensive Stance Slider -->
        <div class="relative mb-2 sm:mb-4">
          <label class="block text-white mb-1">
            ${translateText("control_panel.defensive_stance")}:
            <span class="text-sm">
              ${this.getDefensiveStanceLabel()}
            </span>
          </label>
          <div class="relative h-8">
            <!-- Background track -->
            <div
              class="absolute left-0 right-0 top-3 h-2 bg-white/20 rounded"
            ></div>
            <!-- Tick marks for fixed positions -->
            <div class="absolute left-0 right-0 top-3 h-2 flex justify-between px-0">
              <div class="w-0.5 h-2 bg-white/40"></div>
              <div class="w-0.5 h-2 bg-white/40"></div>
              <div class="w-0.5 h-2 bg-white/40"></div>
            </div>
            <!-- Fill track -->
            <div
              class="absolute left-0 top-3 h-2 bg-green-500/60 rounded transition-all duration-300"
              style="width: ${this.defensiveStance * 100}%"
            ></div>
            <!-- Range input -->
            <input
              id="defensive-stance"
              type="range"
              min="0"
              max="100"
              .value=${(this.defensiveStance * 100).toString()}
              @input=${(e: Event) => {
                const rawValue = parseInt((e.target as HTMLInputElement).value);
                this.defensiveStance = rawValue / 100;
                this.onDefensiveStanceChange(this.defensiveStance);
              }}
              class="absolute left-0 right-0 top-2 m-0 h-4 cursor-pointer defensiveStance"
            />
          </div>
          <div class="flex justify-between text-xs text-white/60 mt-1">
            <span>${translateText("control_panel.stance_defensive")}</span>
            <span>${translateText("control_panel.stance_balanced")}</span>
            <span>${translateText("control_panel.stance_offensive")}</span>
          </div>
        </div>

        <div class="relative mb-0 sm:mb-4">
          <label class="block text-white mb-1">
            ${translateText("control_panel.attack_ratio")}:
            <span
              class="inline-flex items-center gap-1"
              dir="ltr"
              style="unicode-bidi: isolate;"
              translate="no"
            >
              <span>${(this.attackRatio * 100).toFixed(0)}%</span>
              <span>
                (${renderTroops(
                  (this.game?.myPlayer()?.troops() ?? 0) * this.attackRatio,
                )})
              </span>
            </span>
          </label>
          <div class="relative h-8">
            <!-- Background track -->
            <div
              class="absolute left-0 right-0 top-3 h-2 bg-white/20 rounded"
            ></div>
            <!-- Fill track -->
            <div
              class="absolute left-0 top-3 h-2 bg-red-500/60 rounded transition-all duration-300"
              style="width: ${this.attackRatio * 100}%"
            ></div>
            <!-- Range input - exactly overlaying the visual elements -->
            <input
              id="attack-ratio"
              type="range"
              min="1"
              max="100"
              .value=${(this.attackRatio * 100).toString()}
              @input=${(e: Event) => {
                this.attackRatio =
                  parseInt((e.target as HTMLInputElement).value) / 100;
                this.onAttackRatioChange(this.attackRatio);
              }}
              class="absolute left-0 right-0 top-2 m-0 h-4 cursor-pointer attackRatio"
            />
          </div>
        </div>
      </div>
    `;
  }

  createRenderRoot() {
    return this; // Disable shadow DOM to allow Tailwind styles
  }
}
