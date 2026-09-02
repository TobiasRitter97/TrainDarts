# Autodarts Custom Training UI

Ich entwickle eine eigene Benutzeroberfläche als Ergänzung zu **Autodarts**.

Es existiert bereits ein Projekt mit einer groben Oberfläche und einer grundsätzlich funktionierenden Autodarts-Anbindung.

Bitte **keine komplett neue Anwendung von Grund auf entwickeln**, sondern zuerst meinen bestehenden Code analysieren und anschließend darauf aufbauen.

---

# 1. Grundidee

Autodarts selbst bietet bereits verschiedene normale Spielmodi.

Diese möchte ich **nicht nachbauen**.

Meine Anwendung soll sich auf zusätzliche Trainings- und Minispiele konzentrieren, die ich innerhalb von Autodarts so aktuell nicht nutzen kann.

Die Anwendung soll sich wie eine hochwertige Erweiterung von Autodarts anfühlen.

Das wichtigste Prinzip:

> Alle Trainingsspiele verwenden dieselbe Oberfläche, dieselbe Spielerlogik, dieselbe Autodarts-Anbindung und dieselbe Dart-Korrektur.

Nur:

* Spielregeln
* Ziel
* Progression
* Scoring
* spielbezogene Informationen

unterscheiden sich.

---

# 2. Zunächst bestehenden Code analysieren

Bevor größere Änderungen vorgenommen werden:

1. gesamte Projektstruktur analysieren
2. verwendetes Framework identifizieren
3. Routing analysieren
4. State Management analysieren
5. Styling analysieren
6. bestehende Komponenten analysieren
7. Autodarts-Anbindung analysieren
8. WebSocket/API-Kommunikation analysieren
9. automatische Treffererkennung analysieren
10. vorhandene Korrekturlogik analysieren

Vorhandene funktionierende Autodarts-Funktionen sollen bevorzugt weiterverwendet werden.

Keine Autodarts-Endpunkte erfinden.

---

# 3. Spiele, die implementiert werden sollen

Ausschließlich folgende Trainingsspiele sollen zunächst Bestandteil der Anwendung sein:

1. 170 / X01-170
2. 121
3. Bob's 27
4. Bob's 27 Easy
5. Catch 40 Easy – 41 bis 81
6. Catch 40 – 61 bis 100
7. 60 +/-
8. Around the World
9. Random Checkout
10. JDC Challenge

Die Architektur muss aber so aufgebaut sein, dass später problemlos weitere Trainingsspiele ergänzt werden können.

---

# 4. Zentrales Mehrspieler-System

SEHR WICHTIG:

**Jedes Trainingsspiel muss grundsätzlich Multiplayer-fähig sein.**

Unterstützt werden:

* 1 Spieler
* 2 Spieler
* 3 Spieler
* 4 Spieler

Auch klassische Solo-Trainingsspiele sollen gemeinsam gespielt werden können.

---

# 5. Spielerprofile

Es soll ein eigenes Profile-System geben.

Auf dem Startbildschirm bzw. vor Spielbeginn sollen Spieler ausgewählt werden können.

Beispielsweise:

[ Tobias ]
[ Rebecca ]
[ Max ]
[ + Spieler ]

Ein Profil soll mindestens enthalten:

* eindeutige ID
* Name
* optional Avatar / Initialen
* optional individuelle Farbe
* persönliche Statistiken
* persönliche Highscores
* Trainingshistorie

Profile sollen gespeichert werden, sodass sie nicht vor jedem Spiel neu angelegt werden müssen.

Es soll möglich sein:

* Profil erstellen
* Profil bearbeiten
* Profil auswählen
* Profil entfernen
* Gastspieler hinzufügen

---

# 6. Spielstart

Wenn ein Trainingsspiel angeklickt wird:

### Schritt 1

Spieler auswählen.

Beispiel:

**WHO IS PLAYING?**

☑ Tobias
☑ Rebecca
☐ Max
☐ Gast

