import {
  PROJECTILE_CONFIGS,
  ProjectileType,
} from "../../../../core/game/frenzy/FrenzyTypes";
import { FrenzyRenderContext } from "./FrenzyRenderContext";

/**
 * Projectile data from game state
 */
export interface FrenzyProjectileData {
  id: number;
  playerId: string;
  x: number;
  y: number;
  projectileType?: string;
  areaRadius?: number;
  startX?: number;
  startY?: number;
  targetX?: number;
  targetY?: number;
  progress?: number;
}

/**
 * Renders all projectile types in Frenzy mode:
 * - PlasmaOrb: Default cyan/blue plasma (soldiers)
 * - GreenOrb: Green plasma orb (defense posts tier 1)
 * - Laser: Red beam (warships tier 1, defense posts tier 2)
 * - GoldenOrb: Elite soldier projectile
 * - Artillery: Ballistic arc shells
 * - Missile: Tier 2 warship missiles
 */
export class ProjectileRenderer {
  /**
   * Render a projectile based on its type
   */
  render(
    ctx: FrenzyRenderContext,
    projectile: FrenzyProjectileData,
    diameter: number,
  ) {
    const x = projectile.x - ctx.halfWidth;
    const y = projectile.y - ctx.halfHeight;
    const type = projectile.projectileType as ProjectileType | undefined;

    // Laser/beam rendering
    if (
      type === ProjectileType.Laser &&
      projectile.startX !== undefined &&
      projectile.startY !== undefined
    ) {
      this.renderBeam(ctx, projectile);
      return;
    }

    const radius = Math.max(1, diameter / 2);

    // Artillery shell
    if (type === ProjectileType.Artillery) {
      this.renderArtilleryProjectile(ctx, projectile);
      return;
    }

    // Missile (tier 2 warship)
    if (type === ProjectileType.Missile) {
      this.renderMissile(ctx, projectile);
      return;
    }

    // Orb-style projectiles (PlasmaOrb, GreenOrb, GoldenOrb)
    this.renderOrbProjectile(ctx.context, x, y, radius, type);
  }

  /**
   * Render an orb-style projectile with configurable colors
   */
  private renderOrbProjectile(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    type?: ProjectileType,
  ) {
    const config =
      PROJECTILE_CONFIGS[type ?? ProjectileType.PlasmaOrb] ??
      PROJECTILE_CONFIGS[ProjectileType.PlasmaOrb];

    // Adjust radius for elite/golden orbs
    const effectiveRadius =
      type === ProjectileType.GoldenOrb ? radius * 1.5 : radius;

    // Outer glow
    const gradient = context.createRadialGradient(
      x,
      y,
      0,
      x,
      y,
      effectiveRadius * 2.5,
    );
    gradient.addColorStop(0, config.glowColor1);
    gradient.addColorStop(0.3, config.glowColor2);
    gradient.addColorStop(0.6, config.glowColor3);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, effectiveRadius * 2.5, 0, Math.PI * 2);
    context.fill();

