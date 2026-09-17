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
import { SegmentedControl } from "../components/SegmentedControl";
import "./AuthScreen.css";

// Damit der Hinweis auf die alte anonyme Sitzung genau EINMAL kommt.
const LEGACY_ACK_KEY = "darts-legacy-session-acknowledged";

type Mode = "login" | "register" | "guest";

type Props = { onGuestStart: () => void };

// Anmeldung per E-Mail und Passwort, alternativ ein rein lokaler
// Gast-Modus ohne Konto (Tobias-Anforderung 17.09.2026).
export function AuthScreen({ onGuestStart }: Props) {
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
    try {
      if (mode === "register") {
        await registerWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }
      // Ab hier uebernimmt der Auth-Beobachter in App.tsx.
    } catch (err) {
      setError(authErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (legacy) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <Brand />
          <h1 className="auth-title">Bisherige Daten in diesem Browser</h1>
          <p className="auth-lede">
            An der alten, geräteinternen Sitzung hängen noch{" "}
            <b>
              {legacy.profiles} {legacy.profiles === 1 ? "Profil" : "Profile"}
            </b>{" "}
            und{" "}
            <b>
              {legacy.matches} {legacy.matches === 1 ? "Match" : "Matches"}
            </b>
            .
          </p>
          <p className="auth-note">
            Diese Daten werden <b>nicht</b> in dein neues Konto übernommen — so hast du es entschieden. Gelöscht wird
            ebenfalls nichts: sie bleiben unter der alten Kennung liegen und lassen sich später noch holen, falls du es
            dir anders überlegst.
          </p>
          <button type="button" className="btn-primary auth-submit" onClick={acknowledgeLegacy}>
            Verstanden — neu anfangen
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
          {mode === "register" ? "Konto anlegen" : mode === "login" ? "Anmelden" : "Ohne Anmeldung spielen"}
        </h1>
        <p className="auth-lede">
          {mode === "guest"
            ? "Sofort loslegen — ohne Konto, dafür ohne Statistik."
            : "Profile, Spiele und Statistiken hängen an deinem Konto — auf jedem Gerät dieselben Daten."}
        </p>

        <SegmentedControl
          label="Was möchtest du tun?"
          options={[
            { value: "register", label: "Neues Konto" },
            { value: "login", label: "Anmelden" },
            { value: "guest", label: "Ohne Anmeldung" },
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
              <span className="auth-field-label">E-Mail-Adresse</span>
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
              <span className="auth-field-label">Passwort</span>
              <input
                type="password"
                className="auth-input"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {mode === "register" && <span className="auth-field-hint">Mindestens 6 Zeichen.</span>}
            </label>

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary auth-submit" disabled={busy}>
              {busy ? "Einen Moment…" : mode === "register" ? "Konto anlegen" : "Anmelden"}
            </button>
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

  function setName(index: number, value: string) {
    setNames((prev) => prev.map((n, i) => (i === index ? value : n)));
  }

  function start() {
    createGuestPlayers(names);
    enterGuestMode();
    onStart();
  }

  return (
    <div className="auth-form">
      <div className="guest-warning">
        <div className="guest-warning-title">Ohne Konto gilt:</div>
        <ul>
          <li>Spiele werden nicht gespeichert</li>
          <li>Keine Statistiken, keine Historie</li>
          <li>Nach dem Leeren des Browsers ist alles weg</li>
          <li>Ein Konto lässt sich jederzeit nachträglich anlegen</li>
        </ul>
      </div>

      <div className="auth-field">
        <span className="auth-field-label">Spielernamen</span>
        <span className="auth-field-hint">
          Optional — wer nichts einträgt, spielt als „Spieler 1", „Spieler 2" und so weiter.
          {remembered.length > 0 && " Zuletzt genutzte Namen sind schon eingetragen."}
        </span>
        <div className="guest-names">
          {names.map((name, i) => (
            <input
              key={i}
              type="text"
              className="auth-input"
              placeholder={`Spieler ${i + 1}`}
              value={name}
              onChange={(e) => setName(i, e.target.value)}
            />
          ))}
        </div>
        <div className="guest-name-actions">
          {names.length < MAX_GUEST_PLAYERS && (
            <button type="button" className="btn-secondary guest-name-btn" onClick={() => setNames((p) => [...p, ""])}>
              + Spieler
            </button>
          )}
          {names.length > 1 && (
            <button
              type="button"
              className="btn-secondary guest-name-btn"
              onClick={() => setNames((p) => p.slice(0, -1))}
            >
              − Spieler
            </button>
          )}
        </div>
      </div>

      <button type="button" className="btn-primary auth-submit" onClick={start}>
        Verstanden — ohne Konto spielen
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
