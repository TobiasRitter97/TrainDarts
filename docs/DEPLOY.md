# Deployment

## Backend (Raspberry Pi)

Läuft als systemd-Dienst `darts-platform` auf dem Pi (192.168.188.97),
neben dem bestehenden `autodarts.service` (Board Manager, Port 3180).

- Port: 8088
- `DARTS_BOARD_HOST=localhost` (Board Manager läuft auf demselben Pi)
- Status: `ssh darts-pi "systemctl status darts-platform"`
- Logs: `ssh darts-pi "journalctl -u darts-platform -f"`
- Neustart bei Absturz: automatisch (`Restart=on-failure`)
- Neustart bei Pi-Boot: automatisch (`enable`d)

## Frontend (Vercel)

Static Build von `frontend/`, ausgeliefert unter
`https://traindart.vercel.app`. Root Directory ist in den
Vercel-Projekteinstellungen auf `frontend` gesetzt (NICHT in
`vercel.json` — das `rootDirectory`-Feld dort wird von Vercels
Deploy-Schema abgelehnt).

Git-Integration: Vercel-Projekt `darts10/traindart` ist mit
`github.com/TobiasRitter97/TrainDarts` (Branch `main`) verbunden —
jeder Push auf `main` löst automatisch ein Production-Deployment aus.

Der Browser spricht direkt (nicht über Vercel) mit dem Backend auf dem
Pi im Heimnetz — die Pi-IP wird einmalig über den
„⚙ EINSTELLUNGEN"-Dialog abgefragt und in `localStorage` gemerkt
(`frontend/src/piConnection.ts`).
