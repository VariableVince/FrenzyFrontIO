import { UnitType } from "../../../../core/game/Game";
import { GameView, PlayerView, UnitView } from "../../../../core/game/GameView";
import { STRUCTURE_CONFIGS } from "../../../../core/game/frenzy/FrenzyTypes";
import { FrenzyRenderContext, getTierRoman } from "./FrenzyRenderContext";

/**
 * Structure types in Frenzy mode
 */
export enum FrenzyStructureType {
  HQ = "hq",
  Mine = "mine",
  Factory = "factory",
  DefensePost = "defensePost",
  Port = "port",
  Airport = "airport",
  MiniHQ = "minihq",
  MissileSilo = "missileSilo",
  SAMLauncher = "samLauncher",
  Artillery = "artillery",
  ShieldGenerator = "shieldGenerator",
  Construction = "construction",
}

/**
 * Unified structure interface for consistent rendering
 */
export interface FrenzyStructure {
  type: FrenzyStructureType;
  x: number;
  y: number;
  playerId: string;
  tier: number;
  health: number;
  maxHealth: number;
  unit?: UnitView;
  constructionType?: FrenzyStructureType;
  constructionProgress?: number;
  // Airport spawn info
  hasTransporter?: boolean;
  spawnTimer?: number;
  spawnInterval?: number;
}

/**
 * Renders all structure types in Frenzy mode:
 * HQ, Mine, Factory, DefensePost, Port, MissileSilo, SAMLauncher, Artillery, ShieldGenerator
 */
export class StructureRenderer {
  constructor(private game: GameView) {}

  /**
   * Gather all structures from frenzy state
   * All Frenzy buildings (HQ, Mine, Factory, Port) are now managed by FrenzyManager
   */
  gatherAllStructures(frenzyState: any): FrenzyStructure[] {
    const structures: FrenzyStructure[] = [];

    // Use the unified structures array if available (new format)
    if (frenzyState.structures) {
      for (const s of frenzyState.structures) {
        structures.push({
          type: s.type as FrenzyStructureType,
          x: s.x,
          y: s.y,
          playerId: s.playerId,
          tier: s.tier ?? 1,
          health: s.health ?? 100,
          maxHealth: s.maxHealth ?? 100,
          // Airport spawn info
          hasTransporter: s.hasTransporter,
          spawnTimer: s.spawnTimer,
          spawnInterval: s.spawnInterval,
        });
      }
    } else {
      // Legacy fallback: use separate arrays
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
    }

    // Add game units that are still managed as game units
    // Note: Mines, Ports, DefensePosts, Artillery, ShieldGenerators are now Frenzy units
    // Only SAMLaunchers and MissileSilos remain as game units (for now)
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
            case UnitType.Artillery:
              constrType = FrenzyStructureType.Artillery;
              break;
            case UnitType.ShieldGenerator:
              constrType = FrenzyStructureType.ShieldGenerator;
              break;
            case UnitType.Airport:
              constrType = FrenzyStructureType.Airport;
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
   * Render a structure with icon and healthbar
   */
  render(ctx: FrenzyRenderContext, structure: FrenzyStructure) {
    const player = this.game.player(structure.playerId);
    if (!player) return;

    const x = structure.x - ctx.halfWidth;
    const y = structure.y - ctx.halfHeight;

    // Render icon based on type
    switch (structure.type) {
      case FrenzyStructureType.HQ:
        this.renderHQIcon(ctx.context, x, y, player, structure.tier);
        break;
      case FrenzyStructureType.Mine:
        this.renderMineIcon(ctx.context, x, y, player, structure.tier);
        break;
      case FrenzyStructureType.Factory:
        this.renderFactoryIcon(ctx.context, x, y, player, structure.tier);
        break;
      case FrenzyStructureType.DefensePost:
        this.renderDefensePostIcon(ctx.context, x, y, player, structure.tier);
        break;
      case FrenzyStructureType.Port:
        this.renderPortIcon(ctx.context, x, y, player, structure.tier);
        break;
      case FrenzyStructureType.Airport:
        this.renderAirportIcon(ctx.context, x, y, player, structure);
        break;
      case FrenzyStructureType.MiniHQ:
        this.renderMiniHQIcon(ctx.context, x, y, player);
        break;
      case FrenzyStructureType.MissileSilo:
        this.renderMissileSiloIcon(ctx.context, x, y, player, structure.tier);
        break;
      case FrenzyStructureType.SAMLauncher:
        this.renderSAMLauncherIcon(ctx.context, x, y, player, structure.tier);
        break;
      case FrenzyStructureType.Construction:
        this.renderConstructionIcon(
          ctx,
          x,
          y,
          player,
          structure.constructionType!,
          structure.constructionProgress ?? 0,
        );
        break;
    }

    // Get bar config for this structure type
    const structureKey = this.getStructureConfigKey(structure.type);
    const barConfig = structureKey
      ? STRUCTURE_CONFIGS[structureKey]?.bars
      : null;
    const structureSize = this.getStructureSize(structure.type);

    // Render healthbar if damaged and config allows
    if (
      barConfig?.showHealthBar &&
      structure.health < structure.maxHealth &&
      structure.health > 0
    ) {
      this.renderHealthBar(
        ctx.context,
        x,
        y,
        structure.health,
        structure.maxHealth,
        structureSize,
      );
    }
  }

  /**
   * Maps FrenzyStructureType to STRUCTURE_CONFIGS key
   */
  private getStructureConfigKey(
    type: FrenzyStructureType,
  ): keyof typeof STRUCTURE_CONFIGS | null {
    const mapping: Record<
      FrenzyStructureType,
      keyof typeof STRUCTURE_CONFIGS | null
    > = {
      [FrenzyStructureType.HQ]: "hq",
      [FrenzyStructureType.Mine]: "mine",
      [FrenzyStructureType.Factory]: "factory",
      [FrenzyStructureType.Port]: "port",
      [FrenzyStructureType.Airport]: "airport",
      [FrenzyStructureType.MiniHQ]: "minihq",
      [FrenzyStructureType.DefensePost]: "defensePost",
      [FrenzyStructureType.MissileSilo]: "missileSilo",
      [FrenzyStructureType.SAMLauncher]: "samLauncher",
      [FrenzyStructureType.Artillery]: "artillery",
      [FrenzyStructureType.ShieldGenerator]: "shieldGenerator",
      [FrenzyStructureType.Construction]: null,
    };
    return mapping[type] ?? null;
  }

  private getStructureSize(type: FrenzyStructureType): number {
    switch (type) {
      case FrenzyStructureType.HQ:
        return 14;
      case FrenzyStructureType.Mine:
      case FrenzyStructureType.Factory:
      case FrenzyStructureType.Port:
      case FrenzyStructureType.Airport:
        return 10;
      case FrenzyStructureType.MiniHQ:
        return 8;
      case FrenzyStructureType.DefensePost:
      case FrenzyStructureType.MissileSilo:
      case FrenzyStructureType.SAMLauncher:
        return 8;
      default:
        return 8;
    }
  }

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

    // Background
    context.fillStyle = "rgba(0, 0, 0, 0.7)";
    context.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

    // Health fill
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

      context.strokeStyle = "#000";
      context.lineWidth = 1;
      context.stroke();
    }