Spielerreihenfolge soll optional veränderbar sein.

### Schritt 2

Game Settings auswählen.

### Schritt 3

Spiel starten.

---

# 7. Einheitliche Multiplayer-Logik

Jeder Spieler besitzt seinen eigenen:

* Score
* aktuellen Target
* Fortschritt
* Checkout
* Round State
* Statistik-State
* Trainings-State

Nach einer vollständigen Aufnahme von normalerweise drei Darts:

**automatisch nächster Spieler.**

Beispiel:

Tobias
→ 3 Darts

Rebecca
→ 3 Darts

Max
→ 3 Darts

Tobias
→ 3 Darts

usw.

Das System muss aber Spiele unterstützen, bei denen eine Aufgabe aus mehreren Aufnahmen besteht.

Beispielsweise:

Catch 40 mit bis zu 6 Darts.

Der Game Engine muss deshalb bestimmen können, wann:

`playerTurnComplete = true`

ist.

Nicht hart überall drei Darts voraussetzen.

---

# 8. Fairness bei Multiplayer

Bei Trainingsspielen sollen alle Spieler grundsätzlich dieselben Bedingungen erhalten.

Beispiele:

Random Checkout:

Alle Spieler sollen innerhalb einer Runde denselben zufälligen Checkout erhalten.

Around the World:

Alle Spieler spielen dieselbe Target-Reihenfolge.

Catch 40:

Alle Spieler durchlaufen dieselben Checkout-Zahlen.

JDC:

Alle Spieler absolvieren dieselbe Challenge.

Dadurch können die Ergebnisse direkt miteinander verglichen werden.

---

# 9. Game Hub

Die Startseite soll ausschließlich die Custom Trainingsspiele anzeigen.

Große anklickbare Game Cards:

### CHECKOUT

170

121

Catch 40 Easy

Catch 40

60 +/-

Random Checkout

### DOUBLES

Bob's 27

Bob's 27 Easy

### ACCURACY

Around the World

JDC Challenge

Die Kategorien dürfen später angepasst werden.

---

# 10. Game Cards

Jede Game Card enthält:

* Icon
* Spielname
* kurze Beschreibung
* Trainingstyp
* optional persönlicher Highscore
* optional letzter Score
* optional Bestleistung
* Anzahl zuletzt verwendeter Spieler

Beispiel:

🎯

BOB'S 27

Double Training

BEST
426

---

# 11. Design

Moderne Dark-Mode Darts UI.

Designrichtung:

* Sport Broadcast
* professionelle Dart-App
* moderne Darts-Lounge
* reduzierte Gaming-Elemente
* große Zahlen
* hoher Kontrast
* Touch optimiert
* aus mehreren Metern lesbar

Keine:

* übermäßigen Neon-Effekte
* Comic-Optik
* unnötigen Glows
* kleinen Texte
* überladenen Dashboards

Ein zentrales Design System verwenden.

---

# 12. Einheitlicher Game Screen

Jedes Spiel soll grundsätzlich denselben Game Screen verwenden.

Beispiel:

---

BOB'S 27                         BOARD ●

PLAYER 1       PLAYER 2       PLAYER 3

TOBIAS         REBECCA        MAX
143            91             122

---

CURRENT PLAYER

TOBIAS

TARGET

D16

---

DART 1        DART 2        DART 3

D16           16            D8

32            16            16

---

ROUND 8 / 21

---

UNDO             + DART             MENU

---

Je nach Spiel können zusätzliche Informationen eingeblendet werden.

Das Layout darf sich aber nicht grundsätzlich verändern.

---

# 13. Active Player

Der aktuelle Spieler muss sofort erkennbar sein.

Beispielsweise durch:

* Accent Border
* leichte Hintergrundänderung
* Active Indicator
* größere Darstellung

Keine übertriebene Animation.

Nach Ende des Turns:

weiche Transition zum nächsten Spieler.

---

# 14. Dart Correction

Zentrale Funktion für ALLE Spiele.

