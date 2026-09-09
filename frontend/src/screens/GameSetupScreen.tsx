import { useEffect, useState } from "react";
import { defaultSettingsValues, GameDefinition, Leaderboard, Profile } from "../api";
import { PlayerPicker } from "../components/PlayerPicker";
import { GameSettingsForm } from "../components/GameSettingsForm";
import { STATIC_GAMES } from "../staticGames";
import { computeLeaderboardsForGame } from "../data/stats";
import "./GameSetupScreen.css";

export type LocalStartInfo = { game: GameDefinition; players: Profile[]; settings: Record<string, unknown> };

type Props = {
  gameId: string;
  onBack: () => void;
  onStart: (local: LocalStartInfo) => void;
};

// SPEC §32: derselbe Setup-Aufbau fuer jedes Spiel - Players, dann
// Game Settings (aus settingsSchema generiert), dann Start. Keine
// eigene Setup-Seite pro Spiel.
//
// Seit Phase E des Client-Rewrites (~/.claude/plans/agile-brewing-
// wadler.md) braucht dieser Screen KEIN Backend mehr: die Spieldaten
// kommen direkt aus staticGames.ts (frueher nur Offline-Fallback, jetzt
// die einzige Quelle) und die Bestenliste wird lokal aus Firestore
// berechnet (data/stats.ts) - nur PlayerPicker braucht noch eine
// Firestore-Verbindung fuer die Profile, das eigentliche Spiel danach
// zusaetzlich die Board-Verbindung (Phase A).
export function GameSetupScreen({ gameId, onBack, onStart }: Props) {
  const game = STATIC_GAMES.find((g) => g.id === gameId) ?? null;
  const [players, setPlayers] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>(game ? defaultSettingsValues(game.settingsSchema) : {});
  const [leaderboards, setLeaderboards] = useState<Leaderboard[]>([]);

  useEffect(() => {
    setSettings(game ? defaultSettingsValues(game.settingsSchema) : {});
    computeLeaderboardsForGame(gameId)
      .then(setLeaderboards)
      .catch(() => setLeaderboards([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  if (!game) {
    return <p className="screen-error">Unbekanntes Spiel "{gameId}".</p>;
  }

  return (
    <div className="game-setup">
      <button className="btn-secondary back-btn" onClick={onBack}>
        ← Game Hub
      </button>
      <h1 className="screen-title">{game.name}</h1>
      <p className="screen-note">{game.description}</p>

      <h2 className="section-title">Players</h2>
      <div className="panel">
        <PlayerPicker selected={players} onChange={setPlayers} max={game.playerRange[1]} />
      </div>

      {game.settingsSchema.length > 0 && (
        <>
          <h2 className="section-title">Game Settings</h2>
          <div className="panel">
            <GameSettingsForm
              schema={game.settingsSchema}
              values={settings}
              onChange={(key, value) => setSettings((prev) => ({ ...prev, [key]: value }))}
            />
          </div>
        </>
      )}

      {leaderboards.length > 0 && (
        <>
          <h2 className="section-title">All-Time Leaderboard</h2>
          {leaderboards.map((board) => (
            <div key={board.configHash} className="panel leaderboard-panel">
              <div className="leaderboard-config">{board.configLabel}</div>
              {board.entries.map((entry, i) => (
                <div key={entry.profileId} className="leaderboard-row">
                  <span className="leaderboard-rank">{i + 1}.</span>
                  <span
                    className="avatar leaderboard-avatar"
                    style={{ background: entry.color || "#d9a441" }}
                  >
                    {entry.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="leaderboard-name">{entry.name}</span>
                  <span className="leaderboard-value">{entry.value}</span>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      <button
        className="btn-primary continue-btn"
        disabled={players.length === 0}
        onClick={() => onStart({ game, players, settings })}
      >
        START GAME
      </button>
    </div>
  );
}
