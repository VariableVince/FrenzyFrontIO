import { GameView } from "../../../../core/game/GameView";
import {
  isMobileDevice,
  shouldSkipExpensiveEffect,
} from "../../MobileOptimizations";
import { FrenzyRenderContext } from "./FrenzyRenderContext";

/**
 * Mine data for mining cells rendering
 */
export interface MineData {
  x: number;
  y: number;
  playerId: string;
  tier: number;
  crystalsInCell: Array<{ x: number; y: number; count: number }>;
  territoryColor?: string; // Player's territory color for cell boundaries
}

/**
 * Crystal cluster data
 */
export interface CrystalData {
  id: number;
  x: number;
  y: number;
  crystalCount: number;
  rotations?: number[];
}

/**
 * Cached vein data for pulse animation
 */
interface VeinCache {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ctrlX: number;
  ctrlY: number;
  isCrystal: boolean;
  crystalCount: number;
  alpha: number;
}

/**
 * Renders the mining cells effect:
 * - Organic veins connecting mines to crystals
 * - Energy pulses flowing along veins
 * - Voronoi cell boundaries
 * - Crystal clusters
 */
export class MiningCellsRenderer {
  // Static cache for veins and boundaries (only redrawn when mines change)
  private cache: {
    canvas: HTMLCanvasElement | null;
    context: CanvasRenderingContext2D | null;
    mineHash: string;
    veins: VeinCache[];
  } = { canvas: null, context: null, mineHash: "", veins: [] };

  // Throttle cache rebuild checks
  private lastCacheCheck: number = 0;
  private cacheCheckRate: number = 500; // ms

  constructor(private game: GameView) {}

  /**
   * Check if a position is on land owned by a specific player
   */
  private isOwnedByPlayer(x: number, y: number, playerId: string): boolean {
    const tileX = Math.floor(x);
    const tileY = Math.floor(y);
    // Bounds check before calling ref to avoid invalid coordinate errors
    if (
      tileX < 0 ||
      tileY < 0 ||
      tileX >= this.game.width() ||
      tileY >= this.game.height()
    ) {
      return false;
    }
    const tile = this.game.ref(tileX, tileY);
    if (!tile) return false;
    const owner = this.game.owner(tile);
    if (!owner.isPlayer()) return false;
    return owner.id() === playerId;
  }

