import { UnitType } from "../../core/game/Game";

// Defensive stance levels:
// 0 = Units stay close to HQ
// 0.5 = Medium defensive - units stay in fire range of border
// 1 = Offensive - units move to border (current behavior)
export type DefensiveStance = number;

export interface UIState {
  attackRatio: number;
  defensiveStance: DefensiveStance;
  ghostStructure: UnitType | null;
}
