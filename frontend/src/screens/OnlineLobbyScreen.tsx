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
      setError("Could not create room.");
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
      setError(err instanceof Error ? err.message : "Failed to join.");
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
        <h1 className="screen-title">ONLINE GAME</h1>
        <p className="screen-note">Play with someone on a different board over the internet.</p>

        <div className="online-mode-grid">
          <button className="online-mode-card" onClick={() => setMode("host-setup")}>
            <div className="online-mode-title">Host online game</div>
            <div className="online-mode-desc">Creates a room with a PIN you share with your opponent.</div>
          </button>
          <button className="online-mode-card" onClick={() => setMode("join-setup")}>
            <div className="online-mode-title">Join online game</div>
            <div className="online-mode-desc">Join an already created room using its PIN.</div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="online-lobby">
      <button className="btn-secondary back-btn" onClick={() => setMode("choice")}>
        ← Back
      </button>
      <h1 className="screen-title">{mode === "host-setup" ? "CREATE ROOM" : "JOIN ROOM"}</h1>

      {mode === "join-setup" && (
        <div className="panel online-pin-form">
          <label className="screen-note" htmlFor="room-pin">
            Room PIN
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

      <h2 className="section-title">Who are you?</h2>
      <div className="panel">
        <PlayerPicker selected={myProfile} onChange={setMyProfile} max={1} />
      </div>

      {error && <p className="screen-error">{error}</p>}

      <button
        className="btn-primary continue-btn"
        disabled={busy || myProfile.length === 0 || (mode === "join-setup" && pinInput.trim().length !== 5)}
        onClick={mode === "host-setup" ? handleCreateRoom : handleJoinRoom}
      >
        {busy ? "PLEASE WAIT…" : mode === "host-setup" ? "CREATE ROOM" : "JOIN"}
      </button>
    </div>
  );
}
