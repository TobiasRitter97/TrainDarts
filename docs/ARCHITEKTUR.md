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

### 2.1 Aufnahme-Bestätigung durch Takeout

**Entscheidung (02.09.2026):** Eine Aufnahme ist zwar nach dem dritten
Dart (oder einem Bust/Leg-Ende) inhaltlich abgeschlossen, wird aber
NICHT sofort verbucht. Die Anzeige friert ein: alle geworfenen Darts
bleiben sichtbar, der vorläufige Rest wird angezeigt, der bisherige
Spieler bleibt "aktiv". Erst das Takeout-Event vom Board (Darts werden
physisch aus der Scheibe gezogen) — oder ersatzweise ein manueller
Button — bestätigt die Aufnahme. Erst dann passieren Spielerwechsel,
Rundenzähler, Leg-/Run-Ende usw. Genau wie bei Autodarts selbst: der
Wurf ist vorläufig, bis der Spieler die Scheibe verlässt.

**Warum:** Verhindert, dass ein fehlerhaft erkannter letzter Dart
schon einen Spielerwechsel oder ein Leg-Ende auslöst, bevor er
korrigiert werden konnte. Ohne diese Bestätigung müsste jede Korrektur
sofort einen bereits vollzogenen Spielerwechsel rückgängig machen —
mit ihr passiert der Wechsel gar nicht erst voreilig.

**Technisch:** Die Engine unterscheidet ab jetzt zwei Zustände:

- **Pending (vorläufig):** Darts sind geworfen, Cap erreicht oder
  Bust/Checkout erkannt — die Anzeige zeigt bereits das Ergebnis, aber
  `player_states` ist noch NICHT fortgeschrieben. Alle Darts dieser
  Aufnahme sind noch korrigierbar (Abschnitt 7).
- **Committed:** Erst nach der Bestätigung (Takeout-Event oder
  manueller Button, siehe unten) greifen Spielerwechsel, Leg-/Run-
  Wechsel, Highscore-Updates.

Das Takeout-Board-Event (CLAUDE.md, "Verifizierte Autodarts-Anbindung")
wird dafür vom reinen Deduplizierungs-Signal (bisher: `seen_throws`
zurücksetzen) zu einem fachlichen Bestätigungs-Event aufgewertet.

**Manueller Fallback:** Erkennt das Board den Takeout einmal nicht,
gibt es im Game Screen einen Button **"Aufnahme bestätigen"**, der
denselben Commit auslöst. Sitzt bei den GameActions neben UNDO/+DART.

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

### 4.1 Checkout-Vorschläge (CheckoutRoute)

**Entscheidung (02.09.2026):** Für alle Checkout-basierten Spiele
(170, 121, Catch 40, Catch 40 Easy, Random Checkout, 60 +/-) wird der
empfohlene Weg zum Ziel angezeigt, z. B. "T20 T20 BULL" bei Rest 170 —
wie in Autodarts üblich.

**Zentrale, spielunabhängige Logik**, genutzt von den Engine-Familien
`x01`, `checkout_range` und `random_checkout` — keine Neuimplementierung
pro Spiel:

```
suggestRoute(remainingScore, dartsLeft, doubleOut) -> [str] | None
```

- Eingabe: aktueller Restscore, Anzahl noch verfügbarer Darts in der
  laufenden Aufnahme, Double-Out an/aus
- Ausgabe: empfohlene Dart-Folge (z. B. `["T20", "T20", "BULL"]`) oder
  `None`, wenn mit den verbleibenden Darts kein Finish mehr möglich ist
  (z. B. Rest 169 bei 3 Darts, oder Rest 41 bei nur noch 1 Dart übrig)
- Wird nach JEDEM geworfenen Dart neu aufgerufen, nicht nur einmal pro
  Aufnahme — Restscore und `dartsLeft` ändern sich mit jedem Wurf

**Etablierte Finishwege, keine Eigenkreation:** Es wird eine
Standard-Checkout-Tabelle verwendet, wie sie im Dartsport üblich ist
(z. B. 170 = T20 T20 Bull, 100 = T20 D20), keine algorithmisch
"irgendwie richtige", aber unübliche Route. Separate Tabellen für 1, 2
und 3 verbleibende Darts, da sich der sinnvolle Vorschlag mit jedem
Dart der Aufnahme ändert (z. B. nach einem verfehlten ersten Pfeil auf
T20 bei Rest 170 sind nur noch 2 Darts übrig → anderer Vorschlag als
mit 3 Darts). Bekannte "Bogey Numbers" (z. B. 169, 168, 166, 165, 163,
162, 159 bei 3 Darts/Double-Out) liefern bewusst `None`.

**Ein-/Ausblenden, zweistufig** (Anforderung von Tobias):

