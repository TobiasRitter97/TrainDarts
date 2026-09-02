import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend laeuft separat auf Port 8088 (siehe backend/app.py).
// Der Dev-Server leitet /api dorthin weiter. Der Live-WebSocket (/ws)
// wird bewusst NICHT ueber den Vite-Proxy geleitet - das war instabil
// (wiederholte "write EPIPE"-Fehler, siehe frontend/src/wsUrl.ts).
// Das Frontend verbindet sich im Dev-Betrieb stattdessen direkt mit
// dem Backend-Port fuer den WebSocket.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8088",
    },
  },
});
