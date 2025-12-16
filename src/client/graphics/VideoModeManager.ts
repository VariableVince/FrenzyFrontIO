import { EventBus } from "../../core/EventBus";

/**
 * Video Mode toggles the game into a recording-friendly state:
 * - Fixed 1920x1080 (Full HD) resolution
 * - All UI elements hidden
 * - Toggle with F9
 */

export class VideoModeToggleEvent {}

export class VideoModeManager {
  private isVideoMode = false;
  private originalWidth = 0;
  private originalHeight = 0;

  // Full HD resolution
  private readonly VIDEO_WIDTH = 1920;
  private readonly VIDEO_HEIGHT = 1080;

  // UI elements to hide in video mode
  private readonly UI_SELECTORS = [
    "control-panel",
    "leader-board",
    "chat-display",
    "events-display",
    "unit-display",
    "player-panel",
    "game-left-sidebar",
    "game-right-sidebar",
    "player-info-overlay",
    "replay-panel",
    "team-stats",
    "heads-up-message",
    "performance-overlay",
    "spawn-timer",
    "alert-frame",
    "build-menu",
    "emoji-table",
    "frenzy-dev-panel",
    "game-top-bar",
  ];

  constructor(
    private canvas: HTMLCanvasElement,
    private eventBus: EventBus,
  ) {
    this.setupKeyboardShortcut();
    this.injectVideoModeStyles();
  }

  private injectVideoModeStyles(): void {
    const styleId = "video-mode-styles";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      body.video-mode {
        overflow: hidden;
      }

      body.video-mode .video-mode-hidden {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      body.video-mode canvas {
        position: fixed !important;
        left: 50% !important;
        top: 50% !important;
        transform: translate(-50%, -50%) !important;
        width: 1920px !important;
        height: 1080px !important;
      }

      /* Video mode indicator */
      .video-mode-indicator {
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(255, 0, 0, 0.8);
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 14px;
        z-index: 10000;
        pointer-events: none;
        animation: pulse 1s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
    `;
    document.head.appendChild(style);
  }

  private setupKeyboardShortcut(): void {
    window.addEventListener("keydown", (e) => {
      if (e.code === "F9") {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  toggle(): void {
    if (this.isVideoMode) {
      this.exitVideoMode();
    } else {
      this.enterVideoMode();
    }
    this.eventBus.emit(new VideoModeToggleEvent());
  }

  private enterVideoMode(): void {
    this.isVideoMode = true;

    // Store original dimensions
    this.originalWidth = this.canvas.width;
    this.originalHeight = this.canvas.height;

    // Set canvas to Full HD
    this.canvas.width = this.VIDEO_WIDTH;
    this.canvas.height = this.VIDEO_HEIGHT;

    // Add video-mode class to body
    document.body.classList.add("video-mode");

    // Hide UI elements
    this.UI_SELECTORS.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => el.classList.add("video-mode-hidden"));
    });

    // Also hide any fixed positioned overlays
    document
      .querySelectorAll('[style*="position: fixed"], [style*="position:fixed"]')
      .forEach((el) => {
        if (
          el !== this.canvas &&
          !el.classList.contains("video-mode-indicator")
        ) {
          const htmlEl = el as HTMLElement;
          if (htmlEl.tagName.toLowerCase() !== "canvas") {
            htmlEl.classList.add("video-mode-hidden");
          }
        }
      });

    // Show indicator
    this.showIndicator();

    console.log(
      `[VideoMode] Enabled - Canvas: ${this.VIDEO_WIDTH}x${this.VIDEO_HEIGHT}`,
    );
  }

  private exitVideoMode(): void {
    this.isVideoMode = false;

    // Restore original dimensions
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // Remove video-mode class from body
    document.body.classList.remove("video-mode");

    // Show UI elements
    document.querySelectorAll(".video-mode-hidden").forEach((el) => {
      el.classList.remove("video-mode-hidden");
    });

    // Remove indicator
    this.hideIndicator();

    console.log(`[VideoMode] Disabled - Canvas restored to window size`);
  }

  private showIndicator(): void {
    const existing = document.querySelector(".video-mode-indicator");
    if (existing) return;

    const indicator = document.createElement("div");
    indicator.className = "video-mode-indicator";
    indicator.textContent = "● REC 1920x1080 (F9 to exit)";
    document.body.appendChild(indicator);

    // Auto-hide after 3 seconds
    setTimeout(() => {
      indicator.style.opacity = "0.3";
    }, 3000);
  }

  private hideIndicator(): void {
    const indicator = document.querySelector(".video-mode-indicator");
    if (indicator) {
      indicator.remove();
    }
  }

  isActive(): boolean {
    return this.isVideoMode;
  }

  getResolution(): { width: number; height: number } {
    return this.isVideoMode
      ? { width: this.VIDEO_WIDTH, height: this.VIDEO_HEIGHT }
      : { width: window.innerWidth, height: window.innerHeight };
  }
}