Jeder erkannte Dart ist anklickbar.

Beispiel:

DART 2

T5

15

Nach Klick öffnet sich eine zentrale Correction UI.

### Segment

SINGLE
DOUBLE
TRIPLE

### Nummer

1–20

zusätzlich:

OUTER BULL
BULL
MISS
BOUNCER

Danach:

**CORRECT DART**

Die Änderung muss:

1. an Autodarts übertragen werden
2. lokalen Game State aktualisieren
3. Spiellogik rückwirkend neu berechnen
4. Statistiken neu berechnen
5. Progression korrigieren
6. aktuelle UI aktualisieren

---

# 15. Manuelle Eingabe

Falls Autodarts einen Dart nicht erkennt:

`+ DART`

Darüber wird dieselbe Dart-Auswahl geöffnet.

Ein manuell eingetragener Dart soll anschließend technisch wie ein automatisch erkannter Dart behandelt werden.

---

# 16. Undo

Zentraler:

`UNDO`

Button.

Dieser muss mindestens den letzten Dart bzw. die letzte korrigierbare Aktion rückgängig machen.

Wenn dadurch bereits:

* Spieler gewechselt
* Target gewechselt
* Checkout abgeschlossen
* Runde beendet

wurde, muss auch dieser Game State korrekt zurückgesetzt werden.

---

# 17. Spiel 1 – 170

170 ist eine kompakte X01-Trainingsvariante.

Jeder Spieler startet bei:

**170**

Ziel:

auf exakt 0 spielen.

Standardmäßig:

**Double Out**

Spieler wechseln nach jeder Aufnahme.

### Einstellungen

Vor Spielstart:

**Players**
1–4

**Double Out**
ON / OFF

**Match Mode**

* 1 Leg
* Best of 3 Legs
* Best of 5 Legs
* Best of 7 Legs
* Custom
* Endless

Optional zusätzlich:

**Sets**

Wenn Sets aktiviert werden:

* Legs per Set
* Sets to Win

Das soll dieselbe Match Engine wie zukünftige X01-artige Spiele verwenden können.

### Anzeige

* Restscore
* Last Score
* Darts thrown
* Average
* Checkout Route
* Legs
* Sets
* Highest Checkout
* First 9 optional

---

# 18. Spiel 2 – 121

Klassisches 121 Checkout Training.

Standard:

Start:

121

Spieler erhält mehrere Darts, um den aktuellen Checkout zu schaffen.

Nach erfolgreichem Checkout:

121 → 122 → 123 → 124 usw.

Bis maximal:

170.

Safehouse-Logik unterstützen.

### Einstellungen

**Starting Checkout**

Default:
121

optional frei einstellbar.

**Maximum**

Default:
170

**Darts per Checkout**

* 3
* 6
* 9
* 12
* Custom

Default:
9

**Safehouse**

Optionen:

* Standard
* Off
* Easy
* optional später weitere Varianten

**Game Length**

* 10 Targets
* 20 Targets
* 30 Targets
* Custom
* Endless
* Until 170

### Multiplayer

Jeder Spieler besitzt seinen eigenen:

* aktuellen Checkout
* Safehouse
* höchsten Checkout-Level
* Erfolgsstatus

Nach Abschluss des Versuches:

nächster Spieler.

Gewinner bei begrenzter Spieldauer:

Spieler mit dem höchsten erreichten Level.

Bei Gleichstand:

weitere Kennzahlen verwenden, z.B.

* erfolgreiche Checkouts
* benötigte Darts

---

# 19. Spiel 3 – Bob's 27

Standard Bob's 27.

Startscore:

27.

Targets:

D1 → D2 → D3 → ... → D20 → Bull

Jeder Spieler besitzt seinen eigenen Score.

### Einstellungen

**Players**
1–4

**Mode**

* Single Run
* Best of 3 Runs
* Best of 5 Runs
* Custom Runs
* Endless

Ein kompletter Durchlauf D1 bis Bull entspricht einem:

