import { useEffect, useState } from "react";
import { api, GameDefinition } from "../api";
import { STATIC_GAMES } from "../staticGames";
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
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api
      .listGames()
      .then((list) => {
        setGames(list);
        setLoading(false);
      })
      .catch(() => {
        // Kein Board erreichbar - trotzdem die (statische) Spieleliste
        // zeigen, damit die Oberflaeche komplett durchsuchbar bleibt
        // (Tobias-Feedback 09.09.2026). Nur das eigentliche Spielen
        // braucht die echte Verbindung.
        setGames(STATIC_GAMES);
        setLoading(false);
        setOffline(true);
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
      {offline && (
        <p className="screen-note">
          Kein Board verbunden — Spiele können angesehen werden, zum Spielen bitte oben auf „⚙ EINSTELLUNGEN"
          klicken und die IP deines Pi eingeben.
        </p>
      )}

      {categories.map((group) => (
        <section key={group.category} className="game-category" data-category={group.category}>
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
