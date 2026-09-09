import { useEffect, useState } from "react";
import { Profile, defaultSettingsValues } from "../api";
import { GameSettingsForm } from "../components/GameSettingsForm";
import { ensureSignedIn } from "../data/firebase";
import { MatchEngine } from "../engine/matchEngine";
import * as roomDb from "../online/roomDb";
import { Room } from "../online/roomDb";
import { STATIC_GAMES } from "../staticGames";
import { OnlineGameScreen } from "./OnlineGameScreen";
import "./OnlineRoomScreen.css";

type Props = {
  pin: string;
  myProfile: Profile;
  onExit: () => void;
};

const MIN_PLAYERS = 2;

// Warteraum vor einer Online-Partie (Phase F, ~/.claude/plans/agile-
// brewing-wadler.md): zeigt die PIN (Host) bzw. die verbundenen
// Spieler (Gast), der Host waehlt Spiel + Einstellungen. Sobald der
// Raum auf "playing" wechselt, uebernimmt derselbe Screen nahtlos die
// laufende Partie (OnlineGameScreen) - kein zusaetzlicher
// Navigations-Schritt noetig.
export function OnlineRoomScreen({ pin, myProfile, onExit }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => roomDb.subscribeToRoom(pin, setRoom), [pin]);
  useEffect(() => {
    ensureSignedIn().then((u) => setMyUid(u.uid));
  }, []);

  if (!room || !myUid) {
    return <p className="screen-note">Verbinde…</p>;
  }

  const isHost = room.hostUid === myUid;
  const selectedGame = room.gameId ? STATIC_GAMES.find((g) => g.id === room.gameId) ?? null : null;

  if (room.status === "playing" && selectedGame) {
    return <OnlineGameScreen pin={pin} game={selectedGame} myUid={myUid} onExit={onExit} />;
  }

  function selectGame(gameId: string) {
    const game = STATIC_GAMES.find((g) => g.id === gameId);
    if (!game) return;
    roomDb.setRoomGame(pin, gameId, defaultSettingsValues(game.settingsSchema));
  }

  function updateSetting(key: string, value: unknown) {
    if (!room?.gameId) return;
    roomDb.setRoomGame(pin, room.gameId, { ...(room.settings ?? {}), [key]: value });
  }

  async function handleStart() {
    if (!selectedGame || room!.players.length < MIN_PLAYERS) return;
    setStarting(true);
    try {
      // Ein einmal lokal erzeugter initialer Event-Log (MATCH_STARTED),
      // damit alle Geraete vom selben Startzustand ausgehen - siehe
      // roomDb.startRoom().
      const playerRefs = room!.players.map((p) => ({ id: p.profileId, name: p.name, color: p.color, initials: p.initials }));
      const matchId = crypto.randomUUID();
      const engine = new MatchEngine(matchId, selectedGame, playerRefs, room!.settings ?? {});
      await roomDb.startRoom(pin, matchId, engine.events);
    } finally {
      setStarting(false);
    }
  }

  const implementedGames = STATIC_GAMES.filter((g) => g.implemented);

  return (
    <div className="online-room">
      <button className="btn-secondary back-btn" onClick={onExit}>
        ← Verlassen
      </button>

      <h1 className="screen-title">RAUM-PIN</h1>
      <div className="online-room-pin">{pin}</div>
      <p className="screen-note">Gib diese PIN an deinen Mitspieler weiter, damit er beitreten kann.</p>

      <h2 className="section-title">Spieler ({room.players.length}/4)</h2>
      <div className="panel online-player-list">
        {room.players.map((p) => (
          <div key={p.uid} className="online-player-row">
            <span className="avatar" style={{ background: p.color || "#d9a441" }}>
              {(p.initials || p.name.slice(0, 2)).toUpperCase()}
            </span>
            <span>{p.name}</span>
            {p.uid === room.hostUid && <span className="online-host-tag">HOST</span>}
          </div>
        ))}
      </div>

      {isHost ? (
        <>
          <h2 className="section-title">Spiel wählen</h2>
          <div className="game-card-grid online-game-grid">
            {implementedGames.map((g) => (
              <button
                key={g.id}
                className={`game-card ${room.gameId === g.id ? "selected" : ""}`}
                onClick={() => selectGame(g.id)}
              >
                <div className="game-card-icon">{g.icon}</div>
                <div className="game-card-title">{g.name}</div>
              </button>
            ))}
          </div>

          {selectedGame && selectedGame.settingsSchema.length > 0 && (
            <>
              <h2 className="section-title">Einstellungen</h2>
              <div className="panel">
                <GameSettingsForm
                  schema={selectedGame.settingsSchema}
                  values={room.settings ?? {}}
                  onChange={updateSetting}
                />
              </div>
            </>
          )}

          <button
            className="btn-primary continue-btn"
            disabled={!selectedGame || room.players.length < MIN_PLAYERS || starting}
            onClick={handleStart}
          >
            {starting ? "STARTE…" : room.players.length < MIN_PLAYERS ? "WARTE AUF MITSPIELER…" : "SPIEL STARTEN"}
          </button>
        </>
      ) : (
        <p className="screen-note">
          {selectedGame ? `Host hat "${selectedGame.name}" gewählt — warte auf Start…` : "Host wählt gerade ein Spiel…"}
        </p>
      )}
    </div>
  );
}
