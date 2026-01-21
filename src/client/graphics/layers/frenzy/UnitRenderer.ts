import { GameView, PlayerView } from "../../../../core/game/GameView";
import { STRUCTURE_CONFIGS } from "../../../../core/game/frenzy/FrenzyTypes";
import { getMobileConfig } from "../../MobileOptimizations";
import { FrenzyRenderContext } from "./FrenzyRenderContext";

/**
 * Frenzy unit data from the game state
 */
export interface FrenzyUnitData {
  id: number;
  playerId: string;
  x: number;
  y: number;
  unitType: string;
  health: number;
  maxHealth?: number;
  tier?: number;
  shieldHealth?: number;
  maxShieldHealth?: number;
  weaponCooldown?: number;
  fireInterval?: number;
}

/**
 * Renders all mobile unit types in Frenzy mode:
 * Soldier, EliteSoldier, Warship, Artillery, ShieldGenerator, DefensePost
 */
export class UnitRenderer {
  private simplifiedUnits: boolean;

  constructor(private game: GameView) {
    this.simplifiedUnits = getMobileConfig().simplifiedUnits;
  }

  /**
   * Render a single unit
   */
  render(ctx: FrenzyRenderContext, unit: FrenzyUnitData) {
    const player = this.game.player(unit.playerId);
    if (!player) return;

    const x = unit.x - ctx.halfWidth;
    const y = unit.y - ctx.halfHeight;
    const tier = unit.tier ?? 1;

    // Simplified rendering for low-end mobile: just colored circles
    if (this.simplifiedUnits) {
      this.renderSimplifiedUnit(ctx.context, x, y, player, unit);
      return;
    }

    const isDefensePost = unit.unitType === "defensePost";
    const isEliteSoldier = unit.unitType === "eliteSoldier";
    const isWarship = unit.unitType === "warship";
    const isArtillery = unit.unitType === "artillery";
    const isShieldGenerator = unit.unitType === "shieldGenerator";

    if (isShieldGenerator) {
      this.renderShieldGenerator(ctx, x, y, player, unit);
    } else if (isArtillery) {
      this.renderArtillery(ctx.context, x, y, player, tier);
    } else if (isDefensePost) {
      this.renderDefensePost(ctx.context, x, y, player, tier);
    } else if (isEliteSoldier) {
      this.renderEliteSoldier(ctx.context, x, y, player);
    } else if (isWarship) {
      this.renderWarship(ctx.context, x, y, player, tier);
    } else {
      this.renderSoldier(ctx.context, x, y, player);
    }

    // Get bar config for this structure type
    const structureKey = this.getStructureKey(unit.unitType);
    const barConfig = structureKey
      ? STRUCTURE_CONFIGS[structureKey]?.bars
      : null;

    // Render health bar for damaged structures (based on config)
    if (barConfig?.showHealthBar && unit.maxHealth) {
      const healthPercent = unit.health / unit.maxHealth;
      if (healthPercent < 1 && healthPercent > 0) {
        this.renderHealthBar(ctx.context, x, y, unit.health, unit.maxHealth);
      }
    }

    // Render energy bar if configured
    if (barConfig?.showEnergyBar) {
      if (barConfig.energyBarType === "shield" && unit.maxShieldHealth) {
        // Shield bar: shows current shield health
        this.renderEnergyBar(
          ctx.context,
          x,
          y,
          unit.shieldHealth ?? 0,
          unit.maxShieldHealth,
          "#3498db",
        );
      } else if (
        barConfig.energyBarType === "reload" &&
        unit.fireInterval &&
        unit.weaponCooldown !== undefined
      ) {
        // Reload bar: shows loading progress (inverse of cooldown)
        const loadProgress = 1 - unit.weaponCooldown / unit.fireInterval;
        this.renderEnergyBar(
          ctx.context,
          x,
          y,
          loadProgress * 100,
          100,
          "#f39c12",
        );
      }
    }
  }

  /**
   * Maps unit type string to structure config key
   */
  private getStructureKey(
    unitType: string,
  ): keyof typeof STRUCTURE_CONFIGS | null {
    const mapping: Record<string, keyof typeof STRUCTURE_CONFIGS> = {
      defensePost: "defensePost",
      artillery: "artillery",
      shieldGenerator: "shieldGenerator",
      samLauncher: "samLauncher",
      missileSilo: "missileSilo",
    };
    return mapping[unitType] ?? null;
  }

