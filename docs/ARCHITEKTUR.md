# Phase 2 — Zielarchitektur

Stand: 02.09.2026.

Dieses Dokument beschreibt, wie die Custom Training Platform technisch
aufgebaut wird. Zu jedem Baustein steht zuerst in einfachen Worten,
was er tut und warum es ihn braucht. Darunter folgen die technischen
Details (Datenmodelle, Protokolle, Ordnerstruktur) — die sind eher
als Nachschlagewerk für die Umsetzung gedacht, nicht zum Auswendiglernen.

Es wird in dieser Phase noch kein Code geschrieben. Das Dokument ist
die Blaupause für die folgenden Phasen (Design, Profile, Game Hub,
Game Screen, Spiele).

---

## 1. Die Grundidee: ein "Gedächtnis" statt einem "Zustand"

**Einfach erklärt:** Anstatt sich nur den aktuellen Punktestand zu
merken, schreibt das System jeden einzelnen Wurf als Eintrag in ein
Protokoll (wie ein Kassenbon). Der aktuelle Spielstand wird nie direkt
verändert — er wird immer neu berechnet, indem das komplette Protokoll
von vorne durchgerechnet wird. Das klingt aufwendig, hat aber einen
großen Vorteil: Wenn du einen Wurf korrigierst oder zurücknimmst,
korrigiert sich dadurch automatisch alles, was danach passiert ist
(Spielerwechsel, Zielwechsel, Statistiken) — ohne dass wir für jeden
Einzelfall extra Korrekturcode schreiben müssen.

**Warum:** Der alte Prototyp konnte nur den allerletzten Wurf
zurücknehmen. Ein Spielerwechsel oder ein bereits gewechseltes Ziel
ließ sich nicht rückgängig machen. Das ist laut SPEC §16 aber
Pflicht — Undo muss auch "durchgeschlagene" Folgen zurückdrehen.

**Technisch:** Event Sourcing. Pro Match ein append-only Event-Log.
Event-Typen:

- `MATCH_STARTED` — Spieler, Reihenfolge, gameId, Settings, configHash,
  ggf. vorab generierte Zufallssequenz (siehe Abschnitt 3)
- `THROW` — playerId, Segment (number/multiplier/label), Quelle
  `auto`/`manual`, laufende Sequenznummer
- `CORRECT_THROW` — verweist auf die Sequenznummer eines Throws,
  enthält neues Segment. Wird angehängt, der ursprüngliche Throw bleibt
  im Log stehen, gilt bei Replay aber als ersetzt.
- `ROUND_RANDOM_GENERATED` — nur bei Endless-Spielen mit Zufallszielen
- `MATCH_FINISHED` — Ergebnis, Gewinner

`GameState = Replay(Event-Log)`. **Korrektur** = `CORRECT_THROW`
anhängen + Replay. **Undo** = letztes Event physisch entfernen +
Replay (egal ob es ein `THROW` oder `CORRECT_THROW` war).

---

## 2. Der Spielerwechsel — für alle 10 Spiele gleich

**Einfach erklärt:** Jedes Spiel funktioniert nach demselben Grundmuster:
Ein Spieler wirft (meist 3 Darts), dann ist automatisch der nächste
Spieler dran. Diese Regel sitzt an einer zentralen Stelle im System und
gilt für alle Spiele gleich — kein Spiel bekommt eine eigene
Extra-Logik dafür. Manche Spiele (z. B. Catch 40) brauchen für EINE
Aufgabe bis zu zwei Aufnahmen à 3 Darts mit Spielerwechsel dazwischen —
auch das behandelt das System einheitlich, ohne die Grundregel zu
brechen.

**Warum:** SPEC §1 fordert ausdrücklich, dass alle Spiele dieselbe
Spielerlogik nutzen. Nur Regeln, Ziel und Scoring dürfen sich
unterscheiden.

**Technisch:** Zwei getrennte Ebenen von "fertig":

- **Visit (Aufnahme)** — der klassische 3-Darts-Zug. Generisch:
  `isVisitComplete()`, Default 3 Darts. Nach jedem Visit-Ende: nächster
  Spieler. Sitzt in der Multiplayer Engine.
- **Task/Target (Aufgabe)** — spielspezifisch, kann mehrere Visits
  umfassen (Catch 40: 2 Visits = 6 Darts auf denselben Checkout, mit
  Spielerwechsel dazwischen). Wird in der `GameDefinition` verwaltet,
  nicht in der Multiplayer Engine.

