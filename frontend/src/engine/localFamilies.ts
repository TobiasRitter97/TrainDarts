// Welche Engine-Familien bereits auf die lokale Client-Engine
// portiert sind (Client-Rewrite, ~/.claude/plans/agile-brewing-wadler.md).
// Phase C: x01 ("170"). Phase D: alle restlichen 9 Spiele - damit
// laufen jetzt alle 10 Spiele client-seitig, kein Spiel mehr ueber
// das alte Python-Backend (siehe GameSetupScreen.tsx/App.tsx).
export const LOCAL_ENGINE_FAMILIES = new Set([
  "x01",
  "target_progression",
  "random_checkout",
  "checkout_range",
  "catch",
  "accuracy_progression",
  "jdc",
]);
