import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { PauseGameEvent } from "../../Transport";
import { GameType } from "../../../core/game/Game";
import { GameView } from "../../../core/game/GameView";
import { Layer } from "./Layer";
import { GameUpdateType } from "../../../core/game/GameUpdates";

@customElement("options-menu")
export class OptionsMenu extends LitElement implements Layer {
  public game: GameView;
  public eventBus: EventBus;

  @state()
  private showPauseButton: boolean = true;

  @state()
  private isPaused: boolean = false;

  @state()
  private timer: number = 0;

  private isVisible = false;

  private hasWinner = false;

  private onExitButtonClick() {
    window.location.reload();
  }

  createRenderRoot() {
    return this;
  }

  private onPauseButtonClick() {
    this.isPaused = !this.isPaused;
    this.eventBus.emit(new PauseGameEvent(this.isPaused));
  }

  init() {
    console.log("init called from OptionsMenu");
    this.showPauseButton =
      this.game.config().gameConfig().gameType == GameType.Singleplayer;
    this.isVisible = true;
    this.requestUpdate();
  }

  tick() {
    this.hasWinner =
      this.hasWinner ||
      this.game.updatesSinceLastTick()[GameUpdateType.WinUpdate].length > 0;
    if (this.game.inSpawnPhase()) {
      this.timer = 0;
    } else if (!this.hasWinner && this.game.ticks() % 10 == 0) {
      this.timer++;
    }
    this.isVisible = true;
    this.requestUpdate();
  }

  render() {
    if (!this.isVisible) {
      return html``;
    }
    return html`
      <div
        class="top-0 lg:top-4 right-0 lg:right-4 z-50 pointer-events-auto"
        @contextmenu=${(e) => e.preventDefault()}
      >
        <div
          class="bg-opacity-60 bg-gray-900 p-1 lg:p-2 rounded-lg backdrop-blur-md"
        >
          <div class="flex items-center gap-1 lg:gap-2">
            <button
              class="${!this.showPauseButton ? "hidden" : ""} 
                               w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center 
                               bg-opacity-70 bg-gray-700 text-opacity-90 text-white
                               border-none rounded cursor-pointer
                               hover:bg-opacity-60 hover:bg-gray-600
                               transition-colors duration-200
                               text-sm lg:text-xl"
              @click=${this.onPauseButtonClick}
              aria-label="${this.isPaused ? "Resume game" : "Pause game"}"
            >
              ${this.isPaused ? "▶" : "⏸"}
            </button>
            <div
              class="w-14 h-8 lg:w-20 lg:h-10 flex items-center justify-center 
                              bg-opacity-50 bg-gray-700 text-opacity-90 text-white 
                              rounded text-sm lg:text-xl"
            >
              ${this.timer}
            </div>
            <button
              class="w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center 
                               bg-opacity-70 bg-gray-700 text-opacity-90 text-white
                               border-none rounded cursor-pointer
                               hover:bg-opacity-60 hover:bg-gray-600
                               transition-colors duration-200
                               text-sm lg:text-xl"
              @click=${this.onExitButtonClick}
              aria-label="Exit game"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
