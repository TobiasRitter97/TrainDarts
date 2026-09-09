// 1:1-Port von backend/games/accuracy_progression.py (Phase D des
// Client-Rewrites, siehe ~/.claude/plans/agile-brewing-wadler.md).
// Spiel: "Around the World". Jeder Spieler hat seine EIGENE,
// unabhaengige Liste offener Zahlen (1-20, optional Bull). Das Spiel
// endet sofort, sobald EIN Spieler seine Liste leert - dieser Spieler
// gewinnt, andere spielen nicht weiter (kein Ausgleich).
//
// Required Hits = 1: innerhalb EINER Aufnahme wird bei jedem Treffer
// sofort zur naechsten offenen Zahl gewechselt (fuer den naechsten
// Dart derselben Aufnahme) - das ist immer so, unabhaengig von der
// Einstellung "Zielwechsel" (die erst ab Required Hits 2/3 ueberhaupt
// eine Wahl ist, siehe staticGames.ts showIf).
//
// Required Hits = 2/3 kennt seit Tobias-Feedback (09.09.2026) zwei
// Modi ueber die Einstellung "targetChangeMode":
// - "per_visit" (Aufnahme, bisheriges Verhalten): alle 3 Darts einer
//   Aufnahme bleiben auf derselben Zahl, auch wenn die noetigen
//   Treffer schon vorher erreicht wurden (z.B. 2 Treffer mit den
//   ersten beiden Darts bei Required Hits=2 - der dritte Dart zielt
//   trotzdem noch auf dieselbe Zahl).
// - "per_dart" (Dart): sobald die noetige Trefferzahl auf die aktuelle
//   Zahl erreicht ist, wechselt das Ziel sofort fuer die restlichen
//   Darts derselben Aufnahme zur naechsten offenen Zahl (verallgemeinert
//   das Required-Hits=1-Verhalten auf eine hoehere Trefferschwelle).
import { Segment } from "../scoring";

export type HitKind = "single" | "double" | "triple" | null;

export type AccuracyProgressionPlayerState = {
  openNumbers: (number | string)[];
  currentTarget: number | string | null;
  successfulTargets: number;
  totalHits: number;
  totalDarts: number;
  singles: number;
  doubles: number;
  triples: number;
  perfectTargets: number;
};

export function buildOpenNumbers(settings: Record<string, unknown>): (number | string)[] {
  const numbers: (number | string)[] = Array.from({ length: 20 }, (_, i) => i + 1);
  if (Boolean(settings.includeBull)) numbers.push("BULL");
  return numbers;
}

export function createPlayerState(openNumbers: (number | string)[]): AccuracyProgressionPlayerState {
  return {
    openNumbers: [...openNumbers],
    currentTarget: openNumbers[0] ?? null,
    successfulTargets: 0,
    totalHits: 0,
    totalDarts: 0,
    singles: 0,
    doubles: 0,
    triples: 0,
    perfectTargets: 0,
  };
}

// "single"/"double"/"triple", falls dieser Wurf ein Treffer auf die
// aktuelle Zielzahl ist, sonst null. Bull kennt kein Triple.
function hitKind(segment: Segment, target: number | string | null): HitKind {
  if (target === "BULL") {
    if (segment.number !== 25) return null;
    return ({ 1: "single", 2: "double" } as Record<number, HitKind>)[segment.multiplier] ?? null;
  }
  if (segment.number !== target) return null;
  return ({ 1: "single", 2: "double", 3: "triple" } as Record<number, HitKind>)[segment.multiplier] ?? null;
}

function qualifies(kind: HitKind, segmentMode: string): boolean {
  if (kind === null) return false;
  if (segmentMode === "all") return true;
  return kind === segmentMode;
}

// Naechste Zahl NACH value in der aktuellen Listenreihenfolge, mit
// Wraparound - unabhaengig davon, ob value hinterher entfernt wird
// oder nicht.
function nextAfter(openNumbers: (number | string)[], value: number | string): number | string {
  const idx = openNumbers.indexOf(value);
  return openNumbers[(idx + 1) % openNumbers.length];
}

// Reine Berechnung (kein Seiteneffekt) der automatischen Zielwechsel-
// Logik innerhalb EINER Aufnahme bei Required Hits = 1.
function simulateRequiredHits1(
  openNumbers: (number | string)[],
  startTarget: number | string | null,
  visitThrows: Segment[],
  segmentMode: string
) {
  const remaining = [...openNumbers];
  let target = startTarget;
  const hitNumbers: (number | string)[] = [];
  const hitKindsPerDart: HitKind[] = [];
  for (const segment of visitThrows) {
    if (target === null) {
      hitKindsPerDart.push(null);
      continue;
    }
    const kind = hitKind(segment, target);
    const qualified = qualifies(kind, segmentMode);
    hitKindsPerDart.push(qualified ? kind : null);
    if (qualified) {
      hitNumbers.push(target);
      remaining.splice(remaining.indexOf(target), 1);
      target = remaining[0] ?? null;
    }
  }
  return { endingTarget: target, hitNumbers, hitKindsPerDart };
}