**Run**

Bei mehreren Runs:

höchster Gesamtscore bzw. definierter Matchscore entscheidet.

Beste einzelne Runde ebenfalls speichern.

---

# 20. Spiel 4 – Bob's 27 Easy

Verkürzte Bob's-27-Variante.

Nicht alle Doppel müssen gespielt werden.

Die relevanten Match-Doppel sollen als feste Easy-Route definiert werden.

Die genaue Route bitte zentral konfigurierbar machen und nicht hart in UI-Komponenten verteilen.

Beispielsweise über:

`BOBS_27_EASY_TARGETS`

### Einstellungen

* Single Run
* Best of 3 Runs
* Best of 5 Runs
* Custom Runs
* Endless

Ansonsten dieselbe Engine und UI wie Bob's 27 verwenden.

Bob's 27 und Bob's 27 Easy sollen **keine zwei komplett getrennten Implementierungen** sein.

Easy soll lediglich eine andere Game Configuration verwenden.

---

# 21. Spiel 5 – Catch 40 Easy

Easy Version des Catch-Trainings.

Checkout Range:

**41 bis 81**

Jeder Spieler arbeitet sich nacheinander durch:

41
42
43
...
81

Für jedes Checkout stehen maximal:

**6 Darts**

zur Verfügung.

Nach:

* erfolgreichem Checkout
* oder Ablauf der maximalen Dartzahl

wird automatisch zum nächsten Checkout gewechselt.

### Einstellungen

**Game Length**

* kompletter Durchlauf
* Custom Anzahl Targets
* Endless

Optional:

**Shuffle**
ON / OFF

Default:
OFF

Bei OFF:

41 → 42 → 43 usw.

Bei ON:

zufällige Reihenfolge innerhalb 41–81.

Für Multiplayer sollten trotzdem alle Spieler dieselbe Sequenz erhalten.

---

# 22. Spiel 6 – Catch 40

Standardvariante.

Checkout Range:

**61 bis 100**

Sonstige Logik analog Catch 40 Easy.

Catch 40 und Catch 40 Easy sollen dieselbe Engine verwenden.

Unterschied im Wesentlichen:

Easy:
41–81

Standard:
61–100

### Einstellungen

* kompletter Durchlauf
* Custom Targets
* Endless
* Shuffle ON/OFF

---

# 23. Spiel 7 – 60 +/-

Start:

**60**

Der aktuelle Checkout wird mit maximal drei Darts gespielt.

Bei erfolgreichem Checkout:

**+10**

Bei nicht erfolgreichem Checkout:

**-1**

Beispiel:

60 ✓
→ 70

70 ✗
→ 69

69 ✗
→ 68

68 ✓
→ 78

### Einstellungen

**Start Value**

Default:
60

**Increase on Checkout**

Default:
+10

optional konfigurierbar.

**Decrease on Miss**

Default:
-1

optional konfigurierbar.

**Game Length**

* 10 Rounds
* 20 Rounds
* 30 Rounds
* Custom
* Endless

### Multiplayer

Jeder Spieler besitzt seinen eigenen aktuellen Wert.

Nach jedem Checkout-Versuch:

nächster Spieler.

Gewinner bei begrenzter Rundenzahl:

höchster erreichter bzw. finaler Wert.

Zusätzlich speichern:

* Highest Level
* Successful Checkouts
* Checkout %
* Darts per Checkout

---

# 24. Spiel 8 – Around the World

Dieser Modus soll stärker konfigurierbar sein.

Target-Reihenfolge:

1 → 2 → 3 → ... → 20

optional anschließend Bull.

### Wichtigste Regel

**Nach jeder Aufnahme wird IMMER zur nächsten Zahl gewechselt.**

Das bedeutet:

Ein Spieler erhält genau drei Darts auf beispielsweise:

Single 1.

Nach diesen drei Darts geht es IMMER weiter zu:

Single 2.

Dabei ist egal, ob:

