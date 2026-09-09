import { useEffect, useState } from "react";
import { getWsUrl } from "./wsUrl";

export type BoardStatus = "connected" | "reconnecting" | "disconnected";

// Verbindet sich mit dem Live-WebSocket des Backends (docs/ARCHITEKTUR.md
// Abschnitt 10) und haelt den Board-Status aktuell. Reconnect wie im
// Prototyp: bei Verbindungsverlust nach 1.5s erneut versuchen.
export function useBoardStatus(): BoardStatus {
  const [status, setStatus] = useState<BoardStatus>("disconnected");

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
        if (msg.type === "board_status") {
          setStatus(msg.data.status);
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

  return status;
}
