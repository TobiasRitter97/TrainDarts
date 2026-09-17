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
      setError("Die Übernahme hat nicht geklappt. Prüfe deine Internetverbindung — deine lokalen Daten sind unberührt.");
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

        <h1 className="auth-title">Gast-Daten übernehmen?</h1>
        <p className="auth-lede">
          Auf diesem Gerät liegen aus dem Gast-Modus noch{" "}
          <b>
            {summary.profiles} {summary.profiles === 1 ? "Spieler" : "Spieler"}
          </b>{" "}
          und{" "}
          <b>
            {summary.matches} {summary.matches === 1 ? "abgeschlossenes Spiel" : "abgeschlossene Spiele"}
          </b>
          . Sollen sie in dein Konto wandern?
        </p>
        <p className="auth-note">
          Spieler und Spiele wandern immer gemeinsam — die Spiele verweisen auf ihre Spieler, einzeln übernommen fehlten
          in der Statistik die Namen. Entscheidest du dich dagegen, bleiben die Daten lokal liegen und werden nicht
          gelöscht.
        </p>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <div className="auth-form">
          <button type="button" className="btn-primary auth-submit" onClick={takeOver} disabled={busy}>
            {busy ? "Wird übernommen…" : "Ja, ins Konto übernehmen"}
          </button>
          <button type="button" className="btn-secondary auth-submit" onClick={onDone} disabled={busy}>
            Nein, getrennt lassen
          </button>
        </div>
      </div>
    </div>
  );
}
