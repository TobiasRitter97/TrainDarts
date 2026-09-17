import { useState } from "react";
import { Target } from "lucide-react";
import { takeOverGuestData } from "../data/guestTakeover";
import "./AuthScreen.css";

type Props = { summary: { profiles: number; matches: number }; onDone: () => void };

// Ein Gast hat sich angemeldet und hat lokale Daten. Weder
// stillschweigend uebernehmen noch stillschweigend verwerfen - er
// entscheidet (Tobias-Anforderung 17.09.2026).
//
// Bewusst ALLES ODER NICHTS: Matches verweisen ueber die Profil-ID auf
// ihre Spieler. Nur eines von beidem zu uebernehmen ergaebe eine
// Statistik mit unbekannten Namen bzw. Profile ohne Spiele.
export function GuestTakeoverScreen({ summary, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function takeOver() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await takeOverGuestData();
      onDone();
    } catch {
      setError("The transfer did not work. Check your internet connection — your local data is untouched.");
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

        <h1 className="auth-title">Carry over guest data?</h1>
        <p className="auth-lede">
          This device still holds{" "}
          <b>
            {summary.profiles} {summary.profiles === 1 ? "player" : "players"}
          </b>{" "}
          and{" "}
          <b>
            {summary.matches} {summary.matches === 1 ? "finished game" : "finished games"}
          </b>{" "}
          from guest mode. Move them into your account?
        </p>
        <p className="auth-note">
          Players and games always move together — games reference their players, so taking only one of the two would
          leave your statistics without names. If you decline, the data simply stays local and is not deleted.
        </p>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <div className="auth-form">
          <button type="button" className="btn-primary auth-submit" onClick={takeOver} disabled={busy}>
            {busy ? "Transferring…" : "Yes, move into my account"}
          </button>
          <button type="button" className="btn-secondary auth-submit" onClick={onDone} disabled={busy}>
            No, keep them separate
          </button>
        </div>
      </div>
    </div>
  );
}
