📦 **FrenzyFront Patch Notes - v0.04**

🚀 **Performance**

- Major tick performance improvements for smoother gameplay
  → Optimized mine gold payouts: O(n²) → O(1) per tick with Voronoi cell caching
  → Optimized mining cell rendering: reduced expensive calculations
  → Disabled trains and railroad rendering (not used in Frenzy mode)

⚖️ **Balance Changes**

- Bots and Nations now have territory-based mine limits
  → Bots: Can build up to 2× (territory / 2500) mines
  → Nations: Can build up to 4× (territory / 2500) mines
  → Prevents AI from spamming mines and improves performance

🎮 **Single Player**

- Simplified map selection: Only Circle Map available for now
- Default bots reduced to 20 for more stable gameplay

---

📦 **FrenzyFront Patch Notes - v0.03**

⚖️ **Balance Changes**

- Artillery and Defense Post icons now larger and more visible
- Shield Generator health increased (900 → shield HP)
- Artillery damage increased (60 → 100)
- Elite Artillery and Elite Shield Generator added as tier 2 upgrades
  → Elite Artillery: 1.5x range, 1.5x damage, larger splash radius
  → Elite Shield Generator: 1.5x shield radius, 2x shield HP

🔧 **Bug Fixes**

- Fixed crystal assignment flickering when mines are destroyed
  → Crystals now properly match mines by position instead of array index
- Fixed port upgrade not working from radial menu
- Unified all tower upgrade logic for consistency

🏗️ **Code Improvements**

- New centralized structure configuration system (STRUCTURE_CONFIGS)
  → All build costs, health, upgrade costs in one place for easier balancing
- Added itch.io landing page for game distribution

---

📦 **FrenzyFront Patch Notes - v0.02**

🎨 **UI Improvements**

- New icons for Mine, Unit Factory, Harbor, Ship, and Shield Generator
  → Clearer visual distinction between structures in build menu and help modal
- Updated terminology: "City" → "Mine", "Factory" → "Unit Factory"
  → Better reflects their actual function in Frenzy mode

🔧 **Bug Fixes**

- Fixed structures spawning at wrong location after construction completes
  → Harbor and Shield Generator now correctly spawn where they were built

---

📦 **FrenzyFront Patch Notes - v0.01**

🚀 **Performance**

- Major tick performance improvement (~5x faster) by optimizing wilderness capture logic
  → Games should run much smoother, especially with many players

⚖️ **Balance Changes**

- Harbor (Port) now costs the same as Factory (100,000 gold) in Frenzy mode
  → Previously had variable cost, now fixed for consistency
- Bot count now equals (10 - number of human players)
  → Fuller games with more action when fewer humans are present

🔧 **Bug Fixes**

- HQ can no longer be upgraded beyond level 2
  → HQ upgrade option now hidden in radial menu when at max level
- Missile Silo upgrade now properly works from radial menu
  → Fixed SAM Launcher and Missile Silo not being tracked as Frenzy units

---
