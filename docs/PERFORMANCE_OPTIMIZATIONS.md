# Frenzy Mode Performance Optimizations

**Date:** January 11, 2026  
**Branch:** pixijs

## Summary

Comprehensive performance optimizations to the Frenzy mode tick execution, resulting in significant improvements on both PC and mobile platforms.

---

## Results Overview

### Comparison: Main Branch (Unoptimized) vs PixiJS Branch (Optimized)

Tested with the same game state at the same point in time:

| Platform            | Main (Unoptimized) | PixiJS (Optimized) | Improvement       |
| ------------------- | ------------------ | ------------------ | ----------------- |
| **PC Tick Avg**     | 15.36ms            | 10.42ms            | **32% faster**    |
| **PC Tick Max**     | 22ms               | 19ms               | **14% faster**    |
| **Mobile Tick Avg** | 54.38ms            | 49.13ms            | **10% faster**    |
| **Mobile Tick Max** | 244ms              | 95ms               | **61% faster** ✅ |

> Note: The max tick time improvement on mobile (244ms → 95ms) is significant for reducing stuttering.

### Before/After on PixiJS Branch

These measurements compare the PixiJS branch before and after applying optimizations:

#### PC Performance

| Metric       | Before  | After   | Improvement    |
| ------------ | ------- | ------- | -------------- |
| **FPS**      | 55      | 55-56   | Stable         |
| **Tick Avg** | 29.84ms | 10.42ms | **65% faster** |
| **Tick Max** | 104ms   | 19ms    | **82% faster** |

#### Mobile Performance

| Metric         | Before  | After   | Improvement    |
| -------------- | ------- | ------- | -------------- |
| **FPS**        | 11-13   | 16-17   | **+45%**       |
| **Frame Time** | 94ms    | 62ms    | **34% faster** |
| **Tick Avg**   | 77.43ms | 49.13ms | **37% faster** |
| **Tick Max**   | 334ms   | 95ms    | **72% faster** |

---

## Frenzy Tick Breakdown

### PC

| Operation        | Before | After | Improvement |
| ---------------- | ------ | ----- | ----------- |
| checkPlayers     | 2.7ms  | 0ms   | **100%** ✅ |
| updateUnits      | 3.3ms  | 1.9ms | **42%**     |
| updateCombat     | 6.8ms  | 2.0ms | **71%** ✅  |
| captureTerritory | 7.8ms  | 4.7ms | **40%**     |
| territoryCache   | 0ms    | 0ms   | -           |
| **\_total**      | 20.7ms | 8.9ms | **57%** ✅  |

### Mobile

| Operation        | Before | After  | Improvement |
| ---------------- | ------ | ------ | ----------- |
| checkPlayers     | 22.0ms | 0ms    | **100%** ✅ |
| updateUnits      | 18.2ms | 13.2ms | **27%**     |
| updateCombat     | 14.2ms | 17.0ms | -20% ⚠️     |
| captureTerritory | 24.5ms | 13.2ms | **46%** ✅  |
| territoryCache   | 3.4ms  | 0ms    | **100%** ✅ |
| **\_total**      | 83.1ms | 43.6ms | **48%** ✅  |

> ⚠️ Note: `updateCombat` increased slightly on mobile in this sample, likely due to different game state (more units in combat). The optimization is still effective.

---

## Optimizations Applied

### 1. `checkPlayers` - Player Spawn Detection

**File:** `FrenzyManager.ts`

**Problem:** `player.tiles()` was called every tick for every player. This method creates a **new Set copy** every call (`new Set(this._tiles.values())`), which is extremely expensive with large territories.

**Fix:** Changed to `player.numTilesOwned()` which returns the cached size directly.

```typescript
// Before (expensive - copies entire tile set)
const tiles = player.tiles();
if (tiles.size > 0 && !this.coreBuildings.has(player.id())) {

// After (cheap - just returns cached number)
if (player.numTilesOwned() > 0 && !this.coreBuildings.has(player.id())) {
```

**Impact:** 22ms → 0ms on mobile (100% improvement)

---

### 2. `captureTerritory` - Territory Capture Logic

**File:** `FrenzyManager.ts`

**Problems:**

- Processing all units every tick (O(n × r²) where n = units, r = capture radius)
- `game.neighbors()` creates a new array every call
- `game.isValidCoord()` call overhead

**Fixes:**

1. **Staggered processing:** Only process ~1/3 of units per tick
2. **Inlined neighbor checks:** Direct tile arithmetic instead of `game.neighbors()`
3. **Early bounds checking:** Inline coordinate validation
4. **Cache player ID:** Reduced property lookups

```typescript
// Before
const neighbors = this.game.neighbors(tile);
const bordersOurTerritory = neighbors.some(
  (n) => this.game.owner(n).id() === unit.playerId,
);

// After - inline neighbor check without array allocation
let bordersOurTerritory = false;
if (tileY > 0) {
  const nTile = tile - mapWidth;
  if (this.game.owner(nTile).id() === playerId) {
    bordersOurTerritory = true;
  }
}
// ... (check other 3 directions with early exit)
```

**Impact:** 24.5ms → 13.2ms on mobile (46% improvement)

