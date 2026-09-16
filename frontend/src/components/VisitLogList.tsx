import { MatchPlayer, MatchVisit } from "../api";
import { dartLabelValue } from "../dartLabel";
import "./VisitLogList.css";

type Props = {
  history: MatchVisit[];
  players: MatchPlayer[];
  canAct: boolean;
  onSelectThrow: (throwSeq: number) => void;
};

// Restyled Verlauf der letzten Aufnahmen (Redesign 16.09.2026, Tobias'
// Referenzbild 2: "Visit Log"-Tab) - gleiche Daten wie zuvor
// ".visit-history", nur mit zusaetzlicher (rein zur Anzeige berechneter,
// siehe dartLabel.ts) Aufnahme-Summe pro Zeile. Reihenfolge: neueste
// zuerst (match.history liefert bereits die letzten HISTORY_LIMIT
// Aufnahmen in dieser Reihenfolge).
export function VisitLogList({ history, players, canAct, onSelectThrow }: Props) {
  if (history.length === 0) {
    return <p className="visit-log-empty">No visits yet.</p>;
  }
  return (
    <div className="visit-log-list">
      {history.map((visit, vi) => {
        const total = visit.throws.reduce((sum, t) => sum + dartLabelValue(t.label), 0);
        return (
          <div key={vi} className="visit-log-row">
            <span className="visit-log-index">#{history.length - vi}</span>
            <span className="visit-log-player">{players.find((p) => p.id === visit.playerId)?.name ?? "—"}</span>
            <span className="visit-log-throws">
              {visit.throws.map((t) => (
                <button
                  key={t.throwSeq}
                  type="button"
                  className="visit-log-chip"
                  disabled={!canAct}
                  onClick={() => canAct && onSelectThrow(t.throwSeq)}
                >
                  {t.label}
                </button>
              ))}
            </span>
            <span className="visit-log-total">{total}</span>
          </div>
        );
      })}
    </div>
  );
}
