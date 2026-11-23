# html-arbeitsblatt

Interaktive Arbeitsblätter als **eine einzige HTML-Datei**: Aufgaben mit sofortiger Rückmeldung, gestufte Hinweise, Varianten, zwei Lernwege, Pause und Überspringen, Protokoll der Bearbeitung und am Ende ein **PDF zur Abgabe** in Google Classroom oder MS Teams. Alles läuft lokal im Browser der Lernenden. Es gibt keinen Server, keine Anmeldung, keine externen Schriften oder Skripte; die Content-Security-Policy der Datei verbietet jede Netzwerkverbindung (`connect-src 'none'`).

Gebaut von Bernhard Gmeiner (GRG 15 Auf der Schmelz, Wien) mit Claude. Angeregt durch Dominik Freinhofers Artikel „Digitale Arbeitsblätter neu gedacht“ (2026).

## Was die Datei kann

- Aufgabentypen: Auswahl (eine oder mehrere), Lückentext (tippen oder antippen, mit Wortkasten), Zuordnen, Sortieren, Reihenfolge, Markieren im Text, freies Schreiben (bewertet die Lehrperson), Info- und Lesetexte.
- Mehrere richtige Schreibweisen pro Lücke; Kurzformen gelten automatisch gleich (`didn't` = `did not`).
- Rückmeldung, die erklärt, warum eine Antwort falsch ist; nach dem letzten Versuch die Lösung.
- Punkte mit Abzug für spätere Versuche und Hinweise, Variantenpools, Verzweigung in Weg Basis und Weg Plus.
- Speichern im Browser: Pause, Schließen und später weitermachen, Aufgaben überspringen.
- Protokoll: aktive Zeit gesamt und pro Aufgabe, Fensterwechsel (Aufgaben werden dabei ausgeblendet), blockierte Einfüge- und Kopierversuche, große Texteinschübe, Pausen, Neustarts. Auf dem Startbildschirm steht offen, was protokolliert wird.
- Versteckter Hinweis an KI-Werkzeuge im Quelltext; Lösungen liegen nur verschleiert in der Datei.
- Abgabe als PDF mit Antworten, Lösungen, Protokoll und eingebetteten Daten samt Prüfsumme; `tools/auswerten.py` macht daraus eine Excel-Übersicht und eine Sammlung der offenen Texte.

## Ordner

| Ordner | Inhalt |
|---|---|
| `engine/` | `engine.js`, `style.css` |
| `fonts/` | Atkinson Hyperlegible, Bricolage Grotesque (SIL OFL 1.1) |
| `vendor/` | jsPDF 2.5.2 (MIT) |
| `tools/` | `build.py`, `test.js`, `auswerten.py`, `pdf.js`, `veroeffentlichen.sh` |
| `beispiel/` | Beispielblatt mit allen Aufgabentypen (für Tests) |
| `anleitung/` | `FORMAT.md` (Blattformat), `CHECKLISTE.md` |
| `docs/` | veröffentlichte Blätter für GitHub Pages: `https://bernhardgmeiner.github.io/html-arbeitsblatt/<id>/` |

Die Quellen der echten Arbeitsblätter enthalten die Lösungen im Klartext und liegen deshalb im privaten Repository `html-arbeitsblatt-quellen`, nie hier.

## Ablauf

```bash
python3 tools/build.py <blatt.json> --check                 # nur prüfen
python3 tools/build.py <blatt.json> --salt test             # Test-Build
NODE_PATH=$(npm root -g) node tools/test.js <blatt.json>    # Testdurchlauf (Playwright)
python3 tools/build.py <blatt.json> --key                   # echter Build + Lösungsblatt als PDF
bash tools/veroeffentlichen.sh <id>                         # nach docs/ kopieren, dann commit und push
python3 tools/auswerten.py --meta dist/<id>.meta.json abgaben/*.pdf --out <id>_uebersicht.xlsx
```

## Grenzen

- Das Protokoll zeigt Auffälligkeiten, es beweist nichts. Fensterwechsel entstehen auch durch Benachrichtigungen oder die Bildschirmsperre; große Einschübe auch durch Diktat oder Autokorrektur.
- Wer den Quelltext entschlüsselt oder ein Foto vom Bildschirm an eine KI schickt, kommt an Lösungen. Die Sperren machen das Schummeln mühsamer, nicht unmöglich.
- Die Antworten liegen im Browser des Geräts. Wer Browserdaten löscht oder das Gerät wechselt, beginnt neu.
- Ändert sich ein Blatt nach dem Austeilen, passt der gespeicherte Stand nicht mehr und die Lernenden beginnen neu.