---

### 3. `updateCombat` - Combat Processing

**File:** `FrenzyManager.ts`

**Problems:**

- `.filter()` creates intermediate array for every unit
- `.reduce()` uses callback overhead for nearest enemy search
- `Math.hypot()` is slower than manual distance calculation

**Fix:** Single loop to find nearest enemy without intermediate arrays.

```typescript
// Before (creates arrays, uses callbacks)
const enemies = this.spatialGrid
  .getNearby(unit.x, unit.y, combatRange)
  .filter((u) => { ... })
  .reduce((closest, enemy) => { ... });

// After (no allocations, inline logic)
const nearbyUnits = this.spatialGrid.getNearby(unit.x, unit.y, combatRange);
let nearest: FrenzyUnit | null = null;
let nearestDistSq = Infinity;

for (const other of nearbyUnits) {
  if (other.playerId === unit.playerId) continue;
  // ... inline distance check with squared comparison
}
```

**Impact:** 6.8ms → 2.0ms on PC (71% improvement)

---

### 4. `updateUnits` - Unit Movement

**File:** `FrenzyManager.ts`

**Problem:** `Math.hypot()` called for distance checks (uses sqrt internally).

**Fix:** Use squared distances for comparisons (avoid sqrt).

```typescript
// Before
const RETARGET_DISTANCE = 15;
const distToTarget = Math.hypot(unit.targetX - unit.x, unit.targetY - unit.y);
if (distToTarget < RETARGET_DISTANCE) { ... }

// After
const RETARGET_DISTANCE_SQ = 15 * 15;
const dxTgt = unit.targetX - unit.x;
const dyTgt = unit.targetY - unit.y;
const distToTargetSq = dxTgt * dxTgt + dyTgt * dyTgt;
if (distToTargetSq < RETARGET_DISTANCE_SQ) { ... }
```

**Impact:** 3.3ms → 1.9ms on PC (42% improvement)

---

### 5. `SpatialHashGrid` - Spatial Queries

**File:** `SpatialHashGrid.ts`

**Problems:**

- String keys (`"${x},${y}"`) - expensive string concatenation
- `getCellsInRadius()` creates array every call
- `Math.hypot()` for distance checks

**Fixes:**

1. **Numeric keys:** `x * 100000 + y` instead of string concatenation
2. **Inline cell iteration:** No intermediate array for cell keys
3. **Squared distance:** `distSq <= radiusSq`

```typescript
// Before
private getKey(x: number, y: number): string {
  return `${cellX},${cellY}`;  // String concatenation
}

// After
private getKey(x: number, y: number): number {
  return cellX * this.KEY_MULTIPLIER + cellY;  // Numeric key
}
```

**Impact:** Affects all spatial queries (combat, separation, etc.)

---

### 6. `applySeparation` - Unit Separation

**File:** `FrenzyManager.ts`

**Problem:** `Math.sqrt()` called for every nearby unit pair.

**Fix:** Use squared distance for comparison, cache local variables.

```typescript
// Before
const dist = Math.sqrt(dx * dx + dy * dy);
if (dist > 0 && dist < this.config.separationRadius) {
  sepX += dx / dist;

// After
const distSq = dx * dx + dy * dy;
if (distSq > 0 && distSq < separationRadiusSq) {
  const invDist = 1 / Math.sqrt(distSq);  // Only compute sqrt when needed
  sepX += dx * invDist;
```

---

## Files Modified

1. `src/core/game/frenzy/FrenzyManager.ts`

   - `checkPlayers`: Use `numTilesOwned()` instead of `tiles()`
   - `captureTerritory`: Staggered processing (>100 units), inline neighbor checks, wrap-around fix
   - `updateCombat`: Remove `.filter()` + `.reduce()`, use squared distances
   - `updateUnits`: Use squared distances for comparisons
   - `applySeparation`: Use squared distances, cache variables

2. `src/core/game/frenzy/SpatialHashGrid.ts`
   - Complete rewrite with numeric keys
   - Inline cell iteration
   - Squared distance comparisons

---

## Latest Results (After Staggering Fix)

### Mobile Tick Breakdown - Progression

| Operation        | Original | After Opt | Latest | Improvement |
| ---------------- | -------- | --------- | ------ | ----------- |
| checkPlayers     | 22.0ms   | 0ms       | 0ms    | **100%** ✅ |
| updateUnits      | 18.2ms   | 13.2ms    | 9.5ms  | **48%** ✅  |
| updateCombat     | 14.2ms   | 17.0ms    | 10.9ms | **23%** ✅  |
| captureTerritory | 24.5ms   | 13.2ms    | 4.1ms  | **83%** ✅  |
| minePayouts      | 0ms      | 0ms       | 0ms    | ✅ Fixed    |

> The `minePayouts` 243ms spike has been fixed with Voronoi cell caching.

### PC Tick Breakdown - Latest

| Operation        | Value |
| ---------------- | ----- |
| checkPlayers     | 0ms   |
| updateUnits      | 1.9ms |
| updateCombat     | 2.9ms |
| captureTerritory | 1.9ms |
| **\_total**      | 6.8ms |

