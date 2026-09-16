import type { CSSProperties, KeyboardEvent } from "react";
import { Play, Star, Users } from "lucide-react";
import { GameDefinition } from "../api";
import { gameIcon } from "../gameIcons";
import "./GameCard.css";

type Props = {
  game: GameDefinition;
  categoryColor: string;
  favorite: boolean;
  onToggleFavorite: (gameId: string) => void;
  onPlay: (gameId: string) => void;
};

// Hochwertige Game-Card (Redesign 16.09.2026, Tobias' Referenzbild 1) -
// ersetzt die bisherige reine Emoji+Titel+Beschreibung-Karte. Die ganze
// Karte ist klickbar (startet das Spiel), Stern und Play-Button sind
// eigene Buttons mit stopPropagation, damit sie nicht verschachtelt in
// einem <button> liegen (ungueltiges HTML/A11y).
export function GameCard({ game, categoryColor, favorite, onToggleFavorite, onPlay }: Props) {
  const Icon = gameIcon(game);
  const comingSoon = !game.implemented;

  function handleActivate() {
    if (!comingSoon) onPlay(game.id);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleActivate();
    }
  }

  return (
    <div
      className={`game-card ${comingSoon ? "coming-soon" : ""}`}
      style={{ "--category-color": categoryColor } as CSSProperties}
      role="button"
      tabIndex={comingSoon ? -1 : 0}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      aria-disabled={comingSoon}
    >
      <div className="game-card-top">
        <div className="game-card-icon">
          <Icon size={26} strokeWidth={2} />
        </div>
        <button
          type="button"
          className={`game-card-favorite ${favorite ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(game.id);
          }}
          title={favorite ? "Remove from favorites" : "Add to favorites"}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star size={18} strokeWidth={2} fill={favorite ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="game-card-title">{game.name}</div>
      <div className="game-card-category">{CATEGORY_LABEL[game.category] ?? game.category}</div>
      <p className="game-card-desc">{game.description}</p>

      <div className="game-card-footer">
        <span className="game-card-players">
          <Users size={16} strokeWidth={2} />
          {game.playerRange[0]}–{game.playerRange[1]} players
        </span>
        {comingSoon ? (
          <span className="coming-soon-tag">COMING SOON</span>
        ) : (
          <button
            type="button"
            className="game-card-play"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(game.id);
            }}
            title={`Play ${game.name}`}
            aria-label={`Play ${game.name}`}
          >
            <Play size={20} strokeWidth={2} fill="currentColor" />
          </button>
        )}
      </div>
    </div>
  );
}

const CATEGORY_LABEL: Record<string, string> = {
  CHECKOUT: "Checkout Training",
  DOUBLES: "Doubles Training",
  ACCURACY: "Accuracy Training",
};