Die Multiplayer Engine ist zusätzlich zuständig für: Spielerreihenfolge
(änderbar vor Spielstart), aktiven Spieler, Rundenerkennung (alle
aktiven Spieler einmal dran).

---

## 3. Fairness bei Zufallszahlen

**Einfach erklärt:** Bei Spielen wie Random Checkout muss jede Runde
für alle Spieler dieselbe Zufallszahl gelten, damit die Ergebnisse
vergleichbar bleiben. Diese Zahl wird deshalb nicht von jedem Spieler
einzeln "gewürfelt", sondern zentral einmal pro Runde erzeugt und dann
an alle Spieler verteilt.

**Warum:** SPEC §8 — sonst wäre ein Vergleich zwischen Spielern unfair
(einer bekommt zufällig leichtere Ziele als der andere).

**Technisch:** Bei begrenzter Spiellänge wird die komplette
Zufallssequenz bereits bei `MATCH_STARTED` erzeugt und im Event
gespeichert. Bei Endless wird der Wert lazy beim ersten Bedarf einer
neuen Runde erzeugt und als `ROUND_RANDOM_GENERATED`-Event
festgeschrieben, damit ein Replay immer dasselbe Ergebnis liefert.

---

## 4. Ein Baukasten für Spiele statt zehn Einzelprogrammierungen

**Einfach erklärt:** Statt für jedes der 10 Spiele ein komplett eigenes
Programm zu schreiben, gibt es fünf "Spielfamilien" mit derselben
Grundmechanik. Ein einzelnes Spiel ist dann nur noch eine Liste von
Einstellungen für eine dieser Familien. Bob's 27 und Bob's 27 Easy
zum Beispiel nutzen exakt dieselbe Familie — nur die Liste der
Zieldoppel unterscheidet sich. Das macht neue Spiele später sehr
einfach: ein neues "Catch 20" wäre nur eine neue Konfiguration, kein
neues Programm.

**Warum:** SPEC §30 — ähnliche Spiele sollen keine getrennten
Implementierungen sein.

**Technisch:**

```
GameDefinition:
  id, name, description, category, icon
  engineFamily            # welche der 5 Familien unten
  playerRange             # (1, 4)
  settingsSchema          # deklarative Felder für den Setup-Screen
  durationModes           # welche GameDurationConfig-Modi erlaubt sind
  familyConfig            # familien-spezifische Konfiguration
```

| Familie | Spiele | Kernmechanik |
|---|---|---|
| `x01` | 170 | Restscore runter auf 0, Double Out, Legs/Sets |
| `target_progression` | Bob's 27, Bob's 27 Easy, Around the World | feste Target-Liste abarbeiten, Config = Liste + Required Hits + Segment Mode |
| `checkout_range` | 121, Catch 40, Catch 40 Easy, 60 +/- | aktueller Checkout-Wert, Config = Start/Max, Darts pro Aufgabe, Delta bei Erfolg/Misserfolg. 60 +/- ist keine Extra-Engine: `successDelta=+10, failDelta=-1, maxDartsPerTask=3`; 121/Catch 40: `successDelta=+1, maxDartsPerTask=9/6` |
| `random_checkout` | Random Checkout | wie `checkout_range`, aber Ziel kommt pro Aufgabe aus der zentral erzeugten Zufallssequenz (Abschnitt 3) statt aus fester Progression |
| `jdc` | JDC Challenge | fixe Standard-Phasenfolge (Shanghai/Doubles/Shanghai) inkl. Shanghai-Bonus-Scoring, eigenständig, da nicht auf andere Spiele übertragbar |

Jede Familie implementiert dasselbe Reducer-Interface
(`createInitialPlayerState`, `handleThrow`, `isVisitComplete`,
`isFinished`, `getWinner`, `getDisplayData`, `getStatistics`).

---

## 5. Spielerprofile

**Einfach erklärt:** Jede Person legt einmal ein Profil an (Name,
Farbe, Kürzel) und wählt es danach vor jedem Spiel nur noch aus.
Gäste können spontan hinzugefügt werden, ohne ein dauerhaftes Profil
anzulegen. Ein gelöschtes Profil verschwindet aus der Auswahl, aber
alte Ergebnisse mit diesem Profil bleiben in der Historie erhalten.

