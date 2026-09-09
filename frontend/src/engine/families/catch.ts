// 1:1-Port von backend/games/catch.py (Phase D des Client-Rewrites,
// siehe ~/.claude/plans/agile-brewing-wadler.md). Spiele: "Catch 40",
// "Catch 40 Easy". Jeder Spieler durchlaeuft unabhaengig dieselbe
// (bei Shuffle: gemeinsam gemischte) Zahlenfolge, bis zu 6 Darts (2
// Aufnahmen) pro Zahl - TASK_BASED_FAMILIES, siehe matchEngine.ts.
// Anders als checkout_range geht es nach jeder Zahl IMMER zur
// naechsten weiter, egal ob Checkout geschafft oder nicht.
import { applyCountdownThrow, CountdownResult, Segment } from "../scoring";

export type CatchPlayerState = {
  level: number;
  targetIndex: number;
  targets: number[];
  successfulCheckouts: number;
  attempts: number;
  attemptRemaining: number;
  taskVisitsUsed: number;
  taskDone: boolean;
};

export function createPlayerState(targets: number[]): CatchPlayerState {
  const level = targets[0] ?? 0;
  return {
    level,
    targetIndex: 0,
    targets,
    successfulCheckouts: 0,
    attempts: 0,
    attemptRemaining: level,
    taskVisitsUsed: 0,
    taskDone: false,
  };
}

// Immer Double-Out. Basis ist der ueber mehrere eigene Aufnahmen
// hinweg mitgefuehrte Rest des laufenden Versuchs, nicht die nominale
// Zahl.
export function applyThrow(playerState: CatchPlayerState, visitThrows: Segment[]): CountdownResult {
  return applyCountdownThrow(playerState.attemptRemaining, visitThrows, "double_out");
}

// Wird von der Engine GENAU EINMAL pro Spieler und Zahl aufgerufen -
// entweder bei Checkout oder wenn die 6 Darts (2 Aufnahmen) verbraucht
// sind. Anders als bei checkout_range geht es IMMER zur naechsten Zahl
// weiter, unabhaengig vom Erfolg - der Erfolg zaehlt nur fuer die
// Statistik (successfulCheckouts).
export function resolveAttempt(playerState: CatchPlayerState, _settings: Record<string, unknown>, success: boolean): void {
  playerState.attempts += 1;
  if (success) playerState.successfulCheckouts += 1;
  playerState.targetIndex += 1;
  if (playerState.targetIndex < playerState.targets.length) {
    playerState.level = playerState.targets[playerState.targetIndex];
  }
}
