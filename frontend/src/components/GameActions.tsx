type Props = {
  canUndo: boolean;
  // Ob "+ DART" noch einen weiteren Dart derselben Aufnahme zulaesst -
  // false sobald die Aufnahme durch die Engine abgeschlossen wurde
  // (3 Darts, Bust, Checkout).
  canAddDart: boolean;
  // Ob "Aufnahme bestätigen" ueberhaupt anklickbar ist - schon ab dem
  // ERSTEN Dart der Aufnahme, nicht erst nach allen 3 (Tobias-Feedback
  // 11.09.2026: manuelles vorzeitiges Abschliessen, z.B. wenn nur 1-2
  // Darts geworfen werden sollen - die Engine wertet fehlende Darts
  // genauso wie bei einem echten fruehen Board-Takeout).
  canConfirm: boolean;
  // Ob die Aufnahme durch die Engine bereits ZWINGEND abgeschlossen ist
  // (3 Darts/Bust/Checkout) - steuert nur die auffaellige Hervorhebung
  // des Bestaetigen-Buttons, nicht seine Anklickbarkeit.
  visitComplete: boolean;
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
// bestätigen" ist zugleich der manuelle Fallback fuer den Fall, dass
// das Board den Takeout nicht erkennt (docs/ARCHITEKTUR.md Abschnitt
// 2.1), UND die Moeglichkeit, eine Aufnahme bewusst vorzeitig mit nur
// 1-2 Darts abzuschliessen.
export function GameActions({
  canUndo,
  canAddDart,
  canConfirm,
  visitComplete,
  canAct,
  onUndo,
  onAddDart,
  onConfirm,
  onExit,
}: Props) {
  return (
    <div className="game-actions">
      <button className="action-btn" disabled={!canUndo || !canAct} onClick={onUndo}>
        UNDO
      </button>
      <button className="action-btn" disabled={!canAddDart || !canAct} onClick={onAddDart}>
        + DART
      </button>
      <button
        className={`action-btn ${visitComplete ? "action-btn-confirm" : ""}`}
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
