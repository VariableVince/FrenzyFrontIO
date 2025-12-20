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
 * Mine data for protomolecule rendering
 */
interface MineData {
  x: number;
  y: number;
  playerId: string;
  tier: number;
  crystalsInCell: Array<{ x: number; y: number; count: number }>;
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

    // Process new gold payouts - convert to animated text effects only
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
        }
      }
      this.lastPayoutIds = newPayoutIds;
    } else {
      this.lastPayoutIds.clear();
    }

    // Gather all structures into unified list
    const structures = this.gatherAllStructures(frenzyState);

    // Get all mine data for protomolecule rendering
    const allMines: MineData[] = structures
      .filter((s) => s.type === FrenzyStructureType.Mine)
      .map((s) => ({
        x: s.x,
        y: s.y,
        playerId: s.playerId,
        tier: s.tier,
        crystalsInCell: [], // Will be populated below
      }));

    // Assign crystals to their Voronoi cells
    const mineRadius = 40; // Should match config.mineRadius
    if (frenzyState.crystals) {
      for (const crystal of frenzyState.crystals) {
        // Find which mine this crystal belongs to (closest within radius)
        let closestMine: MineData | null = null;
        let closestDist = Infinity;

        for (const mine of allMines) {
          const dist = Math.hypot(crystal.x - mine.x, crystal.y - mine.y);
          if (dist <= mineRadius && dist < closestDist) {
            // Check if closer to this mine than any other
            let isClosest = true;
            for (const other of allMines) {
              if (other === mine) continue;
              const otherDist = Math.hypot(crystal.x - other.x, crystal.y - other.y);
              if (otherDist < dist) {
                isClosest = false;
                break;
              }
            }
            if (isClosest) {
              closestMine = mine;
              closestDist = dist;
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

    // Render protomolecule effect (permanent veins and boundaries)
    this.renderProtomoleculeEffect(context, allMines, frenzyState.crystals ?? []);

    // Render crystals (above protomolecule veins)
    if (frenzyState.crystals) {
      for (const crystal of frenzyState.crystals) {
        this.renderCrystal(context, crystal);
      }
    }

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
   * Render protomolecule effect - organic veins/roots from mines to crystals
   * with cold blue energy pulsing toward mines. Also draws Voronoi boundaries.
   */
  private renderProtomoleculeEffect(
    context: CanvasRenderingContext2D,
    allMines: MineData[],
    allCrystals: Array<{ x: number; y: number; crystalCount: number }>,
  ) {
    const halfWidth = this.game.width() / 2;
    const halfHeight = this.game.height() / 2;
    const time = performance.now() / 1000;
    const mineRadius = 40; // Should match config.mineRadius

    // First, calculate all bisection points between adjacent mines (draw once per pair)
    const drawnBisections = new Set<string>();

    // Draw subtle Voronoi boundaries
    for (let i = 0; i < allMines.length; i++) {
      const mine = allMines[i];
      const mx = mine.x - halfWidth;
      const my = mine.y - halfHeight;

      for (let j = i + 1; j < allMines.length; j++) {
        const other = allMines[j];
        const dist = Math.hypot(other.x - mine.x, other.y - mine.y);

        // Only draw bisection if mines are within 2x radius (overlapping territories)
        if (dist < mineRadius * 2) {
          const pairKey = `${Math.min(i, j)}_${Math.max(i, j)}`;
          if (!drawnBisections.has(pairKey)) {
            drawnBisections.add(pairKey);

            // Calculate bisection line (perpendicular at midpoint)
            const midX = (mine.x + other.x) / 2;
            const midY = (mine.y + other.y) / 2;

            // Perpendicular direction
            const dx = other.x - mine.x;
            const dy = other.y - mine.y;
            const perpX = -dy;
            const perpY = dx;
            const perpLen = Math.hypot(perpX, perpY);
            if (perpLen === 0) continue;

            // Normalize and scale to radius
            const normPerpX = perpX / perpLen;
            const normPerpY = perpY / perpLen;

            // Find where bisection intersects territory boundary
            // Clip to the smaller of: mine radius, or territory boundary
            const clipRadius = Math.min(mineRadius, dist / 2 + 5);

            // Sample along the bisection line, only draw within owned territory
            const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
            const sampleDist = clipRadius;
            let inTerritory = false;
            let segStart = { x: 0, y: 0 };

            for (let t = -sampleDist; t <= sampleDist; t += 2) {
              const px = midX + normPerpX * t;
              const py = midY + normPerpY * t;

              // Check if point is within either mine's radius
              const distToMine = Math.hypot(px - mine.x, py - mine.y);
              const distToOther = Math.hypot(px - other.x, py - other.y);
              const withinBounds = distToMine <= mineRadius || distToOther <= mineRadius;

              // Check territory ownership
              const tile = this.game.ref(Math.floor(px), Math.floor(py));
              const owner = tile ? this.game.owner(tile) : null;
              const isOwned = owner && owner.isPlayer() &&
                (owner.id() === mine.playerId || owner.id() === other.playerId);

              if (withinBounds && isOwned) {
                if (!inTerritory) {
                  inTerritory = true;
                  segStart = { x: px - halfWidth, y: py - halfHeight };
                }
              } else {
                if (inTerritory) {
                  inTerritory = false;
                  segments.push({
                    x1: segStart.x,
                    y1: segStart.y,
                    x2: px - halfWidth - normPerpX * 2,
                    y2: py - halfHeight - normPerpY * 2,
                  });
                }
              }
            }
            // Close any open segment
            if (inTerritory) {
              segments.push({
                x1: segStart.x,
                y1: segStart.y,
                x2: midX + normPerpX * sampleDist - halfWidth,
                y2: midY + normPerpY * sampleDist - halfHeight,
              });
            }

            // Draw bisection segments with subtle styling
            context.strokeStyle = `rgba(100, 180, 255, 0.15)`;
            context.lineWidth = 1;
            for (const seg of segments) {
              context.beginPath();
              context.moveTo(seg.x1, seg.y1);
              context.lineTo(seg.x2, seg.y2);
              context.stroke();
            }
          }
        }
      }
    }

    // Draw organic veins for each mine
    for (const mine of allMines) {
      const mx = mine.x - halfWidth;
      const my = mine.y - halfHeight;

      // Check if mine is on owned territory
      const mineTile = this.game.ref(Math.floor(mine.x), Math.floor(mine.y));
      const mineOwner = mineTile ? this.game.owner(mineTile) : null;
      if (!mineOwner || !mineOwner.isPlayer()) continue;
      const ownerId = mineOwner.id();

      // Draw veins to crystals in cell (dense, prominent)
      for (const crystal of mine.crystalsInCell) {
        this.drawOrganicVein(
          context,
          mx,
          my,
          crystal.x - halfWidth,
          crystal.y - halfHeight,
          time,
          1.5, // line width
          0.6, // alpha
          true, // is crystal vein
          crystal.count,
        );
      }

      // Draw sparse veins into the rest of the cell (area representation)
      // Sample points within cell that are on owned territory
      const areaVeinCount = 8; // Number of area veins per mine
      const angleStep = (Math.PI * 2) / areaVeinCount;

      for (let i = 0; i < areaVeinCount; i++) {
        const baseAngle = i * angleStep + (mine.x * 0.1); // Offset by mine position for variety
        const veinLength = mineRadius * (0.5 + 0.3 * Math.sin(baseAngle * 3 + mine.y * 0.05));

        // End point of vein
        const vx = mine.x + Math.cos(baseAngle) * veinLength;
        const vy = mine.y + Math.sin(baseAngle) * veinLength;

        // Check if end is in Voronoi cell and owned territory
        let inCell = true;
        for (const other of allMines) {
          if (other === mine) continue;
          const distToOther = Math.hypot(vx - other.x, vy - other.y);
          const distToThis = Math.hypot(vx - mine.x, vy - mine.y);
          if (distToOther < distToThis) {
            inCell = false;
            break;
          }
        }

        if (!inCell) continue;

        // Check territory ownership
        const tile = this.game.ref(Math.floor(vx), Math.floor(vy));
        const owner = tile ? this.game.owner(tile) : null;
        if (!owner || !owner.isPlayer() || owner.id() !== ownerId) continue;

        this.drawOrganicVein(
          context,
          mx,
          my,
          vx - halfWidth,
          vy - halfHeight,
          time,
          0.8, // thinner line
          0.25, // lower alpha
          false, // not crystal vein
          1,
        );
      }

      // Draw subtle cell boundary (clipped to territory)
      this.drawCellBoundary(context, mine, allMines, halfWidth, halfHeight);
    }
  }

  /**
   * Draw an organic-looking vein with energy pulses
   */
  private drawOrganicVein(
    context: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    time: number,
    lineWidth: number,
    alpha: number,
    isCrystal: boolean,
    crystalCount: number,
  ) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length < 2) return;

    // Organic curve - add slight waviness
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const perpX = -dy / length;
    const perpY = dx / length;
    const waveAmp = length * 0.05 * Math.sin(time * 0.5 + x1 * 0.1);
    const ctrlX = midX + perpX * waveAmp;
    const ctrlY = midY + perpY * waveAmp;

    // Base vein color (cold blue)
    context.strokeStyle = `rgba(80, 160, 220, ${alpha * 0.4})`;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(x1, y1);
    context.quadraticCurveTo(ctrlX, ctrlY, x2, y2);
    context.stroke();

    // Energy pulses traveling toward mine (from crystal to mine direction)
    const pulseCount = isCrystal ? 2 + crystalCount : 1;
    const pulseSpeed = isCrystal ? 0.8 : 0.4; // pulses per second (slower)

    for (let p = 0; p < pulseCount; p++) {
      // Pulse position along the vein (0 = at crystal/source, 1 = at mine)
      const pulseT = ((time * pulseSpeed + p / pulseCount) % 1);

      // Position along quadratic curve: t=0 at x2 (crystal), t=1 at x1 (mine)
      const t = pulseT;
      const px = (1 - t) * (1 - t) * x2 + 2 * (1 - t) * t * ctrlX + t * t * x1;
      const py = (1 - t) * (1 - t) * y2 + 2 * (1 - t) * t * ctrlY + t * t * y1;

      // Pulse size varies
      const pulseSizeBase = isCrystal ? 2.5 : 1.5;
      const pulseSize = pulseSizeBase * (0.6 + 0.4 * Math.sin(pulseT * Math.PI));

      // Pulse brightness - brighter near ends
      const pulseAlpha = alpha * (0.5 + 0.5 * Math.sin(pulseT * Math.PI));

      // Cold blue glow
      const gradient = context.createRadialGradient(px, py, 0, px, py, pulseSize * 2);
      gradient.addColorStop(0, `rgba(150, 220, 255, ${pulseAlpha})`);
      gradient.addColorStop(0.5, `rgba(80, 180, 240, ${pulseAlpha * 0.5})`);
      gradient.addColorStop(1, `rgba(40, 120, 200, 0)`);

      context.fillStyle = gradient;
      context.beginPath();
      context.arc(px, py, pulseSize * 2, 0, Math.PI * 2);
      context.fill();
    }
  }

  /**
   * Draw the Voronoi cell boundary for a mine (subtle, clipped to territory)
   */
  private drawCellBoundary(
    context: CanvasRenderingContext2D,
    mine: MineData,
    allMines: MineData[],
    halfWidth: number,
    halfHeight: number,
  ) {
    const mineRadius = 40;
    const mx = mine.x - halfWidth;
    const my = mine.y - halfHeight;
    const sampleCount = 48;

    // Check mine tile ownership
    const mineTile = this.game.ref(Math.floor(mine.x), Math.floor(mine.y));
    const mineOwner = mineTile ? this.game.owner(mineTile) : null;
    if (!mineOwner || !mineOwner.isPlayer()) return;
    const ownerId = mineOwner.id();

    // Sample points around the cell boundary
    context.strokeStyle = `rgba(80, 160, 220, 0.2)`;
    context.lineWidth = 0.8;

    let lastPoint: { x: number; y: number; valid: boolean } | null = null;

    for (let i = 0; i <= sampleCount; i++) {
      const angle = (i / sampleCount) * Math.PI * 2;
      let radius = mineRadius;

      // Check Voronoi constraint - find where bisection clips the radius
      for (const other of allMines) {
        if (other === mine) continue;
        const dist = Math.hypot(other.x - mine.x, other.y - mine.y);
        if (dist < mineRadius * 2) {
          // This mine might clip our boundary
          // Find intersection of this angle ray with the bisection plane
          const midX = (mine.x + other.x) / 2;
          const midY = (mine.y + other.y) / 2;
          const distToMid = Math.hypot(midX - mine.x, midY - mine.y);

          // Direction to midpoint from mine
          const angleToMid = Math.atan2(midY - mine.y, midX - mine.x);
          const angleDiff = Math.abs(((angle - angleToMid + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

          // If angle is toward the other mine, clip radius
          if (angleDiff < Math.PI / 2) {
            const clipDist = distToMid / Math.cos(angleDiff);
            if (clipDist > 0 && clipDist < radius) {
              radius = clipDist;
            }
          }
        }
      }

      const px = mine.x + Math.cos(angle) * radius;
      const py = mine.y + Math.sin(angle) * radius;

      // Check if this point is on owned territory
      const tile = this.game.ref(Math.floor(px), Math.floor(py));
      const owner = tile ? this.game.owner(tile) : null;
      const isOwned = owner && owner.isPlayer() && owner.id() === ownerId;

      const point = {
        x: px - halfWidth,
        y: py - halfHeight,
        valid: !!isOwned,
      };

      if (lastPoint && lastPoint.valid && point.valid) {
        context.beginPath();
        context.moveTo(lastPoint.x, lastPoint.y);
        context.lineTo(point.x, point.y);
        context.stroke();
      }

      lastPoint = point;
    }
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

    // Outer glow with animated intensity - cold blue protomolecule style
    const glowIntensity = 0.4 + Math.sin(time * 2.5) * 0.2; // Stronger pulse
    const radiationPulse = 1 + Math.sin(time * 3) * 0.15; // Radiation expansion
    const glowGradient = context.createRadialGradient(
      x,
      y - height * 0.2,
      0,
      x,
      y - height * 0.2,
      size * 1.5 * radiationPulse,
    );
    glowGradient.addColorStop(0, `rgba(120, 200, 255, ${glowIntensity})`); // Cold blue core
    glowGradient.addColorStop(0.5, `rgba(80, 160, 220, ${glowIntensity * 0.5})`); // Mid blue
    glowGradient.addColorStop(1, "rgba(40, 120, 200, 0)"); // Fade out
    context.fillStyle = glowGradient;
    context.beginPath();
    context.arc(x, y - height * 0.2, size * 1.5 * radiationPulse, 0, Math.PI * 2);
    context.fill();

    // Crystal body (pentagon shape - tall with flat bottom) - cold blue
    context.fillStyle = "rgba(60, 140, 200, 0.9)"; // Cold blue
    context.beginPath();
    context.moveTo(x, y - height * 0.7); // Top point
    context.lineTo(x + halfWidth, y - height * 0.2); // Upper right
    context.lineTo(x + halfWidth, y + height * 0.3); // Lower right (flat bottom)
    context.lineTo(x - halfWidth, y + height * 0.3); // Lower left (flat bottom)
    context.lineTo(x - halfWidth, y - height * 0.2); // Upper left
    context.closePath();
    context.fill();

    // Crystal highlight - bright cold blue
    context.fillStyle = "rgba(150, 210, 255, 0.8)";
    context.beginPath();
    context.moveTo(x, y - height * 0.6);
    context.lineTo(x + halfWidth * 0.4, y - height * 0.25);
    context.lineTo(x - halfWidth * 0.4, y - height * 0.25);
    context.closePath();
    context.fill();

    // Border - dark blue
    context.strokeStyle = "rgba(20, 60, 100, 0.8)"; // Dark blue
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
