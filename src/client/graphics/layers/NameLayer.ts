import { renderPlayerFlag } from "../../../core/CustomFlag";
import { EventBus } from "../../../core/EventBus";
import { PseudoRandom } from "../../../core/PseudoRandom";
import { Theme } from "../../../core/configuration/Config";
import { Cell } from "../../../core/game/Game";
import { GameView, PlayerView } from "../../../core/game/GameView";
import { UserSettings } from "../../../core/game/UserSettings";
import { AlternateViewEvent } from "../../InputHandler";
import { createCanvas } from "../../Utils";
import {
  computeAllianceClipPath,
  createAllianceProgressIcon,
  getFirstPlacePlayer,
  getPlayerIcons,
  PlayerIconId,
} from "../PlayerIcons";
import { TransformHandler } from "../TransformHandler";
import { Layer } from "./Layer";

class RenderInfo {
  public icons: Map<PlayerIconId, HTMLElement> = new Map(); // Track icon elements
  // Cached DOM references to avoid querySelector calls
  public nameDiv: HTMLDivElement | null = null;
  public flagDiv: HTMLDivElement | null = null;
  public iconsDiv: HTMLDivElement | null = null;
  public nameSpan: HTMLSpanElement | null = null;
  public shieldDiv: HTMLDivElement | null = null;
  public shieldImg: HTMLImageElement | null = null;
  public shieldNumber: HTMLSpanElement | null = null;

  constructor(
    public player: PlayerView,
    public lastRenderCalc: number,
    public location: Cell | null,
    public fontSize: number,
    public fontColor: string,
    public element: HTMLElement,
  ) {}
}

export class NameLayer implements Layer {
  private canvas: HTMLCanvasElement;
  private lastChecked = 0;
  private renderCheckRate = 100;
  private renderRefreshRate = 500;
  private rand = new PseudoRandom(10);
  private renders: RenderInfo[] = [];
  private seenPlayers: Set<PlayerView> = new Set();
  private container: HTMLDivElement;
  private theme: Theme = this.game.config().theme();
  private userSettings: UserSettings = new UserSettings();
  private isVisible: boolean = true;
  private firstPlace: PlayerView | null = null;
  // Reusable Cell object for coordinate transform
  private originCell: Cell = new Cell(0, 0);

  constructor(
    private game: GameView,
    private transformHandler: TransformHandler,
    private eventBus: EventBus,
  ) {}

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  shouldTransform(): boolean {
    return false;
  }

  redraw() {
    this.theme = this.game.config().theme();
  }

  public init() {
    this.canvas = createCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());
    this.resizeCanvas();

    this.container = document.createElement("div");
    this.container.style.position = "fixed";
    this.container.style.left = "50%";
    this.container.style.top = "50%";
    this.container.style.pointerEvents = "none";
    this.container.style.zIndex = "2";
    document.body.appendChild(this.container);

    // Add CSS keyframes for traitor icon flashing animation
    // Append to container instead of document.head to keep styles scoped to this component
    const style = document.createElement("style");
    style.textContent = `
      @keyframes traitorFlash {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.3;
        }
      }
    `;
    this.container.appendChild(style);

