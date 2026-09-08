import { useState, FormEvent } from "react";
import { normalizeHost, setStoredPiIp, testConnection } from "../piConnection";
import "./ConnectScreen.css";

type Props = {
  onConnected: () => void;
};

// Vercel-Deployment: das Frontend liegt statisch auf Vercel, hat aber
// keinen Zugriff auf den Pi im Heimnetz, ohne dass der Browser selbst
// die Pi-IP kennt. Wird einmalig abgefragt und in localStorage gemerkt
// (siehe frontend/src/piConnection.ts).
export function ConnectScreen({ onConnected }: Props) {
  const [ip, setIp] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const host = normalizeHost(ip);
    if (!host) return;
    setTesting(true);
    setError(null);
    const ok = await testConnection(host);
    setTesting(false);
    if (ok) {
      setStoredPiIp(host);
      onConnected();
    } else {
      setError("Pi nicht erreichbar — läuft das Backend auf deinem Pi?");
    }
  }

  return (
    <div className="connect-screen">
      <div className="connect-card panel">
        <h1 className="screen-title">DARTS TRAINING PLATFORM</h1>
        <p className="screen-note">
          Gib die IP-Adresse deines Raspberry Pi im Heimnetz ein (z.B. 192.168.188.97) — ohne „http://" und ohne Port,
          das ergänzt die App automatisch.
        </p>
        <form className="connect-form" onSubmit={handleSubmit}>
          <input
            autoFocus
            placeholder="192.168.188.97"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            inputMode="decimal"
          />
          <button className="btn-primary" type="submit" disabled={testing || !ip.trim()}>
            {testing ? "Verbinde…" : "Verbinden"}
          </button>
        </form>
        {error && <p className="screen-error">{error}</p>}
      </div>
    </div>
  );
}
