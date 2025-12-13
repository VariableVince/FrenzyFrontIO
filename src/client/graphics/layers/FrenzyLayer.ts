import { GameFork } from "../../../core/game/Game";
import { GameView } from "../../../core/game/GameView";
import { TransformHandler } from "../TransformHandler";
import { Layer } from "./Layer";

/**
 * Frenzy Layer: Renders units and core buildings for Frenzy mode
 */
export class FrenzyLayer implements Layer {
  constructor(
    private game: GameView,
    private transformHandler: TransformHandler,
  ) {}

  shouldTransform(): boolean {
    return true;
  }

  init() {
    console.log("[FrenzyLayer] Initialized");
  }

  tick() {
    // No per-tick updates needed
  }

  renderLayer(context: CanvasRenderingContext2D) {
    // Check if we're in Frenzy fork
    if (this.game.config().gameConfig().gameFork !== GameFork.Frenzy) {
      return;
    }

    const frenzyState = this.game.frenzyManager();
    if (!frenzyState) {
      return; // No state yet, skip rendering
    }

    // Render core buildings
    for (const building of frenzyState.coreBuildings) {
      this.renderCoreBuilding(context, building);
    }

    // Render units
    for (const unit of frenzyState.units) {
      this.renderUnit(context, unit);
    }

    const projectileSize = Math.max(0.5, frenzyState.projectileSize ?? 2);

    // Render projectiles last so they sit on top
    for (const projectile of frenzyState.projectiles) {
      this.renderProjectile(context, projectile, projectileSize);
    }
  }

  private renderTestMarker(context: CanvasRenderingContext2D) {
    // Draw a circle at 0,0 (map center in transformed coordinates)
    context.fillStyle = "#FF0000";
    context.beginPath();
    context.arc(0, 0, 20, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "#000";
    context.lineWidth = 2;
    context.stroke();
  }

  private renderCoreBuilding(context: CanvasRenderingContext2D, building: any) {
    const player = this.game.player(building.playerId);
    if (!player) return;

    const x = building.x - this.game.width() / 2;
    const y = building.y - this.game.height() / 2;

    // Draw city icon (larger than units)
    const size = 12;  // Halved from 24

    // Outer circle (glow)
    context.fillStyle = player.territoryColor().alpha(0.5).toRgbString();
    context.beginPath();
    context.arc(x, y, size / 2 + 4, 0, Math.PI * 2);
    context.fill();

    // Inner circle (building)
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.arc(x, y, size / 2, 0, Math.PI * 2);
    context.fill();

    // Border
    context.strokeStyle = "#000";
    context.lineWidth = 2;
    context.stroke();

    // Spawn progress indicator (ring around building)
    const spawnProgress =
      1 - (building.spawnTimer ?? 0) / (building.spawnInterval ?? 1);
    if (spawnProgress > 0 && spawnProgress < 1) {
      context.strokeStyle = "#fff";
      context.lineWidth = 3;
      context.beginPath();
      context.arc(
        x,
        y,
        size / 2 + 6,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * spawnProgress,
      );
      context.stroke();
    }
  }

  private renderUnit(context: CanvasRenderingContext2D, unit: any) {
    const player = this.game.player(unit.playerId);
    if (!player) return;

    const x = unit.x - this.game.width() / 2;
    const y = unit.y - this.game.height() / 2;

    const isDefensePost = unit.unitType === "defensePost";

    if (isDefensePost) {
      // Defense post: shield icon (50% smaller than before)
      const size = 4;  // Reduced from 8 for 50% smaller

      // Draw shield shape
      context.fillStyle = player.territoryColor().toRgbString();
      context.beginPath();
      context.moveTo(x, y - size / 2); // Top center
      context.lineTo(x + size / 2, y - size / 4); // Top right
      context.lineTo(x + size / 2, y + size / 4); // Bottom right curve start
      context.quadraticCurveTo(x, y + size / 2 + 2, x, y + size / 2); // Bottom point
      context.quadraticCurveTo(x, y + size / 2 + 2, x - size / 2, y + size / 4); // Left curve
      context.lineTo(x - size / 2, y - size / 4); // Top left
      context.closePath();
      context.fill();

      // White border for visibility
      context.strokeStyle = "#fff";
      context.lineWidth = 1;
      context.stroke();

      // Black outline
      context.strokeStyle = "#000";
      context.lineWidth = 0.5;
      context.stroke();
    } else {
      // Regular soldier: triangle pointing up
      const size = 6;  // Halved from 12

      // Fill
      context.fillStyle = player.territoryColor().toRgbString();
      context.beginPath();
      context.moveTo(x, y - size / 2); // Top point
      context.lineTo(x - size / 2, y + size / 2); // Bottom left
      context.lineTo(x + size / 2, y + size / 2); // Bottom right
      context.closePath();
      context.fill();

      // Black outline for visibility
      context.strokeStyle = "#000";
      context.lineWidth = 1;
      context.stroke();
    }
  }

  private renderProjectile(
    context: CanvasRenderingContext2D,
    projectile: any,
    diameter: number,
  ) {
    const x = projectile.x - this.game.width() / 2;
    const y = projectile.y - this.game.height() / 2;

    // Check if this is a beam (defense post red laser)
    if (projectile.isBeam && projectile.startX !== undefined && projectile.startY !== undefined) {
      this.renderBeam(context, projectile);
      return;
    }

    const radius = Math.max(1, diameter / 2);
    
    // Plasma projectile effect with glowing core
    // Outer glow
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius * 2.5);
    gradient.addColorStop(0, "rgba(0, 255, 255, 0.9)");    // Cyan core
    gradient.addColorStop(0.3, "rgba(100, 200, 255, 0.7)"); // Light blue
    gradient.addColorStop(0.6, "rgba(150, 100, 255, 0.4)"); // Purple edge
    gradient.addColorStop(1, "rgba(100, 50, 200, 0)");      // Transparent
    
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius * 2.5, 0, Math.PI * 2);
    context.fill();
    
    // Bright core
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(x, y, radius * 0.5, 0, Math.PI * 2);
    context.fill();
  }

  private renderBeam(context: CanvasRenderingContext2D, projectile: any) {
    const startX = projectile.startX - this.game.width() / 2;
    const startY = projectile.startY - this.game.height() / 2;
    const endX = projectile.x - this.game.width() / 2;
    const endY = projectile.y - this.game.height() / 2;

    // Red beam like C&C Obelisk of Light
    // Outer glow (wider, semi-transparent)
    context.strokeStyle = "rgba(255, 0, 0, 0.3)";
    context.lineWidth = 6;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();

    // Middle glow
    context.strokeStyle = "rgba(255, 50, 50, 0.6)";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();

    // Inner bright core (white-red)
    context.strokeStyle = "rgba(255, 200, 200, 0.9)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();

    // Impact flash at target
    const gradient = context.createRadialGradient(endX, endY, 0, endX, endY, 4);
    gradient.addColorStop(0, "rgba(255, 255, 200, 0.9)");
    gradient.addColorStop(0.5, "rgba(255, 100, 50, 0.6)");
    gradient.addColorStop(1, "rgba(255, 0, 0, 0)");
    
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(endX, endY, 4, 0, Math.PI * 2);
    context.fill();
  }
}
