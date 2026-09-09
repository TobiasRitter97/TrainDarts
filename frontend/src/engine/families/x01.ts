// 1:1-Port von backend/games/x01.py (Phase C des Client-Rewrites,
// siehe ~/.claude/plans/agile-brewing-wadler.md). x01-Familie
// (aktuell: "170").
import { applyCountdownThrow, CheckoutMode, CountdownResult, Segment } from "../scoring";

export const STARTING_SCORE = 170;

export type X01PlayerState = {
  score: number;
  legsWon: number;
  setsWon: number;
  highestCheckout: number;
};

export function createPlayerState(): X01PlayerState {
  return { score: STARTING_SCORE, legsWon: 0, setsWon: 0, highestCheckout: 0 };
}

export function applyThrow(
  playerState: X01PlayerState,
  visitThrows: Segment[],
  settings: Record<string, unknown>
): CountdownResult {
  const checkoutMode = (settings.checkoutMode as CheckoutMode) ?? "double_out";
  return applyCountdownThrow(playerState.score, visitThrows, checkoutMode);
}
