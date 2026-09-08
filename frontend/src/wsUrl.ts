import { getStoredPiIp, wsUrlFor } from "./piConnection";

// Liefert die URL fuer den Live-WebSocket des Backends.
//
// Vercel-Deployment: es gibt kein Backend am selben Origin (Vercel
// liefert nur die statischen Dateien) - dort wird die einmalig
// eingegebene Pi-IP verwendet (siehe ConnectScreen/piConnection.ts).
//
// Im Produktionsbetrieb AUF DEM PI liefert dasselbe Backend auch das
// Frontend aus (siehe backend/app.py), daher reicht dort der aktuelle
// Origin, falls keine IP gespeichert ist.
//
// Im Dev-Betrieb laeuft das Frontend auf Vite (Port 5173), das Backend
// separat auf Port 8088. Der naheliegende Weg waere, den WS ueber
// Vite's Dev-Proxy zu leiten - das war aber instabil: Vite's
// WebSocket-Proxy (besonders bei mehreren gleichzeitigen, lang
// laufenden Verbindungen wie hier Board-Status + Live-Wuerfe) bricht
// wiederholt mit "write EPIPE" ab, was dann unsere eigene
// Reconnect-Logik im Sekundentakt erneut ausloest. Deshalb verbindet
// sich das Frontend im Dev-Betrieb direkt mit dem Backend-Port, ohne
// ueber den Vite-Proxy zu gehen - keine bekannte Instabilitaet mehr.
export function getWsUrl(): string {
  const storedIp = getStoredPiIp();
  if (storedIp) {
    return wsUrlFor(storedIp);
  }
  if (import.meta.env.DEV) {
    return `ws://${location.hostname}:8088/ws`;
  }
  return `ws://${location.host}/ws`;
}