1. **Game Setup** (SPEC §32): Einstellung pro Spiel, ob
   Checkout-Vorschläge grundsätzlich aktiv sind — Teil des
   `settingsSchema` der jeweiligen `GameDefinition`.
2. **Laufendes Spiel**: schneller Toggle (Antippen der Anzeige oder
   Menüpunkt), ohne das Spiel zu unterbrechen. Reine UI-Einstellung,
   erzeugt kein Event im Match-Log, da sie den Spielzustand nicht
   verändert.

Beide Einstellungen werden je Profil gemerkt (lokal im Browser oder am
Profil), statt bei jedem Spiel erneut gefragt zu werden.

**Anzeige:** Komponente `CheckoutRoute` (SPEC §31) an fester Position
im einheitlichen Game Screen (SPEC §12), deutlich zurückhaltender als
der Restscore — Design-System Abschnitt "Typografie": `--fs-lg` statt
`--fs-display`, damit die Hierarchie klar bleibt (Restscore zuerst
lesbar, Vorschlag klar untergeordnet, aber weiterhin aus der Ferne
lesbar).

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
is_guest, merged_into_profile_id, archived_at, created_at). Löschen ist
ein Soft-Delete (`archived_at` gesetzt), damit alte Matches/Highscores
nicht auf ein gelöschtes Profil zeigen. Gäste sind normale Profile mit
`is_guest = true` und werden in der normalen Profilauswahl
standardmäßig ausgeblendet.

**Entscheidung (02.09.2026):** Gast-Ergebnisse bleiben nach dem Spiel
erhalten und sollen später einem echten Profil zugeordnet werden
können. Dafür bekommt `profiles` das Feld
`merged_into_profile_id` (nullable). Wird ein Gast im Nachhinein einem
Profil zugewiesen, wird dieses Feld gesetzt; alle Statistik- und
Highscore-Abfragen rechnen die bisherigen Ergebnisse des Gasts danach
dem Zielprofil zu. Der Gast-Datensatz selbst bleibt zur
Nachvollziehbarkeit bestehen, taucht aber nirgends mehr eigenständig
auf.

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

### 7.1 Eingabe-Komponente: DartboardPicker

**Entscheidung (02.09.2026):** Die Segment-Auswahl in Schritt 1 läuft
primär über ein anklickbares SVG-Dartboard statt über eine reine
Segment-Typ/Zahl-Liste. Grund: auf einem Dartboard erkennt man ein
Feld sofort visuell wieder, das ist schneller und intuitiver als sich
z. B. "Triple, dann 20" aus zwei Listen zusammenzusuchen.

**Komponente `DartboardPicker`** (SPEC §31 Komponentenliste ergänzt):
eine einzige wiederverwendbare Komponente, die an zwei Stellen
eingesetzt wird:

- in der zentralen `DartCorrection`-UI (SPEC §14, einen erkannten Wurf
  korrigieren)
- bei `+ DART` für die manuelle Eingabe eines nicht erkannten Wurfs
  (SPEC §15) — technisch identisch, da ein manuell erfasster Dart
  danach wie ein automatisch erkannter behandelt wird

Anforderungen an `DartboardPicker`:

1. **Alle Felder einzeln antippbar**: 20× Single innen, 20× Single
   außen, 20× Double, 20× Triple, Outer Bull, Bullseye — als eigene
   klickbare SVG-Flächen, nicht als grobe Zonen.
2. **Präzision bei schmalen Ringen** (Double/Triple sind nur wenige
   Millimeter breit): beim Antippen erscheint eine Lupe (vergrößerter
   Ausschnitt um den Finger/Cursor), die live mitwandert, solange der
   Finger auf dem Board bleibt.
3. **Bestätigung vor Übernahme**: nach dem Loslassen erscheint eine
   kurze Bestätigungsanzeige direkt am Board, z. B. "T20 —
   übernehmen?" mit den Optionen Übernehmen/Abbrechen — verhindert,
   dass ein leicht daneben getroffenes Feld ungewollt übernommen wird.
4. **MISS und BOUNCER** stehen als eigene, große Buttons neben dem
   Board (keine Fläche auf dem Board dafür nötig, kein
   Zoom/Bestätigung nötig, da eindeutig).
5. **Fallback bleibt erhalten**: die bisherige Auswahl über
   Segment-Typ (Single/Double/Triple) + Zahl (1–20) bleibt als
   Alternative bestehen, für Fälle wo das Board unpraktisch ist (z. B.
   sehr kleiner Bildschirm) oder falls sich in der Praxis zeigt, dass
   sie in bestimmten Situationen schneller ist. Beide bedienen
   dieselbe Auswahl-Funktion (`onSelect(segment)`), keine doppelte
   Logik.

Eine erste optische und funktionale Vorschau (Board, Lupe,
Bestätigung, MISS/BOUNCER, Fallback-Liste) liegt in
`docs/design/styleguide.html`.

