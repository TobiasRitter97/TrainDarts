import { useState } from "react";
import { useAutodartsBoard } from "../board/useAutodartsBoard";
import { getStoredPiIp } from "../piConnection";
import "./BoardDebugScreen.css";

type Props = {
  onBack: () => void;
};

const STATUS_LABEL: Record<string, string> = {
  connected: "CONNECTED",
  reconnecting: "CONNECTING…",
  disconnected: "DISCONNECTED",
};

// Phase A des Client-Rewrites (~/.claude/plans/agile-brewing-wadler.md):
// Test-Screen fuer die neue direkte Browser->Board-Verbindung (Port
// 3180, kein eigenes Backend mehr) - zeigt live geworfene Darts an,
// um autodartsAdapter.ts gegen ein echtes Board zu verifizieren.
//
// Seit 14.11.2026 zusaetzlich mit Rohdaten-Diagnose: ein Board mit
// Autodarts Desktop erkannte Wuerfe, die App aber nicht. Der Bericht
// ("Copy report") zeigt Version, /api/state und alle Nachrichten
// ungefiltert, damit das Format fremder Boards messbar wird statt
// geraten.
export function BoardDebugScreen({ onBack }: Props) {
  const [ip, setIp] = useState(getStoredPiIp() ?? "");
  const [activeHost, setActiveHost] = useState<string | null>(null);
  const board = useAutodartsBoard(activeHost, { captureRaw: true });
  const [copyStatus, setCopyStatus] = useState<"idle" | "ok" | "error">("idle");

  function buildReport(): string {
    const counts = Object.entries(board.typeCounts)
      .map(([type, n]) => `${type}: ${n}`)
      .join(", ");
    const messages = [...board.rawMessages]
      .reverse()
      .map((m) => `[${new Date(m.at).toLocaleTimeString()}] ${m.text}`)
      .join("\n");
    return [
      `TrainDart board report - ${new Date().toISOString()}`,
      `Host: ${activeHost}`,
      `Connection: ${board.status}`,
      `Board Manager version: ${board.version ?? "unknown"}`,
      `Recognized throws: ${board.throws.map((t) => t.label).join(" ") || "none"}`,
      `Messages by type: ${counts || "none"}`,
      `Current state (/api/state): ${JSON.stringify(board.lastState)}`,
      `Messages (oldest first, without cam_stats/stats/motion_state):`,
      messages || "none",
    ].join("\n");
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(buildReport());
      setCopyStatus("ok");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <div className="board-debug">
      <button className="btn-secondary back-btn" onClick={onBack}>
        ← Back
      </button>
      <h1 className="screen-title">BOARD CONNECTION TEST (Phase A)</h1>
      <p className="screen-note">
        Tests the new direct connection from the browser to the Autodarts Board Manager (port 3180), with no
        backend of our own.
      </p>

      <div className="panel board-debug-form">
        <input
          placeholder="Board IP, e.g. 192.168.188.97"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
        />
        <button className="btn-primary" onClick={() => setActiveHost(ip.trim())} disabled={!ip.trim()}>
          Connect
        </button>
      </div>

      {activeHost && (
        <div className="panel board-debug-status">
          <div className={`board-debug-badge ${board.status}`}>{STATUS_LABEL[board.status]}</div>
          <div className="screen-note">Control API detected: {board.hasControlApi ? "yes (real board)" : "no"}</div>
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
          <h2 className="section-title">Live throws (current visit)</h2>
          {board.throws.length === 0 && <p className="screen-note">No throw detected yet.</p>}
          <div className="board-debug-throw-list">
            {board.throws.map((t, i) => (
              <span key={i} className="board-debug-throw">
                {t.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {activeHost && (
        <div className="panel board-debug-raw">
          <h2 className="section-title">Board data (troubleshooting)</h2>
          <p className="screen-note">
            Throw a dart, then tap "Copy report" and send the copied text to whoever is helping you.
          </p>
          <div className="board-debug-actions">
            <button className="btn-primary" onClick={copyReport}>
              Copy report
            </button>
            {copyStatus === "ok" && <span className="screen-note">Copied!</span>}
            {copyStatus === "error" && (
              <span className="screen-error">Copying failed — please take a screenshot instead.</span>
            )}
          </div>
          <div className="screen-note">Board Manager version: {board.version ?? "unknown"}</div>
          <div className="screen-note">
            Messages by type:{" "}
            {Object.entries(board.typeCounts)
              .map(([type, n]) => `${type}: ${n}`)
              .join(" · ") || "none yet"}
          </div>
          <div className="screen-note">Current state:</div>
          <pre className="board-debug-pre">{JSON.stringify(board.lastState, null, 2)}</pre>
          <div className="screen-note">Latest messages (newest first):</div>
          {board.rawMessages.length === 0 && <p className="screen-note">None yet.</p>}
          {board.rawMessages.map((m) => (
            <pre key={m.at + m.text} className="board-debug-pre">
              {new Date(m.at).toLocaleTimeString()} — {m.text}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}
