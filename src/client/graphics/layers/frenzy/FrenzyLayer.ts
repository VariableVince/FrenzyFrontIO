import { GameFork, GameMapType } from "../../../../core/game/Game";
import { GameView } from "../../../../core/game/GameView";
import { FrameProfiler } from "../../FrameProfiler";
import { TransformHandler } from "../../TransformHandler";
import { Layer } from "../Layer";
import { EffectsRenderer } from "./EffectsRenderer";
import { FrenzyRenderContext, isInViewport } from "./FrenzyRenderContext";
import {
  CrystalData,
  MineData,
  MiningCellsRenderer,
} from "./MiningCellsRenderer";
import { ProjectileRenderer } from "./ProjectileRenderer";
import { FrenzyStructureType, StructureRenderer } from "./StructureRenderer";
import { UnitRenderer } from "./UnitRenderer";

/**
 * FrenzyLayer: Coordinator for all Frenzy mode rendering.
 *
 * This layer delegates rendering to specialized sub-renderers:
 * - StructureRenderer: HQ, mines, factories, defense posts, etc.
 * - UnitRenderer: Soldiers, warships, artillery, etc.
 * - MiningCellsRenderer: Veins, crystals, energy pulses
 * - ProjectileRenderer: Plasma, beams, artillery shells
 * - EffectsRenderer: Gold popups, explosions
 */
export class FrenzyLayer implements Layer {
  private lastFrameTime: number = 0;
  private lastCrystalAssignmentTime: number = 0;
  private cachedMines: MineData[] = [];
  private crystalAssignmentRate: number = 500; // ms

  // Sub-renderers
  private structureRenderer: StructureRenderer;
  private unitRenderer: UnitRenderer;
  private miningCellsRenderer: MiningCellsRenderer;
  private projectileRenderer: ProjectileRenderer;
  private effectsRenderer: EffectsRenderer;

  constructor(
    private game: GameView,
    private transformHandler: TransformHandler,
  ) {
    this.structureRenderer = new StructureRenderer(game);
    this.unitRenderer = new UnitRenderer(game);
    this.miningCellsRenderer = new MiningCellsRenderer(game);
    this.projectileRenderer = new ProjectileRenderer();
    this.effectsRenderer = new EffectsRenderer();
  }

  shouldTransform(): boolean {
    return true;
  }

  init() {
    console.log("[FrenzyLayer] Initialized");
    this.lastFrameTime = performance.now();
  }

  tick() {
    // No per-tick updates needed
  }

