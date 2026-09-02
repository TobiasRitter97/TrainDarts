import { MatchState, MatchPlayer } from "../api";
import "./ResultScreen.css";

type Props = {
  match: MatchState;
  onRematch: () => void;
  onExit: () => void;
};

// SPEC §33, erste einfache Version: Rangliste + je Spieler die
// vorhandenen Kennzahlen (je nach Spiel unterschiedlich - Sets/Legs
// bei 170, Gesamtscore bei Bob's 27, erfolgreiche Checkouts bei
// Random Checkout). REMATCH und GAME HUB genuegen fuer den ersten
// Durchstich; SAME/CHANGE PLAYERS und OTHER GAME folgen spaeter.
function rankValue(p: MatchPlayer, setsEnabled: boolean): number {
  if (setsEnabled) return (p.setsWon ?? 0) * 1000 + (p.legsWon ?? 0);
  // 121: hoechstes erreichtes Level entscheidet, bei Gleichstand
  // erfolgreiche Checkouts (SPEC §18).
  if (p.highestLevel !== null) return p.highestLevel * 1000 + (p.successfulCheckouts ?? 0);
  return p.legsWon ?? p.totalScore ?? p.successfulCheckouts ?? p.score ?? 0;
}

export function ResultScreen({ match, onRematch, onExit }: Props) {
  const setsEnabled = Boolean(match.settings?.setsEnabled);
  const ranked = [...match.players].sort((a, b) => rankValue(b, setsEnabled) - rankValue(a, setsEnabled));

  return (
    <div className="result-screen">
      <h1 className="screen-title">🏆 RESULTS</h1>
      <p className="screen-note">{match.gameName}</p>

      <ol className="result-list">
        {ranked.map((p, i) => (
          <li key={p.id} className={`result-row ${p.id === match.winnerId ? "winner" : ""}`}>
            <span className="result-rank">{i + 1}.</span>
            <span className="result-name">{p.name}</span>
            <span className="result-value">
              {setsEnabled && `${p.setsWon} Sets (${p.legsWon} Legs)`}
              {!setsEnabled && p.highestLevel !== null && `Level ${p.highestLevel} (${p.successfulCheckouts}/${p.attempts})`}
              {!setsEnabled && p.highestLevel === null && p.legsWon !== null && `${p.legsWon} Legs`}
              {!setsEnabled && p.highestLevel === null && p.legsWon === null && p.totalScore !== null && `${p.totalScore} Punkte`}
              {!setsEnabled && p.highestLevel === null && p.legsWon === null && p.totalScore === null && p.successfulCheckouts !== null &&
                `${p.successfulCheckouts}/${p.attempts} Checkouts`}
            </span>
          </li>
        ))}
      </ol>

      <div className="result-stats">
        {ranked.map((p) => (
          <div key={p.id} className="result-stat-card">
            <div className="result-stat-name">{p.name}</div>
            {p.highestCheckout ? <div className="result-stat-row">Highest Checkout: <b>{p.highestCheckout}</b></div> : null}
            {p.highestLevel !== null ? <div className="result-stat-row">Highest Level: <b>{p.highestLevel}</b></div> : null}
            {p.bestRun !== null && p.bestRun !== undefined ? <div className="result-stat-row">Best Run: <b>{p.bestRun}</b></div> : null}
            {p.successfulCheckouts !== null && p.attempts ? (
              <div className="result-stat-row">
                Checkout %: <b>{Math.round((p.successfulCheckouts / p.attempts) * 100)}%</b>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="result-actions">
        <button className="btn-primary" onClick={onRematch}>
          REMATCH
        </button>
        <button className="btn-secondary" onClick={onExit}>
          GAME HUB
        </button>
      </div>
    </div>
  );
}
