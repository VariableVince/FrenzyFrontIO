import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { Layer } from "./Layer";
import { Game } from "../../../core/game/Game";
import { ClientID } from "../../../core/Schemas";
import { renderNumber, renderTroops } from "../../Utils";
import { EventBus } from "../../../core/EventBus";
import { UIState } from "../UIState";
import { SendSetTargetTroopRatioEvent } from "../../Transport";
import { GameView } from "../../../core/game/GameView";

@customElement("control-panel")
export class ControlPanel extends LitElement implements Layer {
  public game: GameView;
  public clientID: ClientID;
  public eventBus: EventBus;
  public uiState: UIState;

  @state()
  private attackRatio: number = 0.2;

  @state()
  private targetTroopRatio = 1;

  @state()
  private currentTroopRatio = 1;

  @state()
  private _population: number;

  @state()
  private _maxPopulation: number;

  @state()
  private popRate: number;

  @state()
  private _troops: number;

  @state()
  private _workers: number;

  @state()
  private _isVisible = false;

  @state()
  private _manpower: number = 0;

  @state()
  private _gold: number;

  @state()
  private _goldPerSecond: number;

  init() {
    this.attackRatio = 0.2;
    this.uiState.attackRatio = this.attackRatio;
    this.currentTroopRatio = this.targetTroopRatio;
  }

  tick() {
    if (!this._isVisible && !this.game.inSpawnPhase()) {
      this.setVisibile(true);
    }

    const player = this.game.playerByClientID(this.clientID);
    if (player == null || !player.isAlive()) {
      this.setVisibile(false);
      return;
    }

    this._population = player.population();
    this._maxPopulation = this.game.config().maxPopulation(player);
    this._gold = player.gold();
    this._troops = player.troops();
    this._workers = player.workers();
    this.popRate = this.game.config().populationIncreaseRate(player) * 10;
    this._goldPerSecond = this.game.config().goldAdditionRate(player) * 10;

    this.currentTroopRatio = player.troops() / player.population();
  }

  onAttackRatioChange(newRatio: number) {
    this.uiState.attackRatio = newRatio;
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

  targetTroops(): number {
    return this._manpower * this.targetTroopRatio;
  }

  onTroopChange(newRatio: number) {
    this.eventBus.emit(new SendSetTargetTroopRatioEvent(newRatio));
  }

  delta(): number {
    const d = this._population - this.targetTroops();
    return d;
  }

  render() {
    return html`
      <div
        class="${this._isVisible
          ? "w-full text-sm lg:text-m lg:w-72 bg-gray-800/70 p-2 pr-3 lg:p-4 shadow-lg rounded-lg backdrop-blur"
          : "hidden"}"
        @contextmenu=${(e) => e.preventDefault()}
      >
        <div class="hidden lg:block bg-black/30 text-white mb-4 p-2 rounded">
          <div class="flex justify-between mb-1">
            <span class="font-bold">Pop:</span>
            <span
              >${renderTroops(this._population)} /
              ${renderTroops(this._maxPopulation)}
              (+${renderTroops(this.popRate)})</span
            >
          </div>
          <div class="flex justify-between">
            <span class="font-bold">Gold:</span>
            <span
              >${renderNumber(this._gold)}
              (+${renderNumber(this._goldPerSecond)})</span
            >
          </div>
        </div>

        <div class="relative mb-4 lg:mb-4">
          <label class="block text-white mb-1"
            >Troops: ${renderTroops(this._troops)} | Workers:
            ${renderTroops(this._workers)}</label
          >
          <div class="relative h-8">
            <!-- Background track -->
            <div
              class="absolute left-0 right-0 top-3 h-2 bg-white/20 rounded"
            ></div>
            <!-- Fill track -->
            <div
              class="absolute left-0 top-3 h-2 bg-blue-500/60 rounded transition-all duration-300"
              style="width: ${this.currentTroopRatio * 100}%"
            ></div>
            <!-- Range input - exactly overlaying the visual elements -->
            <input
              type="range"
              min="1"
              max="100"
              .value=${this.targetTroopRatio * 100}
              @input=${(e: Event) => {
                this.targetTroopRatio =
                  parseInt((e.target as HTMLInputElement).value) / 100;
                this.onTroopChange(this.targetTroopRatio);
              }}
              class="absolute left-0 right-0 top-2 m-0 h-4 opacity-0 cursor-pointer"
            />
            <!-- Handle -->
            <div
              class="absolute top-2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full -ml-2 cursor-pointer hover:scale-110 transition-transform pointer-events-none"
              style="left: ${this.targetTroopRatio * 100}%"
            ></div>
          </div>
        </div>

        <div class="relative mb-0 lg:mb-4">
          <label class="block text-white mb-1"
            >Attack Ratio: ${(this.attackRatio * 100).toFixed(0)}%</label
          >
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
              type="range"
              min="1"
              max="100"
              .value=${this.attackRatio * 100}
              @input=${(e: Event) => {
                this.attackRatio =
                  parseInt((e.target as HTMLInputElement).value) / 100;
                this.onAttackRatioChange(this.attackRatio);
              }}
              class="absolute left-0 right-0 top-2 m-0 h-4 opacity-0 cursor-pointer"
            />
            <!-- Handle -->
            <div
              class="absolute top-2 w-4 h-4 bg-white border-2 border-red-500 rounded-full -ml-2 cursor-pointer hover:scale-110 transition-transform pointer-events-none"
              style="left: ${this.attackRatio * 100}%"
            ></div>
          </div>
        </div>
      </div>
    `;
  }

  createRenderRoot() {
    return this; // Disable shadow DOM to allow Tailwind styles
  }
}
