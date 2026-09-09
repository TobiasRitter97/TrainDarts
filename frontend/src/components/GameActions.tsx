type Props = {
  canUndo: boolean;
  canConfirm: boolean;
  // Bei Online-Partien (Phase F) darf nur der gerade aktive Spieler
  // etwas veraendern - der andere Teilnehmer sieht die Buttons nur
  // deaktiviert (Tobias-Feedback 09.09.2026). Bei lokalen Partien immer
  // true (nur ein Geraet/Board im Spiel).
  canAct: boolean;
  onUndo: () => void;
  onAddDart: () => void;
  onConfirm: () => void;
  onExit: () => void;
};

// SPEC §12/§16: die vier immer sichtbaren Aktionen. "Aufnahme
// bestätigen" ist der manuelle Fallback fuer den Fall, dass das Board
// den Takeout nicht erkennt (docs/ARCHITEKTUR.md Abschnitt 2.1) - nur
// aktiv, wenn es tatsaechlich etwas zu bestaetigen gibt.
export function GameActions({ canUndo, canConfirm, canAct, onUndo, onAddDart, onConfirm, onExit }: Props) {
  return (
    <div className="game-actions">
      <button className="action-btn" disabled={!canUndo || !canAct} onClick={onUndo}>
        UNDO
      </button>
      <button className="action-btn" disabled={canConfirm || !canAct} onClick={onAddDart}>
        + DART
      </button>
      <button
        className={`action-btn ${canConfirm ? "action-btn-confirm" : ""}`}
        disabled={!canConfirm || !canAct}
        onClick={onConfirm}
      >
        AUFNAHME BESTÄTIGEN
      </button>
      <button className="action-btn action-btn-menu" onClick={onExit}>
        MENU
      </button>
    </div>
  );
}