### 7.2 Rückwirkende Korrektur über Aufnahmen hinweg

**Entscheidung (02.09.2026):** Korrigierbar ist nicht nur die laufende
(noch unbestätigte, Abschnitt 2.1) Aufnahme, sondern auch bereits
bestätigte Aufnahmen früherer Spieler — selbst wenn der nächste
Spieler längst wirft. Die Korrektur muss dann automatisch alles
Nachfolgende neu aufrollen: Spielerwechsel, Bust-Entscheidungen,
Leg-/Run-Enden inklusive.

**Warum:** SPEC §14/§16 verlangen genau das; ein Korrektursystem, das
nur den aktuellen Zug korrigieren kann, wäre unvollständig — ein
falsch erkannter Dart aus der vorletzten Aufnahme muss genauso
korrigierbar sein.

**Technisch — wichtige Konsequenz für Phase 8:** Das erfordert, das in
Abschnitt 1 entworfene Event-Log tatsächlich zu bauen. Phase 7 hat den
`MatchEngine`-Zustand aus Zeitgründen direkt mutiert (kein Log, keine
Persistenz) — das reicht für rückwirkende Korrekturen über
Aufnahmegrenzen hinweg nicht mehr aus. Phase 8 stellt `MatchEngine`
daher auf echtes Event-Sourcing um: `THROW`- und
`VISIT_CONFIRMED`-Events (Abschnitt 2.1) werden an ein Log angehängt;
eine Korrektur fügt ein `CORRECT_THROW`-Event an der betroffenen
Stelle ein, danach wird das komplette Log ab Match-Start neu
abgespielt. Dadurch ist jede Korrektur — egal wie weit zurück —
automatisch korrekt, ohne Sonderfälle pro Spielsituation.

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
  status, started_at, finished_at, winner_profile_id) — `status` ist
  `in_progress` | `finished` | `abandoned`
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

**Entscheidung (02.09.2026) — Unterbrochenes Spiel nach Neustart:**
Weder automatisch fortsetzen noch automatisch verwerfen. Beim nächsten
Öffnen der App prüft das Frontend über `GET /api/matches/active`, ob
ein Match mit `status = in_progress` existiert. Falls ja, erscheint
vor allem anderen ein Dialog ("Angefangenes Spiel 170 mit Tobias,
Rebecca fortsetzen?") mit den Optionen **Fortsetzen** (Match bleibt
`in_progress`, Event-Log wird weiter abgespielt) und **Verwerfen**
(`status` wird auf `abandoned` gesetzt — das Event-Log bleibt zur
Fehlersuche erhalten, fließt aber in keine Statistik/Highscore ein).

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
- `POST /api/profiles/{guestId}/merge-into/{profileId}` (Abschnitt 5)
- `GET /api/games` (Game Hub)
- `POST /api/matches` (Match anlegen + starten)
- `GET /api/matches/active` (unterbrochenes Match für Fortsetzen-Dialog,
  Abschnitt 8)
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
        checkout.py              # CheckoutRoute: Standard-Finishtabellen (Abschnitt 4.1)
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
      design/                    # Design-Tokens (siehe docs/design/tokens.css)
      components/                # GameHub, GameCard, PlayerSelector, PlayerProfile,
                                  # GameSetup, GameSettings, GameShell, GameHeader,
                                  # PlayerScoreboard, ActivePlayer, TargetDisplay,
                                  # CurrentThrow, DartChip, DartCorrection,
                                  # DartboardPicker (Abschnitt 7.1), CheckoutRoute,
                                  # GameProgress, GameStats, GameActions, BoardStatus,
                                  # ResultScreen, Leaderboard
      screens/                   # GameHubScreen, GameSetupScreen, GameScreen,
                                  # ResultScreen, ProfileScreen

    deploy/
      darts.service              # systemd-Unit für den Pi

---

## 12. Bau-Reihenfolge der 10 Spiele

**Entscheidung (02.09.2026):** Alle 10 Spiele aus SPEC.md §3 werden
gebaut — die Reihenfolge in SPEC §42 (Phase 9: 170, Bob's 27, Random
Checkout als Architektur-Test; Phase 10: 121, Bob's 27 Easy, Catch 40
Easy, Catch 40, 60 +/-, Around the World, JDC Challenge) ist
ausschließlich die Reihenfolge, in der sie umgesetzt werden — keine
Priorisierung, welche Spiele wichtiger sind oder ob einzelne Spiele
später wegfallen könnten.

---

## Nächster Schritt

Phase 3 gemäß SPEC §42: Design System (Farben, Typografie, Spacing,
Cards, Buttons, Scores, Player States, Statusfarben, Modals, Touch
Targets, Responsive Regeln). Das Ergebnis liegt in `docs/DESIGN.md`
sowie einer Vorschauseite unter `docs/design/styleguide.html`.
