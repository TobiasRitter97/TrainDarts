# Deployment

## Architektur (seit dem Client-Rewrite, ~/.claude/plans/agile-brewing-wadler.md)

Die komplette Spiellogik läuft seit Phase C/D im Browser
(`frontend/src/engine/`) — kein eigenes Backend mehr nötig für das
eigentliche Spielen. Der Browser verbindet sich direkt mit dem
Standard-Autodarts-Board-Manager (Port 3180, `frontend/src/board/`).
Profile, Match-Historie, Statistiken und Bestenlisten liegen seit
Phase E in Firebase/Firestore (`frontend/src/data/`) statt in der
SQLite-Datenbank des alten Backends.

Jede Browser-Installation bekommt automatisch eine anonyme
Firebase-Identität (kein Login-Formular) — analog zur früheren
Isolation "jeder Pi hat nur seine eigenen Daten". Bekannte
Einschränkung: die Identität ist an den jeweiligen Browser/das jeweilige
Gerät gebunden, ein Wechsel startet mit leeren Profilen.

## Altes Backend (Raspberry Pi) — noch nicht abgeschaltet

Läuft weiterhin als systemd-Dienst `darts-platform` auf dem Pi
(192.168.188.97), neben `autodarts.service` (Board Manager, Port
3180) — wird vom Frontend inzwischen aber nicht mehr angesprochen.
Bleibt bis Phase G bewusst unangetastet (kann jederzeit gefahrlos
gestoppt werden, sobald Tobias das möchte).

- Port: 8088
- Status: `ssh darts-pi "systemctl status darts-platform"`
- Logs: `ssh darts-pi "journalctl -u darts-platform -f"`
- Stilllegen (Phase G): `ssh darts-pi "sudo systemctl disable --now darts-platform"`

## Frontend (Vercel)

Static Build von `frontend/`, ausgeliefert unter
`https://traindart.vercel.app`. Root Directory ist in den
Vercel-Projekteinstellungen auf `frontend` gesetzt (NICHT in
`vercel.json` — das `rootDirectory`-Feld dort wird von Vercels
Deploy-Schema abgelehnt).

Git-Integration: Vercel-Projekt `darts10/traindart` ist mit
`github.com/TobiasRitter97/TrainDarts` (Branch `main`) verbunden —
jeder Push auf `main` löst automatisch ein Production-Deployment aus.

Der Browser spricht direkt (nicht über Vercel) mit dem Board-Manager
auf dem Pi im Heimnetz — die Pi-IP wird einmalig über den
„⚙ EINSTELLUNGEN"-Dialog abgefragt und in `localStorage` gemerkt
(`frontend/src/piConnection.ts`).

## Firebase

Projekt `traindarts` (console.firebase.google.com), Firestore +
Anonyme Anmeldung aktiviert. Konfiguration liegt (bewusst öffentlich,
Firebase-Web-API-Keys sind kein Geheimnis) in
`frontend/src/data/firebase.ts`. Sicherheitsregeln beschränken jeden
Zugriff auf den eigenen `users/{uid}`-Pfad:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Zusaetzlich Realtime Database (Region `europe-west1`, explizite
databaseURL in `firebase.ts` noetig - sonst versucht das SDK die
falsche Standard-Region zu erraten und Schreibzugriffe haengen) fuer
den ephemeren Online-Multiplayer-Raumzustand (Phase F, `frontend/src/
online/`):

```json
{
  "rules": {
    "rooms": {
      "$pin": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

Bewusst ohne `runTransaction()`: in Tests zeigte sich, dass
`runTransaction()` in dieser Umgebung (Firebase JS SDK 12.x) auf einem
vom aktuellen Client noch nie gelesenen Pfad zuverlaessig einen
falschen "existiert nicht"-Zwischenstand liefert. Alle Schreibzugriffe
in `roomDb.ts` verwenden deshalb "erst lesen (get), dann schreiben
(update)" statt einer echten Transaktion - fuer ein freundschaftliches
2-4-Spieler-Onlinespiel ein akzeptables Risiko.
