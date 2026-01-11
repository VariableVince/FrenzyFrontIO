import { FrenzyUnit } from "./FrenzyTypes";

/**
 * Spatial hash grid for efficient nearest neighbor queries
 * Divides space into cells and allows O(1) lookups of nearby units
 *
 * Performance optimized:
 * - Uses numeric keys instead of string concatenation
 * - Avoids array allocations in hot paths
 * - Uses squared distance comparisons
 */
export class SpatialHashGrid {
  private grid: Map<number, FrenzyUnit[]> = new Map();
  // Large multiplier to ensure unique keys for reasonable map sizes
  private readonly KEY_MULTIPLIER = 100000;

  constructor(private cellSize: number = 50) {}

  clear() {
    this.grid.clear();
  }

  insert(unit: FrenzyUnit) {
    const key = this.getKey(unit.x, unit.y);
    let cell = this.grid.get(key);
    if (!cell) {
      cell = [];
      this.grid.set(key, cell);
    }
    cell.push(unit);
  }

  getNearby(x: number, y: number, radius: number): FrenzyUnit[] {
    const nearby: FrenzyUnit[] = [];
    const radiusSq = radius * radius;
    const invCellSize = 1 / this.cellSize;

    const minCellX = Math.floor((x - radius) * invCellSize);
    const maxCellX = Math.floor((x + radius) * invCellSize);
    const minCellY = Math.floor((y - radius) * invCellSize);
    const maxCellY = Math.floor((y + radius) * invCellSize);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const key = cx * this.KEY_MULTIPLIER + cy;
        const units = this.grid.get(key);
        if (!units) continue;

        for (let i = 0; i < units.length; i++) {
          const unit = units[i];
          const dx = unit.x - x;
          const dy = unit.y - y;
          const distSq = dx * dx + dy * dy;
          if (distSq <= radiusSq) {
            nearby.push(unit);
          }
        }
      }
    }

    return nearby;
  }

  private getKey(x: number, y: number): number {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return cellX * this.KEY_MULTIPLIER + cellY;
  }
}
