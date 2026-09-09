import { useState } from "react";
import { Profile } from "../api";
import { PlayerPicker } from "../components/PlayerPicker";
import * as roomDb from "../online/roomDb";
import "./OnlineLobbyScreen.css";

type Props = {
  onBack: () => void;
  onEnterRoom: (pin: string, myProfile: Profile) => void;
};

type Mode = "choice" | "host-setup" | "join-setup";

// Online-Multiplayer-Einstieg (Phase F, siehe ~/.claude/plans/agile-
// brewing-wadler.md) - "genau wie arcadedarts" (Tobias' Vorgabe):
// Host erstellt einen Raum mit 5-stelliger PIN, ein Gast tritt per PIN
// bei. Ohne Video-Chat.
export function OnlineLobbyScreen({ onBack, onEnterRoom }: Props) {
  const [mode, setMode] = useState<Mode>("choice");
  const [myProfile, setMyProfile] = useState<Profile[]>([]);
  const [pinInput, setPinInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateRoom() {
    if (myProfile.length === 0) return;
    const me = myProfile[0];
    setBusy(true);
    setError(null);
    try {
      const pin = await roomDb.createRoom({ profileId: me.id, name: me.name, color: me.color, initials: me.initials });
      onEnterRoom(pin, me);
    } catch {
      setError("Raum konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinRoom() {
    const pin = pinInput.trim();
    if (myProfile.length === 0 || pin.length !== 5) return;
    const me = myProfile[0];
    setBusy(true);
    setError(null);
    try {
      await roomDb.joinRoom(pin, { profileId: me.id, name: me.name, color: me.color, initials: me.initials });
      onEnterRoom(pin, me);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beitreten fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "choice") {
    return (
      <div className="online-lobby">
        <button className="btn-secondary back-btn" onClick={onBack}>
          ← Game Hub
        </button>
        <h1 className="screen-title">ONLINE-SPIEL</h1>
        <p className="screen-note">Spiele mit jemandem an einem anderen Board über das Internet zusammen.</p>

        <div className="online-mode-grid">
          <button className="online-mode-card" onClick={() => setMode("host-setup")}>
            <div className="online-mode-title">Online-Spiel hosten</div>
            <div className="online-mode-desc">Erstellt einen Raum mit PIN, die du an deinen Mitspieler weitergibst.</div>
          </button>
          <button className="online-mode-card" onClick={() => setMode("join-setup")}>
            <div className="online-mode-title">Online-Spiel beitreten</div>
            <div className="online-mode-desc">Tritt mit der PIN eines bereits erstellten Raums bei.</div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="online-lobby">
      <button className="btn-secondary back-btn" onClick={() => setMode("choice")}>
        ← Zurück
      </button>
      <h1 className="screen-title">{mode === "host-setup" ? "RAUM ERSTELLEN" : "RAUM BEITRETEN"}</h1>

      {mode === "join-setup" && (
        <div className="panel online-pin-form">
          <label className="screen-note" htmlFor="room-pin">
            Raum-PIN
          </label>
          <input
            id="room-pin"
            className="online-pin-input"
            inputMode="numeric"
            maxLength={5}
            placeholder="12345"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
          />
        </div>
      )}

      <h2 className="section-title">Wer bist du?</h2>
      <div className="panel">
        <PlayerPicker selected={myProfile} onChange={setMyProfile} max={1} />
      </div>

      {error && <p className="screen-error">{error}</p>}

      <button
        className="btn-primary continue-btn"
        disabled={busy || myProfile.length === 0 || (mode === "join-setup" && pinInput.trim().length !== 5)}
        onClick={mode === "host-setup" ? handleCreateRoom : handleJoinRoom}
      >
        {busy ? "BITTE WARTEN…" : mode === "host-setup" ? "RAUM ERSTELLEN" : "BEITRETEN"}
      </button>
    </div>
  );
}
