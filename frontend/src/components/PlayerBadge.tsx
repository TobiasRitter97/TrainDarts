import { MatchPlayer } from "../api";
import "./PlayerBadge.css";

type Props = {
  player: MatchPlayer;
};

// Kleines Spieler-Abzeichen (Redesign 16.09.2026, Tobias' Referenzbild 2) -
// zeigt den aktiven Spieler im Info-Panel des Spielbildschirms.
export function PlayerBadge({ player }: Props) {
  const initials = (player.initials || player.name.slice(0, 2)).toUpperCase();
  return (
    <div className="player-badge">
      <span className="player-badge-avatar" style={{ background: player.color || "#22e0b0" }}>
        {initials}
      </span>
      <span className="player-badge-name">{player.name}</span>
    </div>
  );
}
