// 1:1-Port von backend/engine/checkout.py (Phase B des Client-
// Rewrites, siehe ~/.claude/plans/agile-brewing-wadler.md).
//
// Fuer Double Out wird DOUBLE_OUT_TABLE verwendet: eine verifizierte
// Tabelle fuer 2-170, da die etablierte Checkout-Tabelle keiner
// sauberen Formel folgt (siehe checkoutTable.ts-Kommentar - zwei Reste
// mit identischen Kandidaten-Doppeln koennen unterschiedliche Doppel
// bevorzugen, z.B. Rest 63 -> D12 vs. Rest 66 -> D18).
//
// Fuer Master Out gilt: die Double-Out-Tabellenroute ist immer auch
// eine gueltige Master-Out-Route und wird als Basis wiederverwendet -
// zusaetzlich wird geprueft, ob eine KUeRZERE Route ueber ein
// Triple-Finish moeglich ist (z.B. Rest 60 -> T20 statt S20,D20).
// Straight Out nutzt dieselbe Zusatzsuche mit einem noch groesseren
// Ziel-Segment-Set (auch Singles).
import { DOUBLE_OUT_TABLE } from "./checkoutTable";
import { CheckoutMode } from "./scoring";

type SegmentCandidate = [string, number];

const _PREFERRED_NON_FINISH: SegmentCandidate[] = [
  ...Array.from({ length: 20 }, (_, i) => [`T${20 - i}`, (20 - i) * 3] as SegmentCandidate),
  ["BULL", 50],
  ...Array.from({ length: 20 }, (_, i) => [`D${20 - i}`, (20 - i) * 2] as SegmentCandidate),
  ["S25", 25],
  ...Array.from({ length: 20 }, (_, i) => [`S${20 - i}`, 20 - i] as SegmentCandidate),
];

// Welche Segmente den letzten Dart eines Checkouts bilden duerfen.
// Master-Out-Praeferenz (aus Tobias' eigenen Beispielen hergeleitet):
// ein "uebliches" Doppel mit GERADER Segmentnummer (D2, D4, ..., D20)
// bleibt Primary vor einem Triple (z.B. 36 -> D18, nicht T12). Ein
// "unuebliches" Doppel mit UNGERADER Segmentnummer (D1, D3, ..., D19)
// wird dagegen einem direkten Triple NACHGEORDNET (z.B. 30 -> T10,
// nicht das unuebliche D15), nur letzter Fallback.
function finishSegments(checkoutMode: CheckoutMode): SegmentCandidate[] {
  if (checkoutMode === "double_out") {
    return [["BULL", 50], ...Array.from({ length: 20 }, (_, i) => [`D${20 - i}`, (20 - i) * 2] as SegmentCandidate)];
  }
  if (checkoutMode === "master_out") {
    const evenDoubles: SegmentCandidate[] = [];
    for (let n = 20; n >= 2; n -= 2) evenDoubles.push([`D${n}`, n * 2]);
    const triples: SegmentCandidate[] = [];
    for (let n = 20; n >= 1; n -= 1) triples.push([`T${n}`, n * 3]);
    const oddDoubles: SegmentCandidate[] = [];
    for (let n = 19; n >= 1; n -= 2) oddDoubles.push([`D${n}`, n * 2]);
    return [["BULL", 50], ...evenDoubles, ...triples, ...oddDoubles];
  }
  return [
    ["BULL", 50],
    ...Array.from({ length: 20 }, (_, i) => [`T${20 - i}`, (20 - i) * 3] as SegmentCandidate),
    ...Array.from({ length: 20 }, (_, i) => [`D${20 - i}`, (20 - i) * 2] as SegmentCandidate),
    ["S25", 25],
    ...Array.from({ length: 20 }, (_, i) => [`S${20 - i}`, 20 - i] as SegmentCandidate),
  ];
}

// Empfohlene Dart-Folge fuer den aktuellen Rest, oder null, wenn mit
// den verbleibenden Darts kein Finish moeglich ist. Hoechstens 3 Darts
// werden betrachtet - mehr braucht eine sinnvolle Checkout-Route nie
// (Maximum ist 170 mit 3 Darts).
export function suggestRoute(remaining: number, dartsLeft: number, checkoutMode: CheckoutMode): string[] | null {
  if (remaining <= 0 || dartsLeft <= 0) return null;
  const maxDarts = Math.min(dartsLeft, 3);

  // 1-Dart-Finish ist fuer alle drei Modi eindeutig regelbasiert (kein
  // Tabellen-Nachschlagen noetig) - bei Master Out gewinnt bei einem
  // Gleichstand zwischen Doppel und Triple immer das Doppel, da Doppel
  // in finishSegments() vor den Triples aufgefuehrt sind.
  for (const [label, value] of finishSegments(checkoutMode)) {
    if (value === remaining) return [label];
  }
  if (maxDarts < 2) return null;

  const candidates: string[][] = [];
  const tableRoute = DOUBLE_OUT_TABLE[remaining];
  if (tableRoute && tableRoute.length <= maxDarts) {
    candidates.push(tableRoute);
  }

  if (checkoutMode !== "double_out") {
    for (let n = 2; n <= maxDarts; n++) {
      const route = searchExact(remaining, n, checkoutMode);
      if (route !== null) {
        candidates.push(route);
        break;
      }
    }
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((shortest, r) => (r.length < shortest.length ? r : shortest));
}

// Route mit genau `darts` Wuerfen, oder null. Wird nur noch als
// Zusatzsuche fuer Master/Straight Out verwendet (kuerzere Route via
// Triple-Finish als die Double-Out-Tabelle bietet) - fuer Double Out
// selbst wird ausschliesslich DOUBLE_OUT_TABLE verwendet.
function searchExact(remaining: number, darts: number, checkoutMode: CheckoutMode): string[] | null {
  if (darts === 1) {
    for (const [label, value] of finishSegments(checkoutMode)) {
      if (value === remaining) return [label];
    }
    return null;
  }
  for (const [label, value] of _PREFERRED_NON_FINISH) {
    if (value >= remaining) continue;
    const rest = searchExact(remaining - value, darts - 1, checkoutMode);
    if (rest !== null) return [label, ...rest];
  }
  return null;
}
