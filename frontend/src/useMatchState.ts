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
      try {
        ws = new WebSocket(getWsUrl());
      } catch {
        // z.B. Mixed-Content-Block (ws:// von einer https-Seite ohne
        // erlaubte unsichere Inhalte) - wirft synchron beim Konstruieren,
        // nicht erst beim Verbindungsaufbau. Ohne dieses catch stuerzt
        // die gesamte App ab (kein WS-Reconnect-Pfad greift dann mehr).
        if (!cancelled) setTimeout(connect, 1500);
        return;
      }
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
