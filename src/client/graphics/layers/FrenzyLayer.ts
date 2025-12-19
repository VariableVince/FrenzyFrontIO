import { GameFork, UnitType } from "../../../core/game/Game";
import { GameView, PlayerView, UnitView } from "../../../core/game/GameView";
import { TransformHandler } from "../TransformHandler";
import { Layer } from "./Layer";

/**
 * Floating gold text effect for mine income
 */
interface GoldTextFx {
  x: number;
  y: number;
  gold: number;
  lifeTime: number;
  duration: number;
}

/**
 * Gold flow particle - flows from territory/crystals to mines
 */
interface GoldFlowParticle {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  progress: number; // 0-1
  duration: number; // ms
  size: number;
  isCrystal: boolean; // Purple if from crystal, gold if from land
}

/**
 * Unified structure type for Frenzy mode rendering
 */
enum FrenzyStructureType {
  HQ = "hq",
  Mine = "mine",
  Factory = "factory",
  DefensePost = "defensePost",
  Port = "port",
  MissileSilo = "missileSilo",
  SAMLauncher = "samLauncher",
  Construction = "construction",
}

/**
 * Unified structure interface for consistent rendering
 */
interface FrenzyStructure {
  type: FrenzyStructureType;
  x: number;
  y: number;
  playerId: string;
  tier: number;
  health: number;
  maxHealth: number;
  unit?: UnitView; // Reference to actual game unit for non-HQ structures
  constructionType?: FrenzyStructureType; // The type being constructed
  constructionProgress?: number; // 0-1 progress
}

/**
 * Frenzy Layer: Renders units and core buildings for Frenzy mode
 */
export class FrenzyLayer implements Layer {
  private goldTextEffects: GoldTextFx[] = [];
  private goldFlowParticles: GoldFlowParticle[] = [];
  private lastPayoutIds = new Set<string>();
  private lastFrameTime: number = 0;

  constructor(
    private game: GameView,
    private transformHandler: TransformHandler,
  ) {}

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
    // Check if we're in Frenzy fork
    if (this.game.config().gameConfig().gameFork !== GameFork.Frenzy) {
      return;
    }

    const frenzyState = this.game.frenzyManager();
    if (!frenzyState) {
      return; // No state yet, skip rendering
    }

    // Calculate delta time for animations
    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;
    this.lastFrameTime = now;

    // Process new gold payouts - convert to animated effects
    if (
      frenzyState.pendingGoldPayouts &&
      frenzyState.pendingGoldPayouts.length > 0
    ) {
      const newPayoutIds = new Set<string>();
      for (const payout of frenzyState.pendingGoldPayouts) {
        const payoutId = `${payout.x}_${payout.y}_${payout.gold}`;
        newPayoutIds.add(payoutId);

        // Only add if this is a new payout we haven't seen
        if (!this.lastPayoutIds.has(payoutId)) {
          this.goldTextEffects.push({
            x: payout.x,
            y: payout.y,
            gold: payout.gold,
            lifeTime: 0,
            duration: 1500, // 1.5 seconds
          });

          // Spawn flow particles from nearby crystals and territory
          this.spawnGoldFlowParticles(
            payout.x,
            payout.y,
            payout.gold,
            frenzyState.crystals ?? [],
          );
        }
      }
      this.lastPayoutIds = newPayoutIds;
    } else {
      this.lastPayoutIds.clear();
    }

    // Render and update gold flow particles (below crystals)
    this.updateAndRenderGoldFlowParticles(context, deltaTime);

    // Render crystals first (bottom layer)
    if (frenzyState.crystals) {
      for (const crystal of frenzyState.crystals) {
        this.renderCrystal(context, crystal);
      }
    }

    // Gather all structures into unified list
    const structures = this.gatherAllStructures(frenzyState);

    // Render all structures with unified system
    for (const structure of structures) {
      this.renderStructure(context, structure);
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

    // Update and render gold text effects
    this.updateAndRenderGoldEffects(context, deltaTime);
  }