* 0 Treffer
* 1 Treffer
* 2 Treffer
* 3 Treffer

erzielt wurden.

Dadurch bekommt man immer exakt eine Aufnahme auf eine Zahl.

---

## Around the World Einstellungen

### Segment Mode

Auswahl:

* Single
* Double
* Triple
* All

### Required Hits

Auswahl:

* 1 Treffer
* 2 Treffer
* 3 Treffer

Beispiel:

Segment:
Single

Required Hits:
2

Target:
1

Spieler wirft:

S1
S1
S5

→ Target erfolgreich.

Danach automatisch Target 2.

Anderes Beispiel:

S1
S5
S20

→ Target nicht erfolgreich.

Trotzdem anschließend Target 2.

### All Mode

Bei:

`ALL`

sollen Treffer auf:

* Single
* Double
* Triple

des aktuellen Zahlenfeldes gültig sein.

### Bull

Option:

`Include Bull`

ON / OFF

### Game Length

* 1 kompletter Run
* Best of 3 Runs
* Custom Runs
* Endless

### Wertung

Tracken:

* erfolgreiche Targets
* Treffer gesamt
* Trefferquote
* Singles
* Doubles
* Triples
* Perfect Targets = alle 3 Darts gültig

Gewinner:

höchste Anzahl erfolgreicher Targets.

Bei Gleichstand:

höhere Anzahl tatsächlicher Treffer.

---

# 25. Spiel 9 – Random Checkout

Sehr wichtiger Trainingsmodus.

Vor Spielstart müssen folgende Einstellungen vorhanden sein:

### Minimum Checkout

frei einstellbar.

Beispiel:

40

### Maximum Checkout

frei einstellbar.

Beispiel:

120

Valid Range maximal:

2–170

### Darts per Checkout

Auswahl:

* 3
* 6
* 9
* 12
* Custom

### Number of Checkouts

* 10
* 20
* 30
* 50
* Custom
* Endless

---

## Random-Checkout-Logik

Das System generiert einen zufälligen Checkout innerhalb:

Minimum – Maximum.

Beispiel:

Min:
40

Max:
100

→ Target:

74

Der Spieler versucht den Checkout mit der ausgewählten maximalen Dartzahl.

Danach:

### wenn erfolgreich

automatisch nächster Checkout.

### wenn nicht erfolgreich

nach Erreichen der maximalen Dartzahl automatisch nächster Checkout.

Keine zusätzliche Bestätigung erforderlich.

Der Spielfluss soll möglichst schnell bleiben.

---

## Multiplayer Random Checkout

SEHR WICHTIG:

Alle Spieler sollen dieselbe zufällige Zahl erhalten.

Beispiel:

Round 1:

74

Tobias spielt 74.

Rebecca spielt 74.

Max spielt 74.

Danach wird für alle:

Round 2:

91

generiert.

So sind Ergebnisse vergleichbar.

---

## Random Checkout Statistiken

Tracken:

* Checkout %
* erfolgreiche Checkouts
* Fehlversuche
* Average Darts per Checkout
* Highest Checkout
* First Dart Checkout optional
* Checkout nach 2 Darts
* Checkout nach 3 Darts
* Verteilung nach Score

Gewinner:

meiste erfolgreiche Checkouts.

Bei Gleichstand:

weniger benötigte Darts.

---

# 26. Spiel 10 – JDC Challenge

Implementiere die klassische:

**JDC Challenge**

als festen standardisierten Trainingsmodus.

Die Spiellogik und Wertung sollen gemäß den etablierten JDC-Challenge-Regeln implementiert werden.

Nicht eigene Regeln erfinden.

Die Challenge besteht aus ihren standardmäßigen Bereichen:

* Shanghai-Phase
* Doubles-Phase
* zweite Shanghai-Phase

Die einzelnen Phasen und Targets müssen klar visuell dargestellt werden.

### Multiplayer

Jeder Spieler absolviert exakt dieselbe Challenge.

