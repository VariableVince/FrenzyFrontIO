import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { Difficulty, GameMapType, GameType } from "../core/game/Game";
import { generateID as generateID } from "../core/Util";
import { consolex } from "../core/Consolex";
import "./components/Difficulties";
import { DifficultyDescription } from "./components/Difficulties";
import "./components/Maps";

@customElement("single-player-modal")
export class SinglePlayerModal extends LitElement {
  @state() private isModalOpen = false;
  @state() private selectedMap: GameMapType = GameMapType.World;
  @state() private selectedDifficulty: Difficulty = Difficulty.Medium;
  @state() private disableNPCs = false;
  @state() private disableBots = false;
  @state() private creativeMode = false;

  static styles = css`
    .modal-overlay {
      display: none;
      position: fixed;
      z-index: 1000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      overflow-y: auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .modal-content {
      background-color: rgb(35 35 35 / 0.8);
      -webkit-backdrop-filter: blur(12px);
      backdrop-filter: blur(12px);
      color: white;
      padding: 20px;
      border-radius: 8px;
      width: 80%;
      max-width: 1280px;
      max-height: 80vh;
      overflow-y: auto;
      text-align: center;
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(8px);
      position: relative;
    }

    /* Add custom scrollbar styles */
    .modal-content::-webkit-scrollbar {
      width: 8px;
    }

    .modal-content::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.1);
      border-radius: 4px;
    }

    .modal-content::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
    }

    .modal-content::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .title {
      font-size: 28px;
      color: #fff;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 0 0 20px;
    }

    .close {
      color: #aaa;
      float: right;
      font-size: 28px;
      font-weight: bold;
      cursor: pointer;
    }

    .close:hover,
    .close:focus {
      color: white;
      text-decoration: none;
      cursor: pointer;
    }

    .start-game-button {
      width: 100%;
      max-width: 300px;
      padding: 15px 20px;
      font-size: 16px;
      cursor: pointer;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 8px;
      transition: background-color 0.3s;
      display: inline-block;
      margin: 0 0 20px 0;
    }

    .start-game-button:not(:disabled):hover {
      background-color: #0056b3;
    }

    .start-game-button:disabled {
      background: linear-gradient(to right, #4a4a4a, #3d3d3d);
      opacity: 0.7;
      cursor: not-allowed;
    }

    .options-layout {
      display: grid;
      grid-template-columns: 1fr;
      gap: 24px;
      margin: 24px 0;
    }

    .options-section {
      background: rgba(0, 0, 0, 0.2);
      padding: 12px 24px 24px 24px;
      border-radius: 12px;
    }

    .option-title {
      margin: 0 0 16px 0;
      font-size: 20px;
      color: #fff;
      text-align: center;
    }

    .option-cards {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: center;
      gap: 16px;
    }

    .option-card {
      width: 100%;
      min-width: 100px;
      max-width: 120px;
      padding: 4px 4px 0 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      background: rgba(30, 30, 30, 0.95);
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease-in-out;
    }

    .option-card:hover {
      transform: translateY(-2px);
      border-color: rgba(255, 255, 255, 0.3);
      background: rgba(40, 40, 40, 0.95);
    }

    .option-card.selected {
      border-color: #4a9eff;
      background: rgba(74, 158, 255, 0.1);
    }

    .option-card-title {
      font-size: 14px;
      color: #aaa;
      text-align: center;
      margin: 0 0 4px 0;
    }

    .option-image {
      width: 100%;
      aspect-ratio: 4/2;
      color: #aaa;
      transition: transform 0.2s ease-in-out;
      border-radius: 8px;
      background-color: rgba(255, 255, 255, 0.1);
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `;