  /**
   * Assign crystals to their nearest mine's Voronoi cell
   * Only assigns crystals that are on land owned by the mine's owner
   * OPTIMIZED: Uses squared distances instead of Math.hypot()
   */
  assignCrystalsToMines(
    allMines: MineData[],
    crystals: CrystalData[],
    mineRadius: number,
  ) {
    // Clear existing assignments
    for (const mine of allMines) {
      mine.crystalsInCell = [];
    }

    const mineRadiusSq = mineRadius * mineRadius;

    for (const crystal of crystals) {
      let closestMine: MineData | null = null;
      let closestDistSq = Infinity;

      for (const mine of allMines) {
        // Only consider crystals on land owned by the mine's owner
        if (!this.isOwnedByPlayer(crystal.x, crystal.y, mine.playerId)) {
          continue;
        }

        const dx = crystal.x - mine.x;
        const dy = crystal.y - mine.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= mineRadiusSq && distSq < closestDistSq) {
          // Check if closer to this mine than any other owned by same player
          let isClosest = true;
          for (const other of allMines) {
            if (other === mine) continue;
            if (other.playerId !== mine.playerId) continue; // Only compare same owner
            const odx = crystal.x - other.x;
            const ody = crystal.y - other.y;
            const otherDistSq = odx * odx + ody * ody;
            if (otherDistSq < distSq) {
              isClosest = false;
              break;
            }
          }
          if (isClosest) {
            closestMine = mine;
            closestDistSq = distSq;
          }
        }
      }

      if (closestMine) {
        closestMine.crystalsInCell.push({
          x: crystal.x,
          y: crystal.y,
          count: crystal.crystalCount,
        });
      }
    }
  }

  /**
   * Render the full mining cells effect
   */
  render(
    ctx: FrenzyRenderContext,
    allMines: MineData[],
    allCrystals: CrystalData[],
  ) {
    // Skip expensive mining cells effects on low-end mobile devices
    if (shouldSkipExpensiveEffect()) {
      return;
    }

    const halfWidth = ctx.halfWidth;
    const halfHeight = ctx.halfHeight;

    // Throttle cache rebuild checks (hash computation is expensive with many mines/crystals)
    const now = Date.now();
    if (now - this.lastCacheCheck > this.cacheCheckRate || !this.cache.canvas) {
      this.lastCacheCheck = now;

      // Create a simple hash using counts and sample positions (faster than full string concat)
      // Only rebuild when mines change position/count - crystals don't affect static cache
      let mineHash = `${allMines.length}`;
      for (let i = 0; i < allMines.length; i++) {
        const m = allMines[i];
        mineHash += `,${m.x | 0},${m.y | 0}`;
      }

      // Rebuild cache if needed
      if (this.cache.mineHash !== mineHash || !this.cache.canvas) {
        this.rebuildCache(allMines, allCrystals, halfWidth, halfHeight);
        this.cache.mineHash = mineHash;
      }
    }

    // Draw cached static elements
    if (this.cache.canvas) {
      ctx.context.drawImage(this.cache.canvas, -halfWidth, -halfHeight);
    }

    // Draw animated pulses (skip on mobile for performance)
    if (!isMobileDevice()) {
      this.drawAnimatedPulses(ctx.context, ctx.time);
    }
  }

  /**
   * Render a crystal cluster
   */
  renderCrystal(ctx: FrenzyRenderContext, crystal: CrystalData) {
    const x = crystal.x - ctx.halfWidth;
    const y = crystal.y - ctx.halfHeight;
    const rotations = crystal.rotations ?? [];
    const baseSize = 3 + crystal.crystalCount * 1.5;

    const positions = this.getCrystalClusterPositions(
      crystal.crystalCount,
      baseSize,
    );

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const rotation = rotations[i] ?? 0;
      this.renderSingleCrystal(ctx, x + pos.x, y + pos.y, pos.size, rotation);
    }
  }

  private rebuildCache(
    allMines: MineData[],
    allCrystals: CrystalData[],
    halfWidth: number,
    halfHeight: number,
  ) {
    const mineRadius = 40;
    const mineRadius2 = mineRadius * 2;
    const mineRadius2Sq = mineRadius2 * mineRadius2;

    // Create or resize canvas
    if (!this.cache.canvas) {
      this.cache.canvas = document.createElement("canvas");
      this.cache.canvas.width = this.game.width();
      this.cache.canvas.height = this.game.height();
      const ctx = this.cache.canvas.getContext("2d");
      if (!ctx) return;
      this.cache.context = ctx;
    }

    const ctx = this.cache.context;
    if (!ctx) return;

    ctx.clearRect(0, 0, this.cache.canvas.width, this.cache.canvas.height);
    ctx.save();
    ctx.translate(halfWidth, halfHeight);

    // Clear vein cache
    this.cache.veins = [];

    // Draw Voronoi boundaries (only between mines owned by same player and on their land)
    const drawnBisections = new Set<string>();
    ctx.strokeStyle = `rgba(100, 180, 255, 0.15)`;
    ctx.lineWidth = 1;

    for (let i = 0; i < allMines.length; i++) {
      const mine = allMines[i];
      for (let j = i + 1; j < allMines.length; j++) {
        const other = allMines[j];

        // Only draw bisection between mines owned by same player
        if (mine.playerId !== other.playerId) continue;

        const dx = other.x - mine.x;
        const dy = other.y - mine.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < mineRadius2Sq) {
          const pairKey = `${i}_${j}`;
          if (!drawnBisections.has(pairKey)) {
            drawnBisections.add(pairKey);

            const worldMidX = (mine.x + other.x) / 2;
            const worldMidY = (mine.y + other.y) / 2;

            // Only draw if midpoint is on owned land
            if (!this.isOwnedByPlayer(worldMidX, worldMidY, mine.playerId)) {
              continue;
            }

            // Use player's territory color
            if (mine.territoryColor) {
              const colorMatch = mine.territoryColor.match(
                /rgb\((\d+),\s*(\d+),\s*(\d+)\)/,
              );
              if (colorMatch) {
                ctx.strokeStyle = `rgba(${colorMatch[1]}, ${colorMatch[2]}, ${colorMatch[3]}, 0.25)`;
              }
            }

            const midX = worldMidX - halfWidth;
            const midY = worldMidY - halfHeight;
            const dist = Math.sqrt(distSq);
            const perpLen = dist; // perpLen of (-dy, dx) equals sqrt(dx*dx + dy*dy) = dist
            if (perpLen === 0) continue;

            const normPerpX = -dy / perpLen;
            const normPerpY = dx / perpLen;
            const lineLen = Math.min(mineRadius, dist / 2 + 5);

            ctx.beginPath();
            ctx.moveTo(midX - normPerpX * lineLen, midY - normPerpY * lineLen);
            ctx.lineTo(midX + normPerpX * lineLen, midY + normPerpY * lineLen);
            ctx.stroke();
          }
        }
      }
    }

    // Draw veins and cache geometry
    for (const mine of allMines) {
      const mx = mine.x - halfWidth;
      const my = mine.y - halfHeight;

      // Veins to crystals
      for (const crystal of mine.crystalsInCell) {
        const cx = crystal.x - halfWidth;
        const cy = crystal.y - halfHeight;
        this.drawStaticVein(ctx, mx, my, cx, cy, 1.5, 0.6, true, crystal.count);
      }

      // Area veins
      const areaVeinCount = 8;
      const angleStep = (Math.PI * 2) / areaVeinCount;

      for (let i = 0; i < areaVeinCount; i++) {
        const baseAngle = i * angleStep + mine.x * 0.1;
        const veinLength =
          mineRadius * (0.5 + 0.3 * Math.sin(baseAngle * 3 + mine.y * 0.05));
        const worldVx = mine.x + Math.cos(baseAngle) * veinLength;
        const worldVy = mine.y + Math.sin(baseAngle) * veinLength;
        const vx = worldVx - halfWidth;
        const vy = worldVy - halfHeight;

        // Check if vein endpoint is on owned land
        if (!this.isOwnedByPlayer(worldVx, worldVy, mine.playerId)) {
          continue;
        }

        // Simple Voronoi check using squared distances
        let inCell = true;
        const dxToThis = vx - mx;
        const dyToThis = vy - my;
        const distSqToThis = dxToThis * dxToThis + dyToThis * dyToThis;

        for (const other of allMines) {
          if (other === mine) continue;
          const dxToOther = worldVx - other.x;
          const dyToOther = worldVy - other.y;
          const distSqToOther = dxToOther * dxToOther + dyToOther * dyToOther;
          if (distSqToOther < distSqToThis) {
            inCell = false;
            break;
          }
        }
        if (!inCell) continue;

        this.drawStaticVein(ctx, mx, my, vx, vy, 0.8, 0.25, false, 1);
      }

      // Cell boundary
      this.drawSimpleCellBoundary(ctx, mine, allMines, halfWidth, halfHeight);
    }

    ctx.restore();
  }

  private drawStaticVein(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    lineWidth: number,
    alpha: number,
    isCrystal: boolean,
    crystalCount: number,
  ) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq < 4) return; // 2^2 = 4

    const length = Math.sqrt(lengthSq);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const invLength = 1 / length;
    const perpX = -dy * invLength;
    const perpY = dx * invLength;
    const waveAmp = length * 0.03 * Math.sin(x1 * 0.1 + y1 * 0.1);
    const ctrlX = midX + perpX * waveAmp;
    const ctrlY = midY + perpY * waveAmp;

    ctx.strokeStyle = `rgba(80, 160, 220, ${alpha * 0.4})`;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(ctrlX, ctrlY, x2, y2);
    ctx.stroke();

    this.cache.veins.push({
      x1,
      y1,
      x2,
      y2,
      ctrlX,
      ctrlY,
      isCrystal,
      crystalCount,
      alpha,
    });
  }

  private drawSimpleCellBoundary(
    ctx: CanvasRenderingContext2D,
    mine: MineData,
    allMines: MineData[],
    halfWidth: number,
    halfHeight: number,
  ) {
    const mineRadius = 40;

    // Use player's territory color if available, otherwise default blue
    if (mine.territoryColor) {
      // Parse the rgb color and add alpha
      const colorMatch = mine.territoryColor.match(
        /rgb\((\d+),\s*(\d+),\s*(\d+)\)/,
      );
      if (colorMatch) {
        ctx.strokeStyle = `rgba(${colorMatch[1]}, ${colorMatch[2]}, ${colorMatch[3]}, 0.4)`;
      } else {
        ctx.strokeStyle = mine.territoryColor;
      }
    } else {
      ctx.strokeStyle = `rgba(80, 160, 220, 0.4)`;
    }
    ctx.lineWidth = 1.2;

    // Pre-compute nearby mine data (squared distances, angles) once
    const mineRadius2 = mineRadius * 2;
    const mineRadius2Sq = mineRadius2 * mineRadius2;
    const nearbyMines: Array<{
      distSq: number;
      dist: number;
      midDist: number;
      angleToMid: number;
    }> = [];

    for (const other of allMines) {
      if (other === mine) continue;
      const dx = other.x - mine.x;
      const dy = other.y - mine.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < mineRadius2Sq) {
        const dist = Math.sqrt(distSq);
        nearbyMines.push({
          distSq,
          dist,
          midDist: dist / 2,
          angleToMid: Math.atan2(dy, dx),
        });
      }
    }

    // Sample points around cell boundary
    const sampleCount = 24;
    let lastPoint: { x: number; y: number; owned: boolean } | null = null;

    for (let i = 0; i <= sampleCount; i++) {
      const angle = (i / sampleCount) * Math.PI * 2;
      let radius = mineRadius;

      // Use pre-computed nearby mine data
      for (const nearby of nearbyMines) {
        const angleDiff = Math.abs(
          ((angle - nearby.angleToMid + Math.PI * 3) % (Math.PI * 2)) - Math.PI,
        );
        if (angleDiff < Math.PI / 2) {
          const clipDist = nearby.midDist / Math.cos(angleDiff);
          if (clipDist > 0 && clipDist < radius) {
            radius = clipDist;
          }
        }
      }

      // Calculate world position (add back halfWidth/halfHeight for ownership check)
      const worldX = mine.x + Math.cos(angle) * radius;
      const worldY = mine.y + Math.sin(angle) * radius;
      const px = worldX - halfWidth;
      const py = worldY - halfHeight;

      // Check if this point is on owned land
      const isOwned = this.isOwnedByPlayer(worldX, worldY, mine.playerId);

      // Only draw segment if both points are on owned land
      if (lastPoint && lastPoint.owned && isOwned) {
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(px, py);
        ctx.stroke();
      }

      lastPoint = { x: px, y: py, owned: isOwned };
    }
  }

  private drawAnimatedPulses(context: CanvasRenderingContext2D, time: number) {
    if (this.cache.veins.length === 0) return;

    for (const vein of this.cache.veins) {
      const pulseCount = vein.isCrystal
        ? Math.min(3, 2 + vein.crystalCount)
        : 1;
      const pulseSpeed = vein.isCrystal ? 0.8 : 0.4;

      for (let p = 0; p < pulseCount; p++) {
        const pulseT = (time * pulseSpeed + p / pulseCount) % 1;
        const t = pulseT;

        const px =
          (1 - t) * (1 - t) * vein.x2 +
          2 * (1 - t) * t * vein.ctrlX +
          t * t * vein.x1;
        const py =
          (1 - t) * (1 - t) * vein.y2 +
          2 * (1 - t) * t * vein.ctrlY +
          t * t * vein.y1;

        const pulseSizeBase = vein.isCrystal ? 2.5 : 1.5;
        const pulseSize =
          pulseSizeBase * (0.6 + 0.4 * Math.sin(pulseT * Math.PI));
        const pulseAlpha =
          vein.alpha * (0.5 + 0.5 * Math.sin(pulseT * Math.PI));

        context.fillStyle = `rgba(150, 220, 255, ${pulseAlpha})`;
        context.beginPath();
        context.arc(px, py, pulseSize, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  private getCrystalClusterPositions(
    count: number,
    baseSize: number,
  ): Array<{ x: number; y: number; size: number }> {
    const positions: Array<{ x: number; y: number; size: number }> = [];
    const angles = [0, 72, 144, 216, 288];
    const radius = baseSize * 0.4;

    for (let i = 0; i < count; i++) {
      if (i === 0) {
        positions.push({ x: 0, y: 0, size: baseSize * 0.6 });
      } else {
        const angle = (angles[(i - 1) % 5] * Math.PI) / 180;
        positions.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          size: baseSize * 0.4,
        });
      }
    }

    return positions;
  }

  private renderSingleCrystal(
    ctx: FrenzyRenderContext,
    x: number,
    y: number,
    size: number,
    rotation: number,
  ) {
    const context = ctx.context;
    const time = ctx.time;
    const halfWidth = size / 2;
    const height = size * 1.8;
    const bottomY = y + height * 0.3;

    context.save();
    context.translate(x, bottomY);
    context.rotate(rotation);
    context.translate(-x, -bottomY);

    // Outer glow (skip on mobile for performance)
    if (!isMobileDevice()) {
      const glowIntensity = 0.4 + Math.sin(time * 2.5) * 0.2;
      const radiationPulse = 1 + Math.sin(time * 3) * 0.15;
      const glowGradient = context.createRadialGradient(
        x,
        y - height * 0.2,
        0,
        x,
        y - height * 0.2,
        size * 1.5 * radiationPulse,
      );
      glowGradient.addColorStop(0, `rgba(120, 200, 255, ${glowIntensity})`);
      glowGradient.addColorStop(
        0.5,
        `rgba(80, 160, 220, ${glowIntensity * 0.5})`,
      );
      glowGradient.addColorStop(1, "rgba(40, 120, 200, 0)");
      context.fillStyle = glowGradient;
      context.beginPath();
      context.arc(
        x,
        y - height * 0.2,
        size * 1.5 * radiationPulse,
        0,
        Math.PI * 2,
      );
      context.fill();
    }

    // Crystal body
    context.fillStyle = "rgba(60, 140, 200, 0.9)";
    context.beginPath();
    context.moveTo(x, y - height * 0.7);
    context.lineTo(x + halfWidth, y - height * 0.2);
    context.lineTo(x + halfWidth, y + height * 0.3);
    context.lineTo(x - halfWidth, y + height * 0.3);
    context.lineTo(x - halfWidth, y - height * 0.2);
    context.closePath();
    context.fill();

    // Highlight
    context.fillStyle = "rgba(150, 210, 255, 0.8)";
    context.beginPath();
    context.moveTo(x, y - height * 0.6);
    context.lineTo(x + halfWidth * 0.4, y - height * 0.25);
    context.lineTo(x - halfWidth * 0.4, y - height * 0.25);
    context.closePath();
    context.fill();

    // Border
    context.strokeStyle = "rgba(20, 60, 100, 0.8)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y - height * 0.7);
    context.lineTo(x + halfWidth, y - height * 0.2);
    context.lineTo(x + halfWidth, y + height * 0.3);
    context.lineTo(x - halfWidth, y + height * 0.3);
    context.lineTo(x - halfWidth, y - height * 0.2);
    context.closePath();
    context.stroke();

    context.restore();
  }
}
