📦 **FrenzyFront Patch Notes - v0.10**

⚔️ **Battle Optimizations**

- Major combat performance improvements for Frenzy unit battles
- Added/expanded combat caching (including shield coverage caching) to reduce repeated heavy calculations
- Improved combat/movement update performance and stabilized hot-path scratch array usage
- Added Frenzy performance breakdown overlay metrics to better track tick-time behavior

🧭 **Pathfinding**

- Added HPA pathfinding integration for Frenzy movement
- Added pathfinding tick counters/metrics for tuning and debugging
- Improved unit routing behavior and movement consistency under heavy load

🗺️ **Maps & Rotation**

- Public lobby rotation updated: removed Giant World Map
- Public lobby rotation now uses Europe Classic (replacing Europe)
- Europe Classic now uses the same world-style crystal distribution method as World map
- World-style map tuning and spawn/crystal distribution improvements

🔧 **Additional Fixes**

- Fixed Frenzy nuke launch source selection: nukes now launch from the nearest eligible silo (with cooldown/tier checks)

---

📦 **FrenzyFront Patch Notes - v0.09**

🎮 **Public Lobby Join Reliability**

- Fixed: Joining the public lobby now registers faster, so you can reliably pick a spawn before the game starts
- Improved: “Start Now” is briefly locked right after joining (and after map change auto-rejoin) to prevent starting while a join is still in-flight
- Improved: Public lobby player list updates more quickly

🔧 **Technical**

- Cosmetics are disabled (no cosmetics fetch/validation on join)
- Late joiners during the preload window now receive the map prestart message

---

📦 **FrenzyFront Patch Notes - v0.08**

💥 **Nuke Structure Damage**

- Nukes now damage Frenzy structures (buildings and towers)
- Atom Bomb: 500 damage to structures in blast radius
- Hydrogen Bomb: 1000 damage to structures in blast radius

🛡️ **Defensive Stance Fix**

- Fixed: Units no longer stack on top of each other when in defensive stance
- Each unit now spreads out with a unique offset around the defense target

✈️ **Airport & Transporter Fixes**

- Fixed: Airports now properly rebuild transporters after the transporter is destroyed
- Fixed: Selling airports now works correctly (refunds gold and removes transporter)

🤖 **AI Improvements**

- FakeHuman nations now upgrade ALL mines, factories, and ports (not just one of each)
- Bots and FakeHumans now only accept alliances from players with more territory
- When rejecting alliance requests, they send the 🤡 emoji

---

📦 **FrenzyFront Patch Notes - v0.07**

✈️ **New Unit: Transporter**

- **Airport**: Build airports to deploy Transporters (1 min rebuild time after each launch)
- **Transporter**: Flying unit that carries troops across land to enemy territory
  → Select an enemy territory to deploy - Transporter flies there automatically
  → Carries troops based on your total population (more troops = bigger army)
  → When it lands, it spawns a **Mini HQ** and captures surrounding territory
- **Mini HQ**: Temporary base that captures territory and prevents annexation
  → Territory containing HQ or Mini HQ cannot be surrounded and annexed
  → Mini HQ decays over time but buys crucial time for reinforcements

🛡️ **Annexation Protection**

- Territory containing your HQ or Mini HQ can no longer be annexed (surrounded and captured)
- This protects your base from being cut off and instantly lost

🎮 **Lobby Fix**

- Fixed: Start button now shows "Connecting..." until player registration completes
- Prevents issues when rapidly clicking Start before fully connected

📖 **Help Modal Updates**

- Added Airport and Transporter to the instructions modal
- Fixed Warship description (removed incorrect reference to transport)
- Reordered table: buildings with units first, then towers, then nukes

---

📦 **FrenzyFront Patch Notes - v0.06**

🎮 **Lobby Controls**

- **Map Rotation**: Players can now change the map from the lobby using left/right arrows
- **Start Now**: New button to start the game immediately (no more waiting!)
- Map changes are locked in the last 10 seconds before game start to protect waiting players

🖼️ **Loading Screen**

- Map-specific loading screen images for Circle Map and Square Map
- Added map copyright text display during loading

🎵 **Music**

- Added 4 new background music tracks for in-game
- Music plays in shuffled random order during gameplay
- Menu music remains the same familiar track

⚖️ **Balance Changes**

- **Warship**: Range increased 45 → 50 (better shore bombardment)
- **Elite Defense Post**: Range increased 37.5 → 50 (stronger tier 2)
- **Shield Generator**: Shield HP increased 900 → 1500 (more durable)
- **Elite Shield Generator**: Shield HP increased 2000 → 3000 (more durable)

🔧 **Technical**

- Various stability improvements

---

📦 **FrenzyFront Patch Notes - v0.05**

🗺️ **New Map: Square Map**

- Added Square Map to the rotation (alternates with Circle Map)
- New mechanic: No spawn protection zones - combat starts immediately!
- Faster-paced gameplay with more aggressive early-game strategies

🏗️ **Building Improvements**

- **HP & Energy Bars**: Buildings now display health and energy bars for better visibility
- **Sell Buildings**: New ability to sell structures for 50% refund of total build cost
  → Access via radial menu or hotkey
  → Great for repositioning defenses or recovering resources

🎮 **UI Improvements**

- Redesigned "Join Next Game" button with player names and participant breakdown
  → Shows player tags when ≤8 players are waiting
  → Displays players (blue), bots (orange), nations (purple) counts
- Radial menu restructured for easier navigation
- Hotkey fixes for more reliable keyboard controls
- Reordered help modal: Frenzy basics and build menu now appear first
- Increased account and flag button sizes for better visibility
- Changed default flag from "None" to UN flag

⚖️ **Balance Changes**

- **Missile Silo**: Build cost reduced 1,000,000 → 200,000 (more accessible)
- **Missile Silo**: Upgrade cost increased 100,000 → 400,000 (tier 2 nuke is premium)
- **SAM Launcher**: Build cost reduced 1,500,000 → 150,000 (anti-nuke defense more viable)
- **SAM Launcher**: Construction time reduced 30s → 10s
- **Defense Post**: Build cost increased 25,000 → 35,000 (less spam, more strategic)
- **Defense Post**: Range increased 25 → 30, projectile damage increased 15 → 20
- **Mine**: Construction time increased 2s → 5s (more commitment to build)

🔧 **Bug Fixes**

- Fixed attack ratio showing "troops" instead of "units" in Frenzy mode
- Fixed SAM launchers incorrectly attacking ground units (now only targets nukes)
- Fixed missile silos attacking ground units (now only manual nuke launches)
- Fixed hydrogen bombs not recognizing tier 2 silos in Frenzy mode
- Removed duplicate structure placement checks (validation now only in canBuild)

🔒 **Hidden Features** (temporary while player base is small)

- Create Lobby button hidden
- Join Private Lobby button hidden
- Single Player button hidden

---

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
