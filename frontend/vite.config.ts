import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend laeuft separat auf Port 8088 (siehe backend/app.py).
// Der Dev-Server leitet /api und /ws dorthin weiter, damit das
// Frontend im Browser nur mit einem Origin spricht.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8088",
      "/ws": { target: "ws://localhost:8088", ws: true },
    },
  },
});
