import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { GameMapType } from "../core/game/Game";
import { translateText } from "./Utils";

// Import loading screen images
import circleMapImage from "../../resources/images/loading screen/circlemap/AIcirclemaprender.jpg";
import squareMapImage1 from "../../resources/images/loading screen/squaremap/Airbrush-OBJECT-REMOVER-1769360658417.jpg";
import squareMapImage2 from "../../resources/images/loading screen/squaremap/ships2..jpg";

// Map type to image arrays
const circleMapImages = [circleMapImage];
const squareMapImages = [squareMapImage1, squareMapImage2];

@customElement("game-starting-modal")
export class GameStartingModal extends LitElement {
  @state()
  isVisible = false;

  @state()
  private backgroundImage: string | null = null;

  static styles = css`
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 9999;
      color: white;
      background-color: #1a1a1a;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    .modal.visible {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      animation: fadeIn 0.3s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    .content-overlay {
      background: linear-gradient(
        to top,
        rgba(0, 0, 0, 0.85) 0%,
        rgba(0, 0, 0, 0.6) 50%,
        transparent 100%
      );
      padding: 40px 30px 30px 30px;
      text-align: center;
    }

    .loading {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 20px;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
    }

    .copyright-section {
      font-size: 14px;
      line-height: 1.6;
      opacity: 0.9;
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
    }

    .copyright-section .main-copyright {
      font-size: 16px;
      font-weight: 500;
      margin-bottom: 8px;
    }

    .copyright-section .license {
      font-size: 12px;
      opacity: 0.8;
    }

    .copyright-section a {
      color: #9ca3af;
      text-decoration: underline;
    }

    .copyright-section a:hover {
      color: #d1d5db;
    }

    .credits-link {
      display: inline-block;
      margin-top: 12px;
      color: #60a5fa;
      text-decoration: none;
      font-size: 14px;
    }

    .credits-link:hover {
      color: #93c5fd;
      text-decoration: underline;
    }
  `;

  render() {
    const backgroundStyle = this.backgroundImage
      ? `background-image: url('${this.backgroundImage}');`
      : "";

    return html`
      <div
        class="modal ${this.isVisible ? "visible" : ""}"
        style="${backgroundStyle}"
      >
        <div class="content-overlay">
          <div class="loading">
            ${translateText("game_starting_modal.title")}
          </div>
          <div class="copyright-section">
            <div class="main-copyright">
              © 2024-2025 OpenFront and Contributors, 2025-2026 FrenzyFront
            </div>
            <div class="license">
              Licensed under
              <a
                href="https://www.gnu.org/licenses/agpl-3.0.html"
                target="_blank"
                rel="noopener noreferrer"
                >AGPL-3.0</a
              >
              · Based on
              <a
                href="https://openfront.io"
                target="_blank"
                rel="noopener noreferrer"
                >OpenFront</a
              >
            </div>
            <a
              class="credits-link"
              href="https://github.com/Hauke12345/FrenzyFrontIO/blob/main/CREDITS.md"
              target="_blank"
              rel="noopener noreferrer"
              >${translateText("game_starting_modal.credits")}</a
            >
          </div>
        </div>
      </div>
    `;
  }

  show(mapType?: GameMapType) {
    // Select random image based on map type
    if (mapType === GameMapType.CircleMap) {
      const randomIndex = Math.floor(Math.random() * circleMapImages.length);
      this.backgroundImage = circleMapImages[randomIndex];
    } else if (mapType === GameMapType.SquareMap) {
      const randomIndex = Math.floor(Math.random() * squareMapImages.length);
      this.backgroundImage = squareMapImages[randomIndex];
    } else {
      // Default to a random image from all available
      const allImages = [...circleMapImages, ...squareMapImages];
      const randomIndex = Math.floor(Math.random() * allImages.length);
      this.backgroundImage = allImages[randomIndex];
    }
    this.isVisible = true;
    this.requestUpdate();
  }

  hide() {
    this.isVisible = false;
    this.backgroundImage = null;
    this.requestUpdate();
  }
}
