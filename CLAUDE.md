# Darts Training Platform — Projektanweisungen

## Was hier gebaut wird

Eine Custom Autodarts Training Platform: 10 Trainingsspiele, 1–4 Spieler,
Spielerprofile, Highscores, Statistiken, einheitlicher Game Screen mit
Dart-Korrektur. Die vollständige Anforderungsspezifikation liegt in
`docs/SPEC.md` — sie ist die Wahrheit für alle Produktfragen.
Die Analyse des Vorgängerprojekts und die beschlossene Zielarchitektur
liegen in `docs/ANALYSE.md`.

## Über den Auftraggeber (wichtig für die Zusammenarbeit)

Tobias ist Produktverantwortlicher, kein Programmierer. Konsequenzen:

- Erkläre bei jedem Arbeitsschritt in 2-3 Sätzen auf Deutsch, WAS du tust
  und WARUM — kein Fachjargon ohne Erklärung.
- Gib nach jeder abgeschlossenen Aufgabe eine klare Anleitung, wie er das
  Ergebnis selbst testen kann (welcher Befehl, welche URL, was er sehen
  sollte).
- Triff technische Detailentscheidungen selbstständig, aber lege ihm
  Produktentscheidungen (Verhalten, Optik, Reihenfolge) zur Wahl vor.
- Committe nach jedem funktionierenden Zwischenstand mit verständlicher
  deutscher Commit-Message.

## Zielumgebung

- Entwicklung: dieser Mac
- Produktion: Raspberry Pi 5 (gleicher Pi, auf dem der Autodarts Board
  Manager läuft), erreichbar im Heimnetz unter 192.168.188.97
- Anzeige: Tablet/TV im Browser, Touch-Bedienung, aus mehreren Metern
  lesbar (Design-Vorgaben in SPEC.md §11, §39, §40)

## Verifizierte Autodarts-Anbindung (NICHT erfinden, NICHT ändern)

Diese Fakten wurden am echten Board gemessen und sind verbindlich:

- Endpunkt: `ws://<board-host>:3180/api/events` (lokaler Board Manager,
  kein Auth, keine Cloud)
- Wurf-Event: JSON mit `type: "state"`, darin `data.event: "Throw
  detected"`; `data.throws[]` enthält die KOMPLETTE aktuelle Aufnahme.
  Jeder Wurf: `segment.number` (1-20, 25), `segment.multiplier` (1/2/3),
  `segment.bed`, `segment.name` (z.B. "S19"), `coords.x/y`.
  Verpasste Erkennung / Miss: number oder multiplier = 0.
  Bullseye: number 25, multiplier 2. Single Bull: number 25, multiplier 1.
- Deduplizierung nötig: nur `throws[seen:]` verarbeiten, da jedes Event
  das volle Array wiederholt.
- Takeout: `data.event: "Takeout started"` / `"Takeout finished"`;
  letzteres setzt die Aufnahme zurück (seen = 0).
- Rauschen ignorieren: Events mit type `motion_state`, `cam_stats`,
  `stats`.
- Die Schnittstelle ist inoffiziell und NUR LESEND verifiziert. Es werden
  keine Schreib-Endpunkte erfunden. Korrekturen wirken ausschließlich auf
  unseren eigenen Game State.
- Funktionierender Referenzcode: `docs/reference/darts_web.py`
  (der Prototyp — Doppel-Training mit Web-UI, läuft auf dem Pi).

### Verifizierte Board-Manager-REST-API (Start/Stop/Reset)

Zusätzlich zur WebSocket-Schnittstelle bietet der Board Manager eine
REST-API unter `http://<board-host>:3180/api/...`. Verifiziert am
02.09.2026 gegen den echten, produktiv laufenden Board Manager unter
`192.168.188.97:3180` — nicht durch Raten der Pfade, sondern durch
Analyse des offiziellen Board-Manager-Web-UI-Bundles
(`http://<board-host>:3180/assets/index-*.js`), das exakt diese Pfade
selbst verwendet:

- `GET /api/ping` → Text `"pong"`, HTTP 200 (Health-Check)
- `GET /api/state` → JSON `{connected, running, status, event,
  numThrows, throws[]}` (aktueller Board-Zustand, read-only)
- `PUT /api/start` → HTTP 200, leerer Body. Setzt `running: true`,
  `status: "Throw"`, `event: "Started"`.
- `PUT /api/stop` → HTTP 200, leerer Body. Setzt `running: false`,
  `status: "Stopped"`, `event: "Stopped"`, `numThrows: 0`.
- `POST /api/reset` → HTTP 200, leerer Body. `event: "Manual reset"`,
  `numThrows: 0` (setzt die aktuelle Aufnahme zurück).

Alle vier Aufrufe wurden einzeln gegen das echte Board getestet und
funktionieren wie oben beschrieben; der Board-Zustand wurde danach in
den ursprünglich vorgefundenen Zustand (`Stopped`) zurückversetzt.

Kalibrierung (`/config/calibration*`, `/cams/calibrate/*`) wurde im
UI-Bundle ebenfalls gefunden, aber NICHT nachgebaut — dafür öffnet die
Anwendung stattdessen die echte Board-Manager-Oberfläche
(`http://<board-host>:3180`) in einem neuen Tab.

`POST /api/restart` existiert laut Bundle ebenfalls, wurde aber nicht
getestet (nicht angefragt, vermutlich einschneidender als Start/Stop/
Reset) und wird bis auf Weiteres nicht verwendet.

## Beschlossene Architektur (Details in docs/ANALYSE.md)

- Backend Python 3 / aiohttp auf dem Pi: AutodartsAdapter, GameEngine,
  GameDefinitions (Spiele als Konfiguration von Engine-Familien),
  SQLite-Persistenz, REST + ein Live-WebSocket an alle Clients.
- Game State per Event-Sourcing: chronologischer Event-Log, State ist
  immer Replay des Logs. Korrektur = Correction-Event anhängen + Replay.
  Undo = letztes Event entfernen + Replay. Keine direkte State-Mutation.
- Frontend: Vite + React + TypeScript, statisch vom Pi ausgeliefert.
  Browser spricht NUR mit unserem Backend, nie mit dem Board Manager.
- Fairness-Regel (SPEC §8): gemeinsame Zufallssequenzen werden von der
  Engine pro Runde erzeugt, nicht pro Spieler.

## Arbeitsweise

- Streng nach den Phasen in SPEC.md §42 vorgehen (Phase 1 ist erledigt,
  siehe ANALYSE.md). Immer nur eine Phase, dann Test durch Tobias.
- Phase 9 zuerst mit den drei Referenzspielen (170, Bob's 27, Random
  Checkout), erst danach weitere Spiele.
- Ähnliche Spiele teilen sich eine Engine-Familie und unterscheiden sich
  nur in der Konfiguration (SPEC §30).
- Keine unnötigen Dependencies. Auf dem Pi muss alles mit
  `pip install ... --break-system-packages` installierbar sein.
- Für lokale Tests ohne Dartscheibe: einen kleinen Wurf-Simulator
  vorsehen (CLI oder Test-Endpunkt), der Board-Manager-Events einspeist.