    this.eventBus.on(AlternateViewEvent, (e) => this.onAlternateViewChange(e));
  }

  private onAlternateViewChange(event: AlternateViewEvent) {
    this.isVisible = !event.alternateView;
    // Update visibility of all name elements immediately
    for (const render of this.renders) {
      this.updateElementVisibility(render);
    }
  }

  private updateElementVisibility(render: RenderInfo) {
    if (!render.player.nameLocation() || !render.player.isAlive()) {
      return;
    }

    const baseSize = Math.max(1, Math.floor(render.player.nameLocation().size));
    const size = this.transformHandler.scale * baseSize;
    const isOnScreen = render.location
      ? this.transformHandler.isOnScreen(render.location)
      : false;
    const maxZoomScale = 17;

    if (
      !this.isVisible ||
      size < 7 ||
      (this.transformHandler.scale > maxZoomScale && size > 100) ||
      !isOnScreen
    ) {
      render.element.style.display = "none";
    } else {
      render.element.style.display = "flex";
    }
  }

  public tick() {
    if (this.game.ticks() % 10 !== 0) {
      return;
    }

    // Precompute the first-place player for performance
    this.firstPlace = getFirstPlacePlayer(this.game);

    for (const player of this.game.playerViews()) {
      if (player.isAlive()) {
        if (!this.seenPlayers.has(player)) {
          this.seenPlayers.add(player);
          this.renders.push(this.createPlayerRenderInfo(player));
        }
      }
    }
  }

  public renderLayer(mainContex: CanvasRenderingContext2D) {
    const screenPosOld = this.transformHandler.worldToScreenCoordinates(
      this.originCell,
    );
    const screenX = screenPosOld.x - window.innerWidth / 2;
    const screenY = screenPosOld.y - window.innerHeight / 2;
    this.container.style.transform = `translate(${screenX}px, ${screenY}px) scale(${this.transformHandler.scale})`;

    const now = Date.now();
    if (now > this.lastChecked + this.renderCheckRate) {
      this.lastChecked = now;
      for (const render of this.renders) {
        this.renderPlayerInfo(render);
      }
    }

    mainContex.drawImage(
      this.canvas,
      0,
      0,
      mainContex.canvas.width,
      mainContex.canvas.height,
    );
  }

  private createPlayerRenderInfo(player: PlayerView): RenderInfo {
    const element = document.createElement("div");
    element.style.position = "absolute";
    element.style.display = "flex";
    element.style.flexDirection = "column";
    element.style.alignItems = "center";
    element.style.gap = "0px";

    const iconsDiv = document.createElement("div");
    iconsDiv.classList.add("player-icons");
    iconsDiv.style.display = "flex";
    iconsDiv.style.gap = "4px";
    iconsDiv.style.justifyContent = "center";
    iconsDiv.style.alignItems = "center";
    iconsDiv.style.zIndex = "2";
    iconsDiv.style.opacity = "0.8";
    element.appendChild(iconsDiv);

    const nameDiv = document.createElement("div");
    let flagDiv: HTMLDivElement | null = null;

    const applyFlagStyles = (el: HTMLElement): void => {
      el.classList.add("player-flag");
      el.style.opacity = "0.8";
      el.style.zIndex = "1";
      el.style.aspectRatio = "3/4";
    };

    if (player.cosmetics.flag) {
      const flag = player.cosmetics.flag;
      if (flag !== undefined && flag !== null && flag.startsWith("!")) {
        const flagWrapper = document.createElement("div");
        applyFlagStyles(flagWrapper);
        renderPlayerFlag(flag, flagWrapper);
        nameDiv.appendChild(flagWrapper);
        flagDiv = flagWrapper;
      } else if (flag !== undefined && flag !== null) {
        const flagImg = document.createElement(
          "img",
        ) as unknown as HTMLDivElement;
        applyFlagStyles(flagImg);
        (flagImg as unknown as HTMLImageElement).src =
          "/flags/" + flag + ".svg";
        nameDiv.appendChild(flagImg);
        flagDiv = flagImg;
      }
    }
    nameDiv.classList.add("player-name");
    nameDiv.style.color = this.theme.textColor(player);
    nameDiv.style.fontFamily = this.theme.font();
    nameDiv.style.whiteSpace = "nowrap";
    nameDiv.style.textOverflow = "ellipsis";
    nameDiv.style.zIndex = "3";
    nameDiv.style.display = "flex";
    nameDiv.style.justifyContent = "flex-end";
    nameDiv.style.alignItems = "center";

    const nameSpan = document.createElement("span");
    nameSpan.className = "player-name-span";
    nameSpan.innerHTML = player.name();
    nameDiv.appendChild(nameSpan);
    element.appendChild(nameDiv);

    // Start off invisible so it doesn't flash at 0,0
    element.style.display = "none";

    this.container.appendChild(element);

    // Create RenderInfo with cached DOM references
    const renderInfo = new RenderInfo(player, 0, null, 0, "", element);
    renderInfo.nameDiv = nameDiv;
    renderInfo.flagDiv = flagDiv;
    renderInfo.iconsDiv = iconsDiv;
    renderInfo.nameSpan = nameSpan;

    return renderInfo;
  }

  renderPlayerInfo(render: RenderInfo) {
    if (!render.player.nameLocation() || !render.player.isAlive()) {
      this.renders = this.renders.filter((r) => r !== render);
      render.element.remove();
      return;
    }

    // Update location
    const nameLoc = render.player.nameLocation();
    const locationChanged =
      !render.location ||
      render.location.x !== nameLoc.x ||
      render.location.y !== nameLoc.y;
    render.location = new Cell(nameLoc.x, nameLoc.y);

    // Calculate base size and scale
    const baseSize = Math.max(1, Math.floor(nameLoc.size));
    render.fontSize = Math.max(4, Math.floor(baseSize * 0.4));
    render.fontColor = this.theme.textColor(render.player);

    // Update position if changed (do this before visibility check)
    if (locationChanged) {
      const scale = Math.min(baseSize * 0.25, 3);
      render.element.style.transform = `translate(${render.location.x}px, ${render.location.y}px) translate(-50%, -50%) scale(${scale})`;
    }

    // Update element visibility (handles Ctrl key, size, and screen position)
    this.updateElementVisibility(render);

    // If element is hidden, don't continue with rendering
    if (render.element.style.display === "none") {
      return;
    }

    // Throttle updates
    const now = Date.now();
    if (now - render.lastRenderCalc <= this.renderRefreshRate) {
      return;
    }
    render.lastRenderCalc = now + this.rand.nextInt(0, 100);

    // Update text sizes using cached DOM references
    const nameDiv = render.nameDiv;
    const flagDiv = render.flagDiv;
    if (nameDiv) {
      nameDiv.style.fontSize = `${render.fontSize}px`;
      nameDiv.style.lineHeight = `${render.fontSize}px`;
      nameDiv.style.color = render.fontColor;
    }
    if (render.nameSpan) {
      render.nameSpan.innerHTML = render.player.name();
    }
    if (flagDiv) {
      flagDiv.style.height = `${render.fontSize}px`;
    }

    // Handle icons using cached reference
    const iconsDiv = render.iconsDiv;
    if (!iconsDiv) return;

    const iconSize = Math.min(render.fontSize * 1.5, 48);

    // Compute which icons should be shown for this player using shared logic
    const icons = getPlayerIcons({
      game: this.game,
      player: render.player,
      includeAllianceIcon: true,
      firstPlace: this.firstPlace,
    });

    // Build a set of desired icon IDs
    const desiredIconIds = new Set(icons.map((icon) => icon.id));

    // Remove any icons that are no longer needed
    for (const [id, element] of render.icons) {
      if (!desiredIconIds.has(id)) {
        element.remove();
        render.icons.delete(id);
      }
    }

    // Add or update icons that should be shown
    for (const icon of icons) {
      if (icon.kind === "emoji" && icon.text) {
        let emojiDiv = render.icons.get(icon.id) as HTMLDivElement | undefined;

        if (!emojiDiv) {
          emojiDiv = document.createElement("div");
          emojiDiv.style.position = "absolute";
          emojiDiv.style.top = "50%";
          emojiDiv.style.transform = "translateY(-50%)";
          iconsDiv.appendChild(emojiDiv);
          render.icons.set(icon.id, emojiDiv);
        }

        emojiDiv.textContent = icon.text;
        emojiDiv.style.fontSize = `${iconSize}px`;
      } else if (icon.kind === "image" && icon.src) {
        // Special handling for alliance icon with progress indicator
        if (icon.id === "alliance") {
          let allianceWrapper = render.icons.get(icon.id) as
            | HTMLDivElement
            | undefined;

          const myPlayer = this.game.myPlayer();
          const allianceView = myPlayer
            ?.alliances()
            .find((a) => a.other === render.player.id());

          let fraction = 0;
          let hasExtensionRequest = false;
          if (allianceView) {
            const remaining = Math.max(
              0,
              allianceView.expiresAt - this.game.ticks(),
            );
            const duration = Math.max(1, this.game.config().allianceDuration());
            fraction = Math.max(0, Math.min(1, remaining / duration));
            hasExtensionRequest = allianceView.hasExtensionRequest;
          }

          if (!allianceWrapper) {
            allianceWrapper = createAllianceProgressIcon(
              iconSize,
              fraction,
              hasExtensionRequest,
              this.userSettings.darkMode(),
            );
            iconsDiv.appendChild(allianceWrapper);
            render.icons.set(icon.id, allianceWrapper);
          } else {
            // Update existing alliance icon
            allianceWrapper.style.width = `${iconSize}px`;
            allianceWrapper.style.height = `${iconSize}px`;

            const overlay = allianceWrapper.querySelector(
              ".alliance-progress-overlay",
            ) as HTMLDivElement | null;
            if (overlay) {
              overlay.style.clipPath = computeAllianceClipPath(fraction);
            }

            const questionMark = allianceWrapper.querySelector(
              ".alliance-question-mark",
            ) as HTMLImageElement | null;
            if (questionMark) {
              questionMark.style.display = hasExtensionRequest
                ? "block"
                : "none";
            }

            // Update inner image sizes
            const imgs = allianceWrapper.getElementsByTagName("img");
            for (const img of imgs) {
              img.style.width = `${iconSize}px`;
              img.style.height = `${iconSize}px`;
            }
          }
          continue; // Skip regular image handling
        }

        let imgElement = render.icons.get(icon.id) as
          | HTMLImageElement
          | undefined;

        if (!imgElement) {
          imgElement = this.createIconElement(icon.src, iconSize, icon.center);
          iconsDiv.appendChild(imgElement);
          render.icons.set(icon.id, imgElement);
        }

        // Update src if it changed (e.g., nuke red/white or dark-mode icons)
        if (imgElement.src !== icon.src) {
          imgElement.src = icon.src;
        }

        imgElement.style.width = `${iconSize}px`;
        imgElement.style.height = `${iconSize}px`;

        // Traitor flashing - smooth speed increase starting at 15s
        if (icon.id === "traitor") {
          const remainingTicks = render.player.getTraitorRemainingTicks();
          // Use precise seconds (not rounded) for smoother transitions, rounded to 0.5s intervals
          const remainingSeconds = Math.round((remainingTicks / 10) * 2) / 2;

          if (remainingSeconds <= 15) {
            // Smooth transition: starts at 1s at 15 seconds, decreases to 0.2s at 0 seconds
            // Using cubic ease-out for slower, more gradual acceleration
            const clampedSeconds = Math.max(0, Math.min(15, remainingSeconds));
            const normalizedTime = clampedSeconds / 15; // 0 to 1 (1 = 15s remaining, 0 = 0s remaining)

            // Cubic ease-out: slower acceleration, smoother transition
            const easedProgress = 1 - Math.pow(1 - normalizedTime, 3);
            const maxDuration = 1.0; // Slow flash at 15 seconds
            const minDuration = 0.2; // Fast flash at 0 seconds
            const duration =
              minDuration + (maxDuration - minDuration) * easedProgress;
            const animationDuration = `${duration.toFixed(2)}s`;

            imgElement.style.animation = `traitorFlash ${animationDuration} infinite`;
            imgElement.style.animationTimingFunction = "ease-in-out";
          } else {
            // Don't flash if more than 15 seconds remaining
            imgElement.style.animation = "none";
          }
        }
      }
    }
  }

  private createIconElement(
    src: string,
    size: number,
    center: boolean = false,
  ): HTMLImageElement {
    const icon = document.createElement("img");
    icon.src = src;
    icon.style.width = `${size}px`;
    icon.style.height = `${size}px`;
    icon.setAttribute("dark-mode", this.userSettings.darkMode().toString());
    if (center) {
      icon.style.position = "absolute";
      icon.style.top = "50%";
      icon.style.transform = "translateY(-50%)";
    }
    return icon;
  }
}
