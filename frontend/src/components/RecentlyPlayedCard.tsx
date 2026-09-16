import type { CSSProperties } from "react";
import { Play } from "lucide-react";
import { GameDefinition } from "../api";
import { gameIcon } from "../gameIcons";
import "./RecentlyPlayedCard.css";

type Props = {
  game: GameDefinition;
  categoryColor: string;
  onPlay: (gameId: string) => void;
};

// Kompakte horizontale Variante der GameCard fuer die "Recently
// Played"-Zeile im Game Hub (Redesign 16.09.2026, Tobias' Referenzbild 1).
export function RecentlyPlayedCard({ game, categoryColor, onPlay }: Props) {
  const Icon = gameIcon(game);
  return (
    <button
      type="button"
      className="recently-played-card"
      style={{ "--category-color": categoryColor } as CSSProperties}
      onClick={() => onPlay(game.id)}
    >
      <span className="recently-played-icon">
        <Icon size={22} strokeWidth={2} />
      </span>
      <span className="recently-played-info">
        <span className="recently-played-name">{game.name}</span>
        <span className="recently-played-desc">{game.description}</span>
      </span>
      <span className="recently-played-play">
        <Play size={18} strokeWidth={2} fill="currentColor" />
      </span>
    </button>
  );
}
