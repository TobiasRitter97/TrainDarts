import { FormEvent, useEffect, useState } from "react";
import { LogOut, Mail, Pencil, Power, RotateCcw, Trash2 } from "lucide-react";
import { Profile } from "../api";
import { accountErrorText, authErrorText, logout, sendPasswordReset, signedInUser } from "../data/firebase";
import { isGuest } from "../data/guestStore";
import * as profilesDb from "../data/profiles";
import { ProfileNameError } from "../data/profileNames";
import { CreateProfileDialog } from "../components/CreateProfileDialog";
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
  // Loeschdialog: erst die echten Zahlen holen, dann fragen.
  const [pendingDelete, setPendingDelete] = useState<{ profile: Profile; info: profilesDb.DeletionInfo } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editInitials, setEditInitials] = useState("");

  const [showInactive, setShowInactive] = useState<"active" | "all">("active");
  const [busy, setBusy] = useState(false);

  // Konto endgueltig loeschen (18.09.2026) - unabhaengig von den
  // Zustaenden fuer einzelne Spielerprofile oben, damit ein Fehler im
  // einen Dialog den anderen nicht verwirrt.
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [accountDeleteError, setAccountDeleteError] = useState<string | null>(null);
  const [accountDeleteBusy, setAccountDeleteBusy] = useState(false);

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

  async function askDelete(profile: Profile) {
    setError(null);
    setNotice(null);
    try {
      setPendingDelete({ profile, info: await profilesDb.profileDeletionInfo(profile.id) });
    } catch {
      setError("Could not check what deleting this profile would remove.");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || busy) return;
    setBusy(true);
    setError(null);
    try {
      await profilesDb.deleteProfile(pendingDelete.profile.id);
      setPendingDelete(null);
      reload();
    } catch (err) {
      report(err, "The profile could not be deleted.");
    } finally {
      setBusy(false);
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

  async function performDeleteAccount() {
    if (accountDeleteBusy) return;
    setAccountDeleteBusy(true);
    setAccountDeleteError(null);
    try {
      await profilesDb.deleteAccount();
      // Erfolg: deleteAccount() meldet die Firebase-Sitzung ab, der
      // Auth-Beobachter in App.tsx uebernimmt von hier - dieser Screen
      // wird gleich unmontiert.
    } catch (err) {
      setAccountDeleteError(accountErrorText(err));
      setAccountDeleteBusy(false);
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

            {notice && <p className="screen-note profile-notice">{notice}</p>}

            <div className="account-danger">
              <button
                className="btn-delete"
                onClick={() => {
                  setAccountDeleteError(null);
                  setShowDeleteAccount(true);
                }}
              >
                <Trash2 size={16} strokeWidth={2} /> Delete account
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

      <p className="screen-note profile-privacy-link">
        <a className="profile-quiet-link" href="/privacy">
          Privacy Policy
        </a>
      </p>

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
                    <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => askDelete(profile)}>
                      <Trash2 size={16} strokeWidth={2} />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {showCreate ? (
          <CreateProfileDialog
            onCancel={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              reload();
            }}
          />
        ) : (
          <button className="btn-outline add-profile-btn" onClick={() => setShowCreate(true)}>
            + PROFILE
          </button>
        )}
      </div>

      {pendingDelete && (
        <div className="delete-overlay" onClick={() => setPendingDelete(null)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="delete-title">
              {pendingDelete.info.ownGames > 0
                ? `Delete '${pendingDelete.profile.name}' and ${pendingDelete.info.ownGames} recorded ${
                    pendingDelete.info.ownGames === 1 ? "game" : "games"
                  }? This cannot be undone.`
                : `Delete '${pendingDelete.profile.name}'? This cannot be undone.`}
            </h2>

            {pendingDelete.info.sharedGames > 0 && (
              <p className="delete-note">
                {pendingDelete.info.sharedGames === 1
                  ? "1 further game also involves other players and will be kept."
                  : `${pendingDelete.info.sharedGames} further games also involve other players and will be kept.`}
              </p>
            )}

            {pendingDelete.info.blockedReason && (
              <p className="delete-blocked" role="alert">
                {pendingDelete.info.blockedReason}
              </p>
            )}

            <p className="delete-note">
              Deactivating instead keeps everything and can be undone at any time.
            </p>

            <div className="delete-actions">
              <button className="btn-secondary" onClick={() => setPendingDelete(null)} disabled={busy}>
                Cancel
              </button>
              {!pendingDelete.info.blockedReason && (
                <button className="btn-delete" onClick={confirmDelete} disabled={busy}>
                  {busy ? "Deleting…" : "Delete permanently"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="screen-note profile-hint">
        Deactivated profiles disappear from game selection but keep all their matches and statistics. Nothing is ever
        deleted.
      </p>

      {showDeleteAccount && (
        <div className="delete-overlay" onClick={() => !accountDeleteBusy && setShowDeleteAccount(false)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="delete-title">
              Do you really want to delete your account? Your saved training data and statistics will be permanently
              deleted.
            </h2>
            <p className="delete-note">
              This cannot be undone. If you'd rather keep everything, close this and deactivate a player profile
              instead — that's reversible.
            </p>

            {accountDeleteError && (
              <p className="delete-blocked" role="alert">
                {accountDeleteError}
              </p>
            )}

            <p className="delete-note profile-quiet-note">
              If deletion doesn't fully complete, write to{" "}
              <a className="profile-quiet-link" href="mailto:tobi.ritter@web.de">
                tobi.ritter@web.de
              </a>{" "}
              and it will be removed manually.
            </p>

            <div className="delete-actions">
              <button className="btn-secondary" onClick={() => setShowDeleteAccount(false)} disabled={accountDeleteBusy}>
                Cancel
              </button>
              <button className="btn-delete" onClick={performDeleteAccount} disabled={accountDeleteBusy}>
                {accountDeleteBusy ? "Deleting…" : "Delete account permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
