import { useEffect, useRef, useState } from "react";
import { AutodartsAdapter, BoardStatus, RawThrow } from "./autodartsAdapter";

export type LiveThrow = { label: string; raw: RawThrow };

// Verbindet direkt aus dem Browser mit dem Board Manager auf der
// uebergebenen Host-IP (Port 3180, fest - siehe CLAUDE.md). Ersetzt
// fuer die neue Architektur den Umweg ueber unser eigenes Backend.
export function useAutodartsBoard(boardHost: string | null) {
  const [status, setStatus] = useState<BoardStatus>("disconnected");
  const [throws, setThrows] = useState<LiveThrow[]>([]);
  const [hasControlApi, setHasControlApi] = useState(false);
  const adapterRef = useRef<AutodartsAdapter | null>(null);

  useEffect(() => {
    setThrows([]);
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

    return () => {
      adapter.stopRunning();
      adapterRef.current = null;
    };
  }, [boardHost]);

  return {
    status,
    throws,
    hasControlApi,
    start: () => adapterRef.current?.start(),
    stop: () => adapterRef.current?.stop(),
    reset: () => adapterRef.current?.reset(),
    calibrationUrl: () => adapterRef.current?.calibrationUrl(),
  };
}
