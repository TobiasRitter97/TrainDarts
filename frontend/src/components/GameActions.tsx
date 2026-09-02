type Props = {
  onExit: () => void;
};

// SPEC §12: die drei immer sichtbaren Aktionen. UNDO und + DART
// gehoeren zum Correction-System (SPEC §14/§16), das erst in Phase 8
// gebaut wird - hier bewusst sichtbar, aber deaktiviert statt so zu
// tun als wuerden sie schon etwas tun.
export function GameActions({ onExit }: Props) {
  return (
    <div className="game-actions">
      <button className="action-btn" disabled title="Folgt in Phase 8 (Correction & Undo)">
        UNDO
      </button>
      <button className="action-btn" disabled title="Folgt in Phase 8 (Correction & Undo)">
        + DART
      </button>
      <button className="action-btn action-btn-menu" onClick={onExit}>
        MENU
      </button>
    </div>
  );
}
