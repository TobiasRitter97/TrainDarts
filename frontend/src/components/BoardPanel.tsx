import { Camera, Settings, Undo2 } from "lucide-react";
import { BoardStatus } from "../board/autodartsAdapter";
import { MM_PER_COORD_UNIT } from "../engine/families/grouping";
import { ActionIconButton } from "./ActionIconButton";
import "./BoardPanel.css";

type Props = {
  boardStatus: BoardStatus;
  canUndo: boolean;
  canAct: boolean;
  onUndo: () => void;
  onOpenSettings: () => void;
  // Einschlagpunkte der aktuellen Aufnahme (Tobias-Feedback 16.09.2026) -
  // nur Darts, die das Board tatsaechlich mit Koordinaten gemeldet hat
  // (manuell erfasste Darts haben keine). Normalisiert, 1.0 = 170mm -
  // siehe CLAUDE.md "Verifizierte Koordinaten-Skala".
  liveThrows: { x: number; y: number }[];
};

const NUM_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const CX = 200;
const CY = 200;
// R-Werte sind direkt Millimeter (Standardmass Dartboard) - dieselbe
// Skala wie die verifizierten coords (1.0 = 170mm), siehe dartPosition().
const R = { bull: 6.35, outerBull: 16, tripleIn: 99, tripleOut: 107, doubleIn: 162, doubleOut: 170, label: 185, edge: 196 };

function polar(r: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

// Normalisierte Board-coords -> Position im SVG-Koordinatensystem
// (das bereits 1 Einheit = 1mm nutzt, siehe R oben). Y wird gespiegelt,
// weil SVG y nach unten waechst - gleiche Konvention wie im offiziellen
// Board-Manager-UI (dort: "cy: -coords.y * RADIUS").
function dartPosition(coord: { x: number; y: number }): [number, number] {
  return [CX + coord.x * MM_PER_COORD_UNIT, CY - coord.y * MM_PER_COORD_UNIT];
}

function sectorPath(rIn: number, rOut: number, a0: number, a1: number): string {
  const [x1, y1] = polar(rOut, a0);
  const [x2, y2] = polar(rOut, a1);
  const [x3, y3] = polar(rIn, a1);
  const [x4, y4] = polar(rIn, a0);
  return (
    `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${rOut} ${rOut} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} ` +
    `L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${rIn} ${rIn} 0 0 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`
  );
}

// Visueller Board-Bereich (Redesign 16.09.2026, Tobias' Referenzbild 2,
// Prioritaet 3) mit Live-Einschlagpunkten (Tobias-Feedback 16.09.2026,
// moeglich seit der verifizierten Koordinaten-Skala - siehe CLAUDE.md
// "Verifizierte Koordinaten-Skala"). Bewusst eine EIGENSTAENDIGE, rein
// deklarative SVG-Zeichnung statt einer Wiederverwendung von
// DartboardPicker.tsx - dort haengt die Geometrie eng mit der
// interaktiven Zeigen/Bestaetigen-Logik (Pointer-Events, Lupe) zusammen,
// die hier nicht gebraucht wird.
export function BoardPanel({ boardStatus, canUndo, canAct, onUndo, onOpenSettings, liveThrows }: Props) {
  const live = boardStatus === "connected";

  return (
    <div className="board-panel">
      <div className="board-panel-actions">
        <ActionIconButton icon={Camera} label="Camera / calibration (coming soon)" disabled />
        <ActionIconButton icon={Settings} label="Settings" onClick={onOpenSettings} />
        <ActionIconButton icon={Undo2} label="Undo last throw" onClick={onUndo} disabled={!canUndo || !canAct} />
      </div>

      <div className={`board-panel-stage ${live ? "live" : ""}`}>
        <span className={`board-panel-live-badge ${live ? "live" : ""}`}>
          <span className="board-panel-live-dot" />
          {live ? "LIVE" : boardStatus === "reconnecting" ? "CONNECTING" : "OFFLINE"}
        </span>

        <svg className="board-panel-svg" viewBox="0 0 400 400">
          <circle cx={CX} cy={CY} r={R.edge} className="board-bg" />
          {NUM_ORDER.map((num, i) => {
            const a0 = -9 + i * 18;
            const a1 = 9 + i * 18;
            const even = i % 2 === 0;
            const singleFill = even ? "var(--c-surface)" : "var(--c-text)";
            const ringFill = even ? "var(--c-danger)" : "var(--c-success)";
            const [lx, ly] = polar(R.label, i * 18);
            return (
              <g key={num}>
                <path d={sectorPath(R.outerBull, R.tripleIn, a0, a1)} fill={singleFill} />
                <path d={sectorPath(R.tripleIn, R.tripleOut, a0, a1)} fill={ringFill} />
                <path d={sectorPath(R.tripleOut, R.doubleIn, a0, a1)} fill={singleFill} />
                <path d={sectorPath(R.doubleIn, R.doubleOut, a0, a1)} fill={ringFill} />
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="board-number-label">
                  {num}
                </text>
              </g>
            );
          })}
          <circle cx={CX} cy={CY} r={R.outerBull} fill="var(--c-success)" />
          <circle cx={CX} cy={CY} r={R.bull} fill="var(--c-danger)" />
          {liveThrows.map((coord, i) => {
            const [x, y] = dartPosition(coord);
            return <circle key={i} cx={x} cy={y} r={6} className="board-dart-dot" />;
          })}
        </svg>
      </div>

      <button type="button" className="board-panel-status" onClick={onOpenSettings}>
        <span className={`board-panel-status-dot ${live ? "live" : ""}`} />
        {/* "Calibrated" waere ueberclaimt: wir kennen zwar seit
            16.09.2026 die Einheit/Skala der Board-coords (siehe
            engine/families/grouping.ts), aber NICHT den tatsaechlichen
            Kalibrierungs-Status der Kameras selbst - wir haben nur den
            WS-Verbindungsstatus. */}
        {live ? "Board Connected" : "Board Offline"}
      </button>
    </div>
  );
}
