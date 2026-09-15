import { useEffect, useState, FormEvent } from "react";
import { Profile, ProfileStats } from "../api";
import * as profilesDb from "../data/profiles";
import { computeProfileStats } from "../data/stats";
import "./ProfileScreen.css";

const DEFAULT_COLOR = "#d9a441";

type Props = {
  onBack: () => void;
};

// SPEC §5/§34/§35: dauerhafter Profile-Screen mit Statistiken und
// Bestleistungen ueber alle Matches hinweg (data/stats.ts, Phase E).
export function ProfileScreen({ onBack }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newInitials, setNewInitials] = useState("");
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    reloadProfiles();
  }, []);

  function reloadProfiles(selectAfter?: string) {
    profilesDb
      .listProfiles()
      .then((list) => {
        setLoadError(false);
        setProfiles(list);
        if (selectAfter) {
          setSelectedId(selectAfter);
        } else if (list.length > 0) {
          setSelectedId((prev) => (prev && list.some((p) => p.id === prev) ? prev : list[0].id));
        } else {
          setSelectedId(null);
        }
      })
      .catch(() => setLoadError(true));
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const profile = await profilesDb.createProfile({ name, initials: newInitials.trim() || undefined });
    setNewName("");
    setNewInitials("");
    setShowCreate(false);
    reloadProfiles(profile.id);
  }

  async function handleDelete(profile: Profile) {
    if (!confirm(`Really remove ${profile.name}? Past results are kept.`)) return;
    await profilesDb.archiveProfile(profile.id);
    reloadProfiles();
  }

  useEffect(() => {
    if (!selectedId) {
      setStats(null);
      return;
    }
    setLoadingStats(true);
    computeProfileStats(selectedId)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoadingStats(false));
  }, [selectedId]);

  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="profile-screen">
      <button className="btn-secondary back-btn" onClick={onBack}>
        ← Game Hub
      </button>
      <h1 className="screen-title">PROFILES</h1>

      <div className="profile-screen-layout">
        <div className="profile-list panel">
          {profiles.map((p) => (
            <div key={p.id} className={`profile-list-item ${p.id === selectedId ? "active" : ""}`}>
              <button className="profile-list-row" onClick={() => setSelectedId(p.id)}>
                <span className="avatar" style={{ background: p.color || DEFAULT_COLOR }}>
                  {(p.initials || p.name.slice(0, 2)).toUpperCase()}
                </span>
                <span className="profile-list-name">{p.name}</span>
              </button>
              <button className="icon-btn" title="Remove" onClick={() => handleDelete(p)}>
                ✕
              </button>
            </div>
          ))}
          {loadError && <p className="screen-error">Could not load profiles.</p>}
          {!loadError && profiles.length === 0 && <p className="screen-note">No profiles yet.</p>}

          {showCreate ? (
            <form className="inline-form profile-create-form" onSubmit={submitCreate}>
              <input autoFocus placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <input
                placeholder="Initials (optional)"
                maxLength={3}
                value={newInitials}
                onChange={(e) => setNewInitials(e.target.value)}
              />
              <div className="profile-create-actions">
                <button className="btn-primary" type="submit">
                  Create
                </button>
                <button className="btn-secondary" type="button" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button className="btn-outline add-profile-btn" onClick={() => setShowCreate(true)}>
              + PROFILE
            </button>
          )}
        </div>

        <div className="profile-detail">
          {!selectedProfile && <p className="screen-note">Select a profile to see its stats.</p>}
          {selectedProfile && loadingStats && <p className="screen-note">Loading stats…</p>}
          {selectedProfile && stats && !loadingStats && (
            <>
              <h2 className="section-title">{selectedProfile.name}</h2>

              <div className="stat-grid panel">
                <Stat label="Games" value={stats.gamesPlayed} />
                <Stat label="Wins" value={stats.wins} />
                <Stat label="Win Rate" value={fmtPct(stats.winPercent)} />
                <Stat label="Hit Rate" value={fmtPct(stats.accuracy)} />
                <Stat label="Single %" value={fmtPct(stats.singlePercent)} />
                <Stat label="Double %" value={fmtPct(stats.doublePercent)} />
                <Stat label="Triple %" value={fmtPct(stats.triplePercent)} />
                <Stat label="Bull %" value={fmtPct(stats.bullPercent)} />
                <Stat label="Checkout %" value={fmtPct(stats.checkoutPercent)} />
                <Stat label="Avg. Darts/Checkout" value={stats.averageCheckoutDarts ?? "—"} />
                <Stat label="Highest Checkout" value={stats.highestCheckout} />
                <Stat label="Scoring Average" value={stats.scoringAverage ?? "—"} />
              </div>

              {Object.keys(stats.perGame).length > 0 && (
                <>
                  <h2 className="section-title">Best Results per Game</h2>
                  <div className="panel per-game-list">
                    {Object.entries(stats.perGame).map(([gameId, g]) => (
                      <div key={gameId} className="per-game-row">
                        <span className="per-game-name">{g.gameName}</span>
                        <span className="per-game-meta">
                          {g.gamesPlayed} games · {g.wins} wins
                        </span>
                        <span className="per-game-best">{g.best ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {stats.history.length > 0 && (
                <>
                  <h2 className="section-title">Training History</h2>
                  <div className="panel history-list">
                    {stats.history.map((h) => (
                      <div key={h.matchId} className={`history-row ${h.won ? "won" : ""}`}>
                        <span className="history-game">{h.gameName}</span>
                        <span className="history-date">{new Date(h.finishedAt).toLocaleDateString()}</span>
                        <span className="history-value">{h.metricValue ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {stats.gamesPlayed === 0 && (
                <p className="screen-note">No completed matches for this profile yet.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtPct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-tile">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
