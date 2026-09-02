import { useEffect, useState } from "react";
import { api, defaultSettingsValues, GameDefinition, Profile } from "../api";
import { PlayerPicker } from "../components/PlayerPicker";
import { GameSettingsForm } from "../components/GameSettingsForm";
import "./GameSetupScreen.css";

type Props = {
  gameId: string;
  onBack: () => void;
};

// SPEC §32: derselbe Setup-Aufbau fuer jedes Spiel - Players, dann
// Game Settings (aus settingsSchema generiert), dann Start. Keine
// eigene Setup-Seite pro Spiel.
export function GameSetupScreen({ gameId, onBack }: Props) {
  const [game, setGame] = useState<GameDefinition | null>(null);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [started, setStarted] = useState(false);

  useEffect(() => {
    setGame(null);
    setStarted(false);
    api.listGames().then((list) => {
      const found = list.find((g) => g.id === gameId) ?? null;
      setGame(found);
      if (found) setSettings(defaultSettingsValues(found.settingsSchema));
    });
  }, [gameId]);

  if (!game) {
    return <p className="screen-note">Lade Spiel…</p>;
  }

  if (started) {
    return (
      <div className="game-setup">
        <h1 className="screen-title">{game.name} — bereit</h1>
        <p className="screen-note">Spieler: {players.map((p) => p.name).join(" → ")}</p>
        <p className="screen-note">
          Einstellungen: {Object.entries(settings).map(([k, v]) => `${k}=${v}`).join(", ") || "keine"}
        </p>
        <p className="screen-note">
          Der eigentliche Spielbildschirm entsteht in Phase 6 — hier sehen wir
          erstmal, dass Spielerauswahl und Einstellungen korrekt ankommen.
        </p>
        <div className="setup-actions">
          <button className="btn-secondary" onClick={() => setStarted(false)}>
            Zurück zum Setup
          </button>
          <button className="btn-secondary" onClick={onBack}>
            Zurück zum Game Hub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-setup">
      <button className="btn-secondary back-btn" onClick={onBack}>
        ← Game Hub
      </button>
      <h1 className="screen-title">{game.name}</h1>
      <p className="screen-note">{game.description}</p>

      <h2 className="section-title">Players</h2>
      <PlayerPicker selected={players} onChange={setPlayers} max={game.playerRange[1]} />

      {game.settingsSchema.length > 0 && (
        <>
          <h2 className="section-title">Game Settings</h2>
          <GameSettingsForm
            schema={game.settingsSchema}
            values={settings}
            onChange={(key, value) => setSettings((prev) => ({ ...prev, [key]: value }))}
          />
        </>
      )}

      <button
        className="btn-primary continue-btn"
        disabled={players.length === 0}
        onClick={() => setStarted(true)}
      >
        START GAME
      </button>
    </div>
  );
}
