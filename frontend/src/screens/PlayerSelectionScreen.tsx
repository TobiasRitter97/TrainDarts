import { useEffect, useState, FormEvent } from "react";
import { api, Profile } from "../api";
import "./PlayerSelectionScreen.css";

const MAX_PLAYERS = 4;
const DEFAULT_COLOR = "#d9a441";

export function PlayerSelectionScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newInitials, setNewInitials] = useState("");

  const [showGuest, setShowGuest] = useState(false);
  const [guestName, setGuestName] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    setLoading(true);
    api
      .listProfiles()
      .then((list) => {
        setProfiles(list);
        setError(null);
      })
      .catch(() => setError("Profile konnten nicht geladen werden. Läuft das Backend?"))
      .finally(() => setLoading(false));
  }

  function isSelected(id: string) {
    return selected.some((p) => p.id === id);
  }

  function toggleSelect(profile: Profile) {
    if (isSelected(profile.id)) {
      setSelected((prev) => prev.filter((p) => p.id !== profile.id));
    } else if (selected.length < MAX_PLAYERS) {
      setSelected((prev) => [...prev, profile]);
    }
  }

  function moveSelected(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= selected.length) return;
    setSelected((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeSelected(id: string) {
    setSelected((prev) => prev.filter((p) => p.id !== id));
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const profile = await api.createProfile({
      name,
      initials: newInitials.trim() || undefined,
      color: DEFAULT_COLOR,
    });
    setProfiles((prev) => [...prev, profile]);
    if (selected.length < MAX_PLAYERS) setSelected((prev) => [...prev, profile]);
    setNewName("");
    setNewInitials("");
    setShowCreate(false);
  }

  async function submitGuest(e: FormEvent) {
    e.preventDefault();
    const name = guestName.trim();
    if (!name) return;
    const profile = await api.createProfile({ name, is_guest: true, color: "#6b756c" });
    setProfiles((prev) => [...prev, profile]);
    if (selected.length < MAX_PLAYERS) setSelected((prev) => [...prev, profile]);
    setGuestName("");
    setShowGuest(false);
  }

  function startEdit(profile: Profile) {
    setEditingId(profile.id);
    setEditName(profile.name);
  }

  async function submitEdit(e: FormEvent, id: string) {
    e.preventDefault();
    const name = editName.trim();
    if (!name) return;
    const updated = await api.updateProfile(id, { name });
    setProfiles((prev) => prev.map((p) => (p.id === id ? updated : p)));
    setSelected((prev) => prev.map((p) => (p.id === id ? updated : p)));
    setEditingId(null);
  }

  async function handleDelete(profile: Profile) {
    if (!confirm(`${profile.name} wirklich entfernen? Alte Ergebnisse bleiben erhalten.`)) return;
    await api.deleteProfile(profile.id);
    setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
    setSelected((prev) => prev.filter((p) => p.id !== profile.id));
  }

  if (confirmed) {
    return (
      <div className="player-selection">
        <h1 className="screen-title">Los geht's</h1>
        <p className="screen-note">
          Ausgewählt (in dieser Reihenfolge): {selected.map((p) => p.name).join(" → ")}
        </p>
        <p className="screen-note">
          Die nächsten Schritte (Spiel auswählen, Einstellungen, Spielbildschirm) entstehen in den
          kommenden Phasen. Für jetzt zeigt das nur, dass die Spielerauswahl vollständig funktioniert.
        </p>
        <button className="btn-secondary" onClick={() => setConfirmed(false)}>
          Zurück zur Auswahl
        </button>
      </div>
    );
  }

  return (
    <div className="player-selection">
      <h1 className="screen-title">WHO IS PLAYING?</h1>
      <p className="screen-note">1–4 Spieler auswählen. Reihenfolge unten änderbar.</p>

      {loading && <p className="screen-note">Lade Profile…</p>}
      {error && <p className="screen-error">{error}</p>}

      <div className="profile-grid">
        {profiles.map((profile) => {
          const order = selected.findIndex((p) => p.id === profile.id);
          const editing = editingId === profile.id;
          return (
            <div key={profile.id} className={`profile-tile ${order >= 0 ? "selected" : ""}`}>
              {order >= 0 && <span className="order-badge">{order + 1}</span>}
              {editing ? (
                <form className="edit-form" onSubmit={(e) => submitEdit(e, profile.id)}>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => setEditingId(null)}
                  />
                </form>
              ) : (
                <button className="profile-tile-main" onClick={() => toggleSelect(profile)}>
                  <span
                    className="avatar"
                    style={{ background: profile.color || DEFAULT_COLOR }}
                  >
                    {(profile.initials || profile.name.slice(0, 2)).toUpperCase()}
                  </span>
                  <span className="profile-name">{profile.name}</span>
                  {!!profile.is_guest && <span className="guest-tag">GAST</span>}
                </button>
              )}
              <div className="profile-tile-actions">
                <button
                  className="icon-btn"
                  title="Umbenennen"
                  onClick={() => startEdit(profile)}
                >
                  ✎
                </button>
                <button
                  className="icon-btn"
                  title="Entfernen"
                  onClick={() => handleDelete(profile)}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}

        <button className="profile-tile add-tile" onClick={() => setShowCreate((v) => !v)}>
          + SPIELER
        </button>
        <button className="profile-tile add-tile" onClick={() => setShowGuest((v) => !v)}>
          + GAST
        </button>
      </div>

      {showCreate && (
        <form className="inline-form" onSubmit={submitCreate}>
          <input
            autoFocus
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            placeholder="Kürzel (optional)"
            maxLength={3}
            value={newInitials}
            onChange={(e) => setNewInitials(e.target.value)}
          />
          <button className="btn-primary" type="submit">
            Profil anlegen
          </button>
        </form>
      )}

      {showGuest && (
        <form className="inline-form" onSubmit={submitGuest}>
          <input
            autoFocus
            placeholder="Name des Gasts"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
          />
          <button className="btn-primary" type="submit">
            Gast hinzufügen
          </button>
        </form>
      )}

      <h2 className="section-title">Ausgewählte Spieler</h2>
      {selected.length === 0 && <p className="screen-note">Noch niemand ausgewählt.</p>}
      <ol className="selected-list">
        {selected.map((profile, index) => (
          <li key={profile.id} className="selected-row">
            <span className="order-badge inline">{index + 1}</span>
            <span className="selected-name">{profile.name}</span>
            <div className="selected-actions">
              <button
                className="icon-btn"
                disabled={index === 0}
                onClick={() => moveSelected(index, -1)}
                title="Nach oben"
              >
                ↑
              </button>
              <button
                className="icon-btn"
                disabled={index === selected.length - 1}
                onClick={() => moveSelected(index, 1)}
                title="Nach unten"
              >
                ↓
              </button>
              <button className="icon-btn" onClick={() => removeSelected(profile.id)} title="Entfernen">
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>

      <button
        className="btn-primary continue-btn"
        disabled={selected.length === 0}
        onClick={() => setConfirmed(true)}
      >
        WEITER ({selected.length}/{MAX_PLAYERS})
      </button>
    </div>
  );
}