Nach einer Aufnahme bzw. dem jeweils vorgesehenen Target:

nächster Spieler.

Alle Spieler müssen jederzeit denselben allgemeinen Challenge-Fortschritt nachvollziehen können, besitzen aber ihre eigenen Scores.

### Game Length

Da die JDC Challenge selbst eine abgeschlossene Challenge ist:

* 1 Run
* Best of 3 Runs
* Custom Runs
* Endless Practice

Keine klassischen Sets notwendig.

### Anzeige

* aktuelle Phase
* aktuelles Target
* Phase Score
* Total Score
* Treffer
* Shanghai Bonus
* Progress
* persönlicher Highscore

---

# 27. Unterschied Match / Run / Round

Bitte diese Begriffe zentral definieren.

### Turn / Visit

Ein Zug eines Spielers.

Meist:
3 Darts.

### Round

Wenn alle aktiven Spieler einmal an der Reihe waren.

### Run

Ein kompletter Durchlauf eines Trainingsspiels.

Beispiel:

Bob's 27 D1 → Bull.

### Leg

Eine abgeschlossene X01-artige Partie.

### Set

Gruppe aus mehreren Legs.

Diese Begriffe nicht innerhalb unterschiedlicher Games widersprüchlich verwenden.

---

# 28. Game Length System

Bitte keine universelle Legs/Sets-Auswahl auf jedes Spiel klatschen.

Stattdessen soll jedes Spiel deklarieren können, welche Modi unterstützt werden.

Beispielsweise:

170:

* Legs
* Sets
* Endless

Bob's 27:

* Runs
* Endless

Catch 40:

* Targets
* Full Run
* Endless

121:

* Targets/Rounds
* Until 170
* Endless

60 +/-:

* Rounds
* Endless

Around the World:

* Runs
* Endless

Random Checkout:

* Number of Checkouts
* Endless

JDC Challenge:

* Runs
* Endless

Dafür eine generische Struktur entwickeln.

Beispielsweise konzeptionell:

`GameDurationConfig`

anstatt für jedes Game eigene UI-Komponenten zu bauen.

---

# 29. Game Definition Architecture

Jedes Spiel sollte über eine Definition beschreibbar sein.

Konzeptionell beispielsweise:

GameDefinition

* id
* name
* description
* category
* icon
* playerRange
* settingsSchema
* durationModes
* createInitialState()
* handleThrow()
* handleTurnComplete()
* handleRoundComplete()
* correctThrow()
* undo()
* isFinished()
* getWinner()
* getDisplayData()
* getStatistics()

Nicht zwingend exakt so implementieren.

An vorhandenes Framework anpassen.

---

# 30. Wichtig: Games möglichst aus Konfiguration ableiten

Ähnliche Spiele nicht duplizieren.

Beispiele:

Bob's 27
und
Bob's 27 Easy

→ gleiche Game Engine
→ unterschiedliche Target Config

Catch 40
und
Catch 40 Easy

→ gleiche Game Engine
→ unterschiedliche Range Config

Damit soll zukünftig beispielsweise sehr leicht entstehen können:

Catch 20

oder:

Bob's 27 Medium

ohne ein neues Spiel komplett programmieren zu müssen.

---

# 31. Gemeinsame Game Components

Wiederverwendbare Komponenten erstellen.

Beispiele:

GameHub

GameCard

PlayerSelector

PlayerProfile

GameSetup

GameSettings

GameShell

GameHeader

PlayerScoreboard

ActivePlayer

TargetDisplay

CurrentThrow

DartChip

DartCorrection

CheckoutRoute

GameProgress

GameStats

GameActions

BoardStatus

ResultScreen

Leaderboard

---

# 32. Game Setup Screen

Jedes Spiel bekommt vor Start denselben Aufbau:

---

BOB'S 27

Double Training

---

PLAYERS

[ Tobias ✓ ]

[ Rebecca ✓ ]

[ Max ]

[ + Guest ]

---

