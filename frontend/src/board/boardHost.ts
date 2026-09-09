import { getStoredPiIp } from "../piConnection";

// Kein eigenes Backend mehr fuer die Board-Verbindung (Client-Rewrite,
// ~/.claude/plans/agile-brewing-wadler.md) - Standard "localhost" passt
// zum lokalen Wurf-Simulator (Dev-Betrieb) und zum Python-Adapter-
// Original. Im Vercel-Betrieb ist immer eine gespeicherte Pi-IP
// vorhanden, da die App ohne sie ohnehin nirgends echte Daten zeigt.
export function getBoardHost(): string {
  return getStoredPiIp() ?? "localhost";
}
