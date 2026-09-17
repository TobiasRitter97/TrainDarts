import { MatchPlayer } from "../api";

type Props = {
  players: MatchPlayer[];
  activePlayerId: string;
  pendingConfirmation: boolean;
  pendingOutcome: string | null;
};

// SPEC §12/§13: alle Spieler auf einen Blick, aktiver Spieler klar
// erkennbar (Accent-Border + leichte Hintergrundaenderung, keine
// Animation). Score kommt aus der echten Game Engine.
//
// Bei einem Bust springt die Restpunktzahl automatisch zurueck auf den
// Aufnahme-Startwert (korrekte Darts-Regel) - ohne Kennzeichnung wirkt
// dieser Zahlensprung aber wie ein verwirrender Wechsel zwischen zwei
// verschiedenen Werten (Tobias-Feedback 10.09.2026). Solange die
// Aufnahme auf Bestaetigung wartet, zeigt die Kachel des aktiven
// Spielers deshalb klar "BUST" statt der zurueckgesprungenen Zahl -
// die echte Zahl erscheint erst wieder nach der Bestaetigung.
export function PlayerScoreboard({ players, activePlayerId, pendingConfirmation, pendingOutcome }: Props) {
  return (
    <div className="player-scoreboard">
      {players.map((player) => {
        const isActive = player.id === activePlayerId;
        const showBust = isActive && pendingConfirmation && pendingOutcome === "bust";
        return (
          <div key={player.id} className={`scoreboard-tile ${isActive ? "active" : ""}`}>
            <div className="scoreboard-name">{player.name}</div>
            <div className={`scoreboard-score ${showBust ? "bust" : ""}`}>{showBust ? "BUST" : player.score ?? "—"}</div>
            {player.pressure && <PressureBlock pressure={player.pressure} />}
          </div>
        );
      })}
    </div>
  );
}

// Pressure 501: Dart-Zaehler, Ghost-Rest, Differenz zum Ghost (gruen =
// vorne, rot = hinten) und laufende Punktesumme. Nach einem beendeten
// Leg bleibt das Ergebnis dieses Legs sichtbar, bis das naechste Leg
// abgeschlossen ist.
//
// Solange das Dart-Limit haelt, steht dort "N darts left". Ist es ohne
// Checkout erreicht, wird daraus "TARGET MISSED" plus ein Overtime-
// Zaehler (Training Mode) bzw. "CHALLENGE FAILED" (Strict Mode, das Leg
// ist dann sofort vorbei) - Tobias-Anforderung 17.09.2026.
function PressureBlock({ pressure }: { pressure: NonNullable<MatchPlayer["pressure"]> }) {
  const diff = pressure.diffToGhost;
  const ahead = diff > 0;
  const strict = pressure.gameMode === "strict";
  return (
    <div className="scoreboard-pressure">
      <div className="scoreboard-pressure-row">
        <span>
          {pressure.dartsThisLeg} / {pressure.dartLimit} darts
        </span>
        <span>Ghost {pressure.ghostRemaining}</span>
      </div>

      {pressure.targetMissed ? (
        <div className="scoreboard-pressure-missed">
          <span className="pressure-missed-label">{strict ? "CHALLENGE FAILED" : "TARGET MISSED"}</span>
          {/* Der Zaehler startet erst mit dem ersten Dart ueber dem Limit. */}
          {!strict && pressure.overtime > 0 && <span className="pressure-overtime">OVERTIME +{pressure.overtime}</span>}
        </div>
      ) : (
        <div className="scoreboard-pressure-left">{pressure.dartsLeft} darts left</div>
      )}

      <div className={`scoreboard-pressure-diff ${ahead ? "ahead" : diff < 0 ? "behind" : ""}`}>
        {diff === 0 ? "level with ghost" : `${ahead ? "+" : ""}${diff}`}
      </div>

      <div className="scoreboard-pressure-row">
        <span>{pressure.points} pts</span>
      </div>

      {pressure.lastLeg && <LastLegBlock last={pressure.lastLeg} limit={pressure.dartLimit} strict={strict} />}
    </div>
  );
}

// Ergebnis des zuletzt beendeten Legs, in der von Tobias vorgegebenen
// Form: Ziel, tatsaechliche Dartzahl, Ergebnis und ggf. Overtime.
function LastLegBlock({
  last,
  limit,
  strict,
}: {
  last: NonNullable<NonNullable<MatchPlayer["pressure"]>["lastLeg"]>;
  limit: number;
  strict: boolean;
}) {
  // Im Strict Mode endet das Leg im selben Moment, in dem das Limit
  // faellt - "CHALLENGE FAILED" waere in der laufenden Anzeige also nie
  // zu sehen und steht deshalb als Ueberschrift ueber dem Leg-Ergebnis.
  const failedChallenge = strict && last.failed && !last.checkout;
  return (
    <div className="scoreboard-lastleg">
      <div className={`lastleg-title ${failedChallenge ? "failed" : ""}`}>
        {failedChallenge ? "CHALLENGE FAILED" : "LAST LEG"}
      </div>
      <dl className="lastleg-grid">
        <dt>Target</dt>
        <dd>≤{limit} darts</dd>
        <dt>{last.checkout ? "Finished" : "Stopped at"}</dt>
        <dd>{last.darts} darts</dd>
        <dt>Result</dt>
        <dd className={last.failed ? "failed" : "passed"}>{last.failed ? "Failed" : "Passed"}</dd>
        {last.overtime > 0 && (
          <>
            <dt>Overtime</dt>
            <dd>+{last.overtime} darts</dd>
          </>
        )}
        {!last.checkout && (
          <>
            <dt>Remaining</dt>
            <dd>{last.remaining}</dd>
          </>
        )}
        <dt>Points</dt>
        <dd>{last.points}</dd>
      </dl>
    </div>
  );
}