GAME SETTINGS

Mode

○ Single Run
● Best of 3
○ Best of 5
○ Endless

---

[ START GAME ]

---

Die eigentlichen Settings werden aus:

`GameDefinition`

generiert.

Keine eigene komplett neue Setup-Seite für jedes Spiel entwickeln.

---

# 33. Result Screen Multiplayer

Nach einem Trainingsspiel:

🏆 RESULTS

1. Tobias
   426

2. Rebecca
   391

3. Max
   347

Darunter:

### Tobias

Best Run
426

Accuracy
38 %

Doubles
42 %

etc.

Buttons:

REMATCH

SAME PLAYERS

CHANGE PLAYERS

OTHER GAME

GAME HUB

---

# 34. Highscores

Highscores immer spielerbezogen speichern.

Aber zusätzlich:

lokales Leaderboard anzeigen.

Beispiel:

BOB'S 27

ALL-TIME

1. Tobias – 426
2. Rebecca – 403
3. Max – 388

Bei Games mit unterschiedlichen Settings müssen Highscores getrennt werden.

Beispielsweise:

Around the World:

Single / 1 Hit

darf nicht mit:

Triple / 3 Hits

verglichen werden.

Random Checkout:

40–80 / 6 Darts

darf nicht einfach mit:

80–130 / 3 Darts

verglichen werden.

Dafür sollte es einen:

`gameConfigurationHash`

oder eine vergleichbare Lösung geben.

---

# 35. Statistiken

Langfristig pro Profil speichern:

* Games Played
* Training Sessions
* Wins
* Highscores
* Accuracy
* Single %
* Double %
* Triple %
* Bull %
* Checkout %
* Average Checkout Darts
* Highest Checkout
* Scoring Average
* persönliche Bestleistungen

Zusätzlich pro Game eigene relevante Statistiken.

---

# 36. Autodarts Integration

Autodarts bleibt verantwortlich für automatische Treffererkennung.

Meine Anwendung übernimmt:

* Trainingslogik
* Game State
* Multiplayer
* Profile
* UI
* Statistiken
* Dart Corrections

Bitte eine zentrale Adapter-Schicht verwenden.

Beispielsweise:

AutodartsAdapter

mit konzeptionellen Funktionen wie:

subscribeToThrows()

correctThrow()

addThrow()

undoThrow()

getBoardStatus()

Die tatsächlichen Methoden und APIs müssen anhand meiner bereits bestehenden Implementierung ermittelt werden.

**Keine Autodarts APIs erfinden.**

---

# 37. Board Status

Dezent anzeigen:

● CONNECTED

● RECONNECTING

● DISCONNECTED

Bei Verbindungsverlust:

Game State nicht verlieren.

Nach Wiederherstellung Verbindung:

sauber synchronisieren.

---

# 38. Animationen

Subtil.

Beispiele:

Treffer:
kleiner Pulse

Triple:
kurze Hervorhebung

Bull:
besondere Hervorhebung

Checkout:
kurze Celebration

Perfect Target:
kurze Animation

New Highscore:
etwas stärkere Animation

Player Change:
weiche Transition

Keine Animation darf den Game Flow blockieren.

---

# 39. Responsive Design

Priorität:

1. 16:9 Dart Display / TV
2. Tablet Landscape
3. Desktop
4. Tablet Portrait
5. Smartphone

Wichtige Inhalte müssen aus mehreren Metern Entfernung lesbar sein.

Große Touch Targets.

---

# 40. Kiosk Experience

Während eines Spiels:

* minimale Navigation
* keine unnötigen Menüs
* keine browserartige Oberfläche
* Fokus auf Target, Spieler und Darts

Die Anwendung soll sich wie die Oberfläche einer hochwertigen elektronischen Dart-Anlage anfühlen.

---

# 41. Entwicklungsprinzipien

Bitte:

