# Checkliste vor dem Austeilen

1. `python3 tools/build.py <blatt.json> --check` ohne Fehler; jede Warnung gelesen und bewusst entschieden.
2. Test-Build mit `--salt test`, dann `node tools/test.js <blatt.json> <dist/…html> --shots <ordner>`: BESTANDEN, Bildschirmfotos (Handy, Tablet, Laptop) selbst angesehen.
3. Lösungsblatt-PDF gegen die Aufgaben gelesen: jede Lösung stimmt, jede Rückmeldung passt zum Fehler, keine richtige Antwort fehlt in den Alternativen.
4. Echter Build ohne `--salt`, `bash tools/veroeffentlichen.sh <id>`, commit, push. Nach ein bis zwei Minuten die Adresse öffnen und einmal selbst durchspielen, auch am Handy.
5. Im echten Browser einmal den Tab wechseln: Die Aufgaben müssen verschwinden, im PDF steht der Wechsel.
6. In Classroom/Teams: Link **und** Datei austeilen (die Datei für Geräte ohne Internet, der Link für iPhones). Aufgabe so anlegen, dass ein PDF hochgeladen wird.
7. Den Lernenden einmal vorzeigen: Startbildschirm, Prüfen, Hinweis, Pause, Abgabe, wo das PDF landet.
8. Nach der Abgabe: PDFs herunterladen, `tools/auswerten.py`, Auffälligkeiten im Gespräch klären, nicht automatisch bestrafen.
9. Nach dem Austeilen das Blatt nicht mehr ändern (sonst beginnen alle neu). Für Korrekturen `version` hochzählen und neu austeilen.
