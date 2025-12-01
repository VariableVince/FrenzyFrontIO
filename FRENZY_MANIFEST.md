# Frenzy Mode: Strategic Unit-Based Warfare

## Overview

Transform OpenFront into a continuous RTS inspired by Supreme Commander's strategic view. Units are represented as icons flowing across the map, engaging in automatic combat at borders. Territory boundaries shift dynamically based on unit presence and combat outcomes.

## Design Philosophy

- **Mobile-First**: Touch-friendly, no micromanagement
- **Strategic Icons**: Units shown as simple NATO-style symbols (not detailed sprites)
- **Continuous Movement**: Units move smoothly across the map, not tile-to-tile
- **Flowing Borders**: Territory boundaries shift organically based on unit control
- **Indirect Control**: Players command nations/alliances, not individual units
- **Performance**: Optimize for 100+ units on screen with minimal overhead

## Core Mechanics

### 1. Core Building System

- **Spawn Location**: Each player/bot/nation starts with one Core Building at their spawn position
- **Visual**: City icon (existing asset) with team color
- **Functionality**:
  - Automatically spawns units at fixed intervals (e.g., every 3-5 seconds)
  - Indestructible spawn point
  - Cannot be captured, only surrounded/contested
  - Production continues as long as building has territory connection

### 2. Unit Spawning

- **Spawn Rate**: Continuous production (one unit every 3-5 seconds)
- **Spawn Location**: Units appear at Core Building position with slight random offset
- **Auto-Deploy**: Units immediately begin moving toward nearest border
- **Spawn Cap**: Maximum units per player (e.g., 50) to control performance
- **Queue Visualization**: Show spawn progress on Core Building

### 3. Strategic Unit System

- **Visual Representation**:
  - Small NATO-style icon (triangle, diamond, square)
  - Team color fill
  - Smooth movement animation
  - Size: 10-15px (clearly visible but not cluttering)
  - No individual health bars (performance)
- **Unit Properties**:
  - Health: 100 HP (internal, not displayed individually)
  - Movement Speed: 20-30 pixels per second
  - Combat Strength: Damage output per second
  - Influence Radius: Area where unit exerts territorial control (15-20px)

### 4. Continuous Movement & Flow

- **Pathfinding**:
  - Units flow toward nearest enemy border
  - Avoid clustering (soft repulsion from nearby friendly units)
  - Navigate around obstacles using simplified A\* or flow fields
  - Move along territorial gradient (toward contested areas)
- **Formation**:
  - Natural spreading along borders
  - Density-based positioning (units space out automatically)
  - No rigid formations, organic flow

### 5. Flowing Territory System

- **Border Calculation**:
  - Territory determined by unit presence, not discrete tile ownership
  - Voronoi-style influence zones from units
  - Border shifts continuously as units move
  - Smooth interpolation for visual appeal
- **Control Mechanics**:
  - Area controlled = sum of unit influence radii
  - Contested zones: overlapping enemy influence causes combat
  - Territory color gradient at borders (blend between team colors)
  - Percentage calculated from total controlled area

### 6. Automatic Combat

- **Engagement**:
  - Units automatically engage when influence zones overlap
  - Damage dealt continuously while in combat range
  - No attack animations (just health deduction)
  - Visual: Simple flash/glow effect on engaged units
- **Combat Resolution**:
  - DPS-based: Each unit deals damage per second to nearby enemies
  - Range: ~20-30px engagement distance
  - Multiple units focus fire on nearest enemy
  - Dead units fade out and respawn at Core Building
- **Border Warfare**:
  - Battles naturally occur at territory boundaries
  - Stronger force pushes border forward
  - Weaker force retreats or is eliminated
  - Territory follows the "front line" of surviving units

## Indirect Control System

### Player Commands (High-Level)

