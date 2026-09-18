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
Die Firestore-Regeln stehen seit dem 18.09.2026 als eigene Datei im
Repo: `firestore.rules`. Sie werden NICHT automatisch ausgerollt -
Inhalt kopieren und in der Firebase Console unter
"Firestore Database -> Rules" veroeffentlichen.

WICHTIG zur Reihenfolge: die Regeln verlangen seit dem
Sicherheits-Update eine BESTAETIGTE E-Mail-Adresse. Erst das Frontend
ausrollen und das eigene Konto ueber den Link in der Mail bestaetigen,
DANN die Regeln veroeffentlichen - sonst sperrt man sich selbst aus.
```

Zusaetzlich Realtime Database (Region `europe-west1`, explizite
databaseURL in `firebase.ts` noetig - sonst versucht das SDK die
falsche Standard-Region zu erraten und Schreibzugriffe haengen) fuer
den ephemeren Online-Multiplayer-Raumzustand (Phase F, `frontend/src/
online/`):

```json
Die Regeln der Realtime Database stehen seit dem 18.09.2026 als eigene
Datei im Repo: `database.rules.json`. Sie werden NICHT automatisch
ausgerollt - Inhalt kopieren und in der Firebase Console unter
"Realtime Database -> Rules" veroeffentlichen.

### Was die Regeln tun

Vorher galt fuer `rooms/$pin` nur `auth != null`, fuer Lesen UND
Schreiben. Jeder angemeldete Nutzer konnte damit jeden Raum lesen,
aendern und loeschen, sobald er eine der 90.000 moeglichen PINs erraten
hatte - inklusive komplettem Event-Log. Die Bestaetigung der
E-Mail-Adresse galt hier ausserdem nicht, anders als in Firestore.

Jetzt gilt:

- **Ueberall** ist eine bestaetigte E-Mail-Adresse noetig
  (`auth.token.email_verified == true`), wie in `firestore.rules`.
- **Vollzugriff** auf einen Raum (Event-Log, Einstellungen, matchId,
  hostUid) haben nur seine Teilnehmer.
- **Schreiben** ist nur in drei Faellen erlaubt: einen noch nicht
  vorhandenen Raum anlegen (man muss selbst der Host sein), als
  bestehender Teilnehmer, oder beim Beitritt zu einem Raum mit Status
  `waiting` (danach muss man selbst in der Spielerliste stehen).
- **Offen fuer alle angemeldeten, bestaetigten Nutzer** bleiben genau
  zwei Kinder: `status` (gibt es diese PIN, wartet der Raum?) und
  `players` (der Beitritt haengt sich an die bestehende Liste an).
  Ein Fremder sieht damit hoechstens, ob eine geratene PIN existiert
  und wie die 1-4 Anwesenden heissen - nicht den Spielverlauf.

### Zur Teilnehmerpruefung

RTDB-Regeln koennen nicht ueber Kinder iterieren; es gibt kein
"enthaelt". `players` ist ein Array und liegt in der Datenbank als
Objekt mit den Schluesseln 0..3. Da `MAX_PLAYERS = 4` ist (siehe
`frontend/src/online/roomDb.ts`), zaehlen die Regeln die vier
moeglichen Plaetze einzeln auf. Die Datenform bleibt dadurch
unveraendert.

### Warum in der Datei keine Kommentare stehen

Die RTDB lehnt `"//"`-Schluessel ab - und zwar auf JEDER Ebene, nicht
nur auf der obersten. Erlaubt sind ausschliesslich `.read`, `.write`,
`.validate` und `.indexOn`; jeder andere Schluessel gilt als Kindpfad
und muss ein Objekt enthalten, keinen String. Deshalb steht die
Erklaerung hier und nicht in der Regeldatei.

### Reihenfolge beim Ausrollen

1. Eigenes Konto ueber den Link in der Bestaetigungsmail bestaetigen.
2. Den angepassten Client ausrollen (`roomDb.ts` liest beim Anlegen und
   Beitreten nur noch `status` bzw. `players` statt des ganzen Raums).
3. Erst dann die Regeln veroeffentlichen.

Der angepasste Client funktioniert auch unter den ALTEN Regeln, Schritt
2 laesst sich also gefahrlos vorziehen und testen.
```

Bewusst ohne `runTransaction()`: in Tests zeigte sich, dass
`runTransaction()` in dieser Umgebung (Firebase JS SDK 12.x) auf einem
vom aktuellen Client noch nie gelesenen Pfad zuverlaessig einen
falschen "existiert nicht"-Zwischenstand liefert. Alle Schreibzugriffe
in `roomDb.ts` verwenden deshalb "erst lesen (get), dann schreiben
(update)" statt einer echten Transaktion - fuer ein freundschaftliches
2-4-Spieler-Onlinespiel ein akzeptables Risiko.
