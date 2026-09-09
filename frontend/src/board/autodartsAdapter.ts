// 1:1-Port von backend/adapter/autodarts.py (Phase A des Client-
// Rewrites, siehe ~/.claude/plans/agile-brewing-wadler.md). Laeuft
// jetzt direkt im Browser gegen den STANDARD-Autodarts-Board-Manager
// (Port 3180) - keine eigenen Endpunkte erfinden, siehe CLAUDE.md
// "Verifizierte Autodarts-Anbindung". Reconnect alle 3s,
// Deduplizierung ueber throws[seen:], Takeout-Reset, Segment->Label -
// exakt wie im Python-Original.

export type BoardStatus = "connected" | "reconnecting" | "disconnected";

export type Segment = { number: number; multiplier: number };
export type RawThrow = { segment: Segment; coords?: { x: number; y: number } };

export function throwLabel(segment: Segment | undefined | null): string {
  const number = segment?.number ?? 0;
  const multi = segment?.multiplier ?? 0;
  if (!number || !multi) return "MISS";
  if (number === 25) return multi === 2 ? "BULL" : "S25";
  const prefix = ({ 1: "S", 2: "D", 3: "T" } as Record<number, string>)[multi] ?? "?";
  return `${prefix}${number}`;
}

type Callbacks = {
  onStatusChange?: (status: BoardStatus) => void;
  onThrow?: (label: string, raw: RawThrow) => void;
  onTakeout?: () => void;
};

const RECONNECT_DELAY_MS = 3000;
const UNREACHABLE_LOG_THROTTLE_MS = 60000;

export class AutodartsAdapter {
  private boardHost: string;
  private boardPort: number;
  private callbacks: Callbacks;
  private status: BoardStatus = "disconnected";
  private seenThrows = 0;
  private ws: WebSocket | null = null;
  private stopped = true;
  private lastUnreachableLog: number | null = null;

  constructor(boardHost: string, boardPort = 3180, callbacks: Callbacks = {}) {
    this.boardHost = boardHost;
    this.boardPort = boardPort;
    this.callbacks = callbacks;
  }

  getStatus(): BoardStatus {
    return this.status;
  }

  calibrationUrl(): string {
    return `http://${this.boardHost}:${this.boardPort}`;
  }

  // Live-Probe auf /api/ping statt Raten anhand des Hostnamens - siehe
  // CLAUDE.md "Verifizierte Board-Manager-REST-API".
  async hasControlApi(): Promise<boolean> {
    try {
      const res = await fetch(`http://${this.boardHost}:${this.boardPort}/api/ping`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    await this.control("PUT", "/api/start");
  }

  async stop(): Promise<void> {
    await this.control("PUT", "/api/stop");
  }

  async reset(): Promise<void> {
    await this.control("POST", "/api/reset");
  }

  private async control(method: string, path: string): Promise<void> {
    const res = await fetch(`http://${this.boardHost}:${this.boardPort}${path}`, {
      method,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Board-Steuerung fehlgeschlagen: ${res.status}`);
  }

  private setStatus(status: BoardStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }

  // Startet den endlosen Reconnect-Loop - Gegenstueck zu run() in
  // Python (dort eine async while-True-Schleife, hier ereignisbasiert
  // ueber WebSocket-Callbacks + setTimeout).
  run(): void {
    this.stopped = false;
    this.connect();
  }

  stopRunning(): void {
    this.stopped = true;
    this.ws?.close();
    this.ws = null;
  }

  private connect(): void {
    if (this.stopped) return;
    this.setStatus("reconnecting");
    const url = `ws://${this.boardHost}:${this.boardPort}/api/events`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      // Mixed-Content-Block (https-Seite ohne erlaubte unsichere
      // Inhalte) wirft SYNCHRON beim Konstruieren, nicht erst beim
      // Verbindungsversuch.
      this.logUnreachableThrottled();
      this.setStatus("disconnected");
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    this.seenThrows = 0;
    ws.onopen = () => this.setStatus("connected");
    ws.onmessage = (event) => this.handleMessage(event.data);
    ws.onclose = () => {
      if (this.stopped) return;
      this.setStatus("disconnected");
      this.logUnreachableThrottled();
      this.scheduleReconnect();
    };
    // onerror wird immer von onclose gefolgt (WebSocket-Spezifikation) -
    // der Reconnect passiert dort, hier ist nichts weiter zu tun.
    ws.onerror = () => {};
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
  }

  private logUnreachableThrottled(): void {
    const now = Date.now();
    if (this.lastUnreachableLog === null || now - this.lastUnreachableLog >= UNREACHABLE_LOG_THROTTLE_MS) {
      console.info("Board Manager nicht erreichbar - neuer Versuch alle 3s");
      this.lastUnreachableLog = now;
    }
  }

  private handleMessage(message: string): void {
    let data: { type?: string; data?: { event?: string; throws?: RawThrow[] } };
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }
    if (data?.type !== "state") return;
    const d = data.data ?? {};
    const eventName = d.event;
    if (eventName === "Takeout finished") {
      this.seenThrows = 0;
      this.callbacks.onTakeout?.();
      return;
    }
    if (eventName === "Throw detected") {
      const throws = d.throws ?? [];
      for (const t of throws.slice(this.seenThrows)) {
        this.callbacks.onThrow?.(throwLabel(t.segment), t);
      }
      this.seenThrows = throws.length;
    }
  }
}
