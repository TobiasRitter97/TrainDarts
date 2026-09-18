import { FormEvent, useEffect, useState } from "react";
import { LogOut, Mail, Pencil, Power, RotateCcw } from "lucide-react";
import { Profile } from "../api";
import { authErrorText, logout, sendPasswordReset, signedInUser } from "../data/firebase";
import { isGuest } from "../data/guestStore";
import * as profilesDb from "../data/profiles";
import { ProfileNameError } from "../data/profileNames";
import { SegmentedControl } from "../components/SegmentedControl";
import "./ProfileScreen.css";

type Props = { onBack: () => void };

const DEFAULT_COLOR = "#d9a441";

// Der Profiles-Tab (Umbau 18.09.2026). Trennt zwei Dinge, die vorher
// vermischt waren:
//
//   KONTO          - genau eines pro Nutzer: Adresse, Status, Passwort,
//                    Abmelden. Entfaellt im Gast-Modus.
//   SPIELERPROFILE - beliebig viele: anlegen, umbenennen, Farbe und
//                    Kuerzel, deaktivieren und wieder aktivieren.
//
// Statistiken stehen bewusst NICHT hier - dafuer gibt es den eigenen
// Statistics-Tab. Zwei Orte fuer dieselben Zahlen laufen auseinander.
//
// Es gibt kein Haupt-Profil: das bei der Registrierung angelegte
// Profil ist ein ganz normales. Eine Vorauswahl kommt allein aus der
// geraetelokalen Notiz "zuletzt genutzt" (data/localPrefs.ts).
export function ProfileScreen({ onBack }: Props) {
  const guest = isGuest();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newInitials, setNewInitials] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editInitials, setEditInitials] = useState("");

  const [showInactive, setShowInactive] = useState<"active" | "all">("active");
  const [busy, setBusy] = useState(false);

  function reload() {
    // includeArchived: der Tab zeigt auch deaktivierte Profile, damit
    // sie sich wieder aktivieren lassen.
    profilesDb
      .listProfiles(true, true)
      .then((list) => {
        setProfiles(list);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }

  useEffect(reload, []);

  function report(err: unknown, fallback: string) {
    setError(err instanceof ProfileNameError ? err.message : fallback);
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await profilesDb.createProfile({ name: newName, initials: newInitials.trim() || undefined });
      setNewName("");
      setNewInitials("");
      setShowCreate(false);
      reload();
    } catch (err) {
      report(err, "The profile could not be created.");
    }
  }

  function startEdit(profile: Profile) {
    setError(null);
    setNotice(null);
    setEditingId(profile.id);
    setEditName(profile.name);
    setEditInitials(profile.initials ?? "");
  }

  async function submitEdit(e: FormEvent, id: string) {
    e.preventDefault();
    setError(null);
    try {
      await profilesDb.updateProfile(id, { name: editName, initials: editInitials.trim() });
      setEditingId(null);
      reload();
    } catch (err) {
      report(err, "The profile could not be saved.");
    }
  }

  async function setActive(profile: Profile, active: boolean) {
    setError(null);
    setNotice(null);
    try {
      if (active) await profilesDb.reactivateProfile(profile.id);
      else await profilesDb.archiveProfile(profile.id);
      reload();
    } catch (err) {
      report(err, "That did not work.");
    }
  }

  async function changePassword() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const address = await sendPasswordReset();
      setNotice(`We sent a link to ${address}. Open it to choose a new password.`);
    } catch (err) {
      setError(authErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  const active = profiles.filter((p) => p.archived_at === null);
  const inactive = profiles.filter((p) => p.archived_at !== null);
  const shown = showInactive === "all" ? profiles : active;
  const account = signedInUser();

  return (
    <div className="profile-screen">
      <button className="btn-secondary back-btn" onClick={onBack}>
        ← Game Hub
      </button>
      <h1 className="screen-title">Profiles</h1>

      {!guest && account && (
        <>
          <h2 className="section-title">Account</h2>
          <div className="panel account-panel">
            <div className="account-row">
              <span className="account-label">
                <Mail size={16} strokeWidth={2} /> Email
              </span>
              <span className="account-value">{account.email}</span>
            </div>
            <div className="account-row">
              <span className="account-label">Status</span>
              <span className="account-value account-verified">Confirmed</span>
            </div>
            <div className="account-actions">
              <button className="btn-secondary" onClick={changePassword} disabled={busy}>
                {busy ? "Sending…" : "Change password"}
              </button>
              <button className="btn-secondary account-logout" onClick={() => void logout()}>
                <LogOut size={16} strokeWidth={2} /> Sign out
              </button>
            </div>
          </div>
        </>
      )}

      {guest && (
        <div className="panel account-panel">
          <p className="screen-note">
            Guest mode — these players live only in this browser and are not tied to an account.
          </p>
        </div>
      )}

      <h2 className="section-title">Player profiles</h2>

      {inactive.length > 0 && (
        <SegmentedControl
          label="Show"
          options={[
            { value: "active", label: `Active (${active.length})` },
            { value: "all", label: `All (${profiles.length})` },
          ]}
          value={showInactive}
          onChange={(value) => setShowInactive(value as "active" | "all")}
        />
      )}

      <div className="panel profile-manage">
        {loadError && <p className="screen-error">Could not load profiles.</p>}
        {error && <p className="screen-error">{error}</p>}
        {notice && <p className="screen-note profile-notice">{notice}</p>}
        {!loadError && profiles.length === 0 && <p className="screen-note">No player profiles yet.</p>}

        {shown.map((profile) => {
          const archived = profile.archived_at !== null;
          return (
            <div key={profile.id} className={`profile-manage-row ${archived ? "archived" : ""}`}>
              {editingId === profile.id ? (
                <form className="profile-edit-form" onSubmit={(e) => submitEdit(e, profile.id)}>
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" />
                  <input
                    value={editInitials}
                    onChange={(e) => setEditInitials(e.target.value)}
                    placeholder="Initials"
                    maxLength={3}
                  />
                  <button className="btn-primary" type="submit">
                    Save
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span className="avatar" style={{ background: profile.color || DEFAULT_COLOR }}>
                    {(profile.initials || profile.name.slice(0, 2)).toUpperCase()}
                  </span>
                  <span className="profile-manage-name">{profile.name}</span>
                  {archived && <span className="profile-inactive-tag">INACTIVE</span>}
                  <div className="profile-manage-actions">
                    <button className="icon-btn" title="Rename" onClick={() => startEdit(profile)}>
                      <Pencil size={16} strokeWidth={2} />
                    </button>
                    <button
                      className="icon-btn"
                      title={archived ? "Reactivate" : "Deactivate"}
                      onClick={() => setActive(profile, archived)}
                    >
                      {archived ? <RotateCcw size={16} strokeWidth={2} /> : <Power size={16} strokeWidth={2} />}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {showCreate ? (
          <form className="profile-edit-form" onSubmit={submitCreate}>
            <input autoFocus placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input
              placeholder="Initials (optional)"
              maxLength={3}
              value={newInitials}
              onChange={(e) => setNewInitials(e.target.value)}
            />
            <button className="btn-primary" type="submit">
              Create
            </button>
            <button className="btn-secondary" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button className="btn-outline add-profile-btn" onClick={() => setShowCreate(true)}>
            + PROFILE
          </button>
        )}
      </div>

      <p className="screen-note profile-hint">
        Deactivated profiles disappear from game selection but keep all their matches and statistics. Nothing is ever
        deleted.
      </p>
    </div>
  );
}
