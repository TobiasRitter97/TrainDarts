import { useState } from "react";
import { GameDefinition, MatchState, Segment } from "../api";
import { BoardControlBar } from "../components/BoardControlBar";
import { PlayerScoreboard } from "../components/PlayerScoreboard";
import { CheckoutRouteDisplay } from "../components/CheckoutRouteDisplay";
import { GameProgress } from "../components/GameProgress";
import { GameActions } from "../components/GameActions";
import { DartCorrectionModal } from "../components/DartCorrectionModal";
import { GroupingTrendChart } from "../components/GroupingTrendChart";
import { ResultScreen } from "./ResultScreen";
import "./GameScreen.css";

type CorrectionTarget = { mode: "add" } | { mode: "correct"; throwSeq: number };

export type GameSessionActions = {
  onUndo: () => void;
  onAddThrow: (segment: Segment) => void;
  onCorrectThrow: (throwSeq: number, segment: Segment) => void;
  onConfirm: () => void;
  onRematch: () => void;
};

type Props = {
  match: MatchState;
  game: GameDefinition;
  actions: GameSessionActions;
  // Ob der Fortschritt bei "Spiel verlassen" erhalten bleibt (Remote-
  // Spiele: ja, per Backend/SQLite. Lokale Spiele vor Phase E: nein -
  // andere Bestaetigungsmeldung noetig, siehe handleExit).
  persistsProgress: boolean;
  // Ob DIESES Geraet gerade Aenderungen vornehmen darf - bei lokalen
  // Partien immer true (ein Geraet, ein Board), bei Online-Partien nur
  // fuer den Teilnehmer, dessen Spieler gerade am Zug ist (Tobias-
  // Feedback 09.09.2026: der jeweils andere Mitspieler soll fremde
  // Aufnahmen nicht korrigieren koennen).
  canAct?: boolean;
  onExit: () => void;
};

function pendingLabel(outcome: string | null): string {
  if (outcome === "bust") return "BUST — BESTÄTIGEN";
  if (outcome === "checkout") return "CHECKOUT! — BESTÄTIGEN";
  if (outcome === "round_done") return "RUNDE FERTIG — BESTÄTIGEN";
  return "AUFNAHME FERTIG — BESTÄTIGEN";
}

// Einheitlicher Game Screen (SPEC §12/§13) - rein praesentational,
// unabhaengig davon, ob der Match-State vom alten Backend (siehe
// GameScreen.tsx) oder von der neuen lokalen Client-Engine (siehe
// LocalGameScreen.tsx, Phase C des Client-Rewrites) kommt. Nach
// Erreichen des Dart-Caps (oder Bust/Checkout) friert die Anzeige ein,
// bis Takeout oder der manuelle "Aufnahme bestätigen"-Button den State
// committet. Jeder Dart der aktuellen und der letzten Aufnahmen ist
// antippbar und korrigierbar.
export function GameScreenView({ match, game, actions, persistsProgress, canAct = true, onExit }: Props) {
  const [correction, setCorrection] = useState<CorrectionTarget | null>(null);

  if (match.finished) {
    return <ResultScreen match={match} onRematch={actions.onRematch} onExit={onExit} />;
  }

  function handleExit() {
    const message = persistsProgress
      ? "Spiel verlassen? Der Fortschritt bleibt gespeichert und kann später fortgesetzt werden."
      : "Spiel verlassen? Der Fortschritt geht dabei verloren.";
    if (confirm(message)) onExit();
  }

  function handleCorrectionSelect(segment: Segment) {
    if (!correction || !canAct) return;
    if (correction.mode === "add") {
      actions.onAddThrow(segment);
    } else {
      actions.onCorrectThrow(correction.throwSeq, segment);
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

      <PlayerScoreboard
        players={match.players}
        activePlayerId={match.activePlayerId}
        pendingConfirmation={match.pendingConfirmation}
        pendingOutcome={match.pendingOutcome}
      />

      <section className={`active-player-panel ${match.pendingConfirmation ? "pending" : ""}`}>
        <div className="active-player-label">
          {match.pendingConfirmation ? pendingLabel(match.pendingOutcome) : "CURRENT PLAYER"}
        </div>
        <div className="active-player-name">{activePlayer?.name ?? "—"}</div>
        {!canAct && <div className="waiting-for-turn-label">Nicht dein Zug — nur Zuschauen</div>}
        {match.phase && <div className="jdc-phase-label">{match.phase}</div>}
        {match.attemptInfo && (
          <div className="attempt-info-label">
            {match.attemptInfo.label} {match.attemptInfo.current}
            {match.attemptInfo.total !== null ? ` VON ${match.attemptInfo.total}` : ""}
          </div>
        )}
        {match.target && (
          <>
            <div className="target-label">TARGET</div>
            <div className="target-value">{match.target}</div>
          </>
        )}
        {match.engineFamily === "random_checkout" && activePlayer?.score !== null && activePlayer?.score !== undefined && (
          <>
            <div className="target-label">DEIN REST</div>
            <div className="target-value">{activePlayer.score}</div>
          </>
        )}
        {activePlayer?.groupingRounds && activePlayer.groupingRounds.length > 0 && (
          <div className="grouping-info">
            <div className="target-label">
              LETZTE RUNDE
              {activePlayer.groupingRounds[activePlayer.groupingRounds.length - 1].mm !== null
                ? ` — ${activePlayer.groupingRounds[activePlayer.groupingRounds.length - 1].mm!.toFixed(1)} mm (vorläufig, unkalibriert)`
                : " — keine gültigen Koordinaten"}
            </div>
            <GroupingTrendChart rounds={activePlayer.groupingRounds} bestIndex={activePlayer.bestGroupingRoundIndex} />
          </div>
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
        {darts.map((t, i) => {
          // Das jeweils naechste noch leere Feld darf direkt befuellt
          // werden (ersetzt den Umweg ueber den separaten "+ DART"-
          // Button) - weiter hinten liegende leere Felder bleiben
          // gesperrt, die Engine kennt nur eine fortlaufende Reihenfolge
          // innerhalb der Aufnahme, kein Ueberspringen moeglich.
          const isNextEmpty = !t && !match.pendingConfirmation && i === match.currentVisitThrows.length;
          return (
            <button
              key={i}
              type="button"
              className="dart-slot"
              disabled={!canAct || (!t && !isNextEmpty)}
              onClick={() => {
                if (!canAct) return;
                if (t) setCorrection({ mode: "correct", throwSeq: t.throwSeq });
                else if (isNextEmpty) setCorrection({ mode: "add" });
              }}
            >
              <div className="dart-slot-label">DART {i + 1}</div>
              <div className={`dart-chip ${t ? "filled" : isNextEmpty ? "addable" : "empty"}`}>{t?.label ?? (isNextEmpty ? "+" : "—")}</div>
            </button>
          );
        })}
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
                    disabled={!canAct}
                    onClick={() => canAct && setCorrection({ mode: "correct", throwSeq: t.throwSeq })}
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
        canAddDart={!match.pendingConfirmation && match.currentVisitThrows.length < 3}
        canConfirm={match.currentVisitThrows.length > 0}
        visitComplete={match.pendingConfirmation}
        canAct={canAct}
        onUndo={actions.onUndo}
        onAddDart={() => canAct && setCorrection({ mode: "add" })}
        onConfirm={actions.onConfirm}
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
