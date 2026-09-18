import { FormEvent, useEffect, useState } from "react";
import { Target } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { authErrorText, db, legacyAnonymousUser, loginWithEmail, registerWithEmail } from "../data/firebase";
import {
  createGuestPlayers,
  enterGuestMode,
  lastGuestNames,
  MAX_GUEST_PLAYERS,
} from "../data/guestStore";
import { ProfileNameError } from "../data/profileNames";
import { SegmentedControl } from "../components/SegmentedControl";
import "./AuthScreen.css";

// Damit der Hinweis auf die alte anonyme Sitzung genau EINMAL kommt.
const LEGACY_ACK_KEY = "darts-legacy-session-acknowledged";

type Mode = "login" | "register" | "guest";

type Props = { onGuestStart: () => void; onNeedsVerification: (email: string) => void };

// Anmeldung per E-Mail und Passwort, alternativ ein rein lokaler
// Gast-Modus ohne Konto (Tobias-Anforderung 17.09.2026).
export function AuthScreen({ onGuestStart, onNeedsVerification }: Props) {
  const [mode, setMode] = useState<Mode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legacy, setLegacy] = useState<{ profiles: number; matches: number } | null>(null);

  // Liegt in diesem Browser noch eine anonyme Sitzung mit Daten? Dann
  // einmalig zeigen, was daran haengt - bevor bewusst neu angefangen
  // wird. Es wird dabei NICHTS geloescht.
  useEffect(() => {
    let cancelled = false;
    const anon = legacyAnonymousUser();
    if (!anon) return;
    try {
      if (localStorage.getItem(LEGACY_ACK_KEY)) return;
    } catch {
      // Privates Fenster - dann eben jedes Mal.
    }
    Promise.all([
      getDocs(collection(db, "users", anon.uid, "profiles")),
      getDocs(collection(db, "users", anon.uid, "matches")),
    ])
      .then(([profiles, matches]) => {
        if (cancelled) return;
        if (profiles.size === 0 && matches.size === 0) return;
        setLegacy({ profiles: profiles.size, matches: matches.size });
      })
      .catch(() => {
        // Kein Netz oder kein Zugriff - kein Hinweis, kein Drama.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function acknowledgeLegacy() {
    try {
      localStorage.setItem(LEGACY_ACK_KEY, new Date().toISOString());
    } catch {
      // siehe oben
    }
    setLegacy(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    // Das Passwort wird nach dem Absenden aus dem Formularzustand
    // entfernt und nirgendwohin weitergereicht: der Warte-Bildschirm
    // arbeitet auf der bestehenden Sitzung, nicht auf Zugangsdaten.
    const submitted = password;
    setPassword("");
    try {
      if (mode === "register") {
        // Auch eine bereits vergebene Adresse fuehrt hierher, ohne dass
        // etwas angelegt wurde - der Bildschirm sieht identisch aus.
        await registerWithEmail(email, submitted);
        // Bei Erfolg besteht jetzt eine unbestaetigte Sitzung und der
        // Auth-Beobachter in App.tsx uebernimmt. War die Adresse schon
        // vergeben, gibt es keine Sitzung - dann sorgt dieser Aufruf
        // dafuer, dass trotzdem derselbe Bildschirm erscheint.
        onNeedsVerification(email.trim());
        return;
      }
      const result = await loginWithEmail(email, submitted);
      if (result.status === "unverified") {
        // Sitzung bleibt bestehen, App.tsx leitet auf den
        // Warte-Bildschirm - hier ist nichts weiter zu tun.
        return;
      }
      // Ab hier uebernimmt der Auth-Beobachter in App.tsx.
    } catch (err) {
      setError(authErrorText(err, mode === "register" ? "register" : "login"));
    } finally {
      setBusy(false);
    }
  }

  if (legacy) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <Brand />
          <h1 className="auth-title">Existing data in this browser</h1>
          <p className="auth-lede">
            The old device-local session still holds{" "}
            <b>
              {legacy.profiles} {legacy.profiles === 1 ? "profile" : "profiles"}
            </b>{" "}
            and{" "}
            <b>
              {legacy.matches} {legacy.matches === 1 ? "match" : "matches"}
            </b>
            .
          </p>
          <p className="auth-note">
            This data will <b>not</b> be carried over into your new account — that was your decision. Nothing is
            deleted either: it stays under the old identifier and can still be fetched later if you change your mind.
          </p>
          <button type="button" className="btn-primary auth-submit" onClick={acknowledgeLegacy}>
            Understood — start fresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <Brand />
        <h1 className="auth-title">
          {mode === "register" ? "Create account" : mode === "login" ? "Sign in" : "Play without an account"}
        </h1>
        <p className="auth-lede">
          {mode === "guest"
            ? "Start right away — no account, but no statistics either."
            : "Profiles, games and statistics belong to your account — the same data on every device."}
        </p>

        <SegmentedControl
          label="What would you like to do?"
          options={[
            { value: "register", label: "New account" },
            { value: "login", label: "Sign in" },
            { value: "guest", label: "No account" },
          ]}
          value={mode}
          onChange={(value) => {
            setMode(value as Mode);
            setError(null);
          }}
        />

        {mode === "guest" ? (
          <GuestPanel onStart={onGuestStart} />
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span className="auth-field-label">Email address</span>
              <input
                type="email"
                className="auth-input"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="auth-field">
              <span className="auth-field-label">Password</span>
              <input
                type="password"
                className="auth-input"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {mode === "register" && <span className="auth-field-hint">At least 6 characters.</span>}
            </label>

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary auth-submit" disabled={busy}>
              {busy ? "One moment…" : mode === "register" ? "Create account" : "Sign in"}
            </button>

            {mode === "register" ? (
              // Bewusst KEINE Pflicht-Checkbox ("Ich stimme zu") -
              // Tobias-Vorgabe 18.09.2026. Nur ein dezenter Hinweis
              // direkt unter dem Button, mit Link zur Richtlinie.
              <p className="auth-privacy-note">
                Creating an account sets up a user profile for you. See the{" "}
                <a className="auth-link auth-privacy-link" href="/privacy">
                  Privacy Policy
                </a>{" "}
                for details on how your data is used.
              </p>
            ) : (
              <p className="auth-privacy-note auth-privacy-note-login">
                <a className="auth-link auth-privacy-link" href="/privacy">
                  Privacy Policy
                </a>
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

// Hinweis + Namenseingabe vor dem Betreten des Gast-Modus. Der Hinweis
// erscheint bei JEDEM Betreten, nicht nur einmal - er ist die einzige
// Stelle, an der klar wird, dass nichts gespeichert wird.
function GuestPanel({ onStart }: { onStart: () => void }) {
  const remembered = lastGuestNames();
  const [names, setNames] = useState<string[]>(() =>
    remembered.length > 0 ? remembered : [""]
  );
  const [error, setError] = useState<string | null>(null);

  function setName(index: number, value: string) {
    setError(null);
    setNames((prev) => prev.map((n, i) => (i === index ? value : n)));
  }

  function start() {
    setError(null);
    try {
      // Doppelte oder unzulaessige Namen werden hier gemeldet, nicht
      // still umbenannt - dieselbe Regel wie im Profil-Dialog.
      createGuestPlayers(names);
    } catch (err) {
      setError(err instanceof ProfileNameError ? err.message : "The players could not be created.");
      return;
    }
    enterGuestMode();
    onStart();
  }

  return (
    <div className="auth-form">
      <div className="guest-warning">
        <div className="guest-warning-title">Without an account:</div>
        <ul>
          <li>Games are not saved</li>
          <li>No statistics, no history</li>
          <li>Clearing your browser wipes everything</li>
          <li>You can create an account at any time later</li>
        </ul>
      </div>

      <div className="auth-field">
        <span className="auth-field-label">Player names</span>
        <span className="auth-field-hint">
          Optional — leave a field empty and you play as “Player 1”, “Player 2” and so on.
          {remembered.length > 0 && " Your most recently used names are already filled in."}
        </span>
        <div className="guest-names">
          {names.map((name, i) => (
            <input
              key={i}
              type="text"
              className="auth-input"
              placeholder={`Player ${i + 1}`}
              value={name}
              onChange={(e) => setName(i, e.target.value)}
            />
          ))}
        </div>
        <div className="guest-name-actions">
          {names.length < MAX_GUEST_PLAYERS && (
            <button type="button" className="btn-secondary guest-name-btn" onClick={() => setNames((p) => [...p, ""])}>
              + Player
            </button>
          )}
          {names.length > 1 && (
            <button
              type="button"
              className="btn-secondary guest-name-btn"
              onClick={() => setNames((p) => p.slice(0, -1))}
            >
              − Player
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="btn-primary auth-submit" onClick={start}>
        Understood — play without an account
      </button>
    </div>
  );
}

function Brand() {
  return (
    <div className="auth-brand">
      <span className="auth-brand-icon">
        <Target size={22} strokeWidth={2.5} />
      </span>
      <span className="auth-brand-name">
        Train<span className="auth-brand-accent">Darts</span>
      </span>
    </div>
  );
}
