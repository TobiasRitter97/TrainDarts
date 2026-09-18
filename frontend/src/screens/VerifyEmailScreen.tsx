import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { authErrorText, refreshVerification, resendVerification } from "../data/firebase";
import "./AuthScreen.css";

const COOLDOWN_SECONDS = 60;

type Props = {
  email: string;
  // Wird nur fuer "erneut senden" und "ich habe bestaetigt" gebraucht:
  // beides verlangt eine kurzzeitige Anmeldung. Liegt ausschliesslich
  // im Arbeitsspeicher dieser Komponente - nichts davon wird
  // gespeichert, geloggt oder verschickt.
  password: string;
  onBackToLogin: () => void;
};

// Wartebildschirm nach der Registrierung bzw. nach dem Anmeldeversuch
// mit unbestaetigter Adresse (Sicherheits-Update 18.09.2026). Die App
// selbst ist von hier aus nicht erreichbar.
export function VerifyEmailScreen({ email, password, onBackToLogin }: Props) {
  const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await resendVerification(email, password);
      setNotice("Sent. Check your inbox — and your spam folder.");
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setError(authErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmed() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const verified = await refreshVerification(email, password);
      // Bei Erfolg uebernimmt der Auth-Beobachter in App.tsx.
      if (!verified) {
        setError("Not confirmed yet. Open the link in the email, then try again.");
      }
    } catch (err) {
      setError(authErrorText(err));
    } finally {
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

        <h1 className="auth-title">Confirm your email address</h1>
        <p className="auth-lede">
          We sent a confirmation link to <b className="auth-mail">{email}</b>. Open it, then come back here.
        </p>
        <p className="auth-note">
          Nothing arrived? Check your spam folder. If an account already existed for this address, no new one was
          created — sign in instead.
        </p>

        {notice && <p className="auth-notice">{notice}</p>}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <div className="auth-form">
          <button type="button" className="btn-primary auth-submit" onClick={confirmed} disabled={busy}>
            {busy ? "Checking…" : "I have confirmed"}
          </button>
          <button type="button" className="btn-secondary auth-submit" onClick={resend} disabled={busy || cooldown > 0}>
            {cooldown > 0 ? `Resend email (${cooldown}s)` : "Resend email"}
          </button>
          <button type="button" className="auth-link" onClick={onBackToLogin}>
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
