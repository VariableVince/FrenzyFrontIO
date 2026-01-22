import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { renderDuration, translateText } from "../client/Utils";
import { GameMapType, GameMode, HumansVsNations } from "../core/game/Game";
import { ClientInfo, GameID, GameInfo } from "../core/Schemas";
import { generateID } from "../core/Util";
import { terrainMapFileLoader } from "./TerrainMapFileLoader";
import { JoinLobbyEvent } from "./types/JoinLobbyEvent";

// Import HQ-like icon for player tags
import crownIcon from "../../resources/images/CrownIcon.svg";

@customElement("public-lobby")
export class PublicLobby extends LitElement {
  @state() private lobbies: GameInfo[] = [];
  @state() public isLobbyHighlighted: boolean = false;
  @state() private isButtonDebounced: boolean = false;
  @state() private mapImages: Map<GameID, string> = new Map();
  private lobbiesInterval: number | null = null;
  private currLobby: GameInfo | null = null;
  private debounceDelay: number = 750;
  private lobbyIDToStart = new Map<GameID, number>();
  private lobbiesFetchInFlight: Promise<GameInfo[]> | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.fetchAndUpdateLobbies();
    this.lobbiesInterval = window.setInterval(
      () => this.fetchAndUpdateLobbies(),
      1000,
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.lobbiesInterval !== null) {
      clearInterval(this.lobbiesInterval);
      this.lobbiesInterval = null;
    }
  }

  private async fetchAndUpdateLobbies(): Promise<void> {
    try {
      this.lobbies = await this.fetchLobbies();
      this.lobbies.forEach((l) => {
        // Store the start time on first fetch because endpoint is cached, causing
        // the time to appear irregular.
        if (!this.lobbyIDToStart.has(l.gameID)) {
          const msUntilStart = l.msUntilStart ?? 0;
          this.lobbyIDToStart.set(l.gameID, msUntilStart + Date.now());
        }

        // Load map image if not already loaded
        if (l.gameConfig && !this.mapImages.has(l.gameID)) {
          this.loadMapImage(l.gameID, l.gameConfig.gameMap);
        }
      });
    } catch (error) {
      console.error("Error fetching lobbies:", error);
    }
  }

  private async loadMapImage(gameID: GameID, gameMap: string) {
    try {
      // Convert string to GameMapType enum value
      const mapType = gameMap as GameMapType;
      const data = terrainMapFileLoader.getMapData(mapType);
      this.mapImages.set(gameID, await data.webpPath());
      this.requestUpdate();
    } catch (error) {
      console.error("Failed to load map image:", error);
    }
  }

  async fetchLobbies(): Promise<GameInfo[]> {
    if (this.lobbiesFetchInFlight) {
      return this.lobbiesFetchInFlight;
    }

    this.lobbiesFetchInFlight = (async () => {
      try {
        const response = await fetch(`/api/public_lobbies`);
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return data.lobbies as GameInfo[];
      } catch (error) {
        console.error("Error fetching lobbies:", error);
        throw error;
      } finally {
        this.lobbiesFetchInFlight = null;
      }
    })();

    return this.lobbiesFetchInFlight;
  }

  public stop() {
    if (this.lobbiesInterval !== null) {
      this.isLobbyHighlighted = false;
      clearInterval(this.lobbiesInterval);
      this.lobbiesInterval = null;
    }
  }

  render() {
    if (this.lobbies.length === 0) return html``;

    const lobby = this.lobbies[0];
    if (!lobby?.gameConfig) {
      return;
    }
    const start = this.lobbyIDToStart.get(lobby.gameID) ?? 0;
    const timeRemaining = Math.max(0, Math.floor((start - Date.now()) / 1000));

    // Format time to show minutes and seconds
    const timeDisplay = renderDuration(timeRemaining);

    const teamCount =
      lobby.gameConfig.gameMode === GameMode.Team
        ? (lobby.gameConfig.playerTeams ?? 0)
        : null;

    const mapImageSrc = this.mapImages.get(lobby.gameID);

    // Get players and bots info
    const players = lobby.clients ?? [];
    const numPlayers = players.length;
    const numBots = lobby.gameConfig.bots ?? 0;
    const numNations = lobby.gameConfig.disableNPCs ? 0 : 4; // Default nations count

    // Determine if we should show player tags (show when 8 or fewer players)
    const showPlayerTags = numPlayers <= 8 && numPlayers > 0;

    // Calculate total participants for display
    const totalParticipants = numPlayers + numBots + numNations;

    return html`
      <button
        @click=${() => this.lobbyClicked(lobby)}
        ?disabled=${this.isButtonDebounced}
        class="isolate grid min-h-40 grid-cols-[100%] grid-rows-[100%] place-content-stretch w-full overflow-hidden ${this
          .isLobbyHighlighted
          ? "bg-gradient-to-r from-green-700 to-green-600"
          : "bg-gradient-to-r from-red-800 to-red-600"} text-white font-medium rounded-xl transition-opacity duration-200 hover:opacity-90 ${this
          .isButtonDebounced
          ? "opacity-70 cursor-not-allowed"
          : ""}"
      >
        ${mapImageSrc
          ? html`<img
              src="${mapImageSrc}"
              alt="${lobby.gameConfig.gameMap}"
              class="place-self-start col-span-full row-span-full h-full -z-10"
              style="mask-image: linear-gradient(to left, transparent, #fff)"
            />`
          : html`<div
              class="place-self-start col-span-full row-span-full h-full -z-10 bg-gray-300"
            ></div>`}
        <div
          class="flex flex-col justify-between h-full col-span-full row-span-full p-4 md:p-6 text-right z-0"
        >
          <!-- Header with Join button and map info -->
          <div>
            <div class="text-lg md:text-2xl font-semibold">
              ${translateText("public_lobby.join")}
            </div>
            <div class="text-md font-medium text-red-100">
              <span
                class="text-sm ${this.isLobbyHighlighted
                  ? "text-green-700"
                  : "text-red-700"} bg-white rounded-sm px-1"
              >
                ${lobby.gameConfig.gameMode === GameMode.Team
                  ? typeof teamCount === "string"
                    ? teamCount === HumansVsNations
                      ? translateText("public_lobby.teams_hvn")
                      : translateText(`public_lobby.teams_${teamCount}`)
                    : translateText("public_lobby.teams", {
                        num: teamCount ?? 0,
                      })
                  : translateText("game_mode.ffa")}</span
              >
              <span
                >${translateText(
                  `map.${lobby.gameConfig.gameMap.toLowerCase().replace(/\s+/g, "")}`,
                )}</span
              >
            </div>
          </div>

          <!-- Player tags section (when players <= 8) -->
          ${showPlayerTags
            ? html`
                <div class="flex flex-wrap justify-end gap-1 my-2">
                  ${players.map(
                    (player: ClientInfo) => html`
                      <div
                        class="flex items-center gap-1 bg-white/20 backdrop-blur-sm rounded-md px-2 py-1 text-xs"
                      >
                        <img
                          src="${crownIcon}"
                          alt=""
                          class="w-3 h-3 opacity-80"
                        />
                        <span class="max-w-[80px] truncate"
                          >${player.username}</span
                        >
                      </div>
                    `,
                  )}
                </div>
              `
            : ""}

          <!-- Footer with participant counts and timer -->
          <div>
            <!-- Participant breakdown -->
            <div
              class="flex flex-wrap justify-end gap-2 text-xs md:text-sm mb-1"
            >
              ${numPlayers > 0
                ? html`<span
                    class="bg-blue-500/80 rounded-md px-2 py-0.5 flex items-center gap-1"
                  >
                    <span class="font-bold">${numPlayers}</span>
                    <span
                      >${translateText(
                        numPlayers === 1
                          ? "public_lobby.player"
                          : "public_lobby.players",
                      )}</span
                    >
                  </span>`
                : ""}
              ${numBots > 0
                ? html`<span
                    class="bg-orange-500/80 rounded-md px-2 py-0.5 flex items-center gap-1"
                  >
                    <span class="font-bold">${numBots}</span>
                    <span>${translateText("public_lobby.bots")}</span>
                  </span>`
                : ""}
              ${numNations > 0
                ? html`<span
                    class="bg-purple-500/80 rounded-md px-2 py-0.5 flex items-center gap-1"
                  >
                    <span class="font-bold">${numNations}</span>
                    <span>${translateText("public_lobby.nations")}</span>
                  </span>`
                : ""}
            </div>

            <!-- Total and timer -->
            <div class="text-md font-medium text-red-100">
              ${totalParticipants > 0
                ? html`<span class="font-bold">${totalParticipants}</span>
                    ${translateText("public_lobby.participants")} ·`
                : ""}
              <span>${timeDisplay}</span>
            </div>
          </div>
        </div>
      </button>
    `;
  }

  leaveLobby() {
    this.isLobbyHighlighted = false;
    this.currLobby = null;
  }

  private lobbyClicked(lobby: GameInfo) {
    if (this.isButtonDebounced) {
      return;
    }

    // Set debounce state
    this.isButtonDebounced = true;

    // Reset debounce after delay
    setTimeout(() => {
      this.isButtonDebounced = false;
    }, this.debounceDelay);

    if (this.currLobby === null) {
      this.isLobbyHighlighted = true;
      this.currLobby = lobby;
      this.dispatchEvent(
        new CustomEvent("join-lobby", {
          detail: {
            gameID: lobby.gameID,
            clientID: generateID(),
          } as JoinLobbyEvent,
          bubbles: true,
          composed: true,
        }),
      );
    } else {
      this.dispatchEvent(
        new CustomEvent("leave-lobby", {
          detail: { lobby: this.currLobby },
          bubbles: true,
          composed: true,
        }),
      );
      this.leaveLobby();
    }
  }
}
