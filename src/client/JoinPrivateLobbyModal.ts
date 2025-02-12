import { LitElement, html, css } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import { GameMapType, GameType } from "../core/game/Game";
import { consolex } from "../core/Consolex";

@customElement("join-private-lobby-modal")
export class JoinPrivateLobbyModal extends LitElement {
  @state() private isModalOpen = false;
  @state() private message: string = "";
  @query("#lobbyIdInput") private lobbyIdInput!: HTMLInputElement;
  @state() private hasJoined = false;

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
    }
    .modal-content {
      background-color: white;
      margin: 15% auto;
      padding: 20px;
      border-radius: 8px;
      width: 80%;
      max-width: 500px;
      text-align: center;
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
      color: black;
      text-decoration: none;
      cursor: pointer;
    }
    button {
      padding: 10px 20px;
      font-size: 16px;
      cursor: pointer;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      transition: background-color 0.3s;
    }
    button:hover {
      background-color: #0056b3;
    }
    .lobby-id-container {
      display: flex;
      align-items: stretch;
      justify-content: center;
      gap: 10px;
      margin: 20px 0;
    }
    .lobby-id-container input {
      flex-grow: 1;
      max-width: 200px;
      padding: 10px;
      font-size: 16px;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    .lobby-id-container button {
      padding: 10px 15px;
    }
    .join-button {
      margin-top: 10px;
    }

    .message-area {
      margin-top: 10px;
      padding: 10px;
      border-radius: 4px;
      font-size: 14px;
      transition: opacity 0.3s ease;
      opacity: 0;
      height: 0;
      overflow: hidden;
    }

    .message-area.show {
      opacity: 1;
      height: auto;
      margin-bottom: 10px;
    }

    .message-area.error {
      background-color: #ffebee;
      color: #c62828;
    }

    .message-area.success {
      background-color: #e8f5e9;
      color: #2e7d32;
    }
  `;

  render() {
    return html`
      <div
        class="modal-overlay"
        style="display: ${this.isModalOpen ? "block" : "none"}"
      >
        <div class="modal-content">
          <span class="close" @click=${this.closeAndLeave}>&times;</span>
          <h2>Join Private Lobby</h2>
          <div class="lobby-id-container">
            <input type="text" id="lobbyIdInput" placeholder="Enter Lobby ID" />
            <button @click=${this.pasteFromClipboard}>Paste</button>
          </div>
          <div class="message-area ${this.message ? "show" : ""}">
            ${this.message}
          </div>
          ${!this.hasJoined
            ? html`<button class="join-button" @click=${this.joinLobby}>
                Join Lobby
              </button>`
            : ""}
        </div>
      </div>
    `;
  }

  public open() {
    this.isModalOpen = true;
  }

  public close() {
    this.isModalOpen = false;
    this.lobbyIdInput.value = null;
  }

  public closeAndLeave() {
    this.close();
    this.hasJoined = false;
    this.message = "";
    this.dispatchEvent(
      new CustomEvent("leave-lobby", {
        detail: { lobby: this.lobbyIdInput.value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async pasteFromClipboard() {
    try {
      // TODO: This can be either a link or a id, check if it's a link
      const clipText = await navigator.clipboard.readText();
      this.lobbyIdInput.value = clipText;
    } catch (err) {
      consolex.error("Failed to read clipboard contents: ", err);
    }
  }

  private joinLobby() {
    // TODO: This can be either a link or a id, check if it's a link
    const lobbyId = this.lobbyIdInput.value;
    consolex.log(`Joining lobby with ID: ${lobbyId}`);
    this.message = "Checking lobby..."; // Set initial message

    fetch(`/lobby/${lobbyId}/exists`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.exists) {
          this.message = "Joined successfully! Waiting for game to start...";
          this.hasJoined = true;
          this.dispatchEvent(
            new CustomEvent("join-lobby", {
              detail: {
                lobby: { id: lobbyId },
                gameType: GameType.Private,
                map: GameMapType.World,
              },
              bubbles: true,
              composed: true,
            }),
          );
        } else {
          this.message = "Lobby not found. Please check the ID and try again.";
        }
      })
      .catch((error) => {
        consolex.error("Error checking lobby existence:", error);
        this.message = "An error occurred. Please try again.";
      });
  }
}