* vorhandenen Code bevorzugt wiederverwenden
* keine funktionierende Autodarts-Integration unnötig neu schreiben
* UI von Spiellogik trennen
* Game Engine von Autodarts trennen
* Multiplayer von Beginn an berücksichtigen
* keine Multiplayer-Sonderlösungen pro Game entwickeln
* Game Settings deklarativ aufbauen
* ähnliche Games über gemeinsame Engines lösen
* TypeScript sauber typisieren, falls verwendet
* responsive entwickeln
* Touch-Bedienung berücksichtigen
* keine unnötigen Dependencies hinzufügen
* keine API-Endpunkte erfinden
* jede State-Änderung Undo-fähig gestalten
* Correction immer vollständig durch Game State propagieren

---

# 42. Vorgehensweise

Arbeite bitte in Phasen.

## Phase 1 – Codeanalyse

Analysiere zunächst vollständig das vorhandene Projekt.

Dokumentiere kurz:

* Architektur
* Autodarts Integration
* State Management
* vorhandene Games
* vorhandene UI
* wiederverwendbare Komponenten
* technische Probleme
* mögliche Risiken

NOCH NICHT großflächig umbauen.

---

## Phase 2 – Zielarchitektur

Entwirf danach:

* Game Engine
* Multiplayer Engine
* Profile System
* Game Definition System
* Autodarts Adapter
* Correction System
* Persistence
* Statistics

Zeige konkrete Ordner- und Komponentenstruktur.

---

## Phase 3 – Design System

Definiere:

* Farben
* Typografie
* Spacing
* Cards
* Buttons
* Scores
* Player States
* Statusfarben
* Modals
* Touch Targets
* Responsive Regeln

---

## Phase 4 – Profile & Player Selection

Implementiere zuerst:

* Profile
* Gäste
* 1–4 Spieler
* Player Selection
* Reihenfolge

---

## Phase 5 – Game Hub & Game Setup

Implementiere:

* Game Cards
* Kategorien
* Game Setup
* dynamisch generierte Game Settings

---

## Phase 6 – Unified Game Screen

Baue die gemeinsame Oberfläche.

Noch unabhängig von zehn unterschiedlichen individuellen UIs.

---

## Phase 7 – Autodarts Event Layer

Verbinde:

Autodarts Throw Events

mit:

Game Engine.

---

## Phase 8 – Correction & Undo

Implementiere robust:

* Dart korrigieren
* Dart hinzufügen
* Miss
* Bouncer
* Undo
* rückwirkende Game-State-Neuberechnung

---

## Phase 9 – Referenzspiele

Implementiere zunächst drei Spiele, um die Architektur zu testen:

### 170

Test für:

* klassisches Scoring
* Checkout
* Legs
* Multiplayer

### Bob's 27

Test für:

* Target Progression
* Trainingsscore
* Runs

### Random Checkout

Test für:

* dynamische Targets
* individuelle Settings
* mehrere Aufnahmen
* Multiplayer-Synchronisierung

Erst wenn diese drei Spiele sauber mit derselben Architektur funktionieren, weitere Games ergänzen.

---

## Phase 10 – Restliche Games

Danach:

121

Bob's 27 Easy

Catch 40 Easy

Catch 40

60 +/-

Around the World

JDC Challenge

---

# 43. Wichtigstes Ziel

Am Ende möchte ich keine Sammlung aus zehn isolierten Minispielen.

Ich möchte eine:

# CUSTOM AUTODARTS TRAINING PLATFORM

mit einer gemeinsamen technischen Grundlage.

Der Workflow soll immer gleich sein:

**Game Hub**

↓

**Spiel auswählen**

↓

**1–4 Spieler/Profile auswählen**

↓

**Game Settings wählen**

↓

**Spiel starten**

↓

**Autodarts erkennt Würfe automatisch**

↓

**bei Bedarf Dart direkt korrigieren**

↓

**automatischer Spielerwechsel**

↓

**Live Scores & Progress**

↓

**Result Screen**

↓

**Highscores & Statistiken**

↓

**Rematch oder nächstes Training**
