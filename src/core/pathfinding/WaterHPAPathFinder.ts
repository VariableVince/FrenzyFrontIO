import FastPriorityQueue from "fastpriorityqueue";

import { GameMap, TileRef } from "../game/GameMap";

export type WaterHPAOptions = {
  clusterSize?: number;
  scaleFactorToGameMap?: number;
};

type Edge = { to: number; cost: number };

type ClusterBounds = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  height: number;
};

export class WaterHPAPathFinder {
  private readonly clusterSize: number;
  private readonly scaleFactorToGameMap: number;

  private readonly clusterCols: number;
  private readonly clusterRows: number;

  private readonly nodeTile: TileRef[] = [];
  private readonly nodeCluster: number[] = [];
  private readonly edges: Edge[][] = [];

  private readonly clusterNodes: number[][];

  private constructor(
    private readonly miniMap: GameMap,
    options?: WaterHPAOptions,
  ) {
    this.clusterSize = options?.clusterSize ?? 16;
    this.scaleFactorToGameMap = options?.scaleFactorToGameMap ?? 2;

    this.clusterCols = Math.ceil(this.miniMap.width() / this.clusterSize);
    this.clusterRows = Math.ceil(this.miniMap.height() / this.clusterSize);

    this.clusterNodes = Array(this.clusterCols * this.clusterRows)
      .fill(null)
      .map(() => []);

    this.buildGraph();
  }

  static build(
    miniMap: GameMap,
    options?: WaterHPAOptions,
  ): WaterHPAPathFinder {
    return new WaterHPAPathFinder(miniMap, options);
  }

  /**
   * Find a water-only path on the mini-map.
   *
   * Returns a list of mini-map tiles including start and goal, or null.
   */
  findMiniPath(start: TileRef, goal: TileRef): TileRef[] | null {
    const startCluster = this.clusterIdForTile(start);
    const goalCluster = this.clusterIdForTile(goal);

    if (startCluster === goalCluster) {
      const within = this.findLocalPathInCluster(startCluster, start, goal);
      return within;
    }

    const startLinks = this.distancesToClusterEntrances(startCluster, start);
    if (startLinks.size === 0) {
      return null;
    }

    const goalLinks = this.distancesToClusterEntrances(goalCluster, goal);

    const startId = this.nodeTile.length;
    const goalId = this.nodeTile.length + 1;

    const getTile = (nodeId: number) => {
      if (nodeId === startId) return start;
      if (nodeId === goalId) return goal;
      return this.nodeTile[nodeId];
    };

    const getCluster = (nodeId: number) => {
      if (nodeId === startId) return startCluster;
      if (nodeId === goalId) return goalCluster;
      return this.nodeCluster[nodeId];
    };

    const heuristic = (a: number, b: number) => {
      const ta = getTile(a);
      const tb = getTile(b);
      const ax = this.miniMap.x(ta);
      const ay = this.miniMap.y(ta);
      const bx = this.miniMap.x(tb);
      const by = this.miniMap.y(tb);
      return Math.abs(ax - bx) + Math.abs(ay - by);
    };

    const open = new FastPriorityQueue<{ id: number; f: number }>(
      (a, b) => a.f < b.f,
    );

    const gScore = new Map<number, number>();
    const cameFrom = new Map<number, number>();

    gScore.set(startId, 0);
    open.add({ id: startId, f: heuristic(startId, goalId) });

    const neighbors = (nodeId: number): Edge[] => {
      if (nodeId === goalId) return [];

      if (nodeId === startId) {
        const out: Edge[] = [];
        for (const [to, cost] of startLinks.entries()) {
          out.push({ to, cost });
        }
        // Direct connect if goal is also reachable via entrances (rare).
        const direct = goalLinks.get(startId);
        if (direct !== undefined) {
          out.push({ to: goalId, cost: direct });
        }
        return out;
      }

      const out: Edge[] = [];
      for (const e of this.edges[nodeId] ?? []) {
        out.push(e);
      }

      // Dynamic edges into goal
      if (getCluster(nodeId) === goalCluster) {
        const costToGoal = goalLinks.get(nodeId);
        if (costToGoal !== undefined) {
          out.push({ to: goalId, cost: costToGoal });
        }
      }

      return out;
    };

    while (!open.isEmpty()) {
      const current = open.poll()!.id;
      if (current === goalId) {
        const nodeSequence = this.reconstructNodePath(cameFrom, goalId);
        const keyTiles = nodeSequence.map(getTile);
        return this.stitchKeyTilesToMiniPath(keyTiles);
      }

      const currentG = gScore.get(current);
      if (currentG === undefined) continue;

      for (const e of neighbors(current)) {
        const tentative = currentG + e.cost;
        const known = gScore.get(e.to);
        if (known === undefined || tentative < known) {
          cameFrom.set(e.to, current);
          gScore.set(e.to, tentative);
          open.add({ id: e.to, f: tentative + heuristic(e.to, goalId) });
        }
      }
    }

    return null;
  }