**Warum:** SPEC §5 — Profile sollen gespeichert bleiben, nicht vor
jedem Spiel neu angelegt werden.

**Technisch:** SQLite-Tabelle `profiles` (id, name, initials, color,
is_guest, archived_at, created_at). Löschen ist ein Soft-Delete
(`archived_at` gesetzt), damit alte Matches/Highscores nicht auf ein
gelöschtes Profil zeigen. Gäste sind normale Profile mit
`is_guest = true` und werden in der normalen Profilauswahl
standardmäßig ausgeblendet (siehe Entscheidungsfrage unten).

---

## 6. Anbindung an Autodarts

**Einfach erklärt:** Dieser Baustein ist die einzige Stelle im System,
die mit dem Dartboard selbst spricht. Er nimmt die Wurf-Meldungen vom
Board entgegen, wandelt sie in ein einheitliches Format um (z. B.
"T20" statt Rohdaten) und reicht sie weiter. Er merkt sich auch, ob
die Verbindung zum Board gerade steht oder gerade wieder verbindet,
und zeigt das dezent an.

**Warum:** SPEC §36 — eine zentrale Adapter-Schicht, damit die
Spiellogik nichts von den Details der Board-Kommunikation wissen muss.

**Technisch:** Übernimmt 1:1 die verifizierten Prototyp-Mechanismen
(WS-Verbindung, 3s-Reconnect, Wurf-Normalisierung, Takeout-Handling,
Rauschen ignorieren), aber entkoppelt von der Spiellogik:

- `subscribeToThrows(callback)` — normalisierte Throws gehen an die
  Game Engine statt direkt in ein hartcodiertes Spielobjekt
- `getBoardStatus()` — `connected`/`reconnecting`/`disconnected`
- `addThrow(segment)` — manueller Dart (SPEC §15), läuft danach exakt
  denselben Code-Pfad wie ein automatisch erkannter Wurf
- `correctThrow()` — **nur lokal**, da kein Schreib-Endpunkt zu
  Autodarts verifiziert ist. SPEC §14 Punkt 1 bleibt bis dahin offen.

Es läuft genau ein Match gleichzeitig (ein Board = ein aktives Spiel).

---

## 7. Dart-Korrektur

**Einfach erklärt:** Wenn ein Wurf falsch erkannt wurde oder von Hand
nachgetragen werden muss, klickt man ihn an, wählt das richtige Feld,
und das ganze Spiel (Punktestand, Statistik, Fortschritt) rechnet sich
automatisch neu — auf allen angeschlossenen Bildschirmen gleichzeitig.

**Warum:** SPEC §14 — Korrektur muss vollständig durch den ganzen
Spielzustand durchwirken, nicht nur den einen Wurf ändern.

**Technisch:**

1. Frontend sendet Kommando (`correct_throw` / `add_throw` / `undo`)
2. Backend hängt Event an bzw. entfernt letztes Event (Abschnitt 1)
3. Kompletter Replay des Event-Logs → neuer autoritativer GameState
4. Neuer State per Live-WebSocket an alle verbundenen Clients
5. Statistiken sind Teil des Replays, nie separat gepflegt

---

## 8. Speicherung (Persistenz)

**Einfach erklärt:** Alle Profile, Spielverläufe und Highscores werden
dauerhaft auf dem Pi gespeichert, nicht nur im Arbeitsspeicher. Damit
überlebt der Fortschritt einen Neustart, und Statistiken über Monate
hinweg sind möglich.

**Warum:** Der Prototyp hatte gar keine Speicherung (Problem 5 aus
Phase 1) — jeder Neustart hat alles gelöscht.

**Technisch:** SQLite mit folgenden Tabellen:

- `profiles` (siehe Abschnitt 5)
- `matches` (id, game_id, config_json, config_hash, duration_mode,
  started_at, finished_at, winner_profile_id)
- `match_players` (match_id, profile_id, seat_order)
- `match_events` (id, match_id, seq, type, payload_json, created_at)
  — das Event-Log selbst, persistiert
- `highscores` (id, profile_id, game_id, config_hash, metric_name,
  value, match_id, achieved_at)
- `stats_summary` (profile_id, game_id, ...) — Cache für
  Lifetime-Statistiken, nach `MATCH_FINISHED` aktualisiert

`GameDefinition`s selbst leben NICHT in der Datenbank, sondern als Code
— sie sollen versionierbar und überprüfbar sein, nicht zur Laufzeit
änderbar.

