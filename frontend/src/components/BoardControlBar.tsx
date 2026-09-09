import { useState } from "react";
import { useAutodartsBoard } from "../board/useAutodartsBoard";
import { getBoardHost } from "../board/boardHost";
import { BoardStatusBadge } from "./BoardStatusBadge";
import "./BoardControlBar.css";

// Dezente Board-Leiste: Status + Start/Stop/Reset + Link zur echten
// Board-Manager-Oberflaeche fuer die Kalibrierung (kein Nachbau).
//
// Verbindet seit Phase A des Client-Rewrites (siehe
// ~/.claude/plans/agile-brewing-wadler.md) DIREKT mit dem Autodarts-
// Board-Manager (Port 3180) statt ueber unser altes Backend (Port
// 8088) - behebt nebenbei auch den fehlerhaften Kalibrierungslink
// (der frueher IMMER "localhost" zeigte, weil das Backend selbst auf
// demselben Pi wie das Board laeuft - fuer einen entfernten Browser
// war das nie die richtige Adresse) und vermeidet zwei parallele
// WebSocket-Verbindungen zum selben Board waehrend eines lokal
// gespielten Matches (siehe useLocalMatch.ts).
//
// Der lokale Wurf-Simulator hat keine Steuer-API - hasControlApi (per
// echtem Live-Check, nicht anhand des Hostnamens geraten) blendet die
// Buttons in dem Fall aus, statt eine irrefuehrende Fehlermeldung zu
// zeigen.
export function BoardControlBar() {
  const board = useAutodartsBoard(getBoardHost());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "start" | "stop" | "reset") {
    setBusy(action);
    setError(null);
    try {
      if (action === "start") await board.start();
      if (action === "stop") await board.stop();
      if (action === "reset") await board.reset();
    } catch {
      setError("Board nicht erreichbar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="board-control-bar">
      <BoardStatusBadge status={board.status} />

      {board.hasControlApi && (
        <div className="board-control-buttons">
          <button className="board-btn" disabled={busy !== null} onClick={() => run("start")}>
            Start
          </button>
          <button className="board-btn" disabled={busy !== null} onClick={() => run("stop")}>
            Stop
          </button>
          <button className="board-btn" disabled={busy !== null} onClick={() => run("reset")}>
            Reset
          </button>
          <a className="board-btn calibration-link" href={board.calibrationUrl()} target="_blank" rel="noreferrer">
            Kalibrierung ↗
          </a>
        </div>
      )}

      {!board.hasControlApi && board.status === "connected" && (
        <span className="board-control-hint">Simulator — Steuerung nur am echten Board</span>
      )}

      {error && <span className="board-control-error">{error}</span>}
    </div>
  );
}