    // Outer glow
    context.fillStyle = player.territoryColor().alpha(0.4).toRgbString();
    context.beginPath();
    context.arc(x, y, circleRadius + 2, 0, Math.PI * 2);
    context.fill();

    // Main circle
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.arc(x, y, circleRadius, 0, Math.PI * 2);
    context.fill();

    // Border
    context.strokeStyle = "#000";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, circleRadius, 0, Math.PI * 2);
    context.stroke();

    // Tier
    if (tier >= 1) {
      context.fillStyle = "#fff";
      context.font = "bold 6px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(getTierRoman(tier), x, y);
    }
  }

  private renderMineIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    level: number,
  ) {
    const size = STRUCTURE_CONFIGS.mine.size;
    const sides = 6;
    const angleOffset = Math.PI / 6;

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

    // Main hexagon
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

    if (level >= 1) {
      context.fillStyle = "#fff";
      context.font = "bold 5px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(getTierRoman(level), x, y);
    }
  }

  private renderFactoryIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    tier: number,
  ) {
    const size = STRUCTURE_CONFIGS.factory.size;
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

    context.strokeStyle = "#000";
    context.lineWidth = 1.5;
    context.stroke();

    if (tier >= 1) {
      context.fillStyle = "#fff";
      context.font = "bold 5px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(getTierRoman(tier), x, y);
    }
  }

  private renderDefensePostIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    tier: number,
  ) {
    const size = STRUCTURE_CONFIGS.defensePost.size;
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

    // Main shield
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

    context.strokeStyle = "#000";
    context.lineWidth = 1;
    context.stroke();

    if (tier >= 1) {
      context.fillStyle = "#fff";
      context.font = "bold 5px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(getTierRoman(tier), x, y - 1);
    }
  }

  private renderPortIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    tier: number,
  ) {
    const size = STRUCTURE_CONFIGS.port.size;
    const halfSize = size / 2;

    // Outer glow
    context.fillStyle = player.territoryColor().alpha(0.4).toRgbString();
    context.beginPath();
    context.arc(x, y, halfSize + 2, 0, Math.PI * 2);
    context.fill();

    // Main circle
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.arc(x, y, halfSize, 0, Math.PI * 2);
    context.fill();

    // Wave pattern
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

    context.strokeStyle = "#000";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, halfSize, 0, Math.PI * 2);
    context.stroke();

    if (tier >= 1) {
      context.fillStyle = "#fff";
      context.font = "bold 5px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(getTierRoman(tier), x, y);
    }
  }

  private renderAirportIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    structure: FrenzyStructure,
  ) {
    const size = STRUCTURE_CONFIGS.airport.size;
    const halfSize = size / 2;

    // Outer glow
    context.fillStyle = player.territoryColor().alpha(0.4).toRgbString();
    context.beginPath();
    context.arc(x, y, halfSize + 2, 0, Math.PI * 2);
    context.fill();

    // Main circle (runway base)
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.arc(x, y, halfSize, 0, Math.PI * 2);
    context.fill();

    // Airplane silhouette
    context.fillStyle = "rgba(255, 255, 255, 0.8)";
    context.beginPath();
    // Fuselage
    context.moveTo(x, y - halfSize * 0.6);
    context.lineTo(x + halfSize * 0.15, y + halfSize * 0.4);
    context.lineTo(x, y + halfSize * 0.3);
    context.lineTo(x - halfSize * 0.15, y + halfSize * 0.4);
    context.closePath();
    context.fill();
    // Wings
    context.beginPath();
    context.moveTo(x - halfSize * 0.6, y);
    context.lineTo(x + halfSize * 0.6, y);
    context.lineTo(x + halfSize * 0.3, y + halfSize * 0.15);
    context.lineTo(x - halfSize * 0.3, y + halfSize * 0.15);
    context.closePath();
    context.fill();
    // Tail
    context.beginPath();
    context.moveTo(x - halfSize * 0.25, y + halfSize * 0.25);
    context.lineTo(x + halfSize * 0.25, y + halfSize * 0.25);
    context.lineTo(x + halfSize * 0.15, y + halfSize * 0.35);
    context.lineTo(x - halfSize * 0.15, y + halfSize * 0.35);
    context.closePath();
    context.fill();

    // Border
    context.strokeStyle = "#000";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, halfSize, 0, Math.PI * 2);
    context.stroke();

    // Energy bar when transporter is rebuilding (hasTransporter = false)
    if (
      structure.hasTransporter === false &&
      structure.spawnTimer !== undefined &&
      structure.spawnInterval !== undefined &&
      structure.spawnInterval > 0
    ) {
      const progress = structure.spawnTimer / structure.spawnInterval;
      const barWidth = size + 4;
      const barHeight = 3;
      const barY = y + halfSize + 4;

      // Background
      context.fillStyle = "rgba(0, 0, 0, 0.7)";
      context.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

      // Progress fill (blue energy bar)
      context.fillStyle = "#4488ff";
      context.fillRect(x - barWidth / 2, barY, barWidth * progress, barHeight);

      // Border
      context.strokeStyle = "#000";
      context.lineWidth = 0.5;
      context.strokeRect(x - barWidth / 2, barY, barWidth, barHeight);
    }
  }

  private renderMiniHQIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
  ) {
    const size = STRUCTURE_CONFIGS.minihq.size;
    const halfSize = size / 2;

    // Outer glow
    context.fillStyle = player.territoryColor().alpha(0.5).toRgbString();
    context.beginPath();
    context.arc(x, y, halfSize + 3, 0, Math.PI * 2);
    context.fill();

    // Main circle (round design)
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.arc(x, y, halfSize, 0, Math.PI * 2);
    context.fill();

    // Inner ring
    context.strokeStyle = player.territoryColor().lighten(0.3).toRgbString();
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, halfSize * 0.65, 0, Math.PI * 2);
    context.stroke();

    // Center dot
    context.fillStyle = "rgba(255, 255, 255, 0.9)";
    context.beginPath();
    context.arc(x, y, halfSize * 0.25, 0, Math.PI * 2);
    context.fill();

    // Border
    context.strokeStyle = "#000";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, halfSize, 0, Math.PI * 2);
    context.stroke();
  }

  private renderMissileSiloIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    tier: number,
  ) {
    const size = STRUCTURE_CONFIGS.missileSilo.size;
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

    // Main diamond
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.moveTo(x, y - halfSize);
    context.lineTo(x + halfSize, y);
    context.lineTo(x, y + halfSize);
    context.lineTo(x - halfSize, y);
    context.closePath();
    context.fill();

    // Missile line
    context.strokeStyle = "rgba(255, 255, 255, 0.7)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(x, y - halfSize * 0.5);
    context.lineTo(x, y + halfSize * 0.5);
    context.stroke();

    context.strokeStyle = "#000";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y - halfSize);
    context.lineTo(x + halfSize, y);
    context.lineTo(x, y + halfSize);
    context.lineTo(x - halfSize, y);
    context.closePath();
    context.stroke();

    if (tier >= 1) {
      context.fillStyle = "#fff";
      context.font = "bold 4px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(getTierRoman(tier), x, y);
    }
  }

  private renderSAMLauncherIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
    tier: number,
  ) {
    const size = STRUCTURE_CONFIGS.samLauncher.size;
    const halfSize = size / 2;

    // Outer glow
    context.fillStyle = player.territoryColor().alpha(0.4).toRgbString();
    context.beginPath();
    context.moveTo(x, y - halfSize - 2);
    context.lineTo(x + halfSize + 2, y + halfSize + 2);
    context.lineTo(x - halfSize - 2, y + halfSize + 2);
    context.closePath();
    context.fill();

    // Main triangle
    context.fillStyle = player.territoryColor().toRgbString();
    context.beginPath();
    context.moveTo(x, y - halfSize);
    context.lineTo(x + halfSize, y + halfSize);
    context.lineTo(x - halfSize, y + halfSize);
    context.closePath();
    context.fill();

    // Radar circle
    context.strokeStyle = "rgba(255, 255, 255, 0.7)";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(x, y - halfSize * 0.3, halfSize * 0.35, 0, Math.PI * 2);
    context.stroke();

    context.strokeStyle = "#000";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y - halfSize);
    context.lineTo(x + halfSize, y + halfSize);
    context.lineTo(x - halfSize, y + halfSize);
    context.closePath();
    context.stroke();

    if (tier >= 1) {
      context.fillStyle = "#fff";
      context.font = "bold 4px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(getTierRoman(tier), x, y + 1);
    }
  }

  private renderArtilleryIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
  ) {
    const size = STRUCTURE_CONFIGS.artillery.size; // Same as UnitRenderer.renderArtillery

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

  private renderShieldGeneratorIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: PlayerView,
  ) {
    const size = STRUCTURE_CONFIGS.shieldGenerator.size;

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

    context.fillStyle = "rgba(100, 200, 255, 0.6)";
    context.beginPath();
    context.arc(x, y, size * 0.4, 0, Math.PI * 2);
    context.fill();

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

  private renderConstructionIcon(
    ctx: FrenzyRenderContext,
    x: number,
    y: number,
    player: PlayerView,
    targetType: FrenzyStructureType,
    progress: number,
  ) {
    const context = ctx.context;
    const pulse = 0.9 + 0.1 * Math.sin(ctx.time * 4);

    context.save();
    context.translate(x, y);
    context.scale(pulse, pulse);

    // Gray ghost color
    const grayColor = {
      territoryColor: () => ({
        alpha: (a: number) => ({
          toRgbString: () => `rgba(150, 150, 150, ${a})`,
        }),
        toRgbString: () => "rgb(150, 150, 150)",
      }),
    } as unknown as PlayerView;

    // Render ghost shape
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
      case FrenzyStructureType.Artillery:
        this.renderArtilleryIcon(context, 0, 0, grayColor);
        break;
      case FrenzyStructureType.ShieldGenerator:
        this.renderShieldGeneratorIcon(context, 0, 0, grayColor);
        break;
      case FrenzyStructureType.Airport:
        this.renderAirportIcon(context, 0, 0, grayColor, {
          type: FrenzyStructureType.Airport,
          x: 0,
          y: 0,
          playerId: "",
          tier: 0,
          health: 0,
          maxHealth: 0,
          hasTransporter: true, // Don't show energy bar for construction ghost
        });
        break;
    }

    context.restore();

    // Progress bar
    const barWidth = 10;
    const barHeight = 2;
    const barY = y + 8;

    context.fillStyle = "rgba(0, 0, 0, 0.5)";
    context.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

    context.fillStyle = "rgba(255, 200, 0, 0.9)";
    context.fillRect(x - barWidth / 2, barY, barWidth * progress, barHeight);

    context.strokeStyle = "#000";
    context.lineWidth = 0.5;
    context.strokeRect(x - barWidth / 2, barY, barWidth, barHeight);
  }
}
