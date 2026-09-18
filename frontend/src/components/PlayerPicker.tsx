import { useEffect, useState } from "react";
import { Profile } from "../api";
import * as profilesDb from "../data/profiles";
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
//
// Seit dem 18.09.2026 wird hier NUR noch ausgewaehlt. Anlegen,
// Umbenennen und Deaktivieren von Profilen liegen ausschliesslich im
// Profiles-Tab (screens/ProfileScreen.tsx) - vorher war beides
// vermischt und dieselbe Aktion an zwei Orten unterschiedlich streng.
export function PlayerPicker({ selected, onChange, max = 4 }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);




  useEffect(() => {
    profilesDb
      .listProfiles()
      .then((list) => {
        setProfiles(list);
        setError(null);
      })
      .catch(() => setError("Could not load profiles."))
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



  return (
    <div className="player-picker">
      {loading && <p className="screen-note">Loading profiles…</p>}
      {error && <p className="screen-error">{error}</p>}

      <div className="profile-grid">
        {profiles.map((profile) => {
          const order = selected.findIndex((p) => p.id === profile.id);
          return (
            <div key={profile.id} className={`profile-tile ${order >= 0 ? "selected" : ""}`}>
              {order >= 0 && <span className="order-badge">{order + 1}</span>}
              <button className="profile-tile-main" onClick={() => toggleSelect(profile)}>
                <span className="avatar" style={{ background: profile.color || DEFAULT_COLOR }}>
                  {(profile.initials || profile.name.slice(0, 2)).toUpperCase()}
                </span>
                <span className="profile-name">{profile.name}</span>
                {!!profile.is_guest && <span className="guest-tag">GUEST</span>}
              </button>
            </div>
          );
        })}
      </div>

      {!loading && profiles.length === 0 && (
        <p className="screen-note">
          No player profiles yet. Create one under <b>Profiles</b> in the top navigation.
        </p>
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
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  className="icon-btn"
                  disabled={index === selected.length - 1}
                  onClick={() => moveSelected(index, 1)}
                  title="Move down"
                >
                  ↓
                </button>
                <button className="icon-btn" onClick={() => removeSelected(profile.id)} title="Remove">
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
