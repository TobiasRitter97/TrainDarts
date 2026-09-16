// Kleiner Hilfs-Parser fuer die neuen UI-Anzeigen im Redesign
// 16.09.2026 (ThrowSequenceBar/VisitLogList): rein zur DARSTELLUNG des
// Punktwerts eines Wurf-Labels (z.B. "T20" -> 60) - KEINE Spiellogik,
// die Engine selbst rechnet nach wie vor ausschliesslich mit
// Segment-Objekten (siehe engine/scoring.ts segmentValue()).
export function dartLabelValue(label: string): number {
  if (label === "MISS") return 0;
  if (label === "BULL") return 50;
  if (label === "S25") return 25;
  const prefix = label[0];
  const multiplier = ({ S: 1, D: 2, T: 3 } as Record<string, number>)[prefix];
  if (!multiplier) return 0;
  const number = parseInt(label.slice(1), 10);
  return Number.isFinite(number) ? number * multiplier : 0;
}