    // Bright core
    context.fillStyle = config.coreColor;
    context.beginPath();
    context.arc(x, y, effectiveRadius * 0.5, 0, Math.PI * 2);
    context.fill();
  }

  private renderArtilleryProjectile(
    ctx: FrenzyRenderContext,
    projectile: FrenzyProjectileData,
  ) {
    const context = ctx.context;
    const spotSize = 3;
    const progress = projectile.progress ?? 0;

    const startX = (projectile.startX ?? projectile.x) - ctx.halfWidth;
    const startY = (projectile.startY ?? projectile.y) - ctx.halfHeight;
    const targetX = (projectile.targetX ?? projectile.x) - ctx.halfWidth;
    const targetY = (projectile.targetY ?? projectile.y) - ctx.halfHeight;

    const dx = targetX - startX;
    const dy = targetY - startY;
    const dist = Math.hypot(dx, dy);

    // Ballistic arc
    const arcHeight = Math.min(dist * 0.4, 60);
    const arcOffset = -4 * arcHeight * progress * (1 - progress);

    const x = startX + dx * progress;
    const y = startY + dy * progress + arcOffset;

    // Outer glow
    const glowRadius = spotSize * 4;
    const glowGradient = context.createRadialGradient(
      x,
      y,
      0,
      x,
      y,
      glowRadius,
    );
    glowGradient.addColorStop(0, "rgba(255, 150, 50, 0.6)");
    glowGradient.addColorStop(0.4, "rgba(255, 80, 0, 0.3)");
    glowGradient.addColorStop(1, "rgba(255, 0, 0, 0)");
    context.fillStyle = glowGradient;
    context.beginPath();
    context.arc(x, y, glowRadius, 0, Math.PI * 2);
    context.fill();

    // Core
    context.fillStyle = "#ffffcc";
    context.beginPath();
    context.arc(x, y, spotSize, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(x, y, spotSize * 0.5, 0, Math.PI * 2);
    context.fill();
  }

  private renderBeam(
    ctx: FrenzyRenderContext,
    projectile: FrenzyProjectileData,
  ) {
    const context = ctx.context;
    const startX = projectile.startX! - ctx.halfWidth;
    const startY = projectile.startY! - ctx.halfHeight;
    const endX = projectile.x - ctx.halfWidth;
    const endY = projectile.y - ctx.halfHeight;

    // Outer glow
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

    // Inner core
    context.strokeStyle = "rgba(255, 200, 200, 0.9)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();

    // Impact flash
    const gradient = context.createRadialGradient(endX, endY, 0, endX, endY, 4);
    gradient.addColorStop(0, "rgba(255, 255, 200, 0.9)");
    gradient.addColorStop(0.5, "rgba(255, 100, 50, 0.6)");
    gradient.addColorStop(1, "rgba(255, 0, 0, 0)");

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(endX, endY, 4, 0, Math.PI * 2);
    context.fill();
  }

  /**
   * Render a missile (tier 2 warship projectile)
   * Arcing trajectory with proper missile shape including fins
   */
  private renderMissile(
    ctx: FrenzyRenderContext,
    projectile: FrenzyProjectileData,
  ) {
    const context = ctx.context;
    const progress = projectile.progress ?? 0;

    const startX = (projectile.startX ?? projectile.x) - ctx.halfWidth;
    const startY = (projectile.startY ?? projectile.y) - ctx.halfHeight;
    const targetX = (projectile.targetX ?? projectile.x) - ctx.halfWidth;
    const targetY = (projectile.targetY ?? projectile.y) - ctx.halfHeight;

    const dx = targetX - startX;
    const dy = targetY - startY;
    const dist = Math.hypot(dx, dy);

    // Ballistic arc - smaller arc than artillery
    const arcHeight = Math.min(dist * 0.25, 40);
    const arcOffset = -4 * arcHeight * progress * (1 - progress);

    // Current position on arc
    const x = startX + dx * progress;
    const y = startY + dy * progress + arcOffset;

    // Calculate tangent direction (derivative of position with respect to progress)
    // dx/dt = dx (constant velocity in x)
    // dy/dt = dy + d(arcOffset)/dt = dy + (-4 * arcHeight * (1 - 2*progress))
    const velocityX = dx;
    const velocityY = dy + -4 * arcHeight * (1 - 2 * progress);
    const angle = Math.atan2(velocityY, velocityX);

    // Trail position (slightly behind on the arc)
    const trailProgress = Math.max(0, progress - 0.08);
    const trailArcOffset = -4 * arcHeight * trailProgress * (1 - trailProgress);
    const trailX = startX + dx * trailProgress;
    const trailY = startY + dy * trailProgress + trailArcOffset;

    // Smoke trail
    const trailGradient = context.createLinearGradient(trailX, trailY, x, y);
    trailGradient.addColorStop(0, "rgba(80, 80, 80, 0)");
    trailGradient.addColorStop(0.5, "rgba(120, 120, 120, 0.3)");
    trailGradient.addColorStop(1, "rgba(180, 180, 180, 0.5)");

    context.strokeStyle = trailGradient;
    context.lineWidth = 0.6;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(trailX, trailY);
    context.lineTo(x, y);
    context.stroke();

    // Draw missile
    context.save();
    context.translate(x, y);
    context.rotate(angle);

    // Missile body (elongated white shape)
    const missileLength = 1.0;
    const missileWidth = 0.4;

    context.fillStyle = "#f0f0f0";
    context.beginPath();
    context.ellipse(0, 0, missileLength, missileWidth, 0, 0, Math.PI * 2);
    context.fill();

    // Nose cone (darker tip)
    context.fillStyle = "#d0d0d0";
    context.beginPath();
    context.ellipse(
      missileLength * 0.7,
      0,
      missileLength * 0.4,
      missileWidth * 0.8,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();

    // Tail fins (small triangles at back)
    context.fillStyle = "#c0c0c0";
    context.beginPath();
    // Top fin
    context.moveTo(-missileLength * 0.6, -missileWidth * 0.5);
    context.lineTo(-missileLength * 1.1, -missileWidth * 1.5);
    context.lineTo(-missileLength * 0.9, -missileWidth * 0.3);
    context.closePath();
    context.fill();

    context.beginPath();
    // Bottom fin
    context.moveTo(-missileLength * 0.6, missileWidth * 0.5);
    context.lineTo(-missileLength * 1.1, missileWidth * 1.5);
    context.lineTo(-missileLength * 0.9, missileWidth * 0.3);
    context.closePath();
    context.fill();

    // Engine glow at back
    const glowGradient = context.createRadialGradient(
      -missileLength,
      0,
      0,
      -missileLength,
      0,
      1.0,
    );
    glowGradient.addColorStop(0, "rgba(255, 220, 120, 0.9)");
    glowGradient.addColorStop(0.3, "rgba(255, 150, 50, 0.6)");
    glowGradient.addColorStop(0.6, "rgba(255, 80, 20, 0.3)");
    glowGradient.addColorStop(1, "rgba(255, 50, 0, 0)");

    context.fillStyle = glowGradient;
    context.beginPath();
    context.arc(-missileLength, 0, 1.0, 0, Math.PI * 2);
    context.fill();

    context.restore();
  }
}
