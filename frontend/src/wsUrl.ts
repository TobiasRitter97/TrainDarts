// Liefert die URL fuer den Live-WebSocket des Backends.
//
// Im Produktionsbetrieb liefert dasselbe Backend auch das Frontend aus
// (siehe backend/app.py), daher reicht der aktuelle Origin.
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
  if (import.meta.env.DEV) {
    return `ws://${location.hostname}:8088/ws`;
  }
  return `ws://${location.host}/ws`;
}
