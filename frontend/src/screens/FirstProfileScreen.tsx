import { FormEvent, useState } from "react";
import { Target } from "lucide-react";
import * as profilesDb from "../data/profiles";
import "./AuthScreen.css";

type Props = { email: string; onDone: () => void };

// Direkt nach der Registrierung: gleich ein Spielerprofil anlegen,
// statt erst in die Profilverwaltung zu muessen.
//
// Sicherheits-/Onboarding-Update 18.09.2026: der Schritt ist nicht mehr
// ueberspringbar, sondern sperrt den Weg in die Spiele, solange das
// Konto kein Profil hat. Ob er erscheint, entscheidet App.tsx anhand
// der tatsaechlichen Datenlage in Firestore - nicht anhand eines
// Merkers. Wer schon ein Profil hat, sieht ihn nie.
export function FirstProfileScreen({ email, onDone }: Props) {
  // Vorbelegung aus der E-Mail (Teil vor dem @), aber frei aenderbar.
  const [name, setName] = useState(() => {
    const local = email.split("@")[0] ?? "";
    if (!local) return "";
    const cleaned = local.replace(/[._-]+/g, " ").trim();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a name to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await profilesDb.createProfile({ name: trimmed });
      onDone();
    } catch {
      setError("The profile could not be created. Check your internet connection.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-icon">
            <Target size={22} strokeWidth={2.5} />
          </span>
          <span className="auth-brand-name">
            Train<span className="auth-brand-accent">Darts</span>
          </span>
        </div>

        <h1 className="auth-title">Create player profile</h1>
        <p className="auth-lede">
          One more step before you start: this is the name you play under. It shows up in the game screen and in your
          statistics — you can add more players at any time.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span className="auth-field-label">Name</span>
            <input
              type="text"
              className="auth-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <span className="auth-field-hint">Suggested from your email address — feel free to change it.</span>
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary auth-submit" disabled={busy}>
            {busy ? "One moment…" : "Create profile and start"}
          </button>
        </form>
      </div>
    </div>
  );
}
