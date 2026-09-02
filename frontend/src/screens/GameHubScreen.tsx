import { useEffect, useState } from "react";
import { api, GameDefinition } from "../api";
import "./GameHubScreen.css";

const CATEGORY_ORDER = ["CHECKOUT", "DOUBLES", "ACCURACY"];
const CATEGORY_LABEL: Record<string, string> = {
  CHECKOUT: "Checkout",
  DOUBLES: "Doubles",
  ACCURACY: "Accuracy",
};

type Props = {
  onSelectGame: (gameId: string) => void;
};

export function GameHubScreen({ onSelectGame }: Props) {
  const [games, setGames] = useState<GameDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listGames().then((list) => {
      setGames(list);
      setLoading(false);
    });
  }, []);

  const categories = CATEGORY_ORDER.map((category) => ({
    category,
    games: games.filter((g) => g.category === category),
  })).filter((group) => group.games.length > 0);

  return (
    <div className="game-hub">
      <h1 className="screen-title">GAME HUB</h1>
      {loading && <p className="screen-note">Lade Spiele…</p>}

      {categories.map((group) => (
        <section key={group.category} className="game-category">
          <h2 className="section-title">{CATEGORY_LABEL[group.category] ?? group.category}</h2>
          <div className="game-card-grid">
            {group.games.map((game) => (
              <button
                key={game.id}
                className={`game-card ${game.implemented ? "" : "coming-soon"}`}
                disabled={!game.implemented}
                onClick={() => onSelectGame(game.id)}
              >
                <div className="game-card-icon">{game.icon}</div>
                <div className="game-card-title">{game.name}</div>
                <div className="game-card-desc">{game.description}</div>
                {!game.implemented && <div className="coming-soon-tag">COMING SOON</div>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
