import { useBoardStatus } from "../useBoardStatus";
import "./BoardStatusBadge.css";

const LABELS = {
  connected: "CONNECTED",
  reconnecting: "RECONNECTING",
  disconnected: "DISCONNECTED",
} as const;

// SPEC §37: dezente Statusanzeige, ob das Backend gerade mit dem
// Autodarts Board Manager (oder lokal dem Wurf-Simulator) verbunden ist.
export function BoardStatusBadge() {
  const status = useBoardStatus();
  return (
    <div className="board-status">
      <span className={`board-status-dot ${status}`} />
      {LABELS[status]}
    </div>
  );
}
