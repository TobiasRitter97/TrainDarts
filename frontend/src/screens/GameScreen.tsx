import { useEffect, useState } from "react";
import { api, GameDefinition, Segment } from "../api";
import { useMatchState } from "../useMatchState";
import { BoardControlBar } from "../components/BoardControlBar";
import { PlayerScoreboard } from "../components/PlayerScoreboard";
import { CheckoutRouteDisplay } from "../components/CheckoutRouteDisplay";
import { GameProgress } from "../components/GameProgress";
import { GameActions } from "../components/GameActions";
import { DartCorrectionModal } from "../components/DartCorrectionModal";
import { ResultScreen } from "./ResultScreen";
import "./GameScreen.css";

type Props = {
  onExit: () => void;
};

type CorrectionTarget = { mode: "add" } | { mode: "correct"; throwSeq: number };

function pendingLabel(outcome: string | null): string {
  if (outcome === "bust") return "BUST — BESTÄTIGEN";
  if (outcome === "checkout") return "CHECKOUT! — BESTÄTIGEN";
  return "AUFNAHME FERTIG — BESTÄTIGEN";
}

// Einheitlicher Game Screen (SPEC §12/§13), verbunden mit der echten
// Game Engine. Nach Erreichen des Dart-Caps (oder Bust/Checkout)
// friert die Anzeige ein, bis Takeout oder der manuelle
// "Aufnahme bestätigen"-Button den State committen
// (docs/ARCHITEKTUR.md Abschnitt 2.1). Jeder Dart der aktuellen und
// der letzten Aufnahmen ist antippbar und korrigierbar (Abschnitt 7.2).
export function GameScreen({ onExit }: Props) {
  const match = useMatchState();
  const [game, setGame] = useState<GameDefinition | null>(null);
  const [correction, setCorrection] = useState<CorrectionTarget | null>(null);

  useEffect(() => {
    if (!match) return;
    api
      .listGames()
      .then((list) => {
        setGame((prev) => (prev?.id === match.gameId ? prev : list.find((g) => g.id === match.gameId) ?? null));
      })
      .catch(() => {});
  }, [match?.gameId]);

  if (!match || !game) {
    return <p className="screen-note">Warte auf Spielstart…</p>;
  }

  async function handleRematch() {
    await api.createMatch(game!.id, match!.players.map((p) => p.id), match!.settings);
  }

  if (match.finished) {
    return <ResultScreen match={match} onRematch={handleRematch} onExit={onExit} />;
  }

  function handleExit() {
    if (confirm("Spiel verlassen? Der Fortschritt bleibt gespeichert und kann später fortgesetzt werden.")) {
      onExit();
    }
  }

  async function handleCorrectionSelect(segment: Segment) {
    if (!correction || !match) return;
    if (correction.mode === "add") {
      await api.addThrow(match.matchId, segment);
    } else {
      await api.correctThrow(match.matchId, correction.throwSeq, segment);
    }
    setCorrection(null);
  }

  const darts = [match.currentVisitThrows[0] ?? null, match.currentVisitThrows[1] ?? null, match.currentVisitThrows[2] ?? null];
  const activePlayer = match.players.find((p) => p.id === match.activePlayerId);

  return (
    <div className="game-screen">
      <header className="game-screen-header">
        <div className="game-screen-title">{game.name.toUpperCase()}</div>
        <BoardControlBar />
      </header>

      <PlayerScoreboard players={match.players} activePlayerId={match.activePlayerId} />

      <section className={`active-player-panel ${match.pendingConfirmation ? "pending" : ""}`}>
        <div className="active-player-label">
          {match.pendingConfirmation ? pendingLabel(match.pendingOutcome) : "CURRENT PLAYER"}
        </div>
        <div className="active-player-name">{activePlayer?.name ?? "—"}</div>
        {match.phase && <div className="jdc-phase-label">{match.phase}</div>}
        {match.target && (
          <>
            <div className="target-label">TARGET</div>
            <div className="target-value">{match.target}</div>
          </>
        )}
        {activePlayer?.openNumbers && (
          <div className="open-numbers">
            <div className="target-label">OFFENE ZAHLEN</div>
            <div className="open-numbers-list">
              {activePlayer.openNumbers.map((n) => (
                <span key={n} className={`open-number-chip ${String(n) === match.target ? "active" : ""}`}>
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <CheckoutRouteDisplay route={match.checkoutSuggestion} />

      <section className="current-throw-panel">
        {darts.map((t, i) => (
          <button
            key={i}
            type="button"
            className="dart-slot"
            disabled={!t}
            onClick={() => t && setCorrection({ mode: "correct", throwSeq: t.throwSeq })}
          >
            <div className="dart-slot-label">DART {i + 1}</div>
            <div className={`dart-chip ${t ? "filled" : "empty"}`}>{t?.label ?? "—"}</div>
          </button>
        ))}
      </section>

      {match.history.length > 0 && (
        <section className="visit-history">
          <div className="visit-history-label">Letzte Aufnahmen — antippen zum Korrigieren</div>
          <div className="visit-history-rows">
            {match.history.map((visit, vi) => (
              <div key={vi} className="visit-history-row">
                <span className="visit-history-player">
                  {match.players.find((p) => p.id === visit.playerId)?.name ?? "—"}
                </span>
                {visit.throws.map((t) => (
                  <button
                    key={t.throwSeq}
                    type="button"
                    className="history-chip"
                    onClick={() => setCorrection({ mode: "correct", throwSeq: t.throwSeq })}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      <GameProgress round={match.round} legNumber={match.legNumber} setNumber={match.setNumber} />

      <GameActions
        canUndo={match.canUndo}
        canConfirm={match.pendingConfirmation}
        onUndo={() => api.undoMatch(match.matchId)}
        onAddDart={() => setCorrection({ mode: "add" })}
        onConfirm={() => api.confirmVisit(match.matchId)}
        onExit={handleExit}
      />

      {correction && (
        <DartCorrectionModal
          title={correction.mode === "add" ? "Dart hinzufügen" : "Dart korrigieren"}
          onSelect={handleCorrectionSelect}
          onClose={() => setCorrection(null)}
        />
      )}
    </div>
  );
}
