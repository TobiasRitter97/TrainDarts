import { useEffect, useRef, useState } from "react";
import { BarChart3, ChevronDown, Globe, Home, LogOut, MoreHorizontal, Search, Settings, Star, Target, Wrench } from "lucide-react";
import { Profile } from "../api";
import * as profilesDb from "../data/profiles";
import { logout, signedInUser } from "../data/firebase";
import { BoardControlBar } from "./BoardControlBar";
import "../screens/AuthScreen.css";
import "./AppHeader.css";

export type AppScreen = "hub" | "online-lobby" | "profiles" | "stats" | "board-debug" | "other";

type SearchSlot = { value: string; onChange: (value: string) => void } | null;
type FavoritesSlot = { active: boolean; onToggle: () => void } | null;

type Props = {
  guest: boolean;
  onLeaveGuest: () => void;
  activeScreen: AppScreen;
  onNavigate: (screen: "hub" | "online-lobby" | "profiles" | "stats" | "board-debug") => void;
  onOpenSettings: () => void;
  pendingResume: { gameName: string } | null;
  onResume: () => void;
  search: SearchSlot;
  favorites: FavoritesSlot;
};

// Einheitliche Top-Navigation (Redesign 16.09.2026, Tobias' Referenzbild 1) -
// ersetzt den bisherigen einfachen App-Header. Wird auf allen Screens
// AUSSER dem laufenden Spiel/Online-Raum gerendert (siehe App.tsx) -
// "Search"/"Favorites" sind nur auf dem Game Hub sinnvoll und werden
// dort ueber die "search"/"favorites"-Props aktiviert, sonst ausgeblendet
// (Tobias' Vorgabe: "Suchfeld kann im Spiel reduziert/ausgeblendet
// werden").
export function AppHeader({ guest, onLeaveGuest, activeScreen, onNavigate, onOpenSettings, pendingResume, onResume, search, favorites }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    profilesDb
      .listProfiles()
      .then((list) => setProfile(list[0] ?? null))
      .catch(() => setProfile(null));
  }, [activeScreen]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <span className="app-brand-icon">
          <Target size={22} strokeWidth={2.5} />
        </span>
        <span className="app-brand-name">
          Train<span className="app-brand-accent">Darts</span>
        </span>
      </div>

      <nav className="app-header-nav">
        <button
          type="button"
          className={`app-nav-link ${activeScreen === "hub" ? "active" : ""}`}
          onClick={() => onNavigate("hub")}
        >
          <Home size={18} strokeWidth={2} />
          Game Hub
        </button>
        <button
          type="button"
          className={`app-nav-link ${activeScreen === "online-lobby" ? "active" : ""}`}
          onClick={() => onNavigate("online-lobby")}
        >
          <Globe size={18} strokeWidth={2} />
          Play Online
        </button>
        <button
          type="button"
          className={`app-nav-link ${activeScreen === "stats" ? "active" : ""}`}
          onClick={() => onNavigate("stats")}
        >
          <BarChart3 size={18} strokeWidth={2} />
          Statistics
        </button>
        <button
          type="button"
          className={`app-nav-link ${activeScreen === "profiles" ? "active" : ""}`}
          onClick={() => onNavigate("profiles")}
        >
          <Star size={18} strokeWidth={2} />
          Profiles
        </button>
        <div className="app-nav-more" ref={moreRef}>
          <button
            type="button"
            className={`app-nav-link ${activeScreen === "board-debug" ? "active" : ""}`}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <MoreHorizontal size={18} strokeWidth={2} />
            More
          </button>
          {moreOpen && (
            <div className="app-nav-more-menu">
              <button
                type="button"
                onClick={() => {
                  onNavigate("board-debug");
                  setMoreOpen(false);
                }}
              >
                <Wrench size={16} strokeWidth={2} />
                Board Test
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenSettings();
                  setMoreOpen(false);
                }}
              >
                <Settings size={16} strokeWidth={2} />
                Settings
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className="app-header-actions">
        {pendingResume && (
          <button type="button" className="app-resume-btn" onClick={onResume}>
            Resume {pendingResume.gameName}
          </button>
        )}
        {search && (
          <div className="app-search">
            <Search size={16} strokeWidth={2} />
            <input
              type="text"
              placeholder="Search games…"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
            />
          </div>
        )}
        {favorites && (
          <button
            type="button"
            className={`app-favorites-btn ${favorites.active ? "active" : ""}`}
            onClick={favorites.onToggle}
            title="Show favorites only"
            aria-label="Show favorites only"
          >
            <Star size={18} strokeWidth={2} fill={favorites.active ? "currentColor" : "none"} />
          </button>
        )}
        <button type="button" className="app-profile-pill" onClick={() => onNavigate("profiles")}>
          <span className="app-profile-avatar" style={{ background: profile?.color || "#22e0b0" }}>
            {(profile?.initials || profile?.name.slice(0, 2) || "?").toUpperCase()}
          </span>
          <span className="app-profile-name">{profile?.name ?? "Profiles"}</span>
          <ChevronDown size={16} strokeWidth={2} />
        </button>
        <BoardControlBar />
        {/* Angemeldetes Konto sichtbar, Abmelden direkt daneben
            (Tobias-Anforderung 17.09.2026). */}
        <div className="app-account">
          {guest ? (
            <>
              <span className="app-account-guest">GAST</span>
              <button type="button" className="app-account-login" onClick={onLeaveGuest}>
                Anmelden / Konto anlegen
              </button>
            </>
          ) : (
            <>
              <span className="app-account-mail" title={signedInUser()?.email ?? ""}>
                {signedInUser()?.email}
              </span>
              <button
                type="button"
                className="app-logout-btn"
                onClick={() => void logout()}
                title="Abmelden"
                aria-label="Abmelden"
              >
                <LogOut size={18} strokeWidth={2} />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