  /**
   * Gather all structures from frenzy state and game state into unified list
   */
  private gatherAllStructures(frenzyState: any): FrenzyStructure[] {
    const structures: FrenzyStructure[] = [];

    // Add HQs from frenzy state
    for (const building of frenzyState.coreBuildings) {
      structures.push({
        type: FrenzyStructureType.HQ,
        x: building.x,
        y: building.y,
        playerId: building.playerId,
        tier: building.tier ?? 1,
        health: building.health ?? 1000,
        maxHealth: building.maxHealth ?? 1000,
      });
    }

    // Add factories from frenzy state
    if (frenzyState.factories) {
      for (const factory of frenzyState.factories) {
        structures.push({
          type: FrenzyStructureType.Factory,
          x: factory.x,
          y: factory.y,
          playerId: factory.playerId,
          tier: factory.tier ?? 1,
          health: factory.health ?? 400,
          maxHealth: factory.maxHealth ?? 400,
        });
      }
    }

    // Add structures from game units
    for (const player of this.game.players()) {
      for (const unit of player.units()) {
        const tile = unit.tile();
        if (!tile) continue;

        const x = this.game.x(tile);
        const y = this.game.y(tile);
        const unitInfo = this.game.unitInfo(unit.type());
        const maxHealth = unitInfo?.maxHealth ?? 100;
        const health = unit.health();

        let structureType: FrenzyStructureType | null = null;
        switch (unit.type()) {
          case UnitType.City:
            structureType = FrenzyStructureType.Mine;
            break;
          case UnitType.DefensePost:
            structureType = FrenzyStructureType.DefensePost;
            break;
          case UnitType.Port:
            structureType = FrenzyStructureType.Port;
            break;
          case UnitType.MissileSilo:
            structureType = FrenzyStructureType.MissileSilo;
            break;
          case UnitType.SAMLauncher:
            structureType = FrenzyStructureType.SAMLauncher;
            break;
        }

        if (structureType) {
          structures.push({
            type: structureType,
            x,
            y,
            playerId: player.id(),
            tier: unit.level(),
            health,
            maxHealth,
            unit,
          });
        }

        // Handle construction units
        if (unit.type() === UnitType.Construction) {
          const constructionUnitType = unit.constructionType();
          let constrType: FrenzyStructureType | null = null;
          switch (constructionUnitType) {
            case UnitType.City:
              constrType = FrenzyStructureType.Mine;
              break;
            case UnitType.Factory:
              constrType = FrenzyStructureType.Factory;
              break;
            case UnitType.DefensePost:
              constrType = FrenzyStructureType.DefensePost;
              break;
            case UnitType.Port:
              constrType = FrenzyStructureType.Port;
              break;
            case UnitType.MissileSilo:
              constrType = FrenzyStructureType.MissileSilo;
              break;
            case UnitType.SAMLauncher:
              constrType = FrenzyStructureType.SAMLauncher;
              break;
          }
          if (constrType && constructionUnitType) {
            const unitInfo = this.game.unitInfo(constructionUnitType);
            const constDuration = unitInfo?.constructionDuration ?? 100;
            const elapsed = this.game.ticks() - unit.createdAt();
            const progress = Math.min(
              1,
              elapsed / (constDuration === 0 ? 1 : constDuration),
            );
            structures.push({
              type: FrenzyStructureType.Construction,
              x,
              y,
              playerId: player.id(),
              tier: 1,
              health: 1,
              maxHealth: 1,
              unit,
              constructionType: constrType,
              constructionProgress: progress,
            });
          }
        }
      }
    }

    return structures;
  }

  /**
   * Render a structure with unified icon and healthbar system
   */
  private renderStructure(
    context: CanvasRenderingContext2D,
    structure: FrenzyStructure,
  ) {
    const player = this.game.player(structure.playerId);
    if (!player) return;

    const x = structure.x - this.game.width() / 2;
    const y = structure.y - this.game.height() / 2;

    // Render icon based on type
    switch (structure.type) {
      case FrenzyStructureType.HQ:
        this.renderHQIcon(context, x, y, player, structure.tier);
        break;
      case FrenzyStructureType.Mine:
        this.renderMineIcon(context, x, y, player, structure.tier);
        break;
      case FrenzyStructureType.Factory:
        this.renderFactoryIcon(context, x, y, player, structure.tier);
        break;
      case FrenzyStructureType.DefensePost:
        this.renderDefensePostIcon(context, x, y, player, structure.tier);
        break;
      case FrenzyStructureType.Port:
        this.renderPortIcon(context, x, y, player, structure.tier);
        break;
      case FrenzyStructureType.MissileSilo:
        this.renderMissileSiloIcon(context, x, y, player, structure.tier);
        break;
      case FrenzyStructureType.SAMLauncher:
        this.renderSAMLauncherIcon(context, x, y, player, structure.tier);
        break;
      case FrenzyStructureType.Construction:
        this.renderConstructionIcon(
          context,
          x,
          y,
          player,
          structure.constructionType!,
          structure.constructionProgress ?? 0,
        );
        break;
    }

    // Render healthbar if damaged
    if (structure.health < structure.maxHealth && structure.health > 0) {
      this.renderHealthBar(
        context,
        x,
        y,
        structure.health,
        structure.maxHealth,
        this.getStructureSize(structure.type),
      );
    }
  }

