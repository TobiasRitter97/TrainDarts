import { useEffect, useState } from "react";
import { getWsUrl } from "./wsUrl";

export type LiveThrows = {
  throws: string[];
  turnCount: number;
};

// Live-Wurfanzeige fuer den Game Screen (SPEC §12). Bewusst ohne
// Spiellogik: zeigt einfach die Darts der laufenden Aufnahme, wie sie
// vom Board (oder dem Wurf-Simulator) hereinkommen. turnCount zaehlt
// bei jedem Takeout hoch - reicht fuer eine simple Spieler-Rotation,
// bis die echte Game Engine (Phase 7) uebernimmt.
export function useLiveThrows(): LiveThrows {
  const [live, setLive] = useState<LiveThrows>({ throws: [], turnCount: 0 });

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;

    function connect() {
      ws = new WebSocket(getWsUrl());
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "live") {
          setLive(msg.data);
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

  return live;
}
