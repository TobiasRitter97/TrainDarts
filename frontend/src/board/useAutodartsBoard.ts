import { useEffect, useRef, useState } from "react";
import { AutodartsAdapter, BoardStatus, RawThrow } from "./autodartsAdapter";

export type LiveThrow = { label: string; raw: RawThrow };

// Diagnose (Board Test): eine ungefilterte Nachricht vom Board Manager.
export type RawBoardMessage = { at: number; type: string; text: string };

const STATE_POLL_INTERVAL_MS = 2000;
const RAW_MESSAGE_LIMIT = 40;
const RAW_TEXT_LIMIT = 2000;
// Dieselben Rausch-Typen wie in CLAUDE.md - sie kommen mehrmals pro
// Sekunde und wuerden die eigentlich interessanten Nachrichten sofort
// aus der Liste schieben. Gezaehlt werden sie trotzdem.
const NOISE_TYPES = new Set(["motion_state", "cam_stats", "stats"]);

// Macht aus einer rohen WebSocket-Nachricht lesbaren Text. Binaere
// Frames (Blob/ArrayBuffer) werden ausdruecklich markiert - wuerde ein
// Board Manager so senden, koennte die App sie heute nicht lesen.
async function rawToText(data: unknown): Promise<{ text: string; binary: boolean }> {
  if (typeof data === "string") return { text: data, binary: false };
  if (data instanceof Blob) return { text: await data.text(), binary: true };
  if (data instanceof ArrayBuffer) return { text: new TextDecoder().decode(data), binary: true };
  return { text: String(data), binary: false };
}

function messageType(text: string): string {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed?.type === "string" ? parsed.type : "(no type)";
  } catch {
    return "(not JSON)";
  }
}

// Verbindet direkt aus dem Browser mit dem Board Manager auf der
// uebergebenen Host-IP (Port 3180, fest - siehe CLAUDE.md). Ersetzt
// fuer die neue Architektur den Umweg ueber unser eigenes Backend.
//
// captureRaw (nur Board Test): sammelt zusaetzlich alle Nachrichten
// ungefiltert, die Board-Manager-Version und den letzten /api/state -
// fuer die Fehlersuche an fremden Boards (z.B. Autodarts Desktop), deren
// Nachrichtenformat wir nicht selbst messen koennen.
export function useAutodartsBoard(boardHost: string | null, options: { captureRaw?: boolean } = {}) {
  const captureRaw = options.captureRaw ?? false;
  const [status, setStatus] = useState<BoardStatus>("disconnected");
  const [throws, setThrows] = useState<LiveThrow[]>([]);
  const [hasControlApi, setHasControlApi] = useState(false);
  // Ob das Board selbst gerade Wuerfe entgegennimmt (Board-Manager-
  // Zustand "running", per /api/state) - unabhaengig vom WebSocket-
  // Verbindungsstatus, der nur zeigt, ob WIR verbunden sind (Tobias-
  // Feedback 10.09.2026: "Status vom Board anzeigen aktiv/inaktiv").
  const [boardRunning, setBoardRunning] = useState<boolean | null>(null);
  const [rawMessages, setRawMessages] = useState<RawBoardMessage[]>([]);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [lastState, setLastState] = useState<unknown>(null);
  const [version, setVersion] = useState<string | null>(null);
  const adapterRef = useRef<AutodartsAdapter | null>(null);

  useEffect(() => {
    setThrows([]);
    setBoardRunning(null);
    setRawMessages([]);
    setTypeCounts({});
    setLastState(null);
    setVersion(null);
    if (!boardHost) {
      setStatus("disconnected");
      adapterRef.current = null;
      return;
    }

    let active = true;
    const onRawMessage = captureRaw
      ? (data: unknown) => {
          rawToText(data).then(({ text, binary }) => {
            if (!active) return;
            const type = (binary ? "[binary] " : "") + messageType(text);
            setTypeCounts((prev) => ({ ...prev, [type]: (prev[type] ?? 0) + 1 }));
            if (NOISE_TYPES.has(type)) return;
            const entry = { at: Date.now(), type, text: text.slice(0, RAW_TEXT_LIMIT) };
            setRawMessages((prev) => [entry, ...prev].slice(0, RAW_MESSAGE_LIMIT));
          });
        }
      : undefined;

    const adapter = new AutodartsAdapter(boardHost, 3180, {
      onStatusChange: setStatus,
      onThrow: (label, raw) => setThrows((prev) => [...prev, { label, raw }]),
      onTakeout: () => setThrows([]),
      onRawMessage,
    });
    adapterRef.current = adapter;
    adapter.run();
    adapter.hasControlApi().then((ok) => active && setHasControlApi(ok));
    if (captureRaw) adapter.getVersion().then((v) => active && setVersion(v));

    const pollState = () => {
      adapter.getState().then((state) => {
        if (!active) return;
        setBoardRunning(state ? state.running : null);
        if (captureRaw) setLastState(state);
      });
    };
    pollState();
    const interval = setInterval(pollState, STATE_POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(interval);
      adapter.stopRunning();
      adapterRef.current = null;
    };
  }, [boardHost, captureRaw]);

  return {
    status,
    throws,
    hasControlApi,
    boardRunning,
    rawMessages,
    typeCounts,
    lastState,
    version,
    start: () => adapterRef.current?.start(),
    stop: () => adapterRef.current?.stop(),
    reset: () => adapterRef.current?.reset(),
    calibrationUrl: () => adapterRef.current?.calibrationUrl(),
  };
}
