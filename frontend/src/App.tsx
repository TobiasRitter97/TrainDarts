import { useEffect, useRef, useState } from "react";
import { Profile } from "./api";
import { AppHeader, AppScreen } from "./components/AppHeader";
import { GameHubScreen } from "./screens/GameHubScreen";
import { GameSetupScreen, LocalStartInfo } from "./screens/GameSetupScreen";
import { LocalGameScreen } from "./screens/LocalGameScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { FirstProfileScreen } from "./screens/FirstProfileScreen";
import { GuestTakeoverScreen } from "./screens/GuestTakeoverScreen";
import { VerifyEmailScreen } from "./screens/VerifyEmailScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { StatsScreen } from "./screens/StatsScreen";
import { PiSettingsModal } from "./screens/PiSettingsModal";
import { BoardDebugScreen } from "./screens/BoardDebugScreen";
import { OnlineLobbyScreen } from "./screens/OnlineLobbyScreen";
import { OnlineRoomScreen } from "./screens/OnlineRoomScreen";
import { getStoredPiIp } from "./piConnection";
import * as matchesDb from "./data/matches";
import * as profilesDb from "./data/profiles";
import { recordGamePlayed } from "./data/localPrefs";
import { ResumeInfo } from "./engine/useLocalMatch";
import { authReady, firebaseConfigError, observeAuth, signedInUser } from "./data/firebase";
import { guestDataSummary, isGuest, leaveGuestMode } from "./data/guestStore";
import { STATIC_GAMES } from "./staticGames";
import "./App.css";

type View =
  | { screen: "hub" }
  | { screen: "setup"; gameId: string }
  | { screen: "local-game"; session: LocalStartInfo; resume?: ResumeInfo }
  | { screen: "profiles" }
  | { screen: "stats" }
  | { screen: "board-debug" }
  | { screen: "online-lobby" }
  | { screen: "online-room"; pin: string; myProfile: Profile };

type PendingResumeInfo = { matchId: string; gameId: string; gameName: string; playerNames: string[] };

// Ob die Pi-Einstellungen automatisch beim ersten Laden vorgeschlagen
// werden sollten (Vercel-Deployment). NUR ein Vorschlag, keine Sperre
// (Tobias-Feedback 08.09.2026: die Seite muss immer erreichbar
// bleiben) - der Nutzer kann das Overlay jederzeit schliessen und/oder
// spaeter ueber den "Einstellungen"-Knopf im Header erneut oeffnen.
// Seit dem Client-Rewrite (~/.claude/plans/agile-brewing-wadler.md)
// braucht nur noch die Board-Verbindung (Phase A) eine gespeicherte
// IP - Profile/Statistiken kommen aus Firestore, kein Backend-Probe
// mehr noetig.
function useShouldSuggestPiSettings(): boolean {
  return !import.meta.env.DEV && !getStoredPiIp();
}

// Fortsetzen-Dialog nach Neustart: weder automatisch fortsetzen noch
// verwerfen - einmal beim Laden der App pruefen und den Nutzer
// entscheiden lassen. Seit Phase E kommt das aus Firestore
// (matchesDb.findInProgressMatch()) statt vom eigenen Backend.
// Login-Gate: solange die gespeicherte Sitzung noch geprueft wird,
// bleibt der Bildschirm ruhig; ohne Konto kommt der Login-Screen.
//
// WICHTIG: geprueft wird nur die LOKALE Sitzung, es wird nichts online
// nachgefragt. Ein Internetausfall meldet also niemand ab - am Board
// kann weitergespielt werden (Tobias-Vorgabe 17.09.2026).
// Konten, denen die Uebernahmefrage schon gestellt wurde - egal wie
// sie beantwortet wurde. Sie soll nicht bei jedem Login wiederkommen.
const TAKEOVER_ASKED_KEY = "darts-guest-takeover-asked";

