import { GameFork } from "../../../../core/game/Game";
import { GameView } from "../../../../core/game/GameView";
import { FrameProfiler } from "../../FrameProfiler";
import { TransformHandler } from "../../TransformHandler";
import { Layer } from "../Layer";
import { EffectsRenderer } from "./EffectsRenderer";
import { FrenzyRenderContext, isInViewport } from "./FrenzyRenderContext";
import {
  CrystalData,
  MineData,
  ProtomoleculeRenderer,
} from "./ProtomoleculeRenderer";
import { ProjectileRenderer } from "./ProjectileRenderer";
import { FrenzyStructureType, StructureRenderer } from "./StructureRenderer";
import { UnitRenderer } from "./UnitRenderer";

/**
 * FrenzyLayer: Coordinator for all Frenzy mode rendering.
 *
 * This layer delegates rendering to specialized sub-renderers:
 * - StructureRenderer: HQ, mines, factories, defense posts, etc.
 * - UnitRenderer: Soldiers, warships, artillery, etc.
 * - ProtomoleculeRenderer: Veins, crystals, energy pulses
 * - ProjectileRenderer: Plasma, beams, artillery shells
 * - EffectsRenderer: Gold popups, explosions
 */
export class FrenzyLayer implements Layer {
  private lastFrameTime: number = 0;

  // Sub-renderers
  private structureRenderer: StructureRenderer;
  private unitRenderer: UnitRenderer;
  private protomoleculeRenderer: ProtomoleculeRenderer;
  private projectileRenderer: ProjectileRenderer;
  private effectsRenderer: EffectsRenderer;

  constructor(
    private game: GameView,
    private transformHandler: TransformHandler,
  ) {
    this.structureRenderer = new StructureRenderer(game);
    this.unitRenderer = new UnitRenderer(game);
    this.protomoleculeRenderer = new ProtomoleculeRenderer(game);
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
    this.effectsRenderer.processGoldPayouts(frenzyState.pendingGoldPayouts ?? []);
    this.effectsRenderer.processArtilleryProjectiles(frenzyState.projectiles ?? []);

    // Gather structures
    const gatherStart = FrameProfiler.start();
    const structures = this.structureRenderer.gatherAllStructures(frenzyState);
    FrameProfiler.end("FrenzyLayer:gatherStructures", gatherStart);

    // Build mine data for protomolecule
    const mineStart = FrameProfiler.start();
    const allMines: MineData[] = structures
      .filter((s) => s.type === FrenzyStructureType.Mine)
      .map((s) => ({
        x: s.x,
        y: s.y,
        playerId: s.playerId,
        tier: s.tier,
        crystalsInCell: [],
      }));

    const crystals: CrystalData[] = (frenzyState.crystals ?? []).map((c: any) => ({
      id: c.id,
      x: c.x,
      y: c.y,
      crystalCount: c.crystalCount,
      rotations: c.rotations,
    }));

    // Assign crystals to mines
    const mineRadius = 40;
    this.protomoleculeRenderer.assignCrystalsToMines(allMines, crystals, mineRadius);
    FrameProfiler.end("FrenzyLayer:crystalAssignment", mineStart);

    // Render protomolecule effect
    const protoStart = FrameProfiler.start();
    this.protomoleculeRenderer.render(ctx, allMines, crystals);
    FrameProfiler.end("FrenzyLayer:protomolecule", protoStart);

    // Render crystals
    const crystalStart = FrameProfiler.start();
    for (const crystal of crystals) {
      if (isInViewport(crystal.x, crystal.y, ctx.viewportBounds)) {
        this.protomoleculeRenderer.renderCrystal(ctx, crystal);
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
    }>,
  ) {
    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return;
    const myPlayerId = myPlayer.id();

    ctx.context.save();
    ctx.context.strokeStyle = "rgba(255, 80, 80, 0.25)";
    ctx.context.lineWidth = 0.5;
    ctx.context.setLineDash([4, 3]);

    for (const unit of units) {
      if (unit.playerId !== myPlayerId) continue;
      if (!unit.hasAttackOrder) continue;
      if (unit.attackOrderX === undefined || unit.attackOrderY === undefined) continue;

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