  render() {
    return html`
      <div
        class="modal-overlay"
        style="display: ${this.isModalOpen ? "flex" : "none"}"
      >
        <div class="modal-content">
          <span class="close" @click=${this.close}>&times;</span>

          <div class="title">Single Player</div>

          <div class="options-layout">
            <!-- Map Selection -->
            <div class="options-section">
              <div class="option-title">Map</div>
              <div class="option-cards">
                ${Object.entries(GameMapType)
                  .filter(([key]) => isNaN(Number(key)))
                  .map(
                    ([key, value]) => html`
                      <div @click=${() => this.handleMapSelection(value)}>
                        <map-display
                          .mapKey=${key}
                          .selected=${this.selectedMap === value}
                        ></map-display>
                      </div>
                    `
                  )}
              </div>
            </div>

            <!-- Difficulty Selection -->
            <div class="options-section">
              <div class="option-title">Difficulty</div>
              <div class="option-cards">
                ${Object.entries(Difficulty)
                  .filter(([key]) => isNaN(Number(key)))
                  .map(
                    ([key, value]) => html`
                      <div
                        class="option-card ${this.selectedDifficulty === value
                          ? "selected"
                          : ""}"
                        @click=${() => this.handleDifficultySelection(value)}
                      >
                        <difficulty-display
                          .difficultyKey=${key}
                        ></difficulty-display>
                        <p class="option-card-title">
                          ${DifficultyDescription[key]}
                        </p>
                      </div>
                    `
                  )}
              </div>
            </div>
          </div>
          <div>
            <input
              type="checkbox"
              id="disable-bots"
              @change=${this.handleDisableBotsChange}
            />
            <label for="disable-bots">Disable Bots</label>
          </div>
          <div>
            <input
              type="checkbox"
              id="disable-npcs"
              @change=${this.handleDisableNPCsChange}
            />
            <label for="disable-npcs">Disable NPCs</label>
          </div>
          <div>
            <input
              type="checkbox"
              id="disable-bots"
              @change=${this.handleDisableBotsChange}
            />
            <label for="disable-bots">Disable Bots</label>
          </div>
          <div>
            <input
              type="checkbox"
              id="disable-npcs"
              @change=${this.handleDisableNPCsChange}
            />
            <label for="disable-npcs">Disable NPCs</label>
          </div>

          <div>
            <input
              type="checkbox"
              id="creative-mode"
              @change=${this.handleCreativeModeChange}
            />
            <label for="creative-mode">Creative mode</label>
          </div>

          <div>
            <input
              type="checkbox"
              id="creative-mode"
              @change=${this.handleCreativeModeChange}
            />
            <label for="creative-mode">Creative mode</label>
          </div>

          <button @click=${this.startGame} class="start-game-button">
            Start Game
          </button>
        </div>
      </div>
    `;
  }

  public open() {
    this.isModalOpen = true;
  }

  public close() {
    this.isModalOpen = false;
  }
  private handleMapSelection(value: GameMapType) {
    this.selectedMap = value;
  }
  private handleDifficultySelection(value: Difficulty) {
    this.selectedDifficulty = value;
  }
  private handleDisableBotsChange(e: Event) {
    this.disableBots = Boolean((e.target as HTMLInputElement).checked);
  }
  private handleDisableNPCsChange(e: Event) {
    this.disableNPCs = Boolean((e.target as HTMLInputElement).checked);
  }
  private handleCreativeModeChange(e: Event) {
    this.creativeMode = Boolean((e.target as HTMLInputElement).checked);
  }
  private handleDisableBotsChange(e: Event) {
    this.disableBots = Boolean((e.target as HTMLInputElement).checked);
  }
  private handleDisableNPCsChange(e: Event) {
    this.disableNPCs = Boolean((e.target as HTMLInputElement).checked);
  }
  private handleCreativeModeChange(e: Event) {
    this.creativeMode = Boolean((e.target as HTMLInputElement).checked);
  }
  private startGame() {
    consolex.log(
      `Starting single player game with map: ${GameMapType[this.selectedMap]}`
    );
    this.dispatchEvent(
      new CustomEvent("join-lobby", {
        detail: {
          gameType: GameType.Singleplayer,
          lobby: {
            id: generateID(),
          },
          map: this.selectedMap,
          difficulty: this.selectedDifficulty,
          disableBots: this.disableBots,
          disableNPCs: this.disableNPCs,
          creativeMode: this.creativeMode,
        },
        bubbles: true,
        composed: true,
      })
    );
    this.close();
  }
}