  /**
   * Simplified unit rendering for mobile performance
   */
  private renderSimplifiedUnit(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    unit: FrenzyUnitData,
  ) {
    // Size based on unit type
    let size = 3;
    if (unit.unitType === "warship") size = 6;
    else if (unit.unitType === "artillery") size = 5;
    else if (unit.unitType === "eliteSoldier") size = 4;
    else if (unit.unitType === "shieldGenerator") size = 5;
    else if (unit.unitType === "defensePost") size = 5;

    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  }

  private renderShieldGenerator(
    ctx: FrenzyRenderContext,
    x: number,
    y: number,
    player: PlayerView,
    unit: FrenzyUnitData,
  ) {
    const context = ctx.context;
    const size = 6;
    // Tier 2 shields have 1.5x radius
    const baseShieldRadius = 30;
    const shieldRadius =
      (unit.tier ?? 1) >= 2 ? baseShieldRadius * 1.5 : baseShieldRadius;
    const mobileConfig = getMobileConfig();

    // Draw shield bubble if active
    if (unit.shieldHealth && unit.shieldHealth > 0) {
      if (mobileConfig.reducedAnimations) {
        // Simplified shield rendering for mobile
        context.fillStyle = `rgba(100, 200, 255, 0.15)`;
        context.beginPath();
        context.arc(x, y, shieldRadius, 0, Math.PI * 2);
        context.fill();
      } else {
        const shieldAlpha = 0.15 + 0.1 * Math.sin(ctx.time * 2);
        const shieldGradient = context.createRadialGradient(
          x,
          y,
          0,
          x,
          y,
          shieldRadius,
        );
        shieldGradient.addColorStop(
          0,
          `rgba(100, 200, 255, ${shieldAlpha * 0.3})`,
        );
        shieldGradient.addColorStop(
          0.7,
          `rgba(80, 180, 240, ${shieldAlpha * 0.5})`,
        );
        shieldGradient.addColorStop(1, `rgba(60, 150, 220, ${shieldAlpha})`);

        context.fillStyle = shieldGradient;
        context.beginPath();
        context.arc(x, y, shieldRadius, 0, Math.PI * 2);
        context.fill();

        // Shield edge glow
        context.strokeStyle = `rgba(120, 220, 255, ${0.3 + 0.2 * Math.sin(ctx.time * 3.3)})`;
        context.lineWidth = 2;
        context.stroke();
      }
    }

    // Golden ring for tier 2 towers
    const tier = unit.tier ?? 1;
    if (tier >= 2) {
      context.strokeStyle = "#FFD700";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, size + 2, 0, Math.PI * 2);
      context.stroke();
    }

    // Generator base (hexagon)
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 - Math.PI / 6;
      const px = x + Math.cos(angle) * size;
      const py = y + Math.sin(angle) * size;
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();

    // Center energy core
    const coreGlow = 0.5 + 0.3 * Math.sin(ctx.time * 5);
    context.fillStyle = `rgba(100, 200, 255, ${coreGlow})`;
    context.beginPath();
    context.arc(x, y, size * 0.4, 0, Math.PI * 2);
    context.fill();

