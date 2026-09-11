// Neues Spiel "Grouping Championship" (Tobias-Feedback 11.09.2026):
// reines Praezisions-/Konsistenztraining. 20 Runden je 3 Darts, IMMER
// auf T20 - gemessen wird nicht der Score, sondern wie eng die 3 Darts
// beieinander landen ("Grouping").
//
// WICHTIG - unverifizierte Annahme (siehe CLAUDE.md, Abschnitt
// "Verifizierte Autodarts-Anbindung"): `coords.x/y` wird vom Board
// zwar strukturell mitgeschickt, aber WEDER im verifizierten
// Referenzcode (docs/reference/darts_web.py) NOCH sonst im Projekt
// wurde je gemessen, in welcher Einheit/Skalierung diese Werte
// tatsaechlich vorliegen. MM_PER_COORD_UNIT ist deshalb ein
// Platzhalter (Annahme: coords sind bereits Millimeter relativ zur
// Bullseye-Mitte, Skala = 1) - nach dem ersten Test am echten Board
// MUSS dieser Wert anhand bekannter Wurfpositionen kalibriert werden
// (z.B. Rand des Doppelrings = 170mm vom Zentrum, siehe Standardmass
// eines Dartboards).
import { Segment } from "../scoring";

export const TOTAL_ROUNDS = 20;
export const TARGET_SEGMENT_NUMBER = 20; // immer T20
export const MM_PER_COORD_UNIT = 1; // TODO Kalibrierung am echten Board, siehe Kommentar oben

export type Coords = { x: number; y: number };

export type GroupingRound = {
  // null, wenn weniger als 2 Darts dieser Runde echte Koordinaten
  // hatten (z.B. manuell nachgetragener Dart ohne Board-Erkennung).
  mm: number | null;
  score: number;
  hits: { triple: number; single: number; miss: number };
  timestamp: number;
};

export type GroupingPlayerState = {
  totalScore: number;
  roundIndex: number; // 0..TOTAL_ROUNDS
  rounds: GroupingRound[];
  bestRoundIndex: number | null; // Index in "rounds" mit dem kleinsten mm-Wert
};

export function createPlayerState(): GroupingPlayerState {
  return { totalScore: 0, roundIndex: 0, rounds: [], bestRoundIndex: null };
}

function dartScore(segment: Segment): number {
  if (segment.number !== TARGET_SEGMENT_NUMBER) return 0;
  if (segment.multiplier === 3) return 100;
  if (segment.multiplier === 1) return 20;
  return 0; // Double 20 oder verfehlt zaehlt laut Spec nicht
}

function euclideanDistance(a: Coords, b: Coords): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Durchschnitt ueber ALLE Dart-Paare der Aufnahme (bei 3 gueltigen
// Koordinaten also 3 Paare: 1-2, 1-3, 2-3) - siehe Spec.
function groupingDistanceMm(visitCoords: (Coords | undefined)[]): number | null {
  const valid = visitCoords.filter((c): c is Coords => c !== undefined);
  if (valid.length < 2) return null;
  const pairDistances: number[] = [];
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      pairDistances.push(euclideanDistance(valid[i], valid[j]));
    }
  }
  const avg = pairDistances.reduce((sum, d) => sum + d, 0) / pairDistances.length;
  return avg * MM_PER_COORD_UNIT;
}

export type GroupingThrowResult = {
  outcome: "continue" | "round_done";
  score?: number;
  round?: { mm: number | null; score: number; hits: { triple: number; single: number; miss: number } };
};

export function applyThrow(
  state: GroupingPlayerState,
  visitThrows: Segment[],
  visitCoords: (Coords | undefined)[] = []
): GroupingThrowResult {
  if (visitThrows.length < 3) return { outcome: "continue" };

  const hits = { triple: 0, single: 0, miss: 0 };
  let roundScore = 0;
  for (const t of visitThrows) {
    roundScore += dartScore(t);
    if (t.number === TARGET_SEGMENT_NUMBER && t.multiplier === 3) hits.triple += 1;
    else if (t.number === TARGET_SEGMENT_NUMBER && t.multiplier === 1) hits.single += 1;
    else hits.miss += 1;
  }

  return {
    outcome: "round_done",
    score: state.totalScore + roundScore,
    round: { mm: groupingDistanceMm(visitCoords), score: roundScore, hits },
  };
}

// Wird von der Engine GENAU EINMAL nach jeder abgeschlossenen Aufnahme
// aufgerufen. "at" ist der einmalig beim Bestaetigen erzeugte
// Zeitstempel (siehe MatchEngine.confirmVisit) - NICHT hier per
// Date.now() neu erzeugen, sonst waere ein Replay nicht mehr
// deterministisch (gleiches Prinzip wie bei ROUND_RANDOM_GENERATED).
export function resolveVisit(state: GroupingPlayerState, result: GroupingThrowResult, at: number): void {
  if (!result.round) return;
  state.totalScore = result.score ?? state.totalScore;
  state.rounds.push({ ...result.round, timestamp: at });
  const mm = result.round.mm;
  if (mm !== null) {
    const currentBestMm = state.bestRoundIndex !== null ? state.rounds[state.bestRoundIndex].mm : null;
    if (currentBestMm === null || mm < currentBestMm) state.bestRoundIndex = state.rounds.length - 1;
  }
  state.roundIndex += 1;
}
