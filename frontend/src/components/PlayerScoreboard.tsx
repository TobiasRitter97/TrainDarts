import { MatchPlayer } from "../api";

type Props = {
  players: MatchPlayer[];
  activePlayerId: string;
  pendingConfirmation: boolean;
  pendingOutcome: string | null;
};

// SPEC §12/§13: alle Spieler auf einen Blick, aktiver Spieler klar
// erkennbar (Accent-Border + leichte Hintergrundaenderung, keine
// Animation). Score kommt aus der echten Game Engine.
//
// Bei einem Bust springt die Restpunktzahl automatisch zurueck auf den
// Aufnahme-Startwert (korrekte Darts-Regel) - ohne Kennzeichnung wirkt
// dieser Zahlensprung aber wie ein verwirrender Wechsel zwischen zwei
// verschiedenen Werten (Tobias-Feedback 10.09.2026). Solange die
// Aufnahme auf Bestaetigung wartet, zeigt die Kachel des aktiven
// Spielers deshalb klar "BUST" statt der zurueckgesprungenen Zahl -
// die echte Zahl erscheint erst wieder nach der Bestaetigung.
export function PlayerScoreboard({ players, activePlayerId, pendingConfirmation, pendingOutcome }: Props) {
  return (
    <div className="player-scoreboard">
      {players.map((player) => {
        const isActive = player.id === activePlayerId;
        const showBust = isActive && pendingConfirmation && pendingOutcome === "bust";
        return (
          <div key={player.id} className={`scoreboard-tile ${isActive ? "active" : ""}`}>
            <div className="scoreboard-name">{player.name}</div>
            <div className={`scoreboard-score ${showBust ? "bust" : ""}`}>{showBust ? "BUST" : player.score ?? "—"}</div>
          </div>
        );
      })}
    </div>
  );
}
