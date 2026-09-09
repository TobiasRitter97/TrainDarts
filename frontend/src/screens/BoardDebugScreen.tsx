import { useState } from "react";
import { useAutodartsBoard } from "../board/useAutodartsBoard";
import { getStoredPiIp } from "../piConnection";
import "./BoardDebugScreen.css";

type Props = {
  onBack: () => void;
};

const STATUS_LABEL: Record<string, string> = {
  connected: "VERBUNDEN",
  reconnecting: "VERBINDE…",
  disconnected: "GETRENNT",
};

// Phase A des Client-Rewrites (~/.claude/plans/agile-brewing-wadler.md):
// Test-Screen fuer die neue direkte Browser->Board-Verbindung (Port
// 3180, kein eigenes Backend mehr) - zeigt live geworfene Darts an,
// um autodartsAdapter.ts gegen ein echtes Board zu verifizieren.
export function BoardDebugScreen({ onBack }: Props) {
  const [ip, setIp] = useState(getStoredPiIp() ?? "");
  const [activeHost, setActiveHost] = useState<string | null>(null);
  const board = useAutodartsBoard(activeHost);

  return (
    <div className="board-debug">
      <button className="btn-secondary back-btn" onClick={onBack}>
        ← Zurück
      </button>
      <h1 className="screen-title">BOARD-VERBINDUNGSTEST (Phase A)</h1>
      <p className="screen-note">
        Testet die neue direkte Verbindung Browser → Autodarts-Board-Manager (Port 3180), ganz ohne eigenes Backend.
      </p>

      <div className="panel board-debug-form">
        <input
          placeholder="Board-IP, z.B. 192.168.188.97"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
        />
        <button className="btn-primary" onClick={() => setActiveHost(ip.trim())} disabled={!ip.trim()}>
          Verbinden
        </button>
      </div>

      {activeHost && (
        <div className="panel board-debug-status">
          <div className={`board-debug-badge ${board.status}`}>{STATUS_LABEL[board.status]}</div>
          <div className="screen-note">Control-API erkannt: {board.hasControlApi ? "ja (echtes Board)" : "nein"}</div>
          <div className="board-debug-actions">
            <button className="btn-outline" onClick={board.start} disabled={!board.hasControlApi}>
              Start
            </button>
            <button className="btn-outline" onClick={board.stop} disabled={!board.hasControlApi}>
              Stop
            </button>
            <button className="btn-outline" onClick={board.reset} disabled={!board.hasControlApi}>
              Reset
            </button>
          </div>
        </div>
      )}

      {activeHost && (
        <div className="panel board-debug-throws">
          <h2 className="section-title">Live-Würfe (aktuelle Aufnahme)</h2>
          {board.throws.length === 0 && <p className="screen-note">Noch kein Wurf erkannt.</p>}
          <div className="board-debug-throw-list">
            {board.throws.map((t, i) => (
              <span key={i} className="board-debug-throw">
                {t.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