  /**
   * Convert a mini-map path to a full-res game-map path, attempting to keep waypoints on water.
   */
  miniPathToGameMap(
    gameMap: GameMap,
    miniPath: TileRef[],
    ensureWater: (tile: TileRef) => boolean,
  ): TileRef[] {
    const full: TileRef[] = [];
    for (const mt of miniPath) {
      const mapped = this.miniTileToGameWaterTile(gameMap, mt, ensureWater);
      if (mapped !== null) {
        if (full.length === 0 || full[full.length - 1] !== mapped) {
          full.push(mapped);
        }
      }
    }

    // Return waypoints only; callers can refine between waypoints if needed.
    return full;
  }

  private buildGraph() {
    const tileToNode = new Map<TileRef, number>();

    const getOrCreateNode = (tile: TileRef): number => {
      const existing = tileToNode.get(tile);
      if (existing !== undefined) return existing;

      const clusterId = this.clusterIdForTile(tile);
      const id = this.nodeTile.length;
      this.nodeTile.push(tile);
      this.nodeCluster.push(clusterId);
      this.edges.push([]);
      tileToNode.set(tile, id);
      this.clusterNodes[clusterId].push(id);
      return id;
    };

    const connect = (a: number, b: number, cost: number) => {
      this.edges[a].push({ to: b, cost });
      this.edges[b].push({ to: a, cost });
    };

    // Create entrances between adjacent clusters and connect them.
    for (let cy = 0; cy < this.clusterRows; cy++) {
      for (let cx = 0; cx < this.clusterCols; cx++) {
        // Vertical boundaries: between (cx,cy) and (cx+1,cy)
        if (cx + 1 < this.clusterCols) {
          const xA = (cx + 1) * this.clusterSize - 1;
          const xB = xA + 1;
          if (xA >= 0 && xB < this.miniMap.width()) {
            const y0 = cy * this.clusterSize;
            const y1 = Math.min(
              this.miniMap.height() - 1,
              (cy + 1) * this.clusterSize - 1,
            );

            let runStart: number | null = null;
            for (let y = y0; y <= y1; y++) {
              const a = this.miniMap.ref(xA, y);
              const b = this.miniMap.ref(xB, y);
              const ok = this.miniMap.isWater(a) && this.miniMap.isWater(b);
              if (ok && runStart === null) {
                runStart = y;
              }
              const isEnd = y === y1;
              if ((!ok || isEnd) && runStart !== null) {
                const runEnd = ok && isEnd ? y : y - 1;
                const midY = Math.floor((runStart + runEnd) / 2);
                const tileA = this.miniMap.ref(xA, midY);
                const tileB = this.miniMap.ref(xB, midY);
                const nA = getOrCreateNode(tileA);
                const nB = getOrCreateNode(tileB);
                connect(nA, nB, 1);
                runStart = null;
              }
            }
          }
        }

        // Horizontal boundaries: between (cx,cy) and (cx,cy+1)
        if (cy + 1 < this.clusterRows) {
          const yA = (cy + 1) * this.clusterSize - 1;
          const yB = yA + 1;
          if (yA >= 0 && yB < this.miniMap.height()) {
            const x0 = cx * this.clusterSize;
            const x1 = Math.min(
              this.miniMap.width() - 1,
              (cx + 1) * this.clusterSize - 1,
            );

            let runStart: number | null = null;
            for (let x = x0; x <= x1; x++) {
              const a = this.miniMap.ref(x, yA);
              const b = this.miniMap.ref(x, yB);
              const ok = this.miniMap.isWater(a) && this.miniMap.isWater(b);
              if (ok && runStart === null) {
                runStart = x;
              }
              const isEnd = x === x1;
              if ((!ok || isEnd) && runStart !== null) {
                const runEnd = ok && isEnd ? x : x - 1;
                const midX = Math.floor((runStart + runEnd) / 2);
                const tileA = this.miniMap.ref(midX, yA);
                const tileB = this.miniMap.ref(midX, yB);
                const nA = getOrCreateNode(tileA);
                const nB = getOrCreateNode(tileB);
                connect(nA, nB, 1);
                runStart = null;
              }
            }
          }
        }
      }
    }

    // Intra-cluster shortest paths between entrances.
    for (let clusterId = 0; clusterId < this.clusterNodes.length; clusterId++) {
      const nodes = this.clusterNodes[clusterId];
      if (nodes.length < 2) continue;

      const bounds = this.clusterBounds(clusterId);

      for (const sourceNodeId of nodes) {
        const sourceTile = this.nodeTile[sourceNodeId];
        const dist = this.bfsDistancesWithinBounds(bounds, sourceTile);

        for (const targetNodeId of nodes) {
          if (targetNodeId === sourceNodeId) continue;
          const targetTile = this.nodeTile[targetNodeId];
          const tx = this.miniMap.x(targetTile);
          const ty = this.miniMap.y(targetTile);
          const d = this.distFromBfs(dist, bounds, tx, ty);
          if (d !== null) {
            this.edges[sourceNodeId].push({ to: targetNodeId, cost: d });
          }
        }
      }
    }
  }