  /**
   * Get the base size for a structure type
   */
  private getStructureSize(type: FrenzyStructureType): number {
    switch (type) {
      case FrenzyStructureType.HQ:
        return 14;
      case FrenzyStructureType.Mine:
      case FrenzyStructureType.Factory:
      case FrenzyStructureType.Port:
        return 10;
      case FrenzyStructureType.DefensePost:
      case FrenzyStructureType.MissileSilo:
      case FrenzyStructureType.SAMLauncher:
        return 8;
      default:
        return 8;
    }
  }

  /**
   * Render healthbar below a structure
   */
  private renderHealthBar(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    health: number,
    maxHealth: number,
    structureSize: number,
  ) {
    const barWidth = structureSize + 4;
    const barHeight = 2;
    const barY = y + structureSize / 2 + 3;
    const healthPercent = health / maxHealth;

    // Background (dark)
    context.fillStyle = "rgba(0, 0, 0, 0.7)";
    context.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

    // Health fill (green to red gradient based on health)
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

  /**
   * HQ Icon: Circle with spikes - the most prominent building
   */
  private renderHQIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    tier: number,
  ) {
    const circleRadius = 6;
    const spikeCount = 8;
    const spikeLength = 5;
    const spikeBaseWidth = 2.5;

    // Draw spikes first (behind circle)
    context.fillStyle = player.territoryColor().toRgbString();
    for (let i = 0; i < spikeCount; i++) {
      const angle = (i * 2 * Math.PI) / spikeCount - Math.PI / 2;
      const tipX = x + Math.cos(angle) * (circleRadius + spikeLength);
      const tipY = y + Math.sin(angle) * (circleRadius + spikeLength);
      const leftAngle = angle - Math.PI / 2;
      const rightAngle = angle + Math.PI / 2;
      const baseX1 =
        x +
        Math.cos(angle) * circleRadius +
        Math.cos(leftAngle) * spikeBaseWidth;
      const baseY1 =
        y +
        Math.sin(angle) * circleRadius +
        Math.sin(leftAngle) * spikeBaseWidth;
      const baseX2 =
        x +
        Math.cos(angle) * circleRadius +
        Math.cos(rightAngle) * spikeBaseWidth;
      const baseY2 =
        y +
        Math.sin(angle) * circleRadius +
        Math.sin(rightAngle) * spikeBaseWidth;

      context.beginPath();
      context.moveTo(tipX, tipY);
      context.lineTo(baseX1, baseY1);
      context.lineTo(baseX2, baseY2);
      context.closePath();
      context.fill();

      // Spike border
      context.strokeStyle = "#000";
      context.lineWidth = 1;
      context.stroke();
    }

    // Outer glow (circle)
    context.fillStyle = player.territoryColor().alpha(0.4).toRgbString();
    context.beginPath();
    context.arc(x, y, circleRadius + 2, 0, Math.PI * 2);
    context.fill();

    // Main circle body
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.arc(x, y, circleRadius, 0, Math.PI * 2);
    context.fill();

    // Circle border
    context.strokeStyle = "#000";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, circleRadius, 0, Math.PI * 2);
    context.stroke();

