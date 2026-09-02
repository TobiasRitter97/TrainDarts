import { useEffect, useState } from "react";
import { api } from "../api";
import { useBoardStatus } from "../useBoardStatus";
import { BoardStatusBadge } from "./BoardStatusBadge";
import "./BoardControlBar.css";

// Dezente Board-Leiste: Status + Start/Stop/Reset (verifizierte
// Board-Manager-REST-API, siehe CLAUDE.md) + Link zur echten
// Board-Manager-Oberfläche für die Kalibrierung (kein Nachbau).
//
// Der lokale Wurf-Simulator bildet nur die Wurf-Events nach, hat aber
// keine Steuer-API - hasControlApi (per echtem Live-Check im Backend,
// nicht anhand des Hostnamens geraten) blendet die Buttons in dem
// Fall aus, statt eine irrefuehrende Fehlermeldung zu zeigen.
export function BoardControlBar() {
  const status = useBoardStatus();
  const [calibrationUrl, setCalibrationUrl] = useState<string | null>(null);
  const [hasControlApi, setHasControlApi] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Bei jedem Statuswechsel neu pruefen (z.B. wenn der Simulator
    // oder das echte Board erst nach dem Laden der Seite verbindet).
    api
      .getBoardInfo()
      .then((info) => {
        setCalibrationUrl(info.calibrationUrl);
        setHasControlApi(info.hasControlApi);
      })
      .catch(() => {
        setCalibrationUrl(null);
        setHasControlApi(false);
      });
  }, [status]);

  async function run(action: "start" | "stop" | "reset") {
    setBusy(action);
    setError(null);
    try {
      if (action === "start") await api.startBoard();
      if (action === "stop") await api.stopBoard();
      if (action === "reset") await api.resetBoard();
    } catch {
      setError("Board nicht erreichbar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="board-control-bar">
      <BoardStatusBadge status={status} />

      {hasControlApi && (
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
          {calibrationUrl && (
            <a className="board-btn calibration-link" href={calibrationUrl} target="_blank" rel="noreferrer">
              Kalibrierung ↗
            </a>
          )}
        </div>
      )}

      {!hasControlApi && status === "connected" && (
        <span className="board-control-hint">Simulator — Steuerung nur am echten Board</span>
      )}

      {error && <span className="board-control-error">{error}</span>}
    </div>
  );
}
