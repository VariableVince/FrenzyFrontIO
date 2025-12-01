import { FrenzyUnit } from "./FrenzyTypes";

/**
 * Spatial hash grid for efficient nearest neighbor queries
 * Divides space into cells and allows O(1) lookups of nearby units
 */
export class SpatialHashGrid {
  private grid: Map<string, FrenzyUnit[]> = new Map();

  constructor(private cellSize: number = 50) {}

  clear() {
    this.grid.clear();
  }

  insert(unit: FrenzyUnit) {
    const key = this.getKey(unit.x, unit.y);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key)!.push(unit);
  }

  getNearby(x: number, y: number, radius: number): FrenzyUnit[] {
    const nearby: FrenzyUnit[] = [];
    const cells = this.getCellsInRadius(x, y, radius);

    for (const key of cells) {
      const units = this.grid.get(key) ?? [];
      for (const unit of units) {
        const dist = Math.hypot(unit.x - x, unit.y - y);
        if (dist <= radius) {
          nearby.push(unit);
        }
      }
    }

    return nearby;
  }

  private getKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  private getCellsInRadius(x: number, y: number, radius: number): string[] {
    const cells: string[] = [];
    const minCellX = Math.floor((x - radius) / this.cellSize);
    const maxCellX = Math.floor((x + radius) / this.cellSize);
    const minCellY = Math.floor((y - radius) / this.cellSize);
    const maxCellY = Math.floor((y + radius) / this.cellSize);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        cells.push(`${cx},${cy}`);
      }
    }

    return cells;
  }
}