  renderLayer(context: CanvasRenderingContext2D) {
    // Check if we're in Frenzy mode
    if (this.game.config().gameConfig().gameFork !== GameFork.Frenzy) {
      return;
    }

    const frenzyState = this.game.frenzyManager();
    if (!frenzyState) {
      return;
    }

    // Calculate delta time
    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;
    this.lastFrameTime = now;

    // Build render context
    const [topLeft, bottomRight] = this.transformHandler.screenBoundingRect();
    const margin = 50;

    const ctx: FrenzyRenderContext = {
      game: this.game,
      context,
      transformHandler: this.transformHandler,
      time: now / 1000,
      deltaTime,
      halfWidth: this.game.width() / 2,
      halfHeight: this.game.height() / 2,
      viewportBounds: {
        minX: topLeft.x - margin,
        maxX: bottomRight.x + margin,
        minY: topLeft.y - margin,
        maxY: bottomRight.y + margin,
      },
    };

    // Process effects (gold payouts, artillery impacts)
    this.effectsRenderer.processGoldPayouts(
      frenzyState.pendingGoldPayouts ?? [],
    );
    this.effectsRenderer.processArtilleryProjectiles(
      frenzyState.projectiles ?? [],
    );

    // Gather structures
    const gatherStart = FrameProfiler.start();
    const structures = this.structureRenderer.gatherAllStructures(frenzyState);
    FrameProfiler.end("FrenzyLayer:gatherStructures", gatherStart);

    // Build mine data for mining cells
    const mineStart = FrameProfiler.start();
    const allMines: MineData[] = structures
      .filter((s) => s.type === FrenzyStructureType.Mine)
      .map((s) => {
        // Get player's territory color
        let territoryColor: string | undefined;
        if (this.game.hasPlayer(s.playerId)) {
          const player = this.game.player(s.playerId);
          territoryColor = player.territoryColor().toRgbString();
        }
        return {
          x: s.x,
          y: s.y,
          playerId: s.playerId,
          tier: s.tier,
          crystalsInCell: [],
          territoryColor,
        };
      });

    const crystals: CrystalData[] = (frenzyState.crystals ?? []).map(
      (c: any) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        crystalCount: c.crystalCount,
        rotations: c.rotations,
      }),
    );

    // Assign crystals to mines (throttled to reduce ownership checks)
    const mineRadius = 40;
    const assignNow = Date.now();
    if (
      assignNow - this.lastCrystalAssignmentTime >
      this.crystalAssignmentRate
    ) {
      this.lastCrystalAssignmentTime = assignNow;
      this.miningCellsRenderer.assignCrystalsToMines(
        allMines,
        crystals,
        mineRadius,
      );
      this.cachedMines = allMines;
    } else {
      // Use cached assignment by matching mines by position (not array index)
      // Create a map of cached mines by position key for fast lookup
      const cachedMineMap = new Map<string, MineData>();
      for (const cachedMine of this.cachedMines) {
        const key = `${cachedMine.x},${cachedMine.y}`;
        cachedMineMap.set(key, cachedMine);
      }

      for (const mine of allMines) {
        const key = `${mine.x},${mine.y}`;
        const cachedMine = cachedMineMap.get(key);
        if (cachedMine) {
          mine.crystalsInCell = cachedMine.crystalsInCell;
        }
      }
    }
    FrameProfiler.end("FrenzyLayer:crystalAssignment", mineStart);

    // Render spawn exclusion zone if in spawn phase and on SquareMap
    if (this.game.inSpawnPhase()) {
      this.renderSpawnExclusionZone(ctx);
    }

    // Render mining cells effect
    const protoStart = FrameProfiler.start();
    this.miningCellsRenderer.render(ctx, allMines, crystals);
    FrameProfiler.end("FrenzyLayer:miningCells", protoStart);

    // Render crystals
    const crystalStart = FrameProfiler.start();
    for (const crystal of crystals) {
      if (isInViewport(crystal.x, crystal.y, ctx.viewportBounds)) {
        this.miningCellsRenderer.renderCrystal(ctx, crystal);
      }
    }
    FrameProfiler.end("FrenzyLayer:crystals", crystalStart);

    // Render structures
    const structStart = FrameProfiler.start();
    for (const structure of structures) {
      if (isInViewport(structure.x, structure.y, ctx.viewportBounds)) {
        this.structureRenderer.render(ctx, structure);
      }
    }
    FrameProfiler.end("FrenzyLayer:structures", structStart);

    // Render units
    const unitStart = FrameProfiler.start();
    for (const unit of frenzyState.units) {
      if (isInViewport(unit.x, unit.y, ctx.viewportBounds)) {
        this.unitRenderer.render(ctx, unit);
      }
    }
    FrameProfiler.end("FrenzyLayer:units", unitStart);

    // Render attack order lines for units with active attack orders
    this.renderAttackOrderLines(ctx, frenzyState.units);

    // Render projectiles
    const projStart = FrameProfiler.start();
    const projectileSize = Math.max(0.5, frenzyState.projectileSize ?? 2);
    for (const projectile of frenzyState.projectiles) {
      if (isInViewport(projectile.x, projectile.y, ctx.viewportBounds)) {
        this.projectileRenderer.render(ctx, projectile, projectileSize);
      }
    }
    FrameProfiler.end("FrenzyLayer:projectiles", projStart);

    // Render effects
    this.effectsRenderer.renderExplosions(ctx, deltaTime);
    this.effectsRenderer.renderGoldEffects(ctx, deltaTime);
  }

  /**
   * Render red stripes overlay for spawn exclusion zone during spawn phase.
   * Only renders for SquareMap where the center area is excluded from spawning.
   */
  private renderSpawnExclusionZone(ctx: FrenzyRenderContext) {
    const mapType = this.game.config().gameConfig().gameMap;
    if (mapType !== GameMapType.SquareMap) {
      return;
    }

    const width = this.game.width();
    const height = this.game.height();
    const centerX = width / 2;
    const centerY = height / 2;

    // Exclusion zone is 50% of map size (0.25 on each side from center)
    const exclusionHalfSize = Math.min(width, height) * 0.25;

    // Convert to rendering coordinates (centered at 0,0)
    const left = centerX - exclusionHalfSize - ctx.halfWidth;
    const right = centerX + exclusionHalfSize - ctx.halfWidth;
    const top = centerY - exclusionHalfSize - ctx.halfHeight;
    const bottom = centerY + exclusionHalfSize - ctx.halfHeight;
    const zoneWidth = right - left;
    const zoneHeight = bottom - top;

    ctx.context.save();

    // Create clipping region for the exclusion zone
    ctx.context.beginPath();
    ctx.context.rect(left, top, zoneWidth, zoneHeight);
    ctx.context.clip();

    // Draw red diagonal stripes pattern
    const stripeWidth = 8;
    const stripeGap = 16;
    const stripeColor = "rgba(255, 60, 60, 0.3)";

    ctx.context.strokeStyle = stripeColor;
    ctx.context.lineWidth = stripeWidth;

    // Animate stripes by offsetting based on time
    const animationOffset = (ctx.time * 20) % (stripeWidth + stripeGap);

    // Draw diagonal stripes across the zone
    const diagonal = Math.sqrt(zoneWidth * zoneWidth + zoneHeight * zoneHeight);
    const numStripes = Math.ceil(diagonal / (stripeWidth + stripeGap)) + 2;

    for (let i = -numStripes; i < numStripes; i++) {
      const offset =
        i * (stripeWidth + stripeGap) + animationOffset - diagonal / 2;
      ctx.context.beginPath();
      ctx.context.moveTo(left + offset, top);
      ctx.context.lineTo(left + offset + diagonal, top + diagonal);
      ctx.context.stroke();
    }

    // Draw border around the exclusion zone
    ctx.context.restore();
    ctx.context.save();

    ctx.context.strokeStyle = "rgba(255, 60, 60, 0.6)";
    ctx.context.lineWidth = 2;
    ctx.context.setLineDash([10, 5]);
    ctx.context.strokeRect(left, top, zoneWidth, zoneHeight);

    ctx.context.restore();
  }

  /**
   * Render red dashed lines from units to their attack order targets
   * Only renders lines for units owned by the current player
   */
  private renderAttackOrderLines(
    ctx: FrenzyRenderContext,
    units: Array<{
      x: number;
      y: number;
      playerId: string;
      hasAttackOrder?: boolean;
      attackOrderX?: number;
      attackOrderY?: number;
      isBoardingTransporter?: boolean;
      boardingTargetX?: number;
      boardingTargetY?: number;
      unitType?: string;
      isFlying?: boolean;
      isWaitingForBoarding?: boolean;
      targetX?: number;
      targetY?: number;
    }>,
  ) {
    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return;
    const myPlayerId = myPlayer.id();

    ctx.context.save();

    // First pass: Render blue lines for boarding units and transporters
    ctx.context.strokeStyle = "rgba(80, 120, 255, 0.4)";
    ctx.context.lineWidth = 0.5;
    ctx.context.setLineDash([4, 3]);

    for (const unit of units) {
      if (unit.playerId !== myPlayerId) continue;

      // Render blue line for units boarding a transporter
      if (
        unit.isBoardingTransporter &&
        unit.boardingTargetX !== undefined &&
        unit.boardingTargetY !== undefined
      ) {
        const unitX = unit.x - ctx.halfWidth;
        const unitY = unit.y - ctx.halfHeight;
        const targetX = unit.boardingTargetX - ctx.halfWidth;
        const targetY = unit.boardingTargetY - ctx.halfHeight;

        ctx.context.beginPath();
        ctx.context.moveTo(unitX, unitY);
        ctx.context.lineTo(targetX, targetY);
        ctx.context.stroke();
      }

      // Render blue line for flying or waiting transporters to their target
      if (
        unit.unitType === "transporter" &&
        (unit.isFlying || unit.isWaitingForBoarding)
      ) {
        if (unit.targetX !== undefined && unit.targetY !== undefined) {
          const unitX = unit.x - ctx.halfWidth;
          const unitY = unit.y - ctx.halfHeight;
          const targetX = unit.targetX - ctx.halfWidth;
          const targetY = unit.targetY - ctx.halfHeight;

          ctx.context.beginPath();
          ctx.context.moveTo(unitX, unitY);
          ctx.context.lineTo(targetX, targetY);
          ctx.context.stroke();
        }
      }
    }

    // Second pass: Render red lines for attack orders
    ctx.context.strokeStyle = "rgba(255, 80, 80, 0.25)";

    for (const unit of units) {
      if (unit.playerId !== myPlayerId) continue;
      if (!unit.hasAttackOrder) continue;
      if (unit.attackOrderX === undefined || unit.attackOrderY === undefined)
        continue;

      const unitX = unit.x - ctx.halfWidth;
      const unitY = unit.y - ctx.halfHeight;
      const targetX = unit.attackOrderX - ctx.halfWidth;
      const targetY = unit.attackOrderY - ctx.halfHeight;

      ctx.context.beginPath();
      ctx.context.moveTo(unitX, unitY);
      ctx.context.lineTo(targetX, targetY);
      ctx.context.stroke();
    }

    ctx.context.setLineDash([]);
    ctx.context.restore();
  }
}
