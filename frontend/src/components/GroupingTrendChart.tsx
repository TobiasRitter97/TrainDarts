import "./GroupingTrendChart.css";

type Round = { mm: number | null };

type Props = {
  rounds: Round[];
  bestIndex: number | null;
};

const WIDTH = 300;
const HEIGHT = 70;
const PADDING = 6;

// Einfacher, selbst gezeichneter SVG-Trend-Graph (keine zusaetzliche
// Chart-Bibliothek noetig - CLAUDE.md: "Keine unnoetigen
// Dependencies"). Kleinere mm-Werte (engeres Grouping) liegen weiter
// oben - Runden ohne gueltige Koordinaten (mm=null) werden als Luecke
// in der Linie dargestellt, nicht als 0.
export function GroupingTrendChart({ rounds, bestIndex }: Props) {
  const known = rounds.map((r) => r.mm).filter((mm): mm is number => mm !== null);
  if (known.length === 0) {
    return <div className="grouping-chart-empty">Noch keine Runde mit gültigen Koordinaten.</div>;
  }
  const maxMm = Math.max(...known);
  const minMm = Math.min(...known);
  const span = maxMm - minMm || 1;
  const stepX = rounds.length > 1 ? (WIDTH - 2 * PADDING) / (rounds.length - 1) : 0;

  function pointFor(i: number, mm: number): { x: number; y: number } {
    const x = PADDING + i * stepX;
    // kleiner mm-Wert = besser = weiter oben (kleineres y)
    const y = PADDING + ((mm - minMm) / span) * (HEIGHT - 2 * PADDING);
    return { x, y };
  }

  const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  let prev: { i: number; mm: number } | null = null;
  rounds.forEach((r, i) => {
    if (r.mm === null) return;
    if (prev) {
      const a = pointFor(prev.i, prev.mm);
      const b = pointFor(i, r.mm);
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    prev = { i, mm: r.mm };
  });

  return (
    <svg className="grouping-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
      {segments.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} className="grouping-chart-line" />
      ))}
      {rounds.map((r, i) => {
        if (r.mm === null) return null;
        const p = pointFor(i, r.mm);
        return <circle key={i} cx={p.x} cy={p.y} r={i === bestIndex ? 4 : 2.5} className={`grouping-chart-dot ${i === bestIndex ? "best" : ""}`} />;
      })}
    </svg>
  );
}
