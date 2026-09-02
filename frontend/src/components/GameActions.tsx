type Props = {
  canUndo: boolean;
  canConfirm: boolean;
  onUndo: () => void;
  onAddDart: () => void;
  onConfirm: () => void;
  onExit: () => void;
};

// SPEC §12/§16: die vier immer sichtbaren Aktionen. "Aufnahme
// bestätigen" ist der manuelle Fallback fuer den Fall, dass das Board
// den Takeout nicht erkennt (docs/ARCHITEKTUR.md Abschnitt 2.1) - nur
// aktiv, wenn es tatsaechlich etwas zu bestaetigen gibt.
export function GameActions({ canUndo, canConfirm, onUndo, onAddDart, onConfirm, onExit }: Props) {
  return (
    <div className="game-actions">
      <button className="action-btn" disabled={!canUndo} onClick={onUndo}>
        UNDO
      </button>
      <button className="action-btn" disabled={canConfirm} onClick={onAddDart}>
        + DART
      </button>
      <button className={`action-btn ${canConfirm ? "action-btn-confirm" : ""}`} disabled={!canConfirm} onClick={onConfirm}>
        AUFNAHME BESTÄTIGEN
      </button>
      <button className="action-btn action-btn-menu" onClick={onExit}>
        MENU
      </button>
    </div>
  );
}
