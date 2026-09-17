import { FormEvent, useState } from "react";
import { Target } from "lucide-react";
import * as profilesDb from "../data/profiles";
import "./AuthScreen.css";

type Props = { email: string; onDone: () => void };

// Direkt nach der Registrierung: gleich ein Spielerprofil anlegen,
// statt erst in die Profilverwaltung zu muessen (Tobias-Anforderung
// 17.09.2026). Ueberspringbar, und er erscheint nur beim ERSTEN Start
// eines Kontos - App.tsx merkt sich das pro Konto.
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
      setError("Bitte gib einen Namen ein — oder wähle „Später“.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await profilesDb.createProfile({ name: trimmed });
      onDone();
    } catch {
      setError("Das Profil konnte nicht angelegt werden. Prüfe deine Internetverbindung.");
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

        <h1 className="auth-title">Spielerprofil anlegen</h1>
        <p className="auth-lede">
          Unter diesem Namen spielst du. Er steht später im Spielbildschirm und in der Statistik — weitere Spieler
          kannst du jederzeit ergänzen.
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
            <span className="auth-field-hint">Vorgeschlagen aus deiner E-Mail-Adresse — du kannst ihn ändern.</span>
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary auth-submit" disabled={busy}>
            {busy ? "Einen Moment…" : "Profil anlegen und loslegen"}
          </button>
          <button type="button" className="btn-secondary auth-submit" onClick={onDone} disabled={busy}>
            Später
          </button>
        </form>
      </div>
    </div>
  );
}
