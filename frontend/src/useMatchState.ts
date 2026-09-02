import { useEffect, useState } from "react";
import { MatchState } from "./api";
import { getWsUrl } from "./wsUrl";

// Live-Zustand des aktiven Matches (echte Spiellogik, Phase 7). Kommt
// vom selben WS wie Board-Status/Live-Wuerfe (docs/ARCHITEKTUR.md
// Abschnitt 10), Nachrichtentyp "match_state".
export function useMatchState(): MatchState | null {
  const [state, setState] = useState<MatchState | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;

    function connect() {
      ws = new WebSocket(getWsUrl());
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "match_state") {
          setState(msg.data);
        }
      };
      ws.onclose = () => {
        if (!cancelled) setTimeout(connect, 1500);
      };
    }
    connect();

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, []);

  return state;
}
