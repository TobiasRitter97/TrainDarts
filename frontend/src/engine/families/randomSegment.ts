// Spiel "Random Segment Training" (Tobias-Anforderung 16.09.2026):
// ein zufaelliges Segment wird vorgegeben, der Spieler muss es exakt
// treffen. Neue Engine-Familie im bestehenden Familien-Muster (siehe
// SPEC §30) - KEINE Sonderimplementierung ausserhalb der Engine.
//
// Zwei Dinge unterscheiden dieses Spiel von allen bisherigen Familien
// und sind der Grund fuer eine eigene Familie:
//
// 1. Das Dart-Budget gehoert zum ZIEL, nicht zur Aufnahme. Ein Ziel
//    kann sich ueber eine Aufnahmegrenze hinweg erstrecken (bei
//    "Darts pro Ziel = 3" und einem Treffer mit Dart 1 startet das
//    naechste Ziel noch in derselben Aufnahme und laeuft ggf. in die
//    naechste hinein). Die Spielerrotation bleibt davon unberuehrt bei
//    3 Darts + Takeout.
// 2. Treffer heisst EXAKTE Uebereinstimmung von Nummer UND Feld-Detail
//    (bed) - "T20" zaehlt nur bei Triple 20, und eine grosse Single 7
//    (SingleOuter) ist etwas anderes als eine kleine Single 7
//    (SingleInner), obwohl beide multiplier 1 haben.
//
// Fairness (SPEC §8): die Zielsequenz wird EINMAL pro Match erzeugt und
// im MATCH_STARTED-Event festgehalten - alle Spieler bekommen exakt
// dieselbe Reihenfolge, jeder mit eigenem Fortschrittszeiger. Dadurch
// ist auch das Fortsetzen nach einem Neustart identisch (Replay aus dem
// Event-Log, siehe matchEngine.ts).
import { Segment } from "../scoring";

export type SegmentTargetGroup = "large_single" | "small_single" | "double" | "triple" | "bull";

export type SegmentTarget = {
  group: SegmentTargetGroup;
  number: number; // 1-20, bei Bull 25
  multiplier: number; // 1/2/3 - bei Bull: 1 = aeusserer Bull (25), 2 = Bullseye (50)
};

export type SegmentResult = {
  label: string;
  group: SegmentTargetGroup;
  hit: boolean;
  dartsUsed: number;
};

export type RandomSegmentPlayerState = {
  targetIndex: number; // Zeiger in die gemeinsame Zielsequenz
  dartsUsedOnTarget: number; // Budget-Verbrauch des AKTUELLEN Ziels (ueber Aufnahmen hinweg)
  results: SegmentResult[]; // ein Eintrag pro ABGESCHLOSSENEM Ziel
  hitTargets: number;
  totalDarts: number;
};

export const GROUP_LABELS: Record<SegmentTargetGroup, string> = {
  large_single: "Large Single",
  small_single: "Small Single",
  double: "Double",
  triple: "Triple",
  bull: "Bull",
};

export function createPlayerState(): RandomSegmentPlayerState {
  return { targetIndex: 0, dartsUsedOnTarget: 0, results: [], hitTargets: 0, totalDarts: 0 };
}

// Anzeigename eines Ziels. Fuer grosse/kleine Singles gibt es keine
// etablierte Kurzschreibweise (beides waere "S7"), deshalb ausgeschrieben.
export function targetLabel(target: SegmentTarget): string {
  switch (target.group) {
    case "triple":
      return `T${target.number}`;
    case "double":
      return `D${target.number}`;
    case "large_single":
      return `Large ${target.number}`;
    case "small_single":
      return `Small ${target.number}`;
    case "bull":
      return target.multiplier === 2 ? "Bullseye" : "25";
  }
}

// Alle Ziele der aktivierten Gruppen (Vereinigungsmenge).
export function buildTargetPool(groups: SegmentTargetGroup[]): SegmentTarget[] {
  const numbers = Array.from({ length: 20 }, (_, i) => i + 1);
  const pool: SegmentTarget[] = [];
  for (const group of groups) {
    if (group === "bull") {
      pool.push({ group, number: 25, multiplier: 1 }, { group, number: 25, multiplier: 2 });
      continue;
    }
    const multiplier = group === "double" ? 2 : group === "triple" ? 3 : 1;
    for (const number of numbers) pool.push({ group, number, multiplier });
  }
  return pool;
}

function sameTarget(a: SegmentTarget, b: SegmentTarget): boolean {
  return a.group === b.group && a.number === b.number && a.multiplier === b.multiplier;
}

