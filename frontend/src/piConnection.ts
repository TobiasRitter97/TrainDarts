// Verbindung zum Pi im Heimnetz (Vercel-Deployment): das Frontend wird
// statisch von Vercel ausgeliefert, spricht aber direkt vom Browser aus
// mit dem Backend auf dem Pi (gleiches Heimnetz, kein Umweg ueber
// Vercel selbst - siehe CLAUDE.md "Browser spricht NUR mit unserem
// Backend"). Die IP wird einmalig abgefragt (siehe ConnectScreen) und
// in localStorage gemerkt.
//
// Im lokalen Dev-Betrieb (Vite) und wenn das Backend das Frontend
// selbst ausliefert (direkter Aufruf von z.B. http://<pi-ip>:8088/),
// wird KEINE gespeicherte IP benoetigt - dann reicht der gleiche
// Origin bzw. Vite's Dev-Modus (siehe api.ts/wsUrl.ts).
const STORAGE_KEY = "darts-pi-ip";
const BACKEND_PORT = 8088;

export function getStoredPiIp(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredPiIp(host: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, host);
  } catch {
    // localStorage kann z.B. im privaten Fenster fehlschlagen - dann
    // muss die IP bei jedem Laden neu eingegeben werden, das Deployment
    // funktioniert aber trotzdem innerhalb der Sitzung.
  }
}

// Nimmt eine Nutzereingabe wie "192.168.188.97", "http://192.168.188.97"
// oder "192.168.188.97:8088" entgegen und liefert nur den nackten Host
// zurueck - http:// und Port ergaenzt die App selbst.
export function normalizeHost(input: string): string {
  let value = input.trim();
  value = value.replace(/^https?:\/\//i, "");
  value = value.split("/")[0];
  value = value.split(":")[0];
  return value;
}

export function apiBaseFor(host: string): string {
  return `http://${host}:${BACKEND_PORT}/api`;
}

export function wsUrlFor(host: string): string {
  return `ws://${host}:${BACKEND_PORT}/ws`;
}

export async function testConnection(host: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseFor(host)}/board/info`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
