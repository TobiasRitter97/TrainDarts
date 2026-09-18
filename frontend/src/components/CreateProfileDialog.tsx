import { FormEvent, useState } from "react";
import { Profile } from "../api";
import * as profilesDb from "../data/profiles";
import { ProfileNameError } from "../data/profileNames";
import "./CreateProfileDialog.css";

type Props = {
  // Ein Gastspieler ist ein ganz normales Profil mit is_guest = 1 - nur
  // die Vorbelegung und die Beschriftung unterscheiden sich.
  asGuest?: boolean;
  onCreated: (profile: Profile) => void;
  onCancel: () => void;
};

// Der EINE Weg, ein Spielerprofil anzulegen. Wird vom Profiles-Tab und
// von der Spielerauswahl benutzt, damit es nicht zwei Anlegepfade mit
// unterschiedlich strenger Pruefung gibt. Die Namensregeln kommen
// unveraendert aus data/profileNames.ts ueber data/profiles.ts.
export function CreateProfileDialog({ asGuest = false, onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [initials, setInitials] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const profile = await profilesDb.createProfile({
        name,
        initials: initials.trim() || undefined,
        is_guest: asGuest,
        color: asGuest ? "#6b756c" : undefined,
      });
      setName("");
      setInitials("");
      onCreated(profile);
    } catch (err) {
      setError(err instanceof ProfileNameError ? err.message : "The profile could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="create-profile-dialog" onSubmit={submit}>
      <input
        autoFocus
        className="create-profile-input"
        placeholder={asGuest ? "Guest name" : "Name"}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
      />
      <input
        className="create-profile-input create-profile-initials"
        placeholder="Initials"
        maxLength={3}
        value={initials}
        onChange={(e) => setInitials(e.target.value)}
      />
      <button className="btn-primary" type="submit" disabled={busy}>
        {busy ? "…" : asGuest ? "Add guest" : "Create"}
      </button>
      <button className="btn-secondary" type="button" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      {error && (
        <p className="create-profile-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
