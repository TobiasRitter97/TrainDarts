// 1:1-Port von backend/games/random_checkout.py (Phase D des Client-
// Rewrites, siehe ~/.claude/plans/agile-brewing-wadler.md). Alle
// Spieler versuchen denselben (geteilten, fairen) Zufalls-Checkout-
// Wert - TASK_BASED_FAMILIES, siehe matchEngine.ts.
import { applyCountdownThrow, CountdownResult, Segment } from "../scoring";

export type RandomCheckoutPlayerState = {
  remaining: number;
  successfulCheckouts: number;
  attempts: number;
  attemptRemaining: number;
  taskVisitsUsed: number;
  taskDone: boolean;
};

export function createPlayerState(target: number): RandomCheckoutPlayerState {
  return {
    remaining: target,
    successfulCheckouts: 0,
    attempts: 0,
    attemptRemaining: target,
    taskVisitsUsed: 0,
    taskDone: false,
  };
}

// Double-Out ist beim Checkout-Training immer an - kein eigener
// Schalter in den Settings. Basis ist der ueber mehrere eigene
// Aufnahmen hinweg mitgefuehrte Rest des laufenden Versuchs, nicht
// der nominale (geteilte) Zielwert.
export function applyThrow(playerState: RandomCheckoutPlayerState, visitThrows: Segment[]): CountdownResult {
  return applyCountdownThrow(playerState.attemptRemaining, visitThrows, "double_out");
}

// Wird von der Engine GENAU EINMAL pro Spieler und Versuch aufgerufen.
export function resolveAttempt(playerState: RandomCheckoutPlayerState, _settings: Record<string, unknown>, success: boolean): void {
  playerState.attempts += 1;
  if (success) playerState.successfulCheckouts += 1;
}
