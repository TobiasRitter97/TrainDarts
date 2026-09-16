import { MatchThrow } from "../api";
import { dartLabelValue } from "../dartLabel";
import "./ThrowSequenceBar.css";

type Props = {
  darts: (MatchThrow | null)[];
  pendingConfirmation: boolean;
  canAct: boolean;
  onSlotClick: (index: number, dart: MatchThrow | null) => void;
};

// Prominente Wurfsequenz-Leiste oben im Spielbildschirm (Redesign
// 16.09.2026, Tobias' Referenzbild 2: "T20 | 25 | D18 | 0") - ersetzt
// das bisherige reine 3-Felder-Grid (".current-throw-panel"). Die
// letzte Box zeigt die Summe der bereits geworfenen Darts dieser
// Aufnahme (reine Anzeige, siehe dartLabel.ts).
export function ThrowSequenceBar({ darts, pendingConfirmation, canAct, onSlotClick }: Props) {
  const visitTotal = darts.reduce((sum, d) => sum + (d ? dartLabelValue(d.label) : 0), 0);

  return (
    <div className="throw-sequence-bar">
      {darts.map((dart, i) => {
        const isNextEmpty = !dart && !pendingConfirmation && i === darts.filter(Boolean).length;
        return (
          <button
            key={i}
            type="button"
            className="throw-slot"
            disabled={!canAct || (!dart && !isNextEmpty)}
            onClick={() => onSlotClick(i, dart)}
          >
            <span className="throw-slot-label">DART {i + 1}</span>
            <span className={`throw-slot-value ${dart ? "filled" : isNextEmpty ? "addable" : "empty"}`}>
              {dart?.label ?? (isNextEmpty ? "+" : "—")}
            </span>
          </button>
        );
      })}
      <div className="throw-slot throw-slot-total">
        <span className="throw-slot-label">VISIT TOTAL</span>
        <span className="throw-slot-value filled">{visitTotal}</span>
      </div>
    </div>
  );
}
