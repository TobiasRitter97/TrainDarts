# Phase 1 — Analyse des Bestandsprojekts (abgeschlossen)

Stand: 02.09.2026. Analysiert wurde der funktionierende Prototyp
`darts_web.py` (liegt als Referenz in `docs/reference/`).

## 1. Architektur des Prototyps

Ein Python-Script, drei Rollen in einem Prozess:
(a) WebSocket-Client zum Autodarts Board Manager,
(b) hartkodierte Spiellogik "Around the Doubles" (D1→D20→Bull),
(c) aiohttp-Webserver mit eingebetteter HTML/JS-Seite (Port 8088),
Live-Sync an alle Browser per WebSocket.
State nur im RAM, keine Persistenz, ein impliziter Spieler.

## 2. Verifizierte, wiederzuverwendende Teile

- Board-Manager-Anbindung inkl. Event-Format, Deduplizierung und
  Takeout-Behandlung (Details in CLAUDE.md, Abschnitt "Verifizierte
  Autodarts-Anbindung") — am echten Board getestet.
- Reconnect-Schleife (3s-Retry) — robust gegen Board-Neustarts.
- Wurf-Normalisierung number/multiplier → Label (S/D/T, BULL, MISS).
- Grundprinzip der Web-UI: Server pusht State, Buttons senden Kommandos.

## 3. Festgestellte Probleme (Gründe für den Neubau)

1. Spiellogik, Adapter und UI in einer Datei — nicht erweiterbar auf
   10 Spiele.
2. Kein Spieler-/Profil-Konzept, kein Multiplayer.
3. Undo entfernt nur den letzten Wurf; kann Spielerwechsel, Runden- und
   Zielwechsel nicht zurückdrehen.
4. Korrektur = nur "verwerfen"; kein Umschreiben eines Wurfs (T5→T15),
   keine manuelle Segmentwahl.
5. Keine Persistenz → keine Profile, Highscores, Statistiken.
6. UI als Python-String → kein Routing, keine Komponenten, kein
   Design-System.
7. seen_throws (Deduplizierung) lebt außerhalb der Spiellogik.

## 4. Beschlossene Zielarchitektur

Server-autoritatives Backend (Python/aiohttp) mit:
- AutodartsAdapter (nur Normalisierung, keine Spielregeln)
- GameEngine mit Event-Sourcing: Event-Log als einzige Wahrheit,
  GameState = Replay des Logs. Korrektur/Undo = Event anhängen bzw.
  entfernen + Replay. Dadurch ist jede Änderung rückwirkend korrekt
  (Spielerwechsel, Targets, Statistiken) und per Konstruktion undo-fähig.
- GameDefinitions als Konfiguration von Engine-Familien:
  x01 (→170), target_progression (→Bob's 27, Bob's 27 Easy, Around the
  World), checkout_range (→Catch 40, Catch 40 Easy, 121, 60+/-),
  random_checkout, jdc.
- Turn-Logik generisch: Engine fragt Definition isTurnComplete();
  3 Darts sind nur der Default. Gemeinsame Zufallssequenzen erzeugt die
  Engine pro Runde (Fairness, SPEC §8).
- SQLite: profiles, matches, events/throws, highscores
  (mit configHash zur Trennung unterschiedlicher Settings, SPEC §34).
- REST (Profile, Setup, Historie) + ein Live-WebSocket (GameState).

Frontend: Vite + React + TypeScript als SPA, statisch vom Pi
ausgeliefert; spricht nur mit dem Backend.

## 5. Ordnerstruktur (Soll)

    backend/
      app.py
      adapter/autodarts.py
      engine/{engine.py,events.py,turns.py}
      games/{base.py,x01.py,target_progression.py,checkout_range.py,
             random_checkout.py,jdc.py}
      persistence/{db.py,models.py}
      config/games.py
    frontend/src/{app,design,components,screens}
    deploy/darts.service

## 6. Wichtige Einschränkung

Die lokale Board-Manager-Schnittstelle ist nur lesend verifiziert.
SPEC §14 Punkt 1 ("Änderung an Autodarts übertragen") wird als optionales
Adapter-Feature vorgesehen, aber erst gebaut, wenn ein echter
Schreib-Endpunkt verifiziert ist. Bis dahin ist unser Game State die
einzige Wahrheit für die Trainingsspiele.

## Nächster Schritt

Phase 2 gemäß SPEC §42: Zielarchitektur im Detail (konkrete Module,
Datenmodelle, WS-Protokoll zwischen Backend und Frontend), danach
Phase 3 Design-System.
