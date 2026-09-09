// 1:1-Port von backend/games/target_progression.py (Phase D des
// Client-Rewrites, siehe ~/.claude/plans/agile-brewing-wadler.md).
// Spiele: "Bob's 27", "Bob's 27 Easy". Pro Ziel genau eine Aufnahme
// mit 3 Darts. Jeder getroffene Dart bringt +2x die Zahl (Bull=+50),
// werden alle 3 Darts verfehlt gibt es einmalig -2x die Zahl. Danach
// IMMER zum naechsten Ziel wechseln.
import { Segment } from "../scoring";

export const BOBS27_TARGETS: string[] = [...Array.from({ length: 20 }, (_, i) => `D${i + 1}`), "BULL"];
export const BOBS27_EASY_TARGETS: string[] = [...Array.from({ length: 10 }, (_, i) => `D${(i + 1) * 2}`), "BULL"];

export const STARTING_SCORE = 27;

export type TargetProgressionPlayerState = {
  score: number;
  targetIndex: number;
  runsCompleted: number;
  totalScore: number;
  bestRun: number | null;
  targets: string[];
};

export function createPlayerState(targets: string[]): TargetProgressionPlayerState {
  return { score: STARTING_SCORE, targetIndex: 0, runsCompleted: 0, totalScore: 0, bestRun: null, targets };
}

export function currentTarget(state: TargetProgressionPlayerState): string | null {
  if (state.targetIndex >= state.targets.length) return null;
  return state.targets[state.targetIndex];
}

function targetMatches(targetLabel: string, segment: Segment): boolean {
  if (targetLabel === "BULL") return segment.number === 25 && segment.multiplier === 2;
  const number = parseInt(targetLabel.slice(1), 10);
  return segment.number === number && segment.multiplier === 2;
}

function targetValue(targetLabel: string): number {
  if (targetLabel === "BULL") return 50;
  return parseInt(targetLabel.slice(1), 10) * 2;
}

// Wird nach jedem Dart aufgerufen, wertet aber erst, wenn die Aufnahme
// (3 Darts) komplett ist - Bob's 27 zaehlt Treffer der kompletten
// Aufnahme, nicht Dart fuer Dart.
export function applyThrow(
  playerState: TargetProgressionPlayerState,
  visitThrows: Segment[]
): { outcome: "continue" | "target_done"; score: number; hits?: number } {
  if (visitThrows.length < 3) return { outcome: "continue", score: playerState.score };

  const targetLabel = currentTarget(playerState);
  const hits = targetLabel ? visitThrows.filter((t) => targetMatches(targetLabel, t)).length : 0;
  const value = targetLabel ? targetValue(targetLabel) : 0;
  const delta = hits > 0 ? value * hits : -value;
  return { outcome: "target_done", score: playerState.score + delta, hits };
}
