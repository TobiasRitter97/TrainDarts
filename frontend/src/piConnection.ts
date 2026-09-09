// Board-IP im Heimnetz (Vercel-Deployment): das Frontend wird statisch
// von Vercel ausgeliefert, der Browser spricht aber direkt mit dem
// Autodarts-Board-Manager im selben Heimnetz (Phase A des Client-
// Rewrites, ~/.claude/plans/agile-brewing-wadler.md - kein eigenes
// Backend mehr, siehe board/autodartsAdapter.ts). Die IP wird einmalig
// abgefragt (siehe PiSettingsModal) und in localStorage gemerkt.
const STORAGE_KEY = "darts-pi-ip";
const BOARD_PORT = 3180;

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
// oder "192.168.188.97:3180" entgegen und liefert nur den nackten Host
// zurueck - http:// und Port ergaenzt die App selbst.
export function normalizeHost(input: string): string {
  let value = input.trim();
  value = value.replace(/^https?:\/\//i, "");
  value = value.split("/")[0];
  value = value.split(":")[0];
  return value;
}

// Verifiziert die Board-Manager-REST-API direkt (siehe CLAUDE.md
// "Verifizierte Board-Manager-REST-API") - testet damit genau das,
// was die App tatsaechlich braucht (direkte Board-Verbindung), nicht
// mehr den Umweg ueber ein eigenes Backend.
export async function testConnection(host: string): Promise<boolean> {
  try {
    const res = await fetch(`http://${host}:${BOARD_PORT}/api/ping`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
