import { useEffect, useState } from "react";
import { api } from "../api";
import { BoardStatusBadge } from "./BoardStatusBadge";
import "./BoardControlBar.css";

// Dezente Board-Leiste: Status + Start/Stop/Reset (verifizierte
// Board-Manager-REST-API, siehe CLAUDE.md) + Link zur echten
// Board-Manager-Oberfläche für die Kalibrierung (kein Nachbau).
export function BoardControlBar() {
  const [calibrationUrl, setCalibrationUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getBoardInfo()
      .then((info) => setCalibrationUrl(info.calibrationUrl))
      .catch(() => setCalibrationUrl(null));
  }, []);

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
      <BoardStatusBadge />
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
      {error && <span className="board-control-error">{error}</span>}
    </div>
  );
}