function takeoverAsked(uid: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(TAKEOVER_ASKED_KEY) ?? "[]") as string[]).includes(uid);
  } catch {
    return true;
  }
}

function markTakeoverAsked(uid: string): void {
  try {
    const list = JSON.parse(localStorage.getItem(TAKEOVER_ASKED_KEY) ?? "[]") as string[];
    if (!list.includes(uid)) localStorage.setItem(TAKEOVER_ASKED_KEY, JSON.stringify([...list, uid]));
  } catch {
    // Privates Fenster - dann kommt die Frage eben noch einmal.
  }
}

export default function App() {
  const [authState, setAuthState] = useState<"checking" | "out" | "guest" | "in">("checking");
  // Nach dem Anmelden noch offene Zwischenschritte.
  const [takeover, setTakeover] = useState<{ profiles: number; matches: number } | null>(null);
  // Das Profil-Gate haengt an der TATSAECHLICHEN Datenlage, nicht an
  // einem Merker: hat das Konto noch kein Profil in Firestore, ist der
  // Weg in die Spiele gesperrt, bis eines existiert. In der Praxis
  // trifft das nur frisch registrierte Konten - wer schon ein Profil
  // hat, landet ohne Zwischenschritt in der App.
  const [needsFirstProfile, setNeedsFirstProfile] = useState(false);
  // Konto angelegt bzw. angemeldet, aber E-Mail noch nicht bestaetigt.
  const [pendingVerification, setPendingVerification] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    function sync() {
      if (cancelled) return;
      const user = signedInUser();
      if (user) {
        if (isGuest()) leaveGuestMode();
        // Liegen lokale Gast-Daten vor? Bewusst UNABHAENGIG vom
        // Gast-Flag geprueft: wer ueber "Anmelden / Konto anlegen" aus
        // dem Gast-Modus kommt, hat den Modus vorher schon verlassen -
        // die Daten liegen aber noch da und die Frage ist faellig.
        const summary = guestDataSummary();
        if ((summary.profiles > 0 || summary.matches > 0) && !takeoverAsked(user.uid)) {
          setTakeover(summary);
        }
        setPendingVerification(null);
        setAuthState("in");
        profilesDb
          .listProfiles()
          .then((list) => {
            if (!cancelled) setNeedsFirstProfile(list.length === 0);
          })
          .catch(() => {
            // Offline: nicht aussperren, der Gate greift beim naechsten
            // erfolgreichen Lesen.
            if (!cancelled) setNeedsFirstProfile(false);
          });
        return;
      }
      setAuthState(isGuest() ? "guest" : "out");
    }
    authReady().then(sync);
    const unsubscribe = observeAuth(sync);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Beim Anmelden wartende Spiele nachreichen, ebenso sobald das Geraet
  // wieder online ist.
  useEffect(() => {
    if (authState !== "in") return;
    const flush = () => void matchesDb.flushPendingMatches().catch(() => undefined);
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [authState]);

  // Ohne gueltige Konfiguration kaeme sonst nur eine weisse Seite.
  if (firebaseConfigError) {
    return (
      <div className="app-boot app-boot-error">
        <p>{firebaseConfigError}</p>
      </div>
    );
  }
  if (authState === "checking") return <div className="app-boot">One moment…</div>;
  if (authState === "out") {
    if (pendingVerification) {
      return (
        <VerifyEmailScreen
          email={pendingVerification.email}
          password={pendingVerification.password}
          onBackToLogin={() => setPendingVerification(null)}
        />
      );
    }
    return (
      <AuthScreen
        onGuestStart={() => setAuthState("guest")}
        onNeedsVerification={(email, password) => setPendingVerification({ email, password })}
      />
    );
  }

  if (authState === "in") {
    if (takeover) {
      return (
        <GuestTakeoverScreen
          summary={takeover}
          onDone={() => {
            const user = signedInUser();
            if (user) markTakeoverAsked(user.uid);
            setTakeover(null);
          }}
        />
      );
    }
    if (needsFirstProfile) {
      return <FirstProfileScreen email={signedInUser()?.email ?? ""} onDone={() => setNeedsFirstProfile(false)} />;
    }
  }

  return <SignedInApp guest={authState === "guest"} onLeaveGuest={() => {
    leaveGuestMode();
    setAuthState("out");
  }} />;
}

function SignedInApp({ guest, onLeaveGuest }: { guest: boolean; onLeaveGuest: () => void }) {
  const [view, setView] = useState<View>({ screen: "hub" });
  const [pendingResume, setPendingResume] = useState<PendingResumeInfo | null>(null);
  // Der Dialog ("Fortsetzen?"/"Verwerfen") poppt nur EINMAL automatisch
  // auf (beim allerersten Laden der Seite) - nicht jedes Mal, wenn man
  // z.B. nach "Spiel verlassen" wieder im Game Hub landet, das waere
  // aufdringlich. Stattdessen erscheint dann ein dauerhafter Button im
  // Header (Tobias-Feedback 10.09.2026: vorher kam man ohne
  // Seiten-Neuladen gar nicht mehr an ein verlassenes Spiel heran).
  const [showResumeModal, setShowResumeModal] = useState(false);
  const hasPromptedRef = useRef(false);
  const suggestPiSettings = useShouldSuggestPiSettings();
  const [showPiSettings, setShowPiSettings] = useState(suggestPiSettings);
  const [searchQuery, setSearchQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  useEffect(() => {
    if (view.screen !== "hub") return;
    matchesDb
      .findInProgressMatch()
      .then(async (match) => {
        if (!match) {
          setPendingResume(null);
          return;
        }
        const game = STATIC_GAMES.find((g) => g.id === match.gameId);
        const profiles = await Promise.all(match.playerIds.map((pid) => profilesDb.getProfile(pid)));
        setPendingResume({
          matchId: match.id,
          gameId: match.gameId,
          gameName: game?.name ?? match.gameId,
          playerNames: profiles.filter((p): p is Profile => p !== null).map((p) => p.name),
        });
        if (!hasPromptedRef.current) {
          hasPromptedRef.current = true;
          setShowResumeModal(true);
        }
      })
      .catch(() => setPendingResume(null));
  }, [view.screen]);

  async function handleResume() {
    if (!pendingResume) return;
    const match = await matchesDb.getMatch(pendingResume.matchId);
    const game = STATIC_GAMES.find((g) => g.id === pendingResume.gameId);
    if (!match || !game) {
      setPendingResume(null);
      return;
    }
    const profiles = (await Promise.all(match.playerIds.map((pid) => profilesDb.getProfile(pid)))).filter(
      (p): p is Profile => p !== null
    );
    setPendingResume(null);
    setShowResumeModal(false);
    setView({
      screen: "local-game",
      session: { game, players: profiles, settings: match.settings },
      resume: { matchId: match.id, events: match.events },
    });
  }

  async function handleAbandon() {
    if (!pendingResume) return;
    setShowResumeModal(false);
    await matchesDb.setStatus(pendingResume.matchId, "abandoned");
    setPendingResume(null);
  }

  // AppHeader kennt nur die vier Screens, die auch als Navigationsziel
  // erreichbar sind - alle anderen (setup, local-game, online-room)
  // zeigen einfach keinen aktiven Nav-Link an.
  const headerScreen: AppScreen =
    view.screen === "hub" ||
    view.screen === "online-lobby" ||
    view.screen === "profiles" ||
    view.screen === "stats" ||
    view.screen === "board-debug"
      ? view.screen
      : "other";

  function handleNavigate(screen: "hub" | "online-lobby" | "profiles" | "stats" | "board-debug") {
    setView({ screen });
  }

  return (
    <div className="app-shell">
      <AppHeader
        guest={guest}
        onLeaveGuest={onLeaveGuest}
        activeScreen={headerScreen}
        onNavigate={handleNavigate}
        onOpenSettings={() => setShowPiSettings(true)}
        pendingResume={view.screen === "hub" && pendingResume ? { gameName: pendingResume.gameName } : null}
        onResume={handleResume}
        search={view.screen === "hub" ? { value: searchQuery, onChange: setSearchQuery } : null}
        favorites={view.screen === "hub" ? { active: favoritesOnly, onToggle: () => setFavoritesOnly((v) => !v) } : null}
      />
      <main className="app-main">
        {view.screen === "hub" && (
          <GameHubScreen
            onSelectGame={(gameId) => setView({ screen: "setup", gameId })}
            searchQuery={searchQuery}
            favoritesOnly={favoritesOnly}
          />
        )}
        {view.screen === "setup" && (
          <GameSetupScreen
            gameId={view.gameId}
            onBack={() => setView({ screen: "hub" })}
            onStart={(local) => {
              recordGamePlayed(local.game.id);
              setView({ screen: "local-game", session: local });
            }}
          />
        )}
        {view.screen === "local-game" && (
          <LocalGameScreen
            game={view.session.game}
            players={view.session.players}
            settings={view.session.settings}
            resume={view.resume}
            onExit={() => setView({ screen: "hub" })}
            onOpenSettings={() => setShowPiSettings(true)}
          />
        )}
        {view.screen === "profiles" && <ProfileScreen onBack={() => setView({ screen: "hub" })} />}
        {view.screen === "stats" &&
          (guest ? (
            <GuestGate
              title="Statistics need an account"
              text="Nothing is saved in guest mode, so there is nothing to evaluate. With an account your games go into your history for good — on every device."
              onLeaveGuest={onLeaveGuest}
            />
          ) : (
            <StatsScreen onBack={() => setView({ screen: "hub" })} />
          ))}
        {view.screen === "board-debug" && <BoardDebugScreen onBack={() => setView({ screen: "hub" })} />}
        {view.screen === "online-lobby" && guest && (
          <GuestGate
            title="Playing online needs an account"
            text="An online room needs an identifier your opponents can recognise you by, and that only comes with an account. On your own board you can still play up to four as a guest."
            onLeaveGuest={onLeaveGuest}
          />
        )}
        {view.screen === "online-lobby" && !guest && (
          <OnlineLobbyScreen
            onBack={() => setView({ screen: "hub" })}
            onEnterRoom={(pin, myProfile) => setView({ screen: "online-room", pin, myProfile })}
          />
        )}
        {view.screen === "online-room" && (
          <OnlineRoomScreen
            pin={view.pin}
            myProfile={view.myProfile}
            onExit={() => setView({ screen: "hub" })}
            onOpenSettings={() => setShowPiSettings(true)}
          />
        )}
      </main>

      {pendingResume && showResumeModal && (
        <div className="resume-overlay">
          <div className="resume-modal">
            <h3>Resume unfinished game?</h3>
            <p className="screen-note">
              {pendingResume.gameName} · {pendingResume.playerNames.join(", ")}
            </p>
            <div className="resume-actions">
              <button className="btn-primary" onClick={handleResume}>
                Resume
              </button>
              <button className="btn-secondary" onClick={handleAbandon}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {showPiSettings && <PiSettingsModal onClose={() => setShowPiSettings(false)} />}
    </div>
  );
}

// Einheitlicher Hinweis fuer die Bereiche, die ohne Konto nicht
// funktionieren - statt einer leeren Seite.
function GuestGate({ title, text, onLeaveGuest }: { title: string; text: string; onLeaveGuest: () => void }) {
  return (
    <div className="guest-gate">
      <p className="guest-gate-title">{title}</p>
      <p>{text}</p>
      <button type="button" className="btn-primary" onClick={onLeaveGuest}>
        Create account
      </button>
    </div>
  );
}
