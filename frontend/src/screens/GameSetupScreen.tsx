import { useEffect, useState } from "react";
import { defaultSettingsValues, GameDefinition, Leaderboard, Profile } from "../api";
import { PlayerPicker } from "../components/PlayerPicker";
import { GameSettingsForm, settingsAreValid } from "../components/GameSettingsForm";
import { STATIC_GAMES } from "../staticGames";
import { computeLeaderboardsForGame } from "../data/stats";
import { getLastUsedProfileId, recordProfileUsed } from "../data/localPrefs";
import * as profilesDb from "../data/profiles";
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
    setPlayers([]);
    computeLeaderboardsForGame(gameId)
      .then(setLeaderboards)
      .catch(() => setLeaderboards([]));

    // Vorbelegung mit dem zuletzt genutzten Profil (Tobias-Anforderung
    // 18.09.2026): fuer das haeufigste Solo-Training entfaellt so das
    // zusaetzliche Antippen des eigenen Profils vor jedem Spiel. Nur
    // ein Vorschlag - wer jemand anderen will oder zu zweit spielt,
    // aendert die Auswahl wie gewohnt ueber PlayerPicker.
    //
    // "prev.length === 0" schuetzt nur gegen die theoretische
    // Race-Bedingung, dass der Nutzer schneller selbst waehlt als
    // diese Anfrage zurueckkommt - eine manuelle Auswahl wird nie
    // ueberschrieben.
    profilesDb
      .listProfiles()
      .then((list) => {
        const last = list.find((p) => p.id === getLastUsedProfileId());
        if (last) setPlayers((prev) => (prev.length === 0 ? [last] : prev));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  if (!game) {
    return <p className="screen-error">Unknown game "{gameId}".</p>;
  }

  // Ein sichtbares Zahlenfeld ausserhalb seines min/max blockiert den
  // Start (z.B. eigene Dartzahl bei Pressure 501: nur 9-60 erlaubt).
  const valid = settingsAreValid(game.settingsSchema, settings);

  return (
    <div className="game-setup">
      <button className="btn-secondary back-btn" onClick={onBack}>
        ← Game Hub
      </button>
      <h1 className="screen-title">{game.name}</h1>
      <p className="screen-note">{game.description}</p>

      <h2 className="section-title">Players</h2>
      <div className="panel">
        <PlayerPicker selected={players} onChange={setPlayers} max={game.playerRange[1]} allowGuestCreation />
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

      {!valid && (
        <p className="screen-error">Please fix the highlighted setting - the value is outside the allowed range.</p>
      )}

      <button
        className="btn-primary continue-btn"
        disabled={players.length === 0 || !valid}
        onClick={() => {
          // Merkt sich geraetelokal, wer zuletzt gespielt hat - daraus
          // speist sich die Vorauswahl, nicht aus einem Flag am Profil.
          if (players[0]) recordProfileUsed(players[0].id);
          onStart({ game, players, settings });
        }}
      >
        START GAME
      </button>
    </div>
  );
}
