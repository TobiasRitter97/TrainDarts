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

// Seit Phase E des Client-Rewrites (~/.claude/plans/agile-brewing-
// wadler.md) braucht die Spieleliste kein Backend mehr - staticGames.ts
// (frueher nur Offline-Fallback) ist jetzt die einzige Quelle, die
// komplette Spiellogik laeuft client-seitig.
export function GameHubScreen({ onSelectGame }: Props) {
  const categories = CATEGORY_ORDER.map((category) => ({
    category,
    games: STATIC_GAMES.filter((g) => g.category === category),
  })).filter((group) => group.games.length > 0);

  return (
    <div className="game-hub">
      <h1 className="screen-title">GAME HUB</h1>

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
