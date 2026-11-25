# Blattformat (blatt.json)

Ein Arbeitsblatt ist eine JSON-Datei. `tools/build.py` prüft sie und baut daraus eine HTML-Datei. Alles, was hier nicht steht, gibt es nicht.

Die Quell-JSON enthält alle Lösungen im Klartext. Sie gehört **nie** in dieses öffentliche Repository, sondern ins private `html-arbeitsblatt-quellen`. Öffentlich liegen nur die gebauten Dateien in `docs/`.

## Kopf

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | Kurzname, nur a–z, 0–9, Bindestrich. Bestimmt Dateiname, Adresse und Speicherplatz im Browser. Nach dem Austeilen nie mehr ändern. |
| `version` | nein (1) | Bei einer zweiten, inhaltlich neuen Fassung hochzählen. |
| `title`, `subtitle`, `subtitleDe` | `title` ja | Überschrift und Unterzeile; `subtitleDe` nur bei englischen Blättern. |
| `intro` | nein | Kurzer Text auf dem Startbildschirm (Markdown light). |
| `image` | nein | Bild oben im Startbildschirm, gleiches Format wie bei Aufgaben (siehe Bilder). Zählt wie jedes Bild; dasselbe Bild noch einmal in einer Aufgabe wird nur einmal gespeichert. |
| `subject`, `class`, `level` | nein | Steht klein über dem Titel, z. B. „Englisch · 2A · A1+/A2“. |
| `classes` | nein | Liste, wenn mehrere Klassen dasselbe Blatt bekommen: Die Lernenden tippen ihre Klasse an. Fehlen `class` und `classes`, gibt es ein freies Feld. |
| `lang` | nein (`en`) | Sprache der Oberfläche: `en` oder `de`. |
| `helpDe` | nein (`true`) | Nur bei `en`: deutsche Zeile unter Arbeitsaufträgen, Regeln und Hinweisen. |
| `accent` | nein | Akzentfarbe `#RRGGBB`. Dunkle Schrift- und helle Flächenvariante rechnet der Build aus (Kontrast mindestens 5,5 : 1). |
| `submitTo` | nein | Wohin das PDF hochgeladen wird. Standard „Google Classroom“, sonst z. B. „MS Teams“. |
| `fileTitle` | nein | Anfang des PDF-Dateinamens, Standard ist die `id`. |
| `settings` | nein | Siehe unten. |
| `route` | nein | Verzweigung in zwei Wege, siehe unten. |
| `stations` | ja | Liste der Stationen. |

## settings

| Feld | Standard | Bedeutung |
|---|---|---|
| `feedback` | `instant` | `instant`: Prüfen-Knopf, sofort Rückmeldung. `end`: kein Prüfen, Auswertung erst bei der Abgabe. |
| `attempts` | 2 | Versuche pro Aufgabe (nur `instant`). Nach dem letzten Versuch erscheint die Lösung. |
| `laterFactor` | 0.5 | Anteil der Punkte für alles, was erst ab dem zweiten Versuch stimmt. |
| `hintCost` | 1 | Punkte pro Hinweis (0 = gratis). Nie unter 0 Punkte pro Aufgabe. |
| `typoFactor` | 1 | Punkteanteil für eine Lücke, die nur über die Tippfehler-Toleranz stimmt. |
| `allowSkip` | true | Knopf „Später“. |
| `allowPause` | true | Knopf „Pause“. |
| `selfDeclaration` | true | Kästchen „ohne KI-Werkzeuge und ohne Hilfe“ auf dem Startbildschirm, Pflicht zum Starten. |
| `revealAfterSubmit` | true | Im Modus `end` nach der Abgabe die Punkte zeigen. |
| `surveillance` | alles `true` | `paste` (Einfügen sperren und protokollieren), `copy` (Kopieren der Aufgaben sperren), `focus` (beim Verlassen des Fensters ausblenden und protokollieren), `time` (Zeit protokollieren), `print` (Druckversuche protokollieren). Auf dem Startbildschirm steht nur, was eingeschaltet ist. |

Immer aktiv, nicht abschaltbar: großer Texteinschub wird protokolliert (ab 18 Zeichen in einer Lücke, ab 30 in einem Textfeld auf einmal; das kann auch Diktat oder Autokorrektur sein), Neustarts werden gezählt, der versteckte Hinweis an KI-Werkzeuge steht im Quelltext (HTML-Kommentar, unsichtbares Element, Skript-Kommentar).