  private clusterIdForTile(tile: TileRef): number {
    const x = this.miniMap.x(tile);
    const y = this.miniMap.y(tile);
    const cx = Math.floor(x / this.clusterSize);
    const cy = Math.floor(y / this.clusterSize);
    return cy * this.clusterCols + cx;
  }

  private clusterBounds(clusterId: number): ClusterBounds {
    const cx = clusterId % this.clusterCols;
    const cy = Math.floor(clusterId / this.clusterCols);
    const x0 = cx * this.clusterSize;
    const y0 = cy * this.clusterSize;
    const x1 = Math.min(this.miniMap.width() - 1, x0 + this.clusterSize - 1);
    const y1 = Math.min(this.miniMap.height() - 1, y0 + this.clusterSize - 1);
    return {
      x0,
      y0,
      x1,
      y1,
      width: x1 - x0 + 1,
      height: y1 - y0 + 1,
    };
  }

  private distancesToClusterEntrances(
    clusterId: number,
    from: TileRef,
  ): Map<number, number> {
    const nodes = this.clusterNodes[clusterId];
    if (nodes.length === 0) return new Map();

    const bounds = this.clusterBounds(clusterId);
    const dist = this.bfsDistancesWithinBounds(bounds, from);

    const result = new Map<number, number>();
    for (const nodeId of nodes) {
      const t = this.nodeTile[nodeId];
      const x = this.miniMap.x(t);
      const y = this.miniMap.y(t);
      const d = this.distFromBfs(dist, bounds, x, y);
      if (d !== null) {
        result.set(nodeId, d);
      }
    }

    return result;
  }

