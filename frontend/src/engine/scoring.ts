// 1:1-Port von backend/engine/scoring.py (Phase B des Client-Rewrites,
// siehe ~/.claude/plans/agile-brewing-wadler.md). Gemeinsame "auf exakt
// 0 spielen"-Logik - x01 und Random Checkout sind im Kern ein Countdown
// mit Bust-Regel, nur der Startwert unterscheidet sich.

export type Segment = { number: number; multiplier: number };
export type CheckoutMode = "double_out" | "master_out" | "straight_out";
export type CountdownOutcome = "bust" | "checkout" | "continue";
export type CountdownResult = { outcome: CountdownOutcome; score: number; dartsUsed: number };

export function segmentValue(segment: Segment): number {
  return segment.number * segment.multiplier;
}

// Darf dieser Dart der letzte (abschliessende) Dart eines Checkouts
// sein? double_out: nur Doppel/Bullseye (Multiplikator 2). master_out:
// zusaetzlich Triple (Multiplikator 3). straight_out: jeder Dart.
export function isValidFinisher(segment: Segment, checkoutMode: CheckoutMode): boolean {
  if (checkoutMode === "straight_out") return true;
  if (segment.multiplier === 2) return true;
  return checkoutMode === "master_out" && segment.multiplier === 3;
}

// Rechnet die komplette laufende Aufnahme neu ab startValue durch
// (nicht nur den letzten Dart) - dadurch setzt ein Bust automatisch auf
// den Aufnahme-Startwert zurueck, wie es der echten Darts-Regel
// entspricht. Bei straight_out gibt es kein "Rest 1 ist unerreichbar"-
// Bust mehr (S1 kann finishen) - nur Ueberwerfen bleibt ein Bust.
export function applyCountdownThrow(
  startValue: number,
  visitThrows: Segment[],
  checkoutMode: CheckoutMode
): CountdownResult {
  let value = startValue;
  for (const t of visitThrows) {
    value -= segmentValue(t);
  }
  const last = visitThrows[visitThrows.length - 1];

  const requiresFinisherCheck = checkoutMode !== "straight_out";
  const bust =
    value < 0 ||
    (requiresFinisherCheck && value === 1) ||
    (value === 0 && !isValidFinisher(last, checkoutMode));

  if (bust) {
    return { outcome: "bust", score: startValue, dartsUsed: visitThrows.length };
  }
  if (value === 0) {
    return { outcome: "checkout", score: 0, dartsUsed: visitThrows.length };
  }
  return { outcome: "continue", score: value, dartsUsed: visitThrows.length };
}
