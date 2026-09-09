import { useEffect, useState } from "react";
import { api, defaultSettingsValues, GameDefinition, Leaderboard, Profile } from "../api";
import { PlayerPicker } from "../components/PlayerPicker";
import { GameSettingsForm } from "../components/GameSettingsForm";
import { STATIC_GAMES } from "../staticGames";
import { LOCAL_ENGINE_FAMILIES } from "../engine/localFamilies";
import "./GameSetupScreen.css";

export type LocalStartInfo = { game: GameDefinition; players: Profile[]; settings: Record<string, unknown> };

type Props = {
  gameId: string;
  onBack: () => void;
  // Ohne Argument: Match lief ueber das alte Backend (api.createMatch()
  // ist hier schon passiert). Mit LocalStartInfo: das Spiel gehoert zu
  // einer bereits auf die Client-Engine portierten Familie (Phase C/D
  // des Client-Rewrites) - App.tsx baut daraus einen LocalGameScreen.
  onStart: (local?: LocalStartInfo) => void;
};

// SPEC §32: derselbe Setup-Aufbau fuer jedes Spiel - Players, dann
// Game Settings (aus settingsSchema generiert), dann Start. Keine
// eigene Setup-Seite pro Spiel.
export function GameSetupScreen({ gameId, onBack, onStart }: Props) {
  const [game, setGame] = useState<GameDefinition | null>(null);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [leaderboards, setLeaderboards] = useState<Leaderboard[]>([]);

  useEffect(() => {
    setGame(null);
    setOffline(false);
    api
      .listGames()
      .then((list) => {
        const found = list.find((g) => g.id === gameId) ?? null;
        setGame(found);
        if (found) setSettings(defaultSettingsValues(found.settingsSchema));
      })
      .catch(() => {
        // Kein Board erreichbar - Setup-Screen trotzdem mit den
        // statischen Spieldaten anzeigen, damit man sich die Settings
        // ansehen kann (Tobias-Feedback 09.09.2026). Tatsaechlich
        // starten geht erst mit echter Verbindung (siehe handleStart).
        const found = STATIC_GAMES.find((g) => g.id === gameId) ?? null;
        setGame(found);
        if (found) setSettings(defaultSettingsValues(found.settingsSchema));
        setOffline(true);
      });
    api.getGameLeaderboard(gameId).then(setLeaderboards).catch(() => setLeaderboards([]));
  }, [gameId]);

  if (!game) {
    return <p className="screen-note">Lade Spiel…</p>;
  }

  async function handleStart() {
    if (!game) return;
    if (LOCAL_ENGINE_FAMILIES.has(game.engineFamily)) {
      onStart({ game, players, settings });
      return;
    }
    setStarting(true);
    setError(null);
    try {
      await api.createMatch(game.id, players.map((p) => p.id), settings);
      onStart();
    } catch {
      setError("Match konnte nicht gestartet werden.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="game-setup">
      <button className="btn-secondary back-btn" onClick={onBack}>
        ← Game Hub
      </button>
      <h1 className="screen-title">{game.name}</h1>
      <p className="screen-note">{game.description}</p>
      {offline && (
        <p className="screen-note">
          Kein Board verbunden — zum Spielen oben auf „⚙ EINSTELLUNGEN" klicken und die IP deines Pi eingeben.
        </p>
      )}

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

      {error && <p className="screen-error">{error}</p>}

      <button
        className="btn-primary continue-btn"
        disabled={players.length === 0 || starting}
        onClick={handleStart}
      >
        {starting ? "STARTE…" : "START GAME"}
      </button>
    </div>
  );
}
