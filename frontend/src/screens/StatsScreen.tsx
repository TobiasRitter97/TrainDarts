import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Profile } from "../api";
import { AverageTrendChart } from "../components/AverageTrendChart";
import { SegmentedControl } from "../components/SegmentedControl";
import {
  computeGameStats,
  formatDateTime,
  GameDetail,
  lastUsedProfileId,
  ProfileGameStats,
  StatBarGroup,
  TIME_RANGE_LABELS,
  TimeRange,
} from "../data/gameStats";
import * as profilesDb from "../data/profiles";
import { gameIcon } from "../gameIcons";
import { STATIC_GAMES } from "../staticGames";
import "./StatsScreen.css";

type Props = { onBack: () => void };

// Statistik-Bereich (Tobias-Anforderung 17.09.2026). Der Zeitfilter
// gilt fuer die ganze Seite - Uebersicht, Verlauf und jede
// Detailansicht rechnen auf demselben Ausschnitt.
export function StatsScreen({ onBack }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange>("30d");
  const [stats, setStats] = useState<ProfileGameStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [openGameId, setOpenGameId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    profilesDb
      .listProfiles()
      .then(async (list) => {
        if (cancelled) return;
        setProfiles(list);
        if (list.length === 0) {
          setLoading(false);
          return;
        }
        // Vorauswahl: wer zuletzt gespielt hat, sonst das erste Profil.
        const recent = await lastUsedProfileId(list.map((p) => p.id));
        if (!cancelled) setProfileId((current) => current ?? recent ?? list[0].id);
      })
      .catch(() => {
        if (!cancelled) {
          setProfiles([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!profileId) {
      setStats(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setOpenGameId(null);
    computeGameStats(profileId, range)
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, range]);

  const activeProfile = profiles.find((p) => p.id === profileId) ?? null;

  return (
    <div className="stats-screen">
      <button className="btn-secondary back-btn" onClick={onBack}>
        ← Game Hub
      </button>
      <h1 className="screen-title">Statistics</h1>

      {profiles.length === 0 ? (
        <p className="screen-note">
          No player profile yet. Create one under <b>Profiles</b>, then your games show up here.
        </p>
      ) : (
        <>
          <div className="stats-controls">
            <SegmentedControl
              label="Player"
              options={profiles.map((p) => ({ value: p.id, label: p.name }))}
              value={profileId}
              onChange={(value) => setProfileId(value as string)}
            />
            <SegmentedControl
              label="Period"
              options={(["7d", "30d", "all"] as TimeRange[]).map((r) => ({ value: r, label: TIME_RANGE_LABELS[r] }))}
              value={range}
              onChange={(value) => setRange(value as TimeRange)}
            />
          </div>

          {loading && <p className="screen-note">Calculating…</p>}

          {!loading && stats && stats.overview.gamesPlayed === 0 && (
            <div className="panel stats-empty">
              <p className="stats-empty-title">No finished game in this period.</p>
              <p className="screen-note">
                {activeProfile ? `${activeProfile.name} has ` : "There is "}
                no completed match for <b>{TIME_RANGE_LABELS[range].toLowerCase()}</b>. Switch the period to{" "}
                <b>All time</b>, or play a game — the statistics fill up by themselves.
              </p>
            </div>
          )}

          {!loading && stats && stats.overview.gamesPlayed > 0 && (
            <>
              <div className="stats-overview">
                <OverviewTile label="Games played" value={String(stats.overview.gamesPlayed)} />
                <OverviewTile
                  label="3-dart average"
                  value={stats.overview.threeDartAverage === null ? "—" : String(stats.overview.threeDartAverage)}
                  hint="170 and Pressure 501 only"
                />
                <OverviewTile
                  label="Best leg"
                  value={stats.overview.bestLegDarts === null ? "—" : `${stats.overview.bestLegDarts} darts`}
                  hint="Fewest darts for one leg"
                />
                <OverviewTile
                  label="Checkout rate"
                  value={stats.overview.checkoutPercent === null ? "—" : `${stats.overview.checkoutPercent}%`}
                  hint="Taken when a finish was on, plus successful attempts"
                />
              </div>

              <h2 className="section-title">Average over time</h2>
              <div className="panel">
                <AverageTrendChart points={stats.trend} groupedByDay={stats.trendGroupedByDay} />
              </div>

              <h2 className="section-title">Per game</h2>
              <div className="stats-game-list">
                {stats.games.map((summary) => {
                  const game = STATIC_GAMES.find((g) => g.id === summary.gameId);
                  const Icon = game ? gameIcon(game) : null;
                  const open = openGameId === summary.gameId;
                  return (
                    <div key={summary.gameId} className={`stats-game ${open ? "open" : ""}`}>
                      <button
                        type="button"
                        className="stats-game-head"
                        aria-expanded={open}
                        onClick={() => setOpenGameId(open ? null : summary.gameId)}
                      >
                        <span className="stats-game-icon">{Icon && <Icon size={20} strokeWidth={2} />}</span>
                        <span className="stats-game-name">{summary.gameName}</span>
                        <span className="stats-game-count">
                          {summary.gamesPlayed} {summary.gamesPlayed === 1 ? "game" : "games"}
                        </span>
                        <span className={`stats-game-chevron ${open ? "open" : ""}`}>
                          <ChevronRight size={20} strokeWidth={2.5} />
                        </span>
                      </button>
                      {open && stats.details[summary.gameId] && <GameDetailView detail={stats.details[summary.gameId]} />}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function OverviewTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stats-tile">
      <div className="stats-tile-label">{label}</div>
      <div className="stats-tile-value">{value}</div>
      {hint && <div className="stats-tile-hint">{hint}</div>}
    </div>
  );
}

function GameDetailView({ detail }: { detail: GameDetail }) {
  return (
    <div className="stats-detail">
      <div className="stats-metrics">
        {detail.metrics.map((m) => (
          <div key={m.label} className="stats-metric">
            <div className="stats-metric-label">{m.label}</div>
            <div className="stats-metric-value">{m.value}</div>
            {m.hint && <div className="stats-metric-hint">{m.hint}</div>}
          </div>
        ))}
      </div>

      {detail.barGroups.map((group) => (
        <BarGroupView key={group.title} group={group} />
      ))}

      {detail.missingNote && <p className="stats-missing">{detail.missingNote}</p>}

      <div className="stats-matches">
        <div className="stats-matches-title">Matches</div>
        {detail.matches.slice(0, 10).map((m) => (
          <div key={m.matchId} className="stats-match-row">
            <span>{formatDateTime(m.finishedAt)}</span>
            <span className="stats-match-result">{m.result}</span>
          </div>
        ))}
        {detail.matches.length > 10 && (
          <div className="stats-match-more">+ {detail.matches.length - 10} more in this period</div>
        )}
      </div>
    </div>
  );
}

function BarGroupView({ group }: { group: StatBarGroup }) {
  return (
    <div className="stats-bars">
      <div className="stats-bars-title">{group.title}</div>
      {group.note && <div className="stats-bars-note">{group.note}</div>}
      {group.bars.map((bar) => {
        const percent = bar.total > 0 ? Math.round((bar.value / bar.total) * 100) : 0;
        return (
          <div key={bar.label} className="stats-bar-row">
            <span className="stats-bar-label">{bar.label}</span>
            <span className="stats-bar-track">
              <span className="stats-bar-fill" style={{ width: `${percent}%` }} />
            </span>
            <span className="stats-bar-value">
              {percent}% <span className="stats-bar-abs">({bar.value}/{bar.total})</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