- **Set Nation Stance**: Attack, Defend, or Neutral toward specific nation
- **Alliance Control**:
  - Donate units to allies (units transfer to ally's control)
  - Coordinate attacks (allied units prioritize same targets)
  - Request assistance (allies send units to your borders)
- **Strategic Focus**:
  - Aggressive: Units push deeper into enemy territory
  - Balanced: Units maintain current borders
  - Defensive: Units fall back toward Core Building

### Mobile-Friendly UI

- **Touch Targets**: Large, easily tappable buttons
- **Nation Selection**: Tap enemy nation flag to set attack stance
- **Swipe to Pan**: Natural map navigation
- **Pinch to Zoom**: Standard mobile zoom
- **Minimal UI**: Only essential info visible
- **Strategic View Toggle**: Hide/show unit icons for clarity

## Technical Architecture

### New Data Structures

```typescript
// Unit representation (lightweight)
interface Unit {
  id: number; // Simple numeric ID for performance
  playerId: PlayerId;
  x: number; // Continuous pixel coordinates
  y: number;
  vx: number; // Velocity vector
  vy: number;
  health: number;
  targetX: number; // Where unit is heading
  targetY: number;
}

// Core Building
interface CoreBuilding {
  playerId: PlayerId;
  x: number; // Pixel coordinates
  y: number;
  spawnTimer: number; // Time until next spawn
  spawnInterval: number; // Seconds between spawns
  unitCount: number; // Current units owned by this player
}

// Territory influence (for rendering borders)
interface TerritoryInfluence {
  playerId: PlayerId;
  points: Array<{ x: number; y: number; strength: number }>;
}

// Game State additions
interface FrenzyGameState {
  // ... existing OpenFront fields
  units: Unit[]; // Flat array for performance
  coreBuildings: Map<PlayerId, CoreBuilding>;
  territoryInfluence: Map<PlayerId, TerritoryInfluence>;
  playerStances: Map<PlayerId, Map<PlayerId, Stance>>; // player -> target -> stance
}

enum Stance {
  ATTACK = "ATTACK",
  DEFEND = "DEFEND",
  NEUTRAL = "NEUTRAL",
}

interface FrenzyConfig {
  spawnInterval: number; // 3-5 seconds
  maxUnitsPerPlayer: number; // 50-100 units
  unitHealth: number; // 100 HP
  unitSpeed: number; // 25 pixels/second
  unitDamage: number; // 10 DPS
  engagementRange: number; // 25 pixels
  influenceRadius: number; // 20 pixels (for territory control)
  combatRadius: number; // 30 pixels (for damage dealing)
}
```

### Core Systems

#### 1. Unit Management System

```typescript
class UnitManager {
  private units: Unit[] = [];
  private spatialGrid: SpatialHashGrid; // For efficient collision/combat detection

  update(deltaTime: number) {
    // Update all units in single pass
    for (const unit of this.units) {
      this.updateUnitMovement(unit, deltaTime);
      this.updateUnitCombat(unit, deltaTime);
    }

    // Remove dead units
    this.units = this.units.filter((u) => u.health > 0);
  }

  updateUnitMovement(unit: Unit, dt: number) {
    // Flow field pathfinding toward enemy borders
    const target = this.findNearestBorder(unit);
    const dir = normalize({ x: target.x - unit.x, y: target.y - unit.y });

    // Apply separation from nearby friendlies
    const separation = this.calculateSeparation(unit);

    // Blend target direction with separation
    unit.vx = lerp(dir.x, separation.x, 0.3);
    unit.vy = lerp(dir.y, separation.y, 0.3);

    // Update position
    unit.x += unit.vx * unit.speed * dt;
    unit.y += unit.vy * unit.speed * dt;
  }

  updateUnitCombat(unit: Unit, dt: number) {
    // Find nearby enemies using spatial hash
    const enemies = this.spatialGrid.getNearby(unit.x, unit.y, COMBAT_RADIUS);

    if (enemies.length > 0) {
      // Deal damage to nearest enemy
      const nearest = enemies[0];
      nearest.health -= unit.damage * dt;
    }
  }
}
```

#### 2. Territory Rendering System

```typescript
class TerritoryRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  render(units: Unit[], players: Player[]) {
    // Clear previous frame
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Method 1: Influence-based (simpler, better performance)
    this.renderInfluenceZones(units, players);

    // Method 2: Voronoi diagram (prettier, more expensive)
    // this.renderVoronoiBorders(units, players);
  }

  renderInfluenceZones(units: Unit[], players: Player[]) {
    // Create influence map
    const influenceMap = new Float32Array(
      this.canvas.width * this.canvas.height,
    );
    const ownerMap = new Uint8Array(this.canvas.width * this.canvas.height);

    // Each unit adds influence in radius
    for (const unit of units) {
      this.addInfluence(influenceMap, ownerMap, unit);
    }

    // Render colored territory
    const imageData = this.ctx.createImageData(
      this.canvas.width,
      this.canvas.height,
    );
    for (let i = 0; i < influenceMap.length; i++) {
      if (influenceMap[i] > 0) {
        const player = players[ownerMap[i]];
        const alpha = Math.min(255, influenceMap[i] * 100);
        imageData.data[i * 4] = player.color.r;
        imageData.data[i * 4 + 1] = player.color.g;
        imageData.data[i * 4 + 2] = player.color.b;
        imageData.data[i * 4 + 3] = alpha;
      }
    }

    this.ctx.putImageData(imageData, 0, 0);
  }
}
```

#### 3. Spatial Hash Grid (Performance)

```typescript
class SpatialHashGrid {
  private cellSize: number = 50; // pixels
  private grid: Map<string, Unit[]> = new Map();

  insert(unit: Unit) {
    const key = this.getKey(unit.x, unit.y);
    if (!this.grid.has(key)) this.grid.set(key, []);
    this.grid.get(key)!.push(unit);
  }

  getNearby(x: number, y: number, radius: number): Unit[] {
    const nearby: Unit[] = [];
    const cells = this.getCellsInRadius(x, y, radius);

    for (const key of cells) {
      const units = this.grid.get(key) || [];
      for (const unit of units) {
        const dist = Math.hypot(unit.x - x, unit.y - y);
        if (dist <= radius) nearby.push(unit);
      }
    }

    return nearby;
  }

  private getKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }
}
```

## Performance Optimizations

### For 100+ Units on Mobile

1. **Spatial Hashing**: O(1) nearest neighbor queries
2. **Fixed Timestep**: Consistent simulation at 30 FPS
3. **Object Pooling**: Reuse unit objects instead of creating/destroying
4. **Batch Rendering**: Draw all units of same type in one draw call
5. **LOD System**:
   - Close zoom: Show all units
   - Far zoom: Merge nearby units into clusters
   - Very far: Show density heatmap only
6. **Lazy Territory Calculation**: Update borders every 100ms, not every frame
7. **Web Workers**: Run combat simulation in separate thread
8. **Canvas vs WebGL**: Use Canvas for <200 units, WebGL for more

### Network Optimization

- **Delta Compression**: Only send unit position changes
- **Interpolation**: Smooth out network lag client-side
- **Snapshot Rate**: 10-20 updates/second (not 60)
- **Interest Management**: Only sync visible units to each client

## Configuration

```typescript
const FRENZY_CONFIG = {
  // Core spawning
  spawnInterval: 4.0, // seconds between spawns
  maxUnitsPerPlayer: 60, // hard cap for performance
  startingUnits: 5, // units at game start

  // Unit stats
  unitHealth: 100,
  unitSpeed: 25, // pixels per second
  unitDPS: 15, // damage per second

  // Influence & Combat
  influenceRadius: 18, // pixels of territorial control
  combatRange: 25, // pixels to deal damage
  separationRadius: 10, // personal space from friendlies

  // Rendering
  unitIconSize: 12, // pixels
  showUnitsMaxCount: 200, // above this, use clustering
  borderUpdateInterval: 100, // ms between territory recalc

  // Win condition (unchanged from classic)
  winPercentage: 0.7, // 70% territory to win

  // Mobile
  minTapTargetSize: 44, // pixels for touch targets
  doubleTapZoom: true,
  swipeToCommand: false, // maybe future feature
};
```

## Implementation Phases

### Phase 1: Foundation ✅ COMPLETED (Dec 1, 2025)

- [x] Create `FrenzyManager` class with unit/building management
- [x] Spawn Core Buildings at player start positions
- [x] Implement basic unit spawning (spawn timer with configurable intervals)
- [x] Render units as simple strategic icons (triangles)
- [x] Units move toward map center with separation logic
- [x] Spatial hash grid for efficient collision detection
- [x] Proximity-based combat system (DPS)
- [x] Death and respawn mechanics
- [x] Add `GameMode.Frenzy` enum value
- [x] Integrate FrenzyManager into GameImpl tick loop
- [x] Create FrenzyLayer renderer with test marker

**Files Created:**

- `src/core/game/frenzy/FrenzyTypes.ts` - Type definitions
- `src/core/game/frenzy/FrenzyManager.ts` - Core game logic
- `src/core/game/frenzy/SpatialHashGrid.ts` - Performance optimization
- `src/client/graphics/layers/FrenzyLayer.ts` - Rendering layer

**Current State:**

- Units are being simulated (spawning, moving, fighting)
- Core buildings track spawn timers
- Spatial grid optimizes collision/combat queries
- Renderer shows test marker (ready to visualize units/buildings)

**Next:** Wire up renderer to display actual units and core buildings

### Phase 2: Movement & Pathfinding (In Progress)

- [x] Implement spatial hash grid
- [x] Unit separation (avoid clustering)
- [ ] Flow field pathfinding toward enemy territory
- [ ] Collision with map obstacles (water, mountains)
- [ ] Smooth camera follow for mobile

### Phase 3: Territory System (Week 2)

- [ ] Calculate territory from unit influence
- [ ] Render flowing borders (influence zones)
- [ ] Territory percentage calculation
- [ ] Win condition integration
- [ ] Border color blending for contested areas

### Phase 4: Combat (Week 2-3)

- [x] Proximity-based combat detection
- [x] Deal damage to nearby enemies
- [x] Unit death and respawn at Core
- [ ] Visual combat effects (flashes, glows)
- [ ] Balance unit stats

### Phase 5: Indirect Control (Week 3)

- [ ] Nation stance UI (Attack/Defend/Neutral)
- [ ] Attack orders affect unit targeting
- [ ] Alliance commands (donate, coordinate)
- [ ] Strategic focus (Aggressive/Balanced/Defensive)
- [ ] Mobile touch controls

### Phase 6: Polish & Optimization (Week 4)

- [ ] LOD system for unit rendering
- [ ] Performance profiling and optimization
- [ ] Network synchronization
- [ ] Sound effects (spawn, combat, death)
- [ ] Tutorial/onboarding
- [ ] Balance testing with bots

## Visual Design

### Unit Icons

```
Infantry (default): ▲ (triangle pointing up)
Sizes:
- Normal zoom: 12px
- Zoomed in: 16px
- Zoomed out: 8px or cluster
Colors: Player team color
Stroke: 1px black outline for visibility
```

### Core Building

```
Icon: 🏛️ (city/capitol existing asset)
Size: 24px (2x unit size)
Glow: Pulsing team color
Spawn indicator: Ring fills up as spawn timer progresses
```

### Territory Borders

```
Solid area: Semi-transparent team color (alpha: 0.3)
Border line: 2px stroke in team color (alpha: 0.8)
Contested zones: Blended colors, wavy border
```

### Combat Effects

```
Engaged unit: Red outline pulse
Damage dealt: Small white flash
Unit death: Fade out animation (300ms)
Unit spawn: Fade in + expand animation (200ms)
```

### Mobile UI

```
Top bar: Territory % + Unit count
Bottom right: Nation selection wheel (tap to expand)
Bottom left: Strategic focus toggle
Minimap: Optional overlay (toggle button)
```

## Open Questions & Decisions

### Answered:

✓ Unit control: Indirect via nation stances
✓ Win condition: Territory % (same as classic)
✓ Visual style: Strategic icons (Supreme Commander style)
✓ Movement: Continuous, not tile-based
✓ Mobile support: Required

### Still To Decide:

1. **Unit Variety**: Single unit type or introduce variants later (fast scouts, heavy tanks)?
2. **Resource System**: Pure time-based spawning or add resource collection?
3. **Building Types**: Only Core or add secondary structures (barracks, factories)?
4. **Terrain Effects**: Should mountains/forests affect combat or movement?
5. **Fog of War**: Hide unscouted areas or full visibility?
6. **Bot AI**: How do bots decide where to attack? (probably expand toward center/enemies)
7. **Alliances in Frenzy**: Keep same alliance mechanics as classic mode?

## Compatibility with Classic Mode

### Shared Systems:

- Map loading and terrain
- Player/nation management
- Alliance system
- Win condition (territory %)
- Network infrastructure (with extensions)

### Mode-Specific:

- Game loop: Classic = spreading, Frenzy = unit simulation
- Rendering: Classic = tile colors, Frenzy = flowing borders + unit icons
- Input: Classic = attack buttons, Frenzy = stance controls
- State: Classic = tile ownership, Frenzy = unit positions + influence

### Proposal:

- Add `gameMode: "classic" | "frenzy"` to game settings
- Branch game loop based on mode
- Share 90% of codebase, mode-specific logic in separate classes