## Stationen

```json
{ "id": "s1", "title": "Warm-up", "titleDe": "Aufwärmen", "track": "basis", "tasks": [ … ] }
```

`id` optional (sonst s1, s2 …). `track` nur bei Verzweigung: `basis` oder `plus`.

## Gemeinsame Felder jeder Aufgabe

| Feld | Bedeutung |
|---|---|
| `id` | optional, sonst `<station>-<nr>`; im PDF und in der Auswertung sichtbar |
| `type` | `info`, `choice`, `gaps`, `match`, `sort`, `order`, `mark`, `write`, `pool` |
| `title` | kurze Überschrift (fehlt sie, warnt der Build) |
| `prompt`, `promptDe` | Arbeitsauftrag; `promptDe` bei englischen Blättern (fehlt sie, warnt der Build) |
| `points` | Punkte; Standard = Zahl der Teile (Lücken, Paare, Karten, Zielwörter), bei `choice` und `order` 1. `0` = Bonus- oder Übungsaufgabe: mit Rückmeldung, zählt nichts, steht bei der Abgabe nicht unter „noch nicht fertig“, Hinweise kosten dort nichts |
| `hints`, `hintsDe` | Liste gestufter Hinweise, einer nach dem anderen aufklappbar |
| `explain`, `explainDe` | Erklärung nach dem letzten falschen Versuch |
| `explainOk` | Satz, der bei richtiger Lösung erscheint |

## Bilder

Jede Aufgabe und jeder Infoblock kann ein Bild über dem Inhalt zeigen, Auswahl-Optionen können Bilder statt nur Text haben:

```json
"image": { "src": "bilder/haus-bei-nacht.webp", "alt": "An old wooden house at night …", "caption": "…", "captionDe": "…" }
"options": [ { "t": "at night", "ok": true, "img": { "src": "bilder/nacht.svg", "alt": "A moon and stars" } } ]
```

`src` ist ein Pfad relativ zur `blatt.json` (WebP, PNG, JPG oder SVG); der Build bettet das Bild als Daten in die Datei ein. `alt` ist Pflicht (mindestens 5 Zeichen, beschreibt, was zu sehen ist, in der Sprache des Blatts). Größe: ab 150 KB Warnung, ab 400 KB Fehler; `python3 tools/bild.py ein.png aus.webp` verkleinert auf 1000 px Breite und unter 150 KB. Mehr als vier verschiedene Bilder pro Blatt: Warnung (dasselbe Bild an mehreren Stellen zählt einmal). Bilder lassen sich nicht ziehen, kopieren oder per Rechtsklick speichern (solange `surveillance.copy` an ist). Im Lösungsblatt erscheinen sie klein, im Abgabe-PDF nicht.

Woher die Bilder kommen: mit dem Skill `code-bilder` aus Code gemalt (keine Bildrechte, kein Bildgenerator) oder eigene Fotos und Zeichnungen. Keine Bilder aus dem Lehrwerk oder aus dem Netz.

Markdown light überall: `**fett**`, `*kursiv*`, Leerzeile = Absatz, Zeilen mit `- ` = Liste.

## Typen

### info
Lesetext, Mustertext, Merkkasten oder Wortschatz. Keine Punkte.
`text`, `textDe`, `style` (`text`, `tip`, `model`), `lines: true` (Zeilen nummeriert, eine Zeile pro Zeilenumbruch), `glossary: [["went","ging"], …]`.

### choice
`options: [{ "t": "Toby", "ok": true }, { "t": "Mia", "fb": "Warum falsch …" }]`, `multi: true` bei mehreren richtigen, `shuffle: false` zum Nicht-Mischen, pro Option optional `de`.
Bewertung: eine richtige Option ganz oder gar nicht; Mehrfachauswahl (richtig gewählt − falsch gewählt) / Zahl der richtigen. Der Build warnt, wenn die Zahl der Versuche Raten erlaubt.

### gaps
`text` mit Lücken:
- `{{went}}` getippte Antwort
- `{{didn't go|did not go}}` mehrere richtige Schreibweisen
- `{{*went|goed|gone}}` Antippen, Stern = richtig (auch mehrere Sterne)

