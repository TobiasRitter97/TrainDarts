import { BoardStatus } from "../useBoardStatus";
import "./BoardStatusBadge.css";

const LABELS = {
  connected: "CONNECTED",
  reconnecting: "RECONNECTING",
  disconnected: "DISCONNECTED",
} as const;

type Props = {
  status: BoardStatus;
};

// SPEC §37: dezente Statusanzeige, ob das Backend gerade mit dem
// Autodarts Board Manager (oder lokal dem Wurf-Simulator) verbunden ist.
// Status kommt als Prop von BoardControlBar (statt einer eigenen
// WS-Verbindung), damit nicht mehrere WS-Verbindungen fuer dieselben
// Daten gleichzeitig offen sind.
export function BoardStatusBadge({ status }: Props) {
  return (
    <div className="board-status">
      <span className={`board-status-dot ${status}`} />
      {LABELS[status]}
    </div>
  );
}
