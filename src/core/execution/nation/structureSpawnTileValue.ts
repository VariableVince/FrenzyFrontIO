import { FrenzyStructureType } from "../../game/frenzy/FrenzyTypes";
import { Game, Player, Relation, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { closestTile, closestTwoTiles } from "../Util";

/**
 * Get tiles of structures of the same type, including Frenzy structures
 */
function getOtherStructureTiles(
  mg: Game,
  player: Player,
  type: UnitType,
): Set<TileRef> {
  const otherTiles: Set<TileRef> = new Set();

  // Get regular game units
  for (const unit of player.units(type)) {
    otherTiles.add(unit.tile());
  }

  // In Frenzy mode, also get Frenzy structures
  const frenzyManager = mg.frenzyManager();
  if (frenzyManager) {
    // Map UnitType to FrenzyStructureType
    let frenzyType: FrenzyStructureType | null = null;
    switch (type) {
      case UnitType.City:
        frenzyType = FrenzyStructureType.Mine;
        break;
      case UnitType.Factory:
        frenzyType = FrenzyStructureType.Factory;
        break;
      case UnitType.Port:
        frenzyType = FrenzyStructureType.Port;
        break;
    }

    if (frenzyType) {
      for (const tile of frenzyManager.getStructureTilesByType(frenzyType)) {
        otherTiles.add(tile);
      }
    }

    // For towers (DefensePost, SAMLauncher, MissileSilo, Artillery, ShieldGenerator), get tower tiles
    if (
      type === UnitType.DefensePost ||
      type === UnitType.SAMLauncher ||
      type === UnitType.MissileSilo ||
      type === UnitType.Artillery ||
      type === UnitType.ShieldGenerator
    ) {
      for (const tile of frenzyManager.getTowerTilesForPlayer(player.id())) {
        otherTiles.add(tile);
      }
    }
  }

  return otherTiles;
}

export function structureSpawnTileValue(
  mg: Game,
  player: Player,
  type: UnitType,
): (tile: TileRef) => number {
  const borderTiles = player.borderTiles();
  const otherTiles = getOtherStructureTiles(mg, player, type);
  // Prefer spacing structures out of atom bomb range
  const borderSpacing = mg.config().nukeMagnitudes(UnitType.AtomBomb).outer;
  const structureSpacing = borderSpacing * 2;
  switch (type) {
    case UnitType.City:
    case UnitType.Factory:
    case UnitType.MissileSilo: {
      return (tile) => {
        let w = 0;

        // Prefer higher elevations
        w += mg.magnitude(tile);

        // Prefer to be away from the border
        const [, closestBorderDist] = closestTile(mg, borderTiles, tile);
        w += Math.min(closestBorderDist, borderSpacing);

        // Prefer to be away from other structures of the same type
        const otherTilesCopy = new Set(otherTiles);
        otherTilesCopy.delete(tile);
        const closestOther = closestTwoTiles(mg, otherTilesCopy, [tile]);
        if (closestOther !== null) {
          const d = mg.manhattanDist(closestOther.x, tile);
          w += Math.min(d, structureSpacing);
        }

        // TODO: Cities and factories should consider train range limits
        return w;
      };
    }
    case UnitType.Port: {
      return (tile) => {
        let w = 0;

        // Prefer to be away from other structures of the same type
        const otherTilesCopy = new Set(otherTiles);
        otherTilesCopy.delete(tile);
        const [, closestOtherDist] = closestTile(mg, otherTilesCopy, tile);
        w += Math.min(closestOtherDist, structureSpacing);

        return w;
      };
    }
    case UnitType.DefensePost: {
      return (tile) => {
        let w = 0;

        // Prefer higher elevations
        w += mg.magnitude(tile);

        const [closest, closestBorderDist] = closestTile(mg, borderTiles, tile);
        if (closest !== null) {
          // Prefer to be borderSpacing tiles from the border
          w += Math.max(
            0,
            borderSpacing - Math.abs(borderSpacing - closestBorderDist),
          );

          // Prefer adjacent players who are hostile
          const neighbors: Set<Player> = new Set();
          for (const tile of mg.neighbors(closest)) {
            if (!mg.isLand(tile)) continue;
            const id = mg.ownerID(tile);
            if (id === player.smallID()) continue;
            const neighbor = mg.playerBySmallID(id);
            if (!neighbor.isPlayer()) continue;
            neighbors.add(neighbor);
          }
          for (const neighbor of neighbors) {
            w +=
              borderSpacing * (Relation.Friendly - player.relation(neighbor));
          }
        }

        // Prefer to be away from other structures of the same type
        const otherTilesCopy2 = new Set(otherTiles);
        otherTilesCopy2.delete(tile);
        const closestOther = closestTwoTiles(mg, otherTilesCopy2, [tile]);
        if (closestOther !== null) {
          const d = mg.manhattanDist(closestOther.x, tile);
          w += Math.min(d, structureSpacing);
        }

        return w;
      };
    }
    case UnitType.SAMLauncher: {
      const protectTiles: Set<TileRef> = new Set();
      for (const unit of player.units()) {
        switch (unit.type()) {
          case UnitType.City:
          case UnitType.Factory:
          case UnitType.MissileSilo:
          case UnitType.Port:
            protectTiles.add(unit.tile());
        }
      }
      const range = mg.config().defaultSamRange();
      const rangeSquared = range * range;
      return (tile) => {
        let w = 0;

        // Prefer higher elevations
        w += mg.magnitude(tile);

        // Prefer to be away from the border
        const closestBorder = closestTwoTiles(mg, borderTiles, [tile]);
        if (closestBorder !== null) {
          const d = mg.manhattanDist(closestBorder.x, tile);
          w += Math.min(d, borderSpacing);
        }

        // Prefer to be away from other structures of the same type
        const otherTilesCopy3 = new Set(otherTiles);
        otherTilesCopy3.delete(tile);
        const closestOther = closestTwoTiles(mg, otherTilesCopy3, [tile]);
        if (closestOther !== null) {
          const d = mg.manhattanDist(closestOther.x, tile);
          w += Math.min(d, structureSpacing);
        }

        // Prefer to be in range of other structures
        for (const maybeProtected of protectTiles) {
          const distanceSquared = mg.euclideanDistSquared(tile, maybeProtected);
          if (distanceSquared > rangeSquared) continue;
          w += structureSpacing;
        }

        return w;
      };
    }
    case UnitType.Artillery:
    case UnitType.ShieldGenerator: {
      // Artillery and Shield Generators should be placed defensively
      // Similar to DefensePost but with different spacing preferences
      return (tile) => {
        let w = 0;

        // Prefer higher elevations
        w += mg.magnitude(tile);

        const [closest, closestBorderDist] = closestTile(mg, borderTiles, tile);
        if (closest !== null) {
          // For artillery, prefer to be slightly back from the border
          // For shield generators, prefer to be near structures to protect
          w += Math.max(
            0,
            borderSpacing - Math.abs(borderSpacing * 1.5 - closestBorderDist),
          );
        }

        // Prefer to be away from other structures of the same type
        const otherTilesCopy4 = new Set(otherTiles);
        otherTilesCopy4.delete(tile);
        const closestOther = closestTwoTiles(mg, otherTilesCopy4, [tile]);
        if (closestOther !== null) {
          const d = mg.manhattanDist(closestOther.x, tile);
          w += Math.min(d, structureSpacing);
        }

        return w;
      };
    }
    default:
      throw new Error(`Value function not implemented for ${type}`);
  }
}