Gleichwertig ohne Angabe: Groß/Klein, Leerzeichen, Satzzeichen am Ende, gerade/typografische Apostrophe, Kurzformen (`didn't` = `did not`, `can't` = `cannot` = `can not`, `I'm`, `you're`, `he's`, `I've`, `I'll`). Nicht gleichwertig: `'d` (had/would ist mehrdeutig).
`feedback: { "goed": "…" }` gilt für alle Lücken, `gapFeedback: { "2": { "goed": "…" } }` für eine Lücke (Zählung ab 1). Eine Rückmeldung auf eine richtige Antwort ist ein Fehler.
`bank: true` zeigt einen Wortkasten mit den Lösungen der getippten Lücken, `bankExtra: [...]` als Ablenker. Antippen eines Wortes füllt die gewählte Lücke.
`typo: true` akzeptiert ein falsches Zeichen bei Antworten ab 5 Buchstaben, außer die Eingabe steht in `feedback`. **Nie verwenden, wenn die Schreibung das Lernziel ist** (stopped/stoped). Der Build warnt mit Beispiel.
`caseSensitive: true` nur, wenn Großschreibung zählt.

### match
`pairs: [["go","went"], …]`, `extra: ["goed"]`. Links fix, rechts gemischt als Karten. Antippen und Ablegen, Ziehen oder Tastatur. Rechte Seiten und Ablenker müssen eindeutig sein.

### sort
`categories: ["regular","irregular"]`, `items: [{ "t": "played", "c": 0 }, …]`. Ist eine Karte gewählt, legt Antippen einer schon abgelegten Karte sie in deren Spalte (wichtig am Tablet, wenn die Spalten voll sind); dasselbe gilt beim Zuordnen.

### order
`items` in der richtigen Reihenfolge; angezeigt gemischt (nie schon richtig). Verschieben mit Pfeilen oder am Griff ziehen. Teilpunkte: Anteil der richtig benachbarten Paare.

### mark
`text` mit Zielen in eckigen Klammern: `Yesterday Ben [missed] the bus.` Mehrwortziele `[was sleeping]`. Jedes Wort ist antippbar. Punkte: (Treffer − falsche Markierungen) / Ziele.

### write
Offene Schreibaufgabe, bewertet die Lehrperson. Pflicht: `points`. Optional `minWords`, `maxWords`, `starter` (Satzanfang über dem Feld), `useWords` (werden grün, sobald verwendet; keine Bewertung), `checklist` + `checklistDe` (Selbstcheck zum Ankreuzen, landet im PDF), `criteria` (nur im Lösungsblatt), `rows`.

### pool
Variantenpool: `{ "type": "pool", "pick": 1, "tasks": [ …gleichwertige Aufgaben… ] }`. Jede:r bekommt `pick` Aufgaben, festgelegt über den Variantencode. Alle Aufgaben im Pool sollen gleich viele Punkte haben (der Build warnt sonst).

## route (Verzweigung)

```json
"route": { "from": ["s1"], "threshold": 0.6 }
```
Sind alle bewerteten Aufgaben der Stationen in `from` erledigt oder übersprungen, entscheidet der Anteil der erreichten Punkte: unter `threshold` Weg `basis`, sonst `plus`. Stationen ohne `track` sehen alle. Die Entscheidung steht im Protokoll, die Lernenden sehen nur „Die nächsten Aufgaben passen zu dem, was du bisher gezeigt hast.“ Übersprungene Aufgaben zählen als 0.

## Was der Build prüft

Fehler (bricht ab): fehlende Pflichtfelder, doppelte ids, unbekannte Typen, Lücken ohne Antwort, gleiche Optionen (auch über Kurzformen: `didn't find` = `did not find`), Rückmeldung auf eine richtige Antwort, mehrdeutige Zuordnungen, Kategorien außerhalb, Schreibaufgabe ohne Punkte, kaputte Klammern, Verzweigung ohne beide Wege.
Fehler bei Bildern: fehlende Datei, falsches Format, fehlender Alternativtext, über 400 KB.
Warnungen: Bild über 150 KB oder breiter als 1400 px, mehr als vier verschiedene Bilder, fehlende deutsche Zeilen, fehlende Überschriften, Raten möglich, Rückmeldung verrät schon beim ersten Versuch die Lösung, Hinweise so teuer wie die Aufgabe, Tippfehler-Toleranz mit Beispiel, ungleiche Pool-Punkte, Geviertstrich (—).
