import { Colord, colord } from "colord";
import { TerrainType } from "../game/Game";
import { GameMap, TileRef } from "../game/GameMap";
import { PastelThemeDark } from "./PastelThemeDark";

/**
 * Frenzy Theme: A darker, desaturated theme for the Frenzy game mode.
 * Features muted colors with reddish/brownish tones to match the dark red UI.
 */
export class FrenzyTheme extends PastelThemeDark {
  // Dark, desaturated blue water - like a dark sea
  private frenzyWater = colord("rgb(18,28,45)");
  private frenzyShorelineWater = colord("rgb(30,40,55)");

  // Darker, desaturated shore with brownish tone
  private frenzyShore = colord("rgb(90,85,70)");

  // Override background to be darker
  private frenzyBackground = colord("rgb(25,20,20)");

  terrainColor(gm: GameMap, tile: TileRef): Colord {
    const mag = gm.magnitude(tile);
    if (gm.isShore(tile)) {
      return this.frenzyShore;
    }
    switch (gm.terrainType(tile)) {
      case TerrainType.Ocean:
      case TerrainType.Lake: {
        const w = this.frenzyWater.rgba;
        if (gm.isShoreline(tile) && gm.isWater(tile)) {
          return this.frenzyShorelineWater;
        }
        if (gm.magnitude(tile) < 10) {
          return colord({
            r: Math.max(w.r + 6 - mag, 0),
            g: Math.max(w.g + 5 - mag, 0),
            b: Math.max(w.b + 8 - mag, 0),
          });
        }
        return this.frenzyWater;
      }
      case TerrainType.Plains:
        // Darker, desaturated greens with brownish undertone
        return colord({
          r: 95 + Math.floor(mag / 3),
          g: 110 - mag,
          b: 65,
        });
      case TerrainType.Highland:
        // Darker, muted browns
        return colord({
          r: 100 + mag,
          g: 90 + mag,
          b: 70 + mag,
        });
      case TerrainType.Mountain:
        // Darker grays with slight warmth
        return colord({
          r: 120 + mag / 3,
          g: 115 + mag / 3,
          b: 110 + mag / 3,
        });
    }
  }

  backgroundColor(): Colord {
    return this.frenzyBackground;
  }
}