    // Border
    context.strokeStyle = "#1a5a8e";
    context.lineWidth = 1;
    context.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 - Math.PI / 6;
      const px = x + Math.cos(angle) * size;
      const py = y + Math.sin(angle) * size;
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.stroke();
  }

  private renderArtillery(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    tier: number = 1,
  ) {
    const size = 7;

    // Golden ring for tier 2 towers
    if (tier >= 2) {
      context.strokeStyle = "#FFD700";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, size + 2, 0, Math.PI * 2);
      context.stroke();
    }

    // Base platform
    context.fillStyle = "#555";
    context.fillRect(x - size / 2, y + size / 4, size, size / 3);

    // Cannon barrel (angled)
    context.save();
    context.translate(x, y);
    context.rotate(-Math.PI / 6);

    context.fillStyle = player.territoryColor().toRgbString();
    context.fillRect(-size / 6, -size / 2, size / 3, size * 0.8);

    context.fillStyle = "#333";
    context.fillRect(-size / 6, -size / 2, size / 3, size / 5);

    context.restore();

    // Wheels
    context.fillStyle = "#444";
    context.beginPath();
    context.arc(x - size / 3, y + size / 3, size / 5, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(x + size / 3, y + size / 3, size / 5, 0, Math.PI * 2);
    context.fill();

    // Border
    context.strokeStyle = "#000";
    context.lineWidth = 0.5;
    context.strokeRect(x - size / 2, y + size / 4, size, size / 3);
  }

  private renderDefensePost(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    tier: number = 1,
  ) {
    const size = 6;

    // Golden ring for tier 2 towers
    if (tier >= 2) {
      context.strokeStyle = "#FFD700";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, size + 1, 0, Math.PI * 2);
      context.stroke();
    }

    // Shield shape
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.moveTo(x, y - size / 2);
    context.lineTo(x + size / 2, y - size / 4);
    context.lineTo(x + size / 2, y + size / 4);
    context.quadraticCurveTo(x, y + size / 2 + 2, x, y + size / 2);
    context.quadraticCurveTo(x, y + size / 2 + 2, x - size / 2, y + size / 4);
    context.lineTo(x - size / 2, y - size / 4);
    context.closePath();
    context.fill();

    context.strokeStyle = "#fff";
    context.lineWidth = 1;
    context.stroke();

    context.strokeStyle = "#000";
    context.lineWidth = 0.5;
    context.stroke();
  }

  private renderEliteSoldier(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
  ) {
    const size = 8;

    // Diamond shape
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.moveTo(x, y - size / 2);
    context.lineTo(x + size / 2, y);
    context.lineTo(x, y + size / 2);
    context.lineTo(x - size / 2, y);
    context.closePath();
    context.fill();

    // Golden border
    context.strokeStyle = "#FFD700";
    context.lineWidth = 1.5;
    context.stroke();

    context.strokeStyle = "#000";
    context.lineWidth = 0.5;
    context.stroke();
  }

  private renderWarship(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    tier: number = 1,
  ) {
    // Lower half of an elongated horizontal ellipse
    const radiusX = 7; // Horizontal radius (wider)
    const radiusY = 4; // Vertical radius (shorter)

    // Determine stroke color: golden for tier 2, black for tier 1
    const strokeColor = tier >= 2 ? "#FFD700" : "#000";

    // Draw the bottom half of the ellipse (hull)
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    // Draw arc from left to right (bottom half = PI to 2*PI)
    context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI, false);
    context.closePath();
    context.fill();

    // Border - golden for tier 2, black for tier 1
    context.strokeStyle = strokeColor;
    context.lineWidth = tier >= 2 ? 1.5 : 1;
    context.beginPath();
    context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI, false);
    context.closePath();
    context.stroke();

    // Superstructure (cabin) - rectangle on top, 3px wide, 2px high
    context.fillStyle = player.territoryColor().toRgbString();
    context.fillRect(x - 1.5, y - 2, 3, 2);
    context.strokeStyle = strokeColor;
    context.lineWidth = tier >= 2 ? 1 : 0.5;
    context.strokeRect(x - 1.5, y - 2, 3, 2);
  }

  private renderSoldier(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
  ) {
    const size = 6;

    // Triangle
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.moveTo(x, y - size / 2);
    context.lineTo(x - size / 2, y + size / 2);
    context.lineTo(x + size / 2, y + size / 2);
    context.closePath();
    context.fill();

    context.strokeStyle = "#000";
    context.lineWidth = 1;
    context.stroke();
  }

  private renderHealthBar(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    health: number,
    maxHealth: number,
  ) {
    const barWidth = 12;
    const barHeight = 2;
    const barY = y + 8;
    const healthPercent = health / maxHealth;

    // Background
    context.fillStyle = "rgba(0, 0, 0, 0.7)";
    context.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

    // Health fill (red to green gradient)
    const r = Math.floor(255 * (1 - healthPercent));
    const g = Math.floor(255 * healthPercent);
    context.fillStyle = `rgb(${r}, ${g}, 0)`;
    context.fillRect(
      x - barWidth / 2,
      barY,
      barWidth * healthPercent,
      barHeight,
    );

    // Border
    context.strokeStyle = "#000";
    context.lineWidth = 0.5;
    context.strokeRect(x - barWidth / 2, barY, barWidth, barHeight);
  }

  private renderEnergyBar(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    current: number,
    max: number,
    color: string,
  ) {
    const barWidth = 12;
    const barHeight = 2;
    const barY = y + 11; // Below health bar
    const percent = Math.min(1, Math.max(0, current / max));

    // Background
    context.fillStyle = "rgba(0, 0, 0, 0.7)";
    context.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

    // Energy fill
    context.fillStyle = color;
    context.fillRect(x - barWidth / 2, barY, barWidth * percent, barHeight);

    // Border
    context.strokeStyle = "#000";
    context.lineWidth = 0.5;
    context.strokeRect(x - barWidth / 2, barY, barWidth, barHeight);
  }
}
