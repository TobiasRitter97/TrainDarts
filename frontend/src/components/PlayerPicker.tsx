import { useEffect, useState, FormEvent } from "react";
import { api, Profile } from "../api";
import "./PlayerPicker.css";

const DEFAULT_COLOR = "#d9a441";

type Props = {
  selected: Profile[];
  onChange: (next: Profile[]) => void;
  max?: number;
};

// Wiederverwendbare Spielerauswahl (SPEC §5/§6), eingebettet im
// Game-Setup-Screen. Steuert sich komplett ueber selected/onChange,
// damit der Setup-Screen den gewaehlten Zustand kennt.
export function PlayerPicker({ selected, onChange, max = 4 }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newInitials, setNewInitials] = useState("");

  const [showGuest, setShowGuest] = useState(false);
  const [guestName, setGuestName] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    api
      .listProfiles()
      .then((list) => {
        setProfiles(list);
        setError(null);
      })
      .catch(() => setError("Profile konnten nicht geladen werden. Läuft das Backend?"))
      .finally(() => setLoading(false));
  }, []);

  function isSelected(id: string) {
    return selected.some((p) => p.id === id);
  }

  function toggleSelect(profile: Profile) {
    if (isSelected(profile.id)) {
      onChange(selected.filter((p) => p.id !== profile.id));
    } else if (selected.length < max) {
      onChange([...selected, profile]);
    }
  }

  function moveSelected(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function removeSelected(id: string) {
    onChange(selected.filter((p) => p.id !== id));
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
    if (selected.length < max) onChange([...selected, profile]);
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
    if (selected.length < max) onChange([...selected, profile]);
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
    onChange(selected.map((p) => (p.id === id ? updated : p)));
    setEditingId(null);
  }

  async function handleDelete(profile: Profile) {
    if (!confirm(`${profile.name} wirklich entfernen? Alte Ergebnisse bleiben erhalten.`)) return;
    await api.deleteProfile(profile.id);
    setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
    onChange(selected.filter((p) => p.id !== profile.id));
  }

  return (
    <div className="player-picker">
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
                  <span className="avatar" style={{ background: profile.color || DEFAULT_COLOR }}>
                    {(profile.initials || profile.name.slice(0, 2)).toUpperCase()}
                  </span>
                  <span className="profile-name">{profile.name}</span>
                  {!!profile.is_guest && <span className="guest-tag">GAST</span>}
                </button>
              )}
              <div className="profile-tile-actions">
                <button className="icon-btn" title="Umbenennen" onClick={() => startEdit(profile)}>
                  ✎
                </button>
                <button className="icon-btn" title="Entfernen" onClick={() => handleDelete(profile)}>
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
          <input autoFocus placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
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

      {selected.length > 0 && (
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
      )}
    </div>
  );
}
