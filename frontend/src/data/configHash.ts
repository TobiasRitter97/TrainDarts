// 1:1-Port von backend/persistence/stats.py:compute_config_hash
// (Phase E des Client-Rewrites). Hash ueber Spiel-ID + volle Settings -
// bewusst ALLE Settings, nicht nur "relevante" (sonst wuerden z.B.
// Random Checkout 40-80/6 Darts und 80-130/3 Darts stillschweigend
// zusammengelegt). Muss mit den alten Python-Hashes NICHT
// uebereinstimmen (Tobias' bisherige Testdaten werden bewusst nicht
// migriert) - nur intern konsistent innerhalb der neuen Firestore-Daten.
export async function computeConfigHash(gameId: string, settings: Record<string, unknown>): Promise<string> {
  const canonical = JSON.stringify({ gameId, settings: sortKeys(settings) });
  const bytes = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 12);
}

function sortKeys(value: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) sorted[key] = value[key];
  return sorted;
}
