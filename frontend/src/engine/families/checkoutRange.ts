// 1:1-Port von backend/games/checkout_range.py (Phase D des Client-
// Rewrites, siehe ~/.claude/plans/agile-brewing-wadler.md). Spiele:
// "121", "60 +/-". Ein Spieler arbeitet sich unabhaengig von den
// anderen durch eine Folge von Checkout-Zahlen (TASK_BASED_FAMILIES,
// siehe matchEngine.ts).
import { applyCountdownThrow, CheckoutMode, CountdownResult, Segment } from "../scoring";

export type CheckoutRangePlayerState = {
  level: number;
  highestLevel: number;
  successfulCheckouts: number;
  attempts: number;
  // von matchEngine.ts ergaenzt (initTaskFields):
  attemptRemaining: number;
  taskVisitsUsed: number;
  taskDone: boolean;
};

export function createPlayerState(settings: Record<string, unknown>): CheckoutRangePlayerState {
  const start = Number(settings.startLevel ?? 121);
  return {
    level: start,
    highestLevel: start,
    successfulCheckouts: 0,
    attempts: 0,
    attemptRemaining: start,
    taskVisitsUsed: 0,
    taskDone: false,
  };
}

// Checkout-Regel konfigurierbar (bei 121) - Spiele derselben Familie
// ohne eigenes "Checkout"-Setting (z.B. 60 +/-) bleiben ueber den
// Default bei Double Out. Basis ist der ueber mehrere eigene
// Aufnahmen hinweg mitgefuehrte Rest des laufenden Versuchs, nicht
// der nominale Zielwert.
export function applyThrow(
  playerState: CheckoutRangePlayerState,
  visitThrows: Segment[],
  settings: Record<string, unknown>
): CountdownResult {
  const checkoutMode = (settings.checkoutMode as CheckoutMode) ?? "double_out";
  return applyCountdownThrow(playerState.attemptRemaining, visitThrows, checkoutMode);
}

function safehouseInterval(settings: Record<string, unknown>): number | null {
  const mode = settings.safehouseMode ?? "off";
  if (mode === "standard") return 10;
  if (mode === "easy") return 5;
  return null; // "off" (oder Spiele ohne Safehouse-Konzept) - kein Ruecksprung
}

// Wird von der Engine GENAU EINMAL pro Spieler und Versuch aufgerufen -
// entweder sofort bei Checkout (auch wenn noch eigene Aufnahmen uebrig
// waeren) oder wenn dieser Spieler alle seine Aufnahmen fuer den
// Versuch verbraucht hat, ohne zu checken. Schreibt
// level/highestLevel/Stats fort.
export function resolveAttempt(playerState: CheckoutRangePlayerState, settings: Record<string, unknown>, success: boolean): void {
  const start = Number(settings.startLevel ?? 121);
  const maxLevel = settings.maxLevel as number | undefined;
  playerState.attempts += 1;

  if (success) {
    const achieved = playerState.level;
    playerState.successfulCheckouts += 1;
    playerState.highestLevel = Math.max(playerState.highestLevel, achieved);
    const delta = Number(settings.onSuccessDelta ?? 1);
    let newLevel = achieved + delta;
    if (maxLevel !== undefined) newLevel = Math.min(newLevel, Number(maxLevel));
    playerState.level = newLevel;
    return;
  }

  const interval = safehouseInterval(settings);
  if (interval === null) {
    const delta = Number(settings.onFailDelta ?? 0);
    playerState.level = Math.max(start, playerState.level + delta);
    return;
  }
  const current = playerState.level;
  playerState.level = start + interval * Math.floor((current - start) / interval);
}
