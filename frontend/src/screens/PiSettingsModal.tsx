import { useState, FormEvent } from "react";
import { getStoredPiIp, normalizeHost, setStoredPiIp, testConnection } from "../piConnection";
import "./PiSettingsModal.css";

type Props = {
  onClose: () => void;
};

// Einstellungen fuer die Pi-Verbindung (Vercel-Deployment: das
// Frontend liegt statisch auf Vercel, der Browser spricht direkt mit
// dem Backend auf dem Pi im Heimnetz - siehe piConnection.ts).
//
// Bewusst ein SCHLIESSBARES Overlay, keine erzwingende Vollbild-Sperre
// (Tobias-Feedback 08.09.2026: die App soll immer erreichbar bleiben,
// die IP soll ueber die Einstellungen aenderbar sein, nicht als
// Voraussetzung fuer den Zugang zur Seite).
export function PiSettingsModal({ onClose }: Props) {
  const [ip, setIp] = useState(getStoredPiIp() ?? "");
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const host = normalizeHost(ip);
    if (!host) return;
    setTesting(true);
    setStatus("idle");
    const ok = await testConnection(host);
    setTesting(false);
    if (ok) {
      setStoredPiIp(host);
      setStatus("ok");
    } else {
      setStatus("error");
    }
  }

  return (
    <div className="resume-overlay">
      <div className="resume-modal connect-modal">
        <h3>Pi-Verbindung</h3>
        <p className="screen-note">
          IP-Adresse deines Raspberry Pi im Heimnetz (z.B. 192.168.188.97) — ohne „http://" und ohne Port, das
          ergänzt die App automatisch.
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
            {testing ? "Teste…" : "Verbinden & Speichern"}
          </button>
        </form>
        {status === "error" && (
          <p className="screen-error">Pi nicht erreichbar — läuft das Backend auf deinem Pi?</p>
        )}
        {status === "ok" && (
          <p className="screen-note connect-ok">Verbunden! „Neu laden" klicken, damit die App die neue IP überall verwendet.</p>
        )}
        <div className="resume-actions">
          <button className="btn-secondary" onClick={onClose}>
            Schließen
          </button>
          {status === "ok" && (
            <button className="btn-primary" onClick={() => location.reload()}>
              Neu laden
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