// Reine Berechnung (kein Seiteneffekt): verallgemeinerte Version von
// simulateRequiredHits1 fuer eine beliebige Trefferschwelle - sobald
// "requiredHits" Treffer auf die aktuelle Zahl erreicht sind, wechselt
// das Ziel fuer die restlichen Darts derselben Aufnahme zur naechsten
// offenen Zahl (Modus "per_dart").
function simulatePerDart(
  openNumbers: (number | string)[],
  startTarget: number | string | null,
  visitThrows: Segment[],
  segmentMode: string,
  requiredHits: number
) {
  const remaining = [...openNumbers];
  let target = startTarget;
  let hitsOnCurrent = 0;
  const hitNumbers: (number | string)[] = [];
  const hitKindsPerDart: HitKind[] = [];
  for (const segment of visitThrows) {
    if (target === null) {
      hitKindsPerDart.push(null);
      continue;
    }
    const kind = hitKind(segment, target);
    const qualified = qualifies(kind, segmentMode);
    hitKindsPerDart.push(qualified ? kind : null);
    if (qualified) {
      hitsOnCurrent += 1;
      if (hitsOnCurrent >= requiredHits) {
        hitNumbers.push(target);
        remaining.splice(remaining.indexOf(target), 1);
        target = remaining[0] ?? null;
        hitsOnCurrent = 0;
      }
    }
  }
  return { endingTarget: target, hitNumbers, hitKindsPerDart };
}

export type AccuracyThrowResult = {
  outcome: "continue" | "target_done";
  endingTarget?: number | string | null;
  hitNumbers?: (number | string)[];
  hitKindsPerDart?: HitKind[];
};

export function applyThrow(
  playerState: AccuracyProgressionPlayerState,
  visitThrows: Segment[],
  settings: Record<string, unknown>
): AccuracyThrowResult {
  const requiredHits = Number(settings.requiredHits ?? 1);
  const segmentMode = (settings.segmentMode as string) ?? "single";

  if (requiredHits === 1) {
    const sim = simulateRequiredHits1(playerState.openNumbers, playerState.currentTarget, visitThrows, segmentMode);
    const outcome = visitThrows.length >= 3 ? "target_done" : "continue";
    return { outcome, endingTarget: sim.endingTarget, hitNumbers: sim.hitNumbers, hitKindsPerDart: sim.hitKindsPerDart };
  }

  const targetChangeMode = (settings.targetChangeMode as string) ?? "per_visit";
  if (targetChangeMode === "per_dart") {
    const sim = simulatePerDart(playerState.openNumbers, playerState.currentTarget, visitThrows, segmentMode, requiredHits);
    const outcome = visitThrows.length >= 3 ? "target_done" : "continue";
    return { outcome, endingTarget: sim.endingTarget, hitNumbers: sim.hitNumbers, hitKindsPerDart: sim.hitKindsPerDart };
  }

  // "per_visit" (Aufnahme, Standard): alle 3 Darts immer auf dieselbe
  // Zahl - erst nach dem 3. Dart wird gewertet.
  if (visitThrows.length < 3) return { outcome: "continue" };
  const target = playerState.currentTarget;
  const hitKindsPerDart = visitThrows.map((t) => hitKind(t, target));
  const qualifying = hitKindsPerDart.filter((h) => qualifies(h, segmentMode)).length;
  const success = qualifying >= requiredHits;
  return {
    outcome: "target_done",
    endingTarget: target !== null ? nextAfter(playerState.openNumbers, target) : null,
    hitNumbers: success && target !== null ? [target] : [],
    hitKindsPerDart,
  };
}

// Wird von der Engine GENAU EINMAL nach jeder abgeschlossenen Aufnahme
// aufgerufen - entfernt erledigte Zahlen aus der Liste, setzt das
// naechste Ziel und schreibt die Trefferstatistik fort.
export function resolveVisit(playerState: AccuracyProgressionPlayerState, result: AccuracyThrowResult): void {
  const hitKinds = result.hitKindsPerDart ?? [];
  const hits = hitKinds.filter((h): h is Exclude<HitKind, null> => h !== null);
  playerState.totalDarts += hitKinds.length;
  playerState.totalHits += hits.length;
  for (const h of hits) {
    if (h === "single") playerState.singles += 1;
    else if (h === "double") playerState.doubles += 1;
    else if (h === "triple") playerState.triples += 1;
  }
  if (hits.length === 3) playerState.perfectTargets += 1;

  for (const number of result.hitNumbers ?? []) {
    const idx = playerState.openNumbers.indexOf(number);
    if (idx !== -1) {
      playerState.openNumbers.splice(idx, 1);
      playerState.successfulTargets += 1;
    }
  }

  if (playerState.openNumbers.length === 0) {
    playerState.currentTarget = null; // Liste leer - Spieler hat gewonnen
    return;
  }
  const ending = result.endingTarget ?? null;
  playerState.currentTarget = ending !== null && playerState.openNumbers.includes(ending) ? ending : playerState.openNumbers[0];
}
