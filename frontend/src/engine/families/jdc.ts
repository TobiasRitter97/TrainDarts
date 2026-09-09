// 1:1-Port von backend/games/jdc.py (Phase D des Client-Rewrites,
// siehe ~/.claude/plans/agile-brewing-wadler.md). Spiel: "JDC
// Challenge" - etablierte JDC-Regeln (recherchiert, siehe Python-
// Original-Docstring fuer Quellen). Phase 1 Shanghai 10-15, Phase 2
// Doubles 1-20+Bull, Phase 3 Shanghai 15-20.
import { Segment } from "../scoring";

export const PHASES = ["shanghai1", "doubles", "shanghai2"] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_TARGETS: Record<Phase, (number | string)[]> = {
  shanghai1: Array.from({ length: 6 }, (_, i) => i + 10),
  doubles: [...Array.from({ length: 20 }, (_, i) => `D${i + 1}`), "BULL"],
  shanghai2: Array.from({ length: 6 }, (_, i) => i + 15),
};

export const PHASE_LABELS: Record<Phase, string> = {
  shanghai1: "Shanghai 10–15",
  doubles: "Doubles 1–20 + Bull",
  shanghai2: "Shanghai 15–20",
};

export type JdcPlayerState = {
  phaseIndex: number;
  targetIndex: number;
  phaseScores: { shanghai1: number; doubles: number; shanghai2: number };
  runScore: number;
  totalScore: number;
  bestRun: number | null;
  totalHits: number;
  shanghaiCount: number;
  runsCompleted: number;
};

export function createPlayerState(): JdcPlayerState {
  return {
    phaseIndex: 0,
    targetIndex: 0,
    phaseScores: { shanghai1: 0, doubles: 0, shanghai2: 0 },
    runScore: 0,
    totalScore: 0,
    bestRun: null,
    totalHits: 0,
    shanghaiCount: 0,
    runsCompleted: 0,
  };
}

export function currentPhase(state: JdcPlayerState): Phase | null {
  if (state.phaseIndex >= PHASES.length) return null;
  return PHASES[state.phaseIndex];
}

export function currentTarget(state: JdcPlayerState): number | string | null {
  const phase = currentPhase(state);
  if (phase === null) return null;
  return PHASE_TARGETS[phase][state.targetIndex];
}

function shanghaiVisitResult(targetNumber: number, visitThrows: Segment[]) {
  let total = 0;
  const multsHit = new Set<number>();
  let hits = 0;
  for (const t of visitThrows) {
    if (t.number !== targetNumber) continue;
    total += t.multiplier * targetNumber;
    multsHit.add(t.multiplier);
    hits += 1;
  }
  const shanghai = multsHit.has(1) && multsHit.has(2) && multsHit.has(3);
  if (shanghai) total += 100;
  return { score: total, hits, shanghai };
}

// (Punkte, war-es-ein-Treffer) fuer EINEN Dart auf EIN Doubles-Ziel.
function doubleHitScore(target: number | string, segment: Segment): [number, boolean] {
  if (target === "BULL") {
    if (segment.number !== 25) return [0, false];
    if (segment.multiplier === 2) return [100, true]; // Bullseye: 50 + 50 Bonus
    if (segment.multiplier === 1) return [50, true]; // Single Bull
    return [0, false];
  }
  const number = parseInt(String(target).slice(1), 10);
  if (segment.number === number && segment.multiplier === 2) return [50, true];
  return [0, false];
}

// Reine Berechnung (kein Seiteneffekt): jeder Dart der Aufnahme geht
// auf das naechste Doubles-Ziel, IMMER (nicht nur bei Treffer).
function simulateDoublesVisit(startIndex: number, visitThrows: Segment[]) {
  const targets = PHASE_TARGETS.doubles;
  let index = startIndex;
  let score = 0;
  let hits = 0;
  for (const segment of visitThrows) {
    if (index >= targets.length) break;
    const [pts, hit] = doubleHitScore(targets[index], segment);
    score += pts;
    if (hit) hits += 1;
    index += 1;
  }
  return { score, hits, endingIndex: index };
}

export type JdcThrowResult = {
  outcome: "continue" | "target_done";
  score?: number;
  hits?: number;
  shanghai?: boolean;
  endingIndex?: number;
};

export function applyThrow(playerState: JdcPlayerState, visitThrows: Segment[]): JdcThrowResult {
  const phase = currentPhase(playerState);

  if (phase === "doubles") {
    const sim = simulateDoublesVisit(playerState.targetIndex, visitThrows);
    const outcome = visitThrows.length >= 3 ? "target_done" : "continue";
    return { outcome, ...sim };
  }

  if (phase === "shanghai1" || phase === "shanghai2") {
    if (visitThrows.length < 3) return { outcome: "continue" };
    const target = currentTarget(playerState) as number;
    return { outcome: "target_done", ...shanghaiVisitResult(target, visitThrows) };
  }

  return { outcome: "continue" }; // Run bereits komplett (wartet auf andere Spieler)
}

// Wird von der Engine GENAU EINMAL nach jeder abgeschlossenen Aufnahme
// aufgerufen.
export function resolveVisit(playerState: JdcPlayerState, result: JdcThrowResult): void {
  const phase = currentPhase(playerState);
  if (phase === null) return;

  const score = result.score ?? 0;
  playerState.phaseScores[phase] += score;
  playerState.runScore += score;
  playerState.totalHits += result.hits ?? 0;
  if ((phase === "shanghai1" || phase === "shanghai2") && result.shanghai) {
    playerState.shanghaiCount += 1;
  }

  if (phase === "doubles") {
    playerState.targetIndex = result.endingIndex ?? playerState.targetIndex;
  } else {
    playerState.targetIndex += 1;
  }

  if (playerState.targetIndex >= PHASE_TARGETS[phase].length) {
    playerState.phaseIndex += 1;
    playerState.targetIndex = 0;
  }
}