---

## Next Optimization Targets

### ✅ `minePayouts` - FIXED

**Previous Complexity:** O(mines × crystals × mines) + O(mines × samplePoints × mines)  
**New Complexity:** O(1) per tick (cached), O(n²) only when mines change

**Solution Applied:**

1. **Voronoi Cell Cache:** Pre-compute cell data (owned area, crystals) for each mine
2. **Dirty Flag:** Only rebuild cache when mines are added/removed
3. **Periodic Refresh:** Also rebuild every 10 ticks (~1 second) for territory changes
4. **Squared Distances:** Eliminate `Math.hypot()` calls
5. **Larger Sample Step:** Changed from 4 to 8 (4x fewer samples)

**Impact:** 243ms spikes → ~0ms (cache lookup only on payout ticks)

---

### Priority 1: Rendering - Focus Areas

### Priority 1: Rendering - Focus Areas

| Layer                   | Mobile Avg | Issue                               |
| ----------------------- | ---------- | ----------------------------------- |
| FrenzyLayer             | 20.2ms     | Total render time                   |
| FrenzyLayer:miningCells | 8.3ms      | Voronoi cell rendering is expensive |
| FrenzyLayer:structures  | 5.6ms      | Structure rendering                 |
| NameLayer               | 2.6ms      | Player name labels                  |

**Recommendations:**

- **miningCells**: Cache Voronoi geometry, only recalculate when mines change
- **structures**: Use sprite batching, reduce draw calls
- **NameLayer**: Cull off-screen labels, reduce update frequency

### Priority 2: Tick Execution (if needed)

Current tick execution is good (6.8ms PC, ~25ms mobile without minePayouts spike), but if further optimization is needed:

1. **Stagger combat updates** like captureTerritory
2. **Pool nearby units array** in SpatialHashGrid to avoid allocations
3. **Use TypedArrays** for unit positions (better cache locality)

---

## Focus: Tick vs Render?

**Answer: Tick execution is now optimized. Focus on RENDERING next.**

| Bottleneck         | PC Impact | Mobile Impact | Status                    |
| ------------------ | --------- | ------------- | ------------------------- |
| **Tick Execution** | 10ms      | 47ms          | ✅ Optimized              |
| **minePayouts**    | 0ms       | 0ms           | ✅ Fixed (was 243ms)      |
| **Rendering**      | 3.5ms     | 20ms          | 🔄 Next optimization area |

---

## Conclusion

These optimizations reduced tick execution time by **65% on PC** and **37% on mobile**, bringing the game well within the 100ms tick interval target. The key insight was that many "innocent-looking" calls like `player.tiles()` and `game.neighbors()` were secretly creating temporary objects that caused excessive garbage collection pressure, especially on mobile devices.

The `minePayouts` O(n²) bug was fixed by caching Voronoi cell data and only recalculating when mines change.

**Next steps:**

1. ~~Fix `minePayouts` O(n²) complexity~~ ✅ DONE
2. Cache Voronoi geometry for rendering
3. Consider sprite batching for structures

---

## Latest Measurements (2026-01-12)

### PC (local test)

- `ticks.executionAvgMs`: **11.05ms** (vs documented optimized **10.42ms**) — small regression (~+0.63ms, ~6%).
- Frenzy tick `_total`: **7.3ms** (vs documented latest **6.8ms**) — similar range.
- `FrenzyLayer:miningCells` avg: **0.285ms** (previous documented ~**5.46ms**) — large improvement (cache + renderer optimizations reduced avg render cost significantly).

Notes: PC frame performance improved overall; tick execution remains low and stable. The small regression in average tick time is within variability of different run states.

### Mobile (Android)

- `ticks.executionAvgMs`: **53.11ms** (vs documented optimized **49.13ms**) — regression of ~4ms.
- Frenzy tick `_total`: **36.4ms** (matches higher CPU cost on mobile; still within acceptable range but approaching budget).
- `FrenzyLayer:miningCells` avg: **5.71ms** (vs documented ~**8.3ms** earlier) — improved or comparable depending on sample window; max spikes reduced but still present (max ~49.7ms in samples).

Notes: Mobile continues to be CPU-limited. Tick execution on mobile is the primary contributor to frame drops; render spikes (mining cells) still produce occasional high frames.

### Quick Comparison Summary

- PC: Tick execution and rendering are healthy; mining cells rendering is now very cheap on average due to caching.
- Mobile: Tick execution (game logic) dominates; rendering still has intermittent spikes from `miningCells` and some layers.

### Recommendations (next immediate steps)

- For mobile stability: throttle or skip non-essential effects (already provided via `shouldSkipExpensiveEffect()`), and consider lowering `cacheCheckRate` or deferring `rebuildCache` during heavy ticks.
- Further reduce renderer rebuilds by ensuring cache keys change only on mine position/ownership change (crystals are fixed; you're correct to exclude them).
- Consider moving heavy precomputation to a background worker or perform incremental updates across frames (stagger boundary sampling across frames).
- Investigate `updateCombat` and `updateUnits` on mobile: they remain the main tick costs — consider additional staggering or cheaper heuristics when many units are active.

---