  private bfsDistancesWithinBounds(
    bounds: ClusterBounds,
    start: TileRef,
  ): Int16Array {
    const w = bounds.width;
    const h = bounds.height;
    const dist = new Int16Array(w * h);
    dist.fill(-1);

    const sx = this.miniMap.x(start);
    const sy = this.miniMap.y(start);
    if (sx < bounds.x0 || sx > bounds.x1 || sy < bounds.y0 || sy > bounds.y1) {
      return dist;
    }

    const startTile = this.miniMap.ref(sx, sy);
    if (!this.miniMap.isWater(startTile)) {
      return dist;
    }

    const startIdx = (sy - bounds.y0) * w + (sx - bounds.x0);
    dist[startIdx] = 0;

    const queue = new Int32Array(w * h);
    let qh = 0;
    let qt = 0;
    queue[qt++] = startIdx;

    while (qh < qt) {
      const idx = queue[qh++];
      const d0 = dist[idx];
      const lx = idx % w;
      const ly = Math.floor(idx / w);
      const gx = bounds.x0 + lx;
      const gy = bounds.y0 + ly;

      // 4-neighborhood
      const tryPush = (nx: number, ny: number) => {
        if (
          nx < bounds.x0 ||
          nx > bounds.x1 ||
          ny < bounds.y0 ||
          ny > bounds.y1
        ) {
          return;
        }
        const local = (ny - bounds.y0) * w + (nx - bounds.x0);
        if (dist[local] !== -1) return;
        const tile = this.miniMap.ref(nx, ny);
        if (!this.miniMap.isWater(tile)) return;
        dist[local] = (d0 + 1) as number;
        queue[qt++] = local;
      };

      tryPush(gx, gy - 1);
      tryPush(gx, gy + 1);
      tryPush(gx - 1, gy);
      tryPush(gx + 1, gy);
    }

    return dist;
  }

  private distFromBfs(
    dist: Int16Array,
    bounds: ClusterBounds,
    x: number,
    y: number,
  ): number | null {
    if (x < bounds.x0 || x > bounds.x1 || y < bounds.y0 || y > bounds.y1) {
      return null;
    }
    const idx = (y - bounds.y0) * bounds.width + (x - bounds.x0);
    const d = dist[idx];
    return d >= 0 ? d : null;
  }

  private findLocalPathInCluster(
    clusterId: number,
    start: TileRef,
    goal: TileRef,
  ): TileRef[] | null {
    const bounds = this.clusterBounds(clusterId);
    return this.bfsPathWithinBounds(bounds, start, goal);
  }

