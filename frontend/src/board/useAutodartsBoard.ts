import { useEffect, useRef, useState } from "react";
import { AutodartsAdapter, BoardStatus, RawThrow } from "./autodartsAdapter";

export type LiveThrow = { label: string; raw: RawThrow };

const STATE_POLL_INTERVAL_MS = 2000;

// Verbindet direkt aus dem Browser mit dem Board Manager auf der
// uebergebenen Host-IP (Port 3180, fest - siehe CLAUDE.md). Ersetzt
// fuer die neue Architektur den Umweg ueber unser eigenes Backend.
export function useAutodartsBoard(boardHost: string | null) {
  const [status, setStatus] = useState<BoardStatus>("disconnected");
  const [throws, setThrows] = useState<LiveThrow[]>([]);
  const [hasControlApi, setHasControlApi] = useState(false);
  // Ob das Board selbst gerade Wuerfe entgegennimmt (Board-Manager-
  // Zustand "running", per /api/state) - unabhaengig vom WebSocket-
  // Verbindungsstatus, der nur zeigt, ob WIR verbunden sind (Tobias-
  // Feedback 10.09.2026: "Status vom Board anzeigen aktiv/inaktiv").
  const [boardRunning, setBoardRunning] = useState<boolean | null>(null);
  const adapterRef = useRef<AutodartsAdapter | null>(null);

  useEffect(() => {
    setThrows([]);
    setBoardRunning(null);
    if (!boardHost) {
      setStatus("disconnected");
      adapterRef.current = null;
      return;
    }
    const adapter = new AutodartsAdapter(boardHost, 3180, {
      onStatusChange: setStatus,
      onThrow: (label, raw) => setThrows((prev) => [...prev, { label, raw }]),
      onTakeout: () => setThrows([]),
    });
    adapterRef.current = adapter;
    adapter.run();
    adapter.hasControlApi().then(setHasControlApi);

    const pollState = () => {
      adapter.getState().then((state) => setBoardRunning(state ? state.running : null));
    };
    pollState();
    const interval = setInterval(pollState, STATE_POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      adapter.stopRunning();
      adapterRef.current = null;
    };
  }, [boardHost]);

  return {
    status,
    throws,
    hasControlApi,
    boardRunning,
    start: () => adapterRef.current?.start(),
    stop: () => adapterRef.current?.stop(),
    reset: () => adapterRef.current?.reset(),
    calibrationUrl: () => adapterRef.current?.calibrationUrl(),
  };
}