`config_hash` = deterministischer Hash aus gameId + relevanten
Settings, verhindert Vermischen unterschiedlicher Einstellungen in
Highscores (SPEC §34, z. B. Random Checkout 40–80/6 Darts vs.
80–130/3 Darts).

---

## 9. Statistiken

**Einfach erklärt:** Es gibt zwei Arten von Statistik: die für das
gerade laufende Spiel (wird bei jedem Wurf frisch berechnet) und die
langfristige pro Profil (Gesamtzahl Spiele, Siege, Trefferquoten
usw.), die nach jedem beendeten Spiel aktualisiert wird.

**Warum:** SPEC §35 verlangt beides — Live-Werte im Spiel und
langfristige Werte im Profil.

**Technisch:** Live-Statistik komplett aus dem Event-Log des laufenden
Matches abgeleitet (`getStatistics()` der Engine-Familie), nie
eigenständig gespeichert. Lifetime-Statistik wird bei
`MATCH_FINISHED` in `stats_summary` fortgeschrieben statt bei jedem
Seitenaufruf die komplette Historie neu zu berechnen.

---

## 10. Kommunikation zwischen Backend und Bildschirmen

**Einfach erklärt:** Es gibt zwei Kommunikationswege: einen "Live-Draht"
(WebSocket), über den der aktuelle Spielstand laufend an alle
Bildschirme gepusht wird, und normale Web-Anfragen (REST) für alles,
was nicht in Echtzeit passieren muss (Profile verwalten, Spiel
starten, Highscores abrufen).

**Technisch:**

**WebSocket** (ein Kanal, an alle Clients):
- Server → Client: `{"type": "state", "data": <GameState>}`
- Server → Client: `{"type": "board_status", "data": {"status": ...}}`
- Client → Server: `{"cmd": "correct_throw"|"add_throw"|"undo", ...}`

**REST:**
- `GET/POST /api/profiles`, `PUT/DELETE /api/profiles/{id}`
- `GET /api/games` (Game Hub)
- `POST /api/matches` (Match anlegen + starten)
- `GET /api/matches/{id}` (Ergebnis/Historie)
- `GET /api/highscores/{gameId}?configHash=...`
- `GET /api/profiles/{id}/stats`

---

## 11. Ordner- und Komponentenstruktur

    backend/
      app.py                     # aiohttp-Wiring, Routen, WS-Handler
      adapter/
        autodarts.py             # AutodartsAdapter
      engine/
        engine.py                # MultiplayerEngine: Turn/Runde, Replay-Treiber
        events.py                # Event-Typen + (De-)Serialisierung
        turns.py                 # Visit/Runden-Logik, Zufallssequenzen (Fairness)
      games/
        base.py                  # GameDefinition-Interface
        x01.py                   # → 170
        target_progression.py    # → Bob's 27 (+Easy), Around the World
        checkout_range.py        # → 121, Catch 40 (+Easy), 60 +/-
        random_checkout.py       # → Random Checkout
        jdc.py                   # → JDC Challenge
      persistence/
        db.py                    # SQLite Setup/Migrationen
        models.py                # Row <-> Objekt, Queries
      stats/
        aggregate.py             # Lifetime-Statistiken, Highscore-Pflege
      config/
        games.py                 # alle 10 GameDefinitions registriert

    frontend/src/
      app/                       # App-Shell, Routing, WS-Client, globaler Store
      design/                    # Design-Tokens (Inhalt folgt in Phase 3)
      components/                # GameHub, GameCard, PlayerSelector, PlayerProfile,
                                  # GameSetup, GameSettings, GameShell, GameHeader,
                                  # PlayerScoreboard, ActivePlayer, TargetDisplay,
                                  # CurrentThrow, DartChip, DartCorrection,
                                  # CheckoutRoute, GameProgress, GameStats,
                                  # GameActions, BoardStatus, ResultScreen, Leaderboard
      screens/                   # GameHubScreen, GameSetupScreen, GameScreen,
                                  # ResultScreen, ProfileScreen

    deploy/
      darts.service              # systemd-Unit für den Pi

---

## Nächster Schritt

Phase 3 gemäß SPEC §42: Design System (Farben, Typografie, Spacing,
Cards, Buttons, Scores, Player States, Statusfarben, Modals, Touch
Targets, Responsive Regeln).