// Erzeugt die gemeinsame Zielsequenz. Kein Ziel darf zweimal DIREKT
// hintereinander vorkommen (bei einem Pool mit nur einem einzigen Ziel
// ist das unmoeglich - dann wird die Regel notgedrungen ignoriert).
export function generateTargets(pool: SegmentTarget[], count: number): SegmentTarget[] {
  if (pool.length === 0) return [];
  const targets: SegmentTarget[] = [];
  for (let i = 0; i < count; i++) {
    let next = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1) {
      const previous = targets[targets.length - 1];
      let guard = 0;
      while (previous && sameTarget(next, previous) && guard < 20) {
        next = pool[Math.floor(Math.random() * pool.length)];
        guard += 1;
      }
    }
    targets.push(next);
  }
  return targets;
}

// Treffer-Pruefung. Nummer muss immer stimmen; bei Doppel/Triple/Bull
// reicht zusaetzlich der multiplier (eindeutig). Grosse vs. kleine
// Single ist NUR ueber das bed unterscheidbar - fehlt das bed (manuell
// erfasster Dart, siehe Segment-Kommentar in scoring.ts), wird bewusst
// GROSSZUEGIG gewertet: ein manuell als "S7" nachgetragener Dart zaehlt
// fuer beide Single-Varianten, weil wir den Ring nicht kennen und einen
// echten Treffer nicht faelschlich zum Fehlwurf machen wollen.
export function matchesTarget(segment: Segment, target: SegmentTarget): boolean {
  if (segment.number !== target.number) return false;
  if (target.group === "bull") return segment.multiplier === target.multiplier;
  if (target.group === "double") return segment.multiplier === 2;
  if (target.group === "triple") return segment.multiplier === 3;
  // large_single / small_single
  if (segment.multiplier !== 1) return false;
  if (!segment.bed) return true; // unbekannter Ring -> grosszuegig
  return target.group === "large_single" ? segment.bed === "SingleOuter" : segment.bed === "SingleInner";
}

export type RandomSegmentThrowResult = {
  outcome: "continue" | "player_done";
  score: number; // getroffene Ziele inkl. der laufenden Aufnahme (Live-Anzeige)
  endingIndex: number;
  endingDartsUsed: number;
  newResults: SegmentResult[];
  dartsThrown: number;
};

// Reine Berechnung (kein Seiteneffekt) - spielt die Darts der laufenden
// Aufnahme ab dem committeten Stand durch. Wird sowohl fuer die
// Live-Anzeige (aktuelles Ziel, Restbudget) als auch beim Bestaetigen
// der Aufnahme benutzt; deshalb MUSS sie ohne State-Mutation auskommen.
export function applyThrow(
  playerState: RandomSegmentPlayerState,
  visitThrows: Segment[],
  targets: SegmentTarget[],
  dartsPerTarget: number
): RandomSegmentThrowResult {
  let index = playerState.targetIndex;
  let used = playerState.dartsUsedOnTarget;
  const newResults: SegmentResult[] = [];
  let dartsThrown = 0;

  for (const segment of visitThrows) {
    if (index >= targets.length) break; // Liste fertig - weitere Darts zaehlen nicht mehr
    dartsThrown += 1;
    used += 1;
    const target = targets[index];
    if (matchesTarget(segment, target)) {
      // Treffer: Ziel sofort fertig, Restbudget verfaellt.
      newResults.push({ label: targetLabel(target), group: target.group, hit: true, dartsUsed: used });
      index += 1;
      used = 0;
    } else if (used >= dartsPerTarget) {
      // Budget aufgebraucht: Ziel gilt als verfehlt.
      newResults.push({ label: targetLabel(target), group: target.group, hit: false, dartsUsed: used });
      index += 1;
      used = 0;
    }
  }

  const hits = newResults.filter((r) => r.hit).length;
  return {
    outcome: index >= targets.length ? "player_done" : "continue",
    score: playerState.hitTargets + hits,
    endingIndex: index,
    endingDartsUsed: used,
    newResults,
    dartsThrown,
  };
}

// Wird von der Engine GENAU EINMAL nach jeder bestaetigten Aufnahme
// aufgerufen und schreibt den simulierten Stand fest.
export function resolveVisit(playerState: RandomSegmentPlayerState, result: RandomSegmentThrowResult): void {
  playerState.targetIndex = result.endingIndex;
  playerState.dartsUsedOnTarget = result.endingDartsUsed;
  playerState.results.push(...result.newResults);
  playerState.hitTargets += result.newResults.filter((r) => r.hit).length;
  playerState.totalDarts += result.dartsThrown;
}

export function isFinished(playerState: RandomSegmentPlayerState, targets: SegmentTarget[]): boolean {
  return playerState.targetIndex >= targets.length;
}
