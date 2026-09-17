import { TrendPoint } from "../data/gameStats";
import "./AverageTrendChart.css";

type Props = { points: TrendPoint[]; groupedByDay: boolean };

const WIDTH = 720;
const HEIGHT = 200;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 28;

// Verlauf des 3-Dart-Averages. Selbst gezeichnetes SVG - wie schon beim
// GroupingTrendChart bewusst ohne zusaetzliche Chart-Bibliothek
// (CLAUDE.md: "Keine unnoetigen Dependencies").
//
// Die Skala startet NICHT bei 0, sondern umschliesst die tatsaechlichen
// Werte mit etwas Luft. Bei Trainingsaverages um die 40-60 wuerde eine
// 0-Basis jede Veraenderung platt druecken - und genau die Veraenderung
// ist hier die Information.
export function AverageTrendChart({ points, groupedByDay }: Props) {
  if (points.length === 0) {
    return (
      <p className="trend-empty">
        No game with a meaningful average in this period yet — the curve is drawn from 170 and Pressure 501, where you
        play down from a high score.
      </p>
    );
  }

  if (points.length === 1) {
    const only = points[0];
    return (
      <div className="trend-single">
        <span className="trend-single-value">{only.average}</span>
        <span className="trend-single-label">
          3-dart average · {only.label}
          <br />
          One game so far — the curve starts with the second one.
        </span>
      </div>
    );
  }

  const values = points.map((p) => p.average);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max(2, (rawMax - rawMin) * 0.2);
  const min = Math.max(0, Math.floor(rawMin - pad));
  const max = Math.ceil(rawMax + pad);
  const span = max - min || 1;

  const stepX = (WIDTH - PAD_L - PAD_R) / (points.length - 1);
  const x = (i: number) => PAD_L + i * stepX;
  const y = (v: number) => PAD_T + (1 - (v - min) / span) * (HEIGHT - PAD_T - PAD_B);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.average).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${HEIGHT - PAD_B} L ${PAD_L} ${HEIGHT - PAD_B} Z`;

  // Drei Hilfslinien: unten, Mitte, oben.
  const ticks = [min, Math.round((min + max) / 2), max];
  // Bei vielen Punkten nicht jedes Datum beschriften, sonst ueberlappt es.
  const labelEvery = Math.ceil(points.length / 6);

  return (
    <figure className="trend-figure">
      <svg className="trend-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Average over time">
        {ticks.map((t) => (
          <g key={t}>
            <line className="trend-grid" x1={PAD_L} y1={y(t)} x2={WIDTH - PAD_R} y2={y(t)} />
            <text className="trend-axis" x={PAD_L - 8} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}

        <path className="trend-area" d={area} />
        <path className="trend-line" d={line} />

        {points.map((p, i) => (
          <circle key={i} className="trend-dot" cx={x(i)} cy={y(p.average)} r={points.length > 40 ? 2 : 4}>
            <title>
              {p.label}: {p.average}
              {p.games > 1 ? ` (${p.games} games)` : ""}
            </title>
          </circle>
        ))}

        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text key={`l${i}`} className="trend-axis" x={x(i)} y={HEIGHT - 8} textAnchor="middle">
              {p.label}
            </text>
          ) : null
        )}
      </svg>
      <figcaption className="trend-caption">
        3-dart average · {groupedByDay ? "one point per day" : "one point per game"}
      </figcaption>
    </figure>
  );
}
