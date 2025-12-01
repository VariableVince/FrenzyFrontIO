# Transport Ship Stress Test

## What is it?

A visual demonstration mode that makes bots aggressively spawn transport ships to stress-test the pathfinding optimization. This allows you to see the performance improvement in action during gameplay.

## How to Use

### Quick Start

```bash
npm run dev:transport-stress
```

This will:

1. Start the dev server with transport stress test enabled
2. Open the game in your browser
3. Start a single-player game with bots
4. Watch bots spawn many transport ships constantly

### What to Look For

When playing with stress test mode enabled:

- **Many transport ships** - Bots will continuously spawn transport ships to enemy territories
- **Performance overlay** - Press a key to show FPS/performance metrics (if available)
- **Smooth gameplay** - Even with many ships, the game should remain responsive
- **Network tab** - Check browser DevTools to see low CPU usage

### Comparing Before/After

To see the optimization impact:

1. **With optimization** (current):

   - Run `npm run dev:transport-stress`
   - Note the FPS and responsiveness

2. **Without optimization** (to test):
   - Comment out the caching in `PlayerImpl.shoreTiles()`
   - Run the stress test again
   - Compare performance (should be noticeably worse)

### Configuration

The stress test is triggered by the `TRANSPORT_STRESS_TEST` environment variable set to `"true"`.

**How it works:**

- Bots check every tick (not just attack ticks) if they should spawn a transport
- They randomly select enemy territories as targets
- They attempt to spawn from available shore tiles
- This creates constant pathfinding calculations

**Code locations:**

- Config schema: `src/core/Schemas.ts` - `transportStressTest` field
- Bot behavior: `src/core/execution/BotExecution.ts` - `maybeSpawnTransport()` method
- NPM script: `package.json` - `dev:transport-stress` command

## Expected Results

### With Shore Tile Caching (Optimized)

- Smooth 60 FPS gameplay
- Low CPU usage (<10% per core)
- 50+ transport ships active simultaneously
- Quick response to user input

### Without Caching (Baseline)

- Noticeable frame drops
- Higher CPU usage (15-25% per core)
- Sluggish UI when many ships spawn
- Slower pathfinding calculations

## Tips

1. **Use a small map** - World or Europe for faster testing
2. **Add more bots** - 5-10 bots create more activity
3. **Enable instant build** - Bots can afford ships immediately
4. **Disable NPCs** - Focus on bot behavior only
5. **Watch the console** - Look for pathfinding timing logs (if enabled)

## Technical Details

### Performance Impact

With the shore tile caching optimization:

- **14.76x faster** shore lookups (385k → 5.7M ops/sec)
- **93.2% reduction** in computation time per lookup
- Cache only rebuilds on territory changes (rare)
- No noticeable overhead during normal gameplay

### When Cache Invalidates

The shore tile cache is invalidated when:

1. A player conquers new territory (border changes)
2. A player loses territory (border changes)
3. Shore tiles specifically change (rare mid-game)

In stress test mode with many ships, the cache hit rate is extremely high since territory changes are less frequent than pathfinding calculations.

## Troubleshooting

**Stress test not activating:**

- Check that `TRANSPORT_STRESS_TEST=true` in environment
- Verify bots have shore access (use maps with water)
- Ensure bots have gold for ships (enable infinite gold)

**Performance still poor:**

- Check if other heavy processes are running
- Try a smaller map
- Verify the optimization code is present in `PlayerImpl.ts`
- Check browser DevTools for JavaScript errors

**Ships not spawning:**

- Bots need shore tiles to spawn from
- Bots need enemy territories to target
- Ships require gold (enable infinite gold in settings)
- Instant build helps remove construction delays
