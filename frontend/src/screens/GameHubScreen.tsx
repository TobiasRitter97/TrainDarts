import { useEffect, useMemo, useState } from "react";
import { Clock, Crosshair, Grid3x3, Target, Users } from "lucide-react";
import { GameDefinition } from "../api";
import { STATIC_GAMES } from "../staticGames";
import { getFavoriteGameIds, getRecentlyPlayedGameIds, toggleFavoriteGame } from "../data/localPrefs";
import { FilterTabs } from "../components/FilterTabs";
import { SectionHeader } from "../components/SectionHeader";
import { GameCard } from "../components/GameCard";
import { RecentlyPlayedCard } from "../components/RecentlyPlayedCard";
import "./GameHubScreen.css";

const CATEGORY_ORDER = ["CHECKOUT", "DOUBLES", "ACCURACY"];
const CATEGORY_META: Record<string, { label: string; subline: string; icon: typeof Target; colorVar: string }> = {
  CHECKOUT: { label: "Checkout", subline: "Build your finishing skills.", icon: Target, colorVar: "var(--c-category-checkout)" },
  DOUBLES: { label: "Doubles", subline: "Master your doubles.", icon: Users, colorVar: "var(--c-category-doubles)" },
  ACCURACY: { label: "Accuracy", subline: "Sharpen your precision.", icon: Crosshair, colorVar: "var(--c-category-accuracy)" },
};

type Props = {
  onSelectGame: (gameId: string) => void;
  searchQuery: string;
  favoritesOnly: boolean;
};

function matchesSearch(game: GameDefinition, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return game.name.toLowerCase().includes(q) || game.description.toLowerCase().includes(q);
}

// Redesign 16.09.2026 (Tobias' Referenzbild 1): Hero mit Filter-Tabs,
// "Recently Played" und Kategorie-Abschnitten mit hochwertigen
// GameCards statt der bisherigen reinen "GAME HUB"-Ueberschrift + Grid.
// Spiellogik/Datenquelle (staticGames.ts) unveraendert - reines UI-
// Redesign. Favoriten/Verlauf sind rein lokale UI-Komfortfunktionen
// (siehe data/localPrefs.ts), kein neues Backend-Datenmodell.
export function GameHubScreen({ onSelectGame, searchQuery, favoritesOnly }: Props) {
  const [category, setCategory] = useState("all");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    setFavoriteIds(getFavoriteGameIds());
    setRecentIds(getRecentlyPlayedGameIds());
  }, []);

  function handleToggleFavorite(gameId: string) {
    setFavoriteIds(toggleFavoriteGame(gameId));
  }

  const visibleGames = useMemo(
    () =>
      STATIC_GAMES.filter(
        (g) => matchesSearch(g, searchQuery) && (!favoritesOnly || favoriteIds.includes(g.id))
      ),
    [searchQuery, favoritesOnly, favoriteIds]
  );

  const recentGames = recentIds
    .map((id) => visibleGames.find((g) => g.id === id))
    .filter((g): g is GameDefinition => g !== undefined);

  const tabs = [
    { value: "all", label: "All Games", icon: Grid3x3 },
    ...CATEGORY_ORDER.filter((c) => STATIC_GAMES.some((g) => g.category === c)).map((c) => ({
      value: c,
      label: CATEGORY_META[c]?.label ?? c,
      icon: CATEGORY_META[c]?.icon ?? Target,
      colorVar: CATEGORY_META[c]?.colorVar,
    })),
  ];

  const categories = CATEGORY_ORDER.filter((c) => category === "all" || category === c)
    .map((c) => ({ category: c, games: visibleGames.filter((g) => g.category === c) }))
    .filter((group) => group.games.length > 0);

  return (
    <div className="game-hub">
      <div className="game-hub-hero">
        <div>
          <h1 className="game-hub-title">Game Hub</h1>
          <p className="game-hub-subtitle">Train smarter. Play better.</p>
        </div>
        <FilterTabs tabs={tabs} value={category} onChange={setCategory} />
      </div>

      {recentGames.length > 0 && (
        <section>
          <SectionHeader title="Recently Played" icon={Clock} />
          <div className="recently-played-row">
            {recentGames.map((game) => (
              <RecentlyPlayedCard
                key={game.id}
                game={game}
                categoryColor={CATEGORY_META[game.category]?.colorVar ?? "var(--c-brand)"}
                onPlay={onSelectGame}
              />
            ))}
          </div>
        </section>
      )}

      {categories.map((group) => {
        const meta = CATEGORY_META[group.category];
        return (
          <section key={group.category}>
            <SectionHeader
              title={meta?.label ?? group.category}
              subline={meta?.subline}
              icon={meta?.icon}
              colorVar={meta?.colorVar}
              viewAllCount={category === "all" ? group.games.length : undefined}
              onViewAll={category === "all" ? () => setCategory(group.category) : undefined}
            />
            <div className="game-card-grid">
              {group.games.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  categoryColor={meta?.colorVar ?? "var(--c-brand)"}
                  favorite={favoriteIds.includes(game.id)}
                  onToggleFavorite={handleToggleFavorite}
                  onPlay={onSelectGame}
                />
              ))}
            </div>
          </section>
        );
      })}

      {categories.length === 0 && recentGames.length === 0 && (
        <p className="screen-note game-hub-empty">No games match your search.</p>
      )}
    </div>
  );
}