    // Tier indicator
    if (tier >= 1) {
      const tierText = this.getTierRoman(tier);
      context.fillStyle = "#fff";
      context.font = "bold 6px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(tierText, x, y);
    }
  }

  /**
   * Mine Icon: Hexagon (6-sided) - represents resource extraction
   */
  private renderMineIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    level: number,
  ) {
    const size = 8;
    const sides = 6;
    const angleOffset = Math.PI / 6; // Rotate so flat side is on bottom

    // Outer glow
    context.fillStyle = player.territoryColor().alpha(0.4).toRgbString();
    context.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides + angleOffset;
      const px = x + Math.cos(angle) * (size / 2 + 2);
      const py = y + Math.sin(angle) * (size / 2 + 2);
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();

    // Main hexagon body
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides + angleOffset;
      const px = x + Math.cos(angle) * (size / 2);
      const py = y + Math.sin(angle) * (size / 2);
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();

    // Border
    context.strokeStyle = "#000";
    context.lineWidth = 1.5;
    context.stroke();

    // Level indicator
    if (level >= 1) {
      const tierText = this.getTierRoman(level);
      context.fillStyle = "#fff";
      context.font = "bold 5px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(tierText, x, y);
    }
  }

  /**
   * Factory Icon: Square with notched corners (gear-like) - industrial
   */
  private renderFactoryIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    tier: number,
  ) {
    const size = 8;
    const halfSize = size / 2;
    const notch = size * 0.15;

    // Outer glow
    context.fillStyle = player.territoryColor().alpha(0.4).toRgbString();
    context.beginPath();
    context.moveTo(x - halfSize - 2 + notch, y - halfSize - 2);
    context.lineTo(x + halfSize + 2 - notch, y - halfSize - 2);
    context.lineTo(x + halfSize + 2, y - halfSize - 2 + notch);
    context.lineTo(x + halfSize + 2, y + halfSize + 2 - notch);
    context.lineTo(x + halfSize + 2 - notch, y + halfSize + 2);
    context.lineTo(x - halfSize - 2 + notch, y + halfSize + 2);
    context.lineTo(x - halfSize - 2, y + halfSize + 2 - notch);
    context.lineTo(x - halfSize - 2, y - halfSize - 2 + notch);
    context.closePath();
    context.fill();

    // Main body
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.moveTo(x - halfSize + notch, y - halfSize);
    context.lineTo(x + halfSize - notch, y - halfSize);
    context.lineTo(x + halfSize, y - halfSize + notch);
    context.lineTo(x + halfSize, y + halfSize - notch);
    context.lineTo(x + halfSize - notch, y + halfSize);
    context.lineTo(x - halfSize + notch, y + halfSize);
    context.lineTo(x - halfSize, y + halfSize - notch);
    context.lineTo(x - halfSize, y - halfSize + notch);
    context.closePath();
    context.fill();

    // Border
    context.strokeStyle = "#000";
    context.lineWidth = 1.5;
    context.stroke();

    // Tier indicator
    if (tier >= 1) {
      const tierText = this.getTierRoman(tier);
      context.fillStyle = "#fff";
      context.font = "bold 5px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(tierText, x, y);
    }
  }

  /**
   * Defense Post Icon: Shield shape - defensive structure
   */
  private renderDefensePostIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    tier: number,
  ) {
    const size = 6.4;
    const halfSize = size / 2;

    // Outer glow
    context.fillStyle = player.territoryColor().alpha(0.4).toRgbString();
    context.beginPath();
    context.moveTo(x, y - halfSize - 2);
    context.lineTo(x + halfSize + 2, y - halfSize * 0.3);
    context.lineTo(x + halfSize + 2, y + halfSize * 0.5);
    context.quadraticCurveTo(x, y + halfSize + 4, x, y + halfSize + 2);
    context.quadraticCurveTo(
      x,
      y + halfSize + 4,
      x - halfSize - 2,
      y + halfSize * 0.5,
    );
    context.lineTo(x - halfSize - 2, y - halfSize * 0.3);
    context.closePath();
    context.fill();

    // Main shield body
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.moveTo(x, y - halfSize);
    context.lineTo(x + halfSize, y - halfSize * 0.3);
    context.lineTo(x + halfSize, y + halfSize * 0.5);
    context.quadraticCurveTo(x, y + halfSize + 2, x, y + halfSize);
    context.quadraticCurveTo(
      x,
      y + halfSize + 2,
      x - halfSize,
      y + halfSize * 0.5,
    );
    context.lineTo(x - halfSize, y - halfSize * 0.3);
    context.closePath();
    context.fill();

    // Border
    context.strokeStyle = "#000";
    context.lineWidth = 1;
    context.stroke();

    // Tier indicator
    if (tier >= 1) {
      const tierText = this.getTierRoman(tier);
      context.fillStyle = "#fff";
      context.font = "bold 5px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(tierText, x, y - 1);
    }
  }

  /**
   * Port Icon: Anchor shape - naval structure
   */
  private renderPortIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    tier: number,
  ) {
    const size = 8;
    const halfSize = size / 2;

    // Outer glow (circle)
    context.fillStyle = player.territoryColor().alpha(0.4).toRgbString();
    context.beginPath();
    context.arc(x, y, halfSize + 2, 0, Math.PI * 2);
    context.fill();

    // Main circle body
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.arc(x, y, halfSize, 0, Math.PI * 2);
    context.fill();

    // Wave pattern on bottom half
    context.strokeStyle = "rgba(255, 255, 255, 0.5)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x - halfSize * 0.7, y + 1);
    context.quadraticCurveTo(x - halfSize * 0.35, y - 1, x, y + 1);
    context.quadraticCurveTo(
      x + halfSize * 0.35,
      y + 3,
      x + halfSize * 0.7,
      y + 1,
    );
    context.stroke();

    // Border
    context.strokeStyle = "#000";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, halfSize, 0, Math.PI * 2);
    context.stroke();

    // Tier indicator
    if (tier >= 1) {
      const tierText = this.getTierRoman(tier);
      context.fillStyle = "#fff";
      context.font = "bold 5px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(tierText, x, y);
    }
  }

  /**
   * Missile Silo Icon: Diamond with vertical line - offensive structure
   */
  private renderMissileSiloIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    tier: number,
  ) {
    const size = 6.4;
    const halfSize = size / 2;

    // Outer glow
    context.fillStyle = player.territoryColor().alpha(0.4).toRgbString();
    context.beginPath();
    context.moveTo(x, y - halfSize - 2);
    context.lineTo(x + halfSize + 2, y);
    context.lineTo(x, y + halfSize + 2);
    context.lineTo(x - halfSize - 2, y);
    context.closePath();
    context.fill();

    // Main diamond body
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.moveTo(x, y - halfSize);
    context.lineTo(x + halfSize, y);
    context.lineTo(x, y + halfSize);
    context.lineTo(x - halfSize, y);
    context.closePath();
    context.fill();

    // Missile indicator (vertical line)
    context.strokeStyle = "rgba(255, 255, 255, 0.7)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(x, y - halfSize * 0.5);
    context.lineTo(x, y + halfSize * 0.5);
    context.stroke();

    // Border
    context.strokeStyle = "#000";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y - halfSize);
    context.lineTo(x + halfSize, y);
    context.lineTo(x, y + halfSize);
    context.lineTo(x - halfSize, y);
    context.closePath();
    context.stroke();

    // Tier indicator
    if (tier >= 1) {
      const tierText = this.getTierRoman(tier);
      context.fillStyle = "#fff";
      context.font = "bold 4px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(tierText, x, y);
    }
  }

  /**
   * SAM Launcher Icon: Triangle pointing up with circle - anti-air
   */
  private renderSAMLauncherIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    tier: number,
  ) {
    const size = 6.4;
    const halfSize = size / 2;

    // Outer glow
    context.fillStyle = player.territoryColor().alpha(0.4).toRgbString();
    context.beginPath();
    context.moveTo(x, y - halfSize - 2);
    context.lineTo(x + halfSize + 2, y + halfSize + 2);
    context.lineTo(x - halfSize - 2, y + halfSize + 2);
    context.closePath();
    context.fill();

    // Main triangle body
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.moveTo(x, y - halfSize);
    context.lineTo(x + halfSize, y + halfSize);
    context.lineTo(x - halfSize, y + halfSize);
    context.closePath();
    context.fill();

    // Radar circle on top
    context.strokeStyle = "rgba(255, 255, 255, 0.7)";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(x, y - halfSize * 0.3, halfSize * 0.35, 0, Math.PI * 2);
    context.stroke();

    // Border
    context.strokeStyle = "#000";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y - halfSize);
    context.lineTo(x + halfSize, y + halfSize);
    context.lineTo(x - halfSize, y + halfSize);
    context.closePath();
    context.stroke();

    // Tier indicator
    if (tier >= 1) {
      const tierText = this.getTierRoman(tier);
      context.fillStyle = "#fff";
      context.font = "bold 4px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(tierText, x, y + 1);
    }
  }

  /**
   * Construction Icon: Animated building-in-progress using the target structure shape
   */
  private renderConstructionIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    targetType: FrenzyStructureType,
    progress: number,
  ) {
    const time = Date.now() / 1000;
    // Pulsing scale animation (gentle pulse)
    const pulse = 0.9 + 0.1 * Math.sin(time * 4);

    context.save();
    context.translate(x, y);
    context.scale(pulse, pulse);

    // Draw the target structure with gray/transparent overlay
    const grayColor = {
      territoryColor: () => ({
        alpha: (a: number) => ({
          toRgbString: () => `rgba(150, 150, 150, ${a})`,
        }),
        toRgbString: () => "rgb(150, 150, 150)",
      }),
    } as unknown as PlayerView;

    // Render the ghost shape of the target structure
    switch (targetType) {
      case FrenzyStructureType.Mine:
        this.renderMineIcon(context, 0, 0, grayColor, 0);
        break;
      case FrenzyStructureType.Factory:
        this.renderFactoryIcon(context, 0, 0, grayColor, 0);
        break;
      case FrenzyStructureType.DefensePost:
        this.renderDefensePostIcon(context, 0, 0, grayColor, 0);
        break;
      case FrenzyStructureType.Port:
        this.renderPortIcon(context, 0, 0, grayColor, 0);
        break;
      case FrenzyStructureType.MissileSilo:
        this.renderMissileSiloIcon(context, 0, 0, grayColor, 0);
        break;
      case FrenzyStructureType.SAMLauncher:
        this.renderSAMLauncherIcon(context, 0, 0, grayColor, 0);
        break;
    }

    context.restore();

    // Draw progress bar below the structure
    const barWidth = 10;
    const barHeight = 2;
    const barY = y + 8;

    // Background
    context.fillStyle = "rgba(0, 0, 0, 0.5)";
    context.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

    // Progress fill (yellow for construction)
    context.fillStyle = "rgba(255, 200, 0, 0.9)";
    context.fillRect(x - barWidth / 2, barY, barWidth * progress, barHeight);

    // Border
    context.strokeStyle = "#000";
    context.lineWidth = 0.5;
    context.strokeRect(x - barWidth / 2, barY, barWidth, barHeight);
  }

  /**
   * Spawn gold flow particles from nearby crystals and territory towards a mine
   * Computationally cheap - just creates a few particles per payout
   */
  private spawnGoldFlowParticles(
    mineX: number,
    mineY: number,
    gold: number,
    crystals: Array<{ x: number; y: number; crystalCount: number }>,
  ) {
    const maxParticles = 12; // Cap total particles per payout for performance
    let particleCount = 0;

    // Spawn particles from nearby crystals (purple glow)
    for (const crystal of crystals) {
      if (particleCount >= maxParticles) break;

      const dist = Math.hypot(crystal.x - mineX, crystal.y - mineY);
      if (dist < 150) {
        // Close enough to contribute
        // Spawn 1-2 particles per crystal based on crystal count
        const count = Math.min(2, crystal.crystalCount);
        for (let i = 0; i < count && particleCount < maxParticles; i++) {
          // Add slight randomness to start position
          const offsetX = (Math.random() - 0.5) * 10;
          const offsetY = (Math.random() - 0.5) * 10;

          this.goldFlowParticles.push({
            x: crystal.x + offsetX,
            y: crystal.y + offsetY,
            targetX: mineX,
            targetY: mineY,
            progress: 0,
            duration: 800 + Math.random() * 400, // 0.8-1.2 seconds
            size: 2 + Math.random() * 1.5,
            isCrystal: true,
          });
          particleCount++;
        }
      }
    }

    // Spawn particles from territory (gold color) - random positions around mine
    const territoryParticles = Math.min(maxParticles - particleCount, 6);
    for (let i = 0; i < territoryParticles; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 60; // 30-90 pixels away

      this.goldFlowParticles.push({
        x: mineX + Math.cos(angle) * dist,
        y: mineY + Math.sin(angle) * dist,
        targetX: mineX,
        targetY: mineY,
        progress: 0,
        duration: 600 + Math.random() * 300, // 0.6-0.9 seconds
        size: 1.5 + Math.random() * 1,
        isCrystal: false,
      });
    }
  }

  /**
   * Update and render gold flow particles
   */
  private updateAndRenderGoldFlowParticles(
    context: CanvasRenderingContext2D,
    deltaTime: number,
  ) {
    const halfWidth = this.game.width() / 2;
    const halfHeight = this.game.height() / 2;

    // Update and filter completed particles
    this.goldFlowParticles = this.goldFlowParticles.filter((particle) => {
      // Update progress
      particle.progress += deltaTime / particle.duration;
      if (particle.progress >= 1) {
        return false; // Remove completed
      }

      // Ease-in curve for acceleration toward mine
      const t = particle.progress;
      const easeT = t * t * (3 - 2 * t); // Smooth step

      // Interpolate position
      const x =
        particle.x + (particle.targetX - particle.x) * easeT - halfWidth;
      const y =
        particle.y + (particle.targetY - particle.y) * easeT - halfHeight;

      // Fade in at start, fade out at end
      const alpha = t < 0.1 ? t * 10 : t > 0.8 ? (1 - t) * 5 : 1;

      // Size shrinks as it approaches
      const size = particle.size * (1 - easeT * 0.5);

      // Draw particle with glow
      const color = particle.isCrystal
        ? `rgba(180, 100, 255, ${alpha * 0.9})` // Purple for crystals
        : `rgba(255, 215, 0, ${alpha * 0.8})`; // Gold for territory

      const glowColor = particle.isCrystal
        ? `rgba(147, 112, 219, ${alpha * 0.4})`
        : `rgba(255, 200, 50, ${alpha * 0.3})`;

      // Glow
      context.fillStyle = glowColor;
      context.beginPath();
      context.arc(x, y, size * 2, 0, Math.PI * 2);
      context.fill();

      // Core
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();

      return true; // Keep particle
    });
  }

  private updateAndRenderGoldEffects(
    context: CanvasRenderingContext2D,
    deltaTime: number,
  ) {
    // Update and filter expired effects
    this.goldTextEffects = this.goldTextEffects.filter((effect) => {
      effect.lifeTime += deltaTime;
      if (effect.lifeTime >= effect.duration) {
        return false; // Remove expired
      }

      // Calculate animation progress
      const t = effect.lifeTime / effect.duration;
      const riseDistance = 15; // 50% smaller
      const x = effect.x - this.game.width() / 2;
      const y = effect.y - this.game.height() / 2 - t * riseDistance;
      const alpha = 1 - t;

      // Gold text styling
      const goldText = `+${effect.gold}`;

      // Draw with fade and rise (50% smaller)
      context.save();
      context.font = "bold 6px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";

      // Black outline for visibility
      context.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
      context.lineWidth = 1.5;
      context.strokeText(goldText, x, y);

      // Gold fill
      context.fillStyle = `rgba(255, 215, 0, ${alpha})`;
      context.fillText(goldText, x, y);
      context.restore();

      return true; // Keep effect
    });
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

  private getTierRoman(tier: number): string {
    const romans = [
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
      "X",
    ];
    return romans[tier - 1] || tier.toString();
  }

  private renderUnit(context: CanvasRenderingContext2D, unit: any) {
    const player = this.game.player(unit.playerId);
    if (!player) return;

    const x = unit.x - this.game.width() / 2;
    const y = unit.y - this.game.height() / 2;

    const isDefensePost = unit.unitType === "defensePost";
    const isEliteSoldier = unit.unitType === "eliteSoldier";
    const isWarship = unit.unitType === "warship";

    if (isDefensePost) {
      // Defense post: shield icon (50% smaller than before)
      const size = 4; // Reduced from 8 for 50% smaller

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
    } else if (isEliteSoldier) {
      // Elite soldier: larger diamond/star shape
      const size = 8; // Larger than regular soldier

      // Draw diamond shape
      context.fillStyle = player.territoryColor().toRgbString();
      context.beginPath();
      context.moveTo(x, y - size / 2); // Top point
      context.lineTo(x + size / 2, y); // Right point
      context.lineTo(x, y + size / 2); // Bottom point
      context.lineTo(x - size / 2, y); // Left point
      context.closePath();
      context.fill();

      // Golden border for elite units
      context.strokeStyle = "#FFD700";
      context.lineWidth = 1.5;
      context.stroke();

      // Black outer outline
      context.strokeStyle = "#000";
      context.lineWidth = 0.5;
      context.stroke();
    } else if (isWarship) {
      // Warship: boat/ship shape with pointed bow
      const size = 10;

      // Ship hull shape (pointed at front, flat at back)
      context.fillStyle = player.territoryColor().toRgbString();
      context.beginPath();
      // Bow (front point)
      context.moveTo(x, y - size / 2);
      // Right side
      context.lineTo(x + size / 3, y - size / 6);
      context.lineTo(x + size / 3, y + size / 3);
      // Stern (back, flat)
      context.lineTo(x - size / 3, y + size / 3);
      // Left side
      context.lineTo(x - size / 3, y - size / 6);
      context.closePath();
      context.fill();

      // Deck line (horizontal bar)
      context.fillStyle = "#fff";
      context.fillRect(x - size / 4, y - size / 10, size / 2, size / 6);

      // Cannon turret (small circle on deck)
      context.beginPath();
      context.arc(x, y + size / 8, size / 6, 0, Math.PI * 2);
      context.fillStyle = "#444";
      context.fill();

      // Navy blue border
      context.strokeStyle = "#1a3a6e";
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(x, y - size / 2);
      context.lineTo(x + size / 3, y - size / 6);
      context.lineTo(x + size / 3, y + size / 3);
      context.lineTo(x - size / 3, y + size / 3);
      context.lineTo(x - size / 3, y - size / 6);
      context.closePath();
      context.stroke();

      // Black outer outline
      context.strokeStyle = "#000";
      context.lineWidth = 0.5;
      context.stroke();
    } else {
      // Regular soldier: triangle pointing up
      const size = 6; // Halved from 12

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
    if (
      projectile.isBeam &&
      projectile.startX !== undefined &&
      projectile.startY !== undefined
    ) {
      this.renderBeam(context, projectile);
      return;
    }

    const radius = Math.max(1, diameter / 2);

    // Check if this is an elite projectile (draws as stripes)
    if (projectile.isElite) {
      this.renderEliteProjectile(context, x, y, radius);
      return;
    }

    // Plasma projectile effect with glowing core
    // Outer glow
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius * 2.5);
    gradient.addColorStop(0, "rgba(0, 255, 255, 0.9)"); // Cyan core
    gradient.addColorStop(0.3, "rgba(100, 200, 255, 0.7)"); // Light blue
    gradient.addColorStop(0.6, "rgba(150, 100, 255, 0.4)"); // Purple edge
    gradient.addColorStop(1, "rgba(100, 50, 200, 0)"); // Transparent

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

  private renderEliteProjectile(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
  ) {
    // Elite projectiles are spherical with golden/yellow glow
    const eliteRadius = radius * 1.5;

    // Outer glow (gold/orange)
    const gradient = context.createRadialGradient(
      x,
      y,
      0,
      x,
      y,
      eliteRadius * 2.5,
    );
    gradient.addColorStop(0, "rgba(255, 255, 150, 0.95)"); // Bright yellow core
    gradient.addColorStop(0.3, "rgba(255, 220, 100, 0.8)"); // Golden
    gradient.addColorStop(0.6, "rgba(255, 180, 50, 0.5)"); // Orange-gold edge
    gradient.addColorStop(1, "rgba(255, 150, 0, 0)"); // Transparent

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, eliteRadius * 2.5, 0, Math.PI * 2);
    context.fill();

    // Bright white core
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(x, y, eliteRadius * 0.5, 0, Math.PI * 2);
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

  private renderCrystal(
    context: CanvasRenderingContext2D,
    crystal: {
      id: number;
      x: number;
      y: number;
      crystalCount: number;
      rotations?: number[];
    },
  ) {
    const x = crystal.x - this.game.width() / 2;
    const y = crystal.y - this.game.height() / 2;
    const rotations = crystal.rotations ?? [];

    // Base size scales with crystal count
    const baseSize = 3 + crystal.crystalCount * 1.5;

    // Draw cluster of small crystals
    const crystalPositions = this.getCrystalClusterPositions(
      crystal.crystalCount,
      baseSize,
    );

    for (let i = 0; i < crystalPositions.length; i++) {
      const pos = crystalPositions[i];
      const rotation = rotations[i] ?? 0;
      this.renderSingleCrystal(
        context,
        x + pos.x,
        y + pos.y,
        pos.size,
        rotation,
      );
    }
  }

  private getCrystalClusterPositions(
    count: number,
    baseSize: number,
  ): Array<{ x: number; y: number; size: number }> {
    const positions: Array<{ x: number; y: number; size: number }> = [];

    // Deterministic positions for crystal arrangement
    const angles = [0, 72, 144, 216, 288]; // Pentagon arrangement
    const radius = baseSize * 0.4;

    for (let i = 0; i < count; i++) {
      if (i === 0) {
        // Center crystal (largest)
        positions.push({ x: 0, y: 0, size: baseSize * 0.6 });
      } else {
        // Surrounding crystals
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
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    rotation: number,
  ) {
    // Growth animation - subtle pulse (crystals are hard, no movement)
    const time = performance.now() / 1000;
    const halfWidth = size / 2;
    const height = size * 1.8; // Taller crystal
    const bottomY = y + height * 0.3; // Bottom anchor point

    // Save context and apply rotation around bottom center
    context.save();
    context.translate(x, bottomY);
    context.rotate(rotation);
    context.translate(-x, -bottomY);

    // Outer glow with animated intensity
    const glowIntensity = 0.3 + Math.sin(time * 2) * 0.1; // Glow pulses, not size
    const glowGradient = context.createRadialGradient(
      x,
      y - height * 0.2,
      0,
      x,
      y - height * 0.2,
      size * 1.5,
    );
    glowGradient.addColorStop(0, `rgba(147, 112, 219, ${glowIntensity})`); // Purple glow
    glowGradient.addColorStop(1, "rgba(147, 112, 219, 0)");
    context.fillStyle = glowGradient;
    context.beginPath();
    context.arc(x, y - height * 0.2, size * 1.5, 0, Math.PI * 2);
    context.fill();

    // Crystal body (pentagon shape - tall with flat bottom)
    context.fillStyle = "rgba(138, 43, 226, 0.9)"; // BlueViolet
    context.beginPath();
    context.moveTo(x, y - height * 0.7); // Top point
    context.lineTo(x + halfWidth, y - height * 0.2); // Upper right
    context.lineTo(x + halfWidth, y + height * 0.3); // Lower right (flat bottom)
    context.lineTo(x - halfWidth, y + height * 0.3); // Lower left (flat bottom)
    context.lineTo(x - halfWidth, y - height * 0.2); // Upper left
    context.closePath();
    context.fill();

    // Crystal highlight
    context.fillStyle = "rgba(200, 162, 255, 0.8)";
    context.beginPath();
    context.moveTo(x, y - height * 0.6);
    context.lineTo(x + halfWidth * 0.4, y - height * 0.25);
    context.lineTo(x - halfWidth * 0.4, y - height * 0.25);
    context.closePath();
    context.fill();

    // Border
    context.strokeStyle = "rgba(75, 0, 130, 0.8)"; // Indigo
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y - height * 0.7);
    context.lineTo(x + halfWidth, y - height * 0.2);
    context.lineTo(x + halfWidth, y + height * 0.3);
    context.lineTo(x - halfWidth, y + height * 0.3);
    context.lineTo(x - halfWidth, y - height * 0.2);
    context.closePath();
    context.stroke();

    // Restore context
    context.restore();
  }
}