  private bfsPathWithinBounds(
    bounds: ClusterBounds,
    start: TileRef,
    goal: TileRef,
  ): TileRef[] | null {
    const w = bounds.width;
    const h = bounds.height;

    const sx = this.miniMap.x(start);
    const sy = this.miniMap.y(start);
    const gx = this.miniMap.x(goal);
    const gy = this.miniMap.y(goal);

    if (
      sx < bounds.x0 ||
      sx > bounds.x1 ||
      sy < bounds.y0 ||
      sy > bounds.y1 ||
      gx < bounds.x0 ||
      gx > bounds.x1 ||
      gy < bounds.y0 ||
      gy > bounds.y1
    ) {
      return null;
    }

    const startTile = this.miniMap.ref(sx, sy);
    const goalTile = this.miniMap.ref(gx, gy);
    if (!this.miniMap.isWater(startTile) || !this.miniMap.isWater(goalTile)) {
      return null;
    }

    const dist = new Int16Array(w * h);
    const prev = new Int32Array(w * h);
    dist.fill(-1);
    prev.fill(-1);

    const startIdx = (sy - bounds.y0) * w + (sx - bounds.x0);
    const goalIdx = (gy - bounds.y0) * w + (gx - bounds.x0);

    dist[startIdx] = 0;

    const queue = new Int32Array(w * h);
    let qh = 0;
    let qt = 0;
    queue[qt++] = startIdx;

    while (qh < qt) {
      const idx = queue[qh++];
      if (idx === goalIdx) break;

      const lx = idx % w;
      const ly = Math.floor(idx / w);
      const cx = bounds.x0 + lx;
      const cy = bounds.y0 + ly;

      const d0 = dist[idx];

      const tryPush = (nx: number, ny: number) => {
        if (
          nx < bounds.x0 ||
          nx > bounds.x1 ||
          ny < bounds.y0 ||
          ny > bounds.y1
        ) {
          return;
        }
        const local = (ny - bounds.y0) * w + (nx - bounds.x0);
        if (dist[local] !== -1) return;
        const tile = this.miniMap.ref(nx, ny);
        if (!this.miniMap.isWater(tile)) return;
        dist[local] = (d0 + 1) as number;
        prev[local] = idx;
        queue[qt++] = local;
      };

      tryPush(cx, cy - 1);
      tryPush(cx, cy + 1);
      tryPush(cx - 1, cy);
      tryPush(cx + 1, cy);
    }

    if (dist[goalIdx] === -1) return null;

    const reversed: TileRef[] = [];
    let cur = goalIdx;
    while (cur !== -1) {
      const lx = cur % w;
      const ly = Math.floor(cur / w);
      const x = bounds.x0 + lx;
      const y = bounds.y0 + ly;
      reversed.push(this.miniMap.ref(x, y));
      if (cur === startIdx) break;
      cur = prev[cur];
    }

    reversed.reverse();
    return reversed;
  }

  private reconstructNodePath(cameFrom: Map<number, number>, goalId: number) {
    const path: number[] = [goalId];
    let current = goalId;
    while (cameFrom.has(current)) {
      current = cameFrom.get(current)!;
      path.unshift(current);
    }
    return path;
  }

  private stitchKeyTilesToMiniPath(keyTiles: TileRef[]): TileRef[] | null {
    if (keyTiles.length === 0) return null;

    const stitched: TileRef[] = [keyTiles[0]];

    for (let i = 0; i < keyTiles.length - 1; i++) {
      const a = keyTiles[i];
      const b = keyTiles[i + 1];

      const ax = this.miniMap.x(a);
      const ay = this.miniMap.y(a);
      const bx = this.miniMap.x(b);
      const by = this.miniMap.y(b);

      const manhattan = Math.abs(ax - bx) + Math.abs(ay - by);
      if (manhattan === 1) {
        stitched.push(b);
        continue;
      }

      const cluster = this.clusterIdForTile(a);
      if (cluster !== this.clusterIdForTile(b)) {
        return null;
      }

      const local = this.findLocalPathInCluster(cluster, a, b);
      if (!local) return null;

      for (let j = 1; j < local.length; j++) {
        stitched.push(local[j]);
      }
    }

    return stitched;
  }

  private miniTileToGameWaterTile(
    gameMap: GameMap,
    miniTile: TileRef,
    ensureWater: (tile: TileRef) => boolean,
  ): TileRef | null {
    const mx = this.miniMap.x(miniTile);
    const my = this.miniMap.y(miniTile);

    const baseX = mx * this.scaleFactorToGameMap;
    const baseY = my * this.scaleFactorToGameMap;

    const candidates: Array<{ x: number; y: number }> = [
      { x: baseX, y: baseY },
      { x: baseX + 1, y: baseY },
      { x: baseX, y: baseY + 1 },
      { x: baseX + 1, y: baseY + 1 },
    ];

    for (const c of candidates) {
      if (!gameMap.isValidCoord(c.x, c.y)) continue;
      const t = gameMap.ref(c.x, c.y);
      if (ensureWater(t)) return t;
    }

    // Fallback: small radius search.
    for (let r = 1; r <= 2; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = baseX + dx;
          const y = baseY + dy;
          if (!gameMap.isValidCoord(x, y)) continue;
          const t = gameMap.ref(x, y);
          if (ensureWater(t)) return t;
        }
      }
    }

    return null;
  }
}
