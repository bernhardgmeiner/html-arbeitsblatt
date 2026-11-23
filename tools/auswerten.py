#!/usr/bin/env python3
"""html-arbeitsblatt · Abgaben auswerten

Liest die PDF-Abgaben der Lernenden, prüft die eingebetteten Daten und schreibt eine Übersicht.

  python3 tools/auswerten.py --meta dist/<id>.meta.json abgaben/*.pdf [--out uebersicht.xlsx]

Ergebnis:
  <out>.xlsx (oder .csv, wenn openpyxl fehlt): eine Zeile pro Abgabe, Punkte, Protokoll, Prüfung
  <out>_texte.md: alle offenen Texte zum Bewerten, nach Aufgabe sortiert
Die Daten stecken in den PDF-Metadaten (Subject = AB1:<base64-JSON>, Keywords = ab-sum:<Prüfsumme>).
Eine falsche Prüfsumme heißt: Datei nach dem Erstellen verändert oder nicht von diesem Blatt.
"""
import argparse, base64, csv, hashlib, json, os, sys
from datetime import datetime

try:
    from pypdf import PdfReader
except ImportError:
    sys.exit("pypdf fehlt: pip install pypdf --break-system-packages")


def read(path, meta):
    r = PdfReader(path)
    md = r.metadata or {}
    subj, kw = str(md.get("/Subject", "")), str(md.get("/Keywords", ""))
    if not subj.startswith("AB1:"):
        return None, "keine Arbeitsblatt-Daten (nicht mit html-arbeitsblatt erstellt?)"
    raw = base64.b64decode(subj[4:]).decode("utf-8")
    P = json.loads(raw)
    want = hashlib.sha256((raw + "|" + meta["salt"]).encode()).hexdigest()[:24]
    ok = kw == "ab-sum:" + want
    note = []
    if not ok: note.append("PRÜFSUMME FALSCH")
    if P.get("sheet") != meta["id"]: note.append("anderes Blatt")
    elif P.get("hash") != meta["hash"]: note.append("andere Blattversion")
    return {"P": P, "ok": ok, "note": ", ".join(note), "file": os.path.basename(path)}, None


def fmt_t(ms):
    return datetime.fromtimestamp(ms / 1000).strftime("%d.%m.%Y %H:%M") if ms else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--meta", required=True)
    ap.add_argument("--out", default="uebersicht.xlsx")
    ap.add_argument("pdfs", nargs="+")
    a = ap.parse_args()
    meta = json.load(open(a.meta, encoding="utf-8"))
    rows, problems = [], []
    for f in a.pdfs:
        try:
            res, err = read(f, meta)
        except Exception as e:
            res, err = None, f"nicht lesbar ({e})"
        if err: problems.append((os.path.basename(f), err))
        else: rows.append(res)
    task_ids = [t["id"] for t in meta["tasks"]]
    titles = {t["id"]: t["title"] or t["id"] for t in meta["tasks"]}
    head = ["Name", "Klasse", "Variante", "Beginn", "Abgabe", "Aktiv (min)", "Punkte auto", "von", "Prozent", "Offen (Lehrperson)",
            "Weg", "Selbstständig", "Neustarts", "Fenster verlassen", "außerhalb (min)", "Einfügen", "Kopieren", "Große Einschübe",
            "Pausen", "Seite geschlossen", "Hinweise", "Prüfung", "Datei"] + [titles[i] for i in task_ids]
    data = []
    for r in sorted(rows, key=lambda x: (x["P"]["cls"], x["P"]["name"].lower())):
        P, s = r["P"], r["P"]["stats"]
        per = {t["id"]: (t["pts"] if t["pts"] is not None else f"Text ({t.get('words', 0)} W.)") for t in P["tasks"]}
        data.append([P["name"], P["cls"], P["code"], fmt_t(P["start"]), fmt_t(P["end"]), round(P["activeMs"] / 60000, 1), P["auto"], P["autoMax"],
                     round(P["auto"] / P["autoMax"] * 100) if P["autoMax"] else 0, P["open"], P.get("track") or "",
                     "ja" if P.get("declared") else ("NEIN" if P.get("declared") is False else "-"),
                     P.get("restarts", 0), s["leaves"], round(s["awayMs"] / 60000, 1), s["paste"], s["copy"], s["inserts"], s["pauses"], s["reopen"], s["hints"],
                     "ok" if r["ok"] and not r["note"] else r["note"], r["file"]] + [per.get(i, "") for i in task_ids])
    seen = {}
    for d in data: seen.setdefault((d[0].lower(), d[1]), []).append(d[22])
    dup = {k: v for k, v in seen.items() if len(v) > 1}
    out = a.out
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill
        wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Abgaben"
        ws.append(head)
        for c in ws[1]: c.font = Font(bold=True)
        warn = PatternFill("solid", fgColor="F8DFD9")
        for d in data:
            ws.append(d)
            row = ws.max_row
            for col, cond in [(12, d[11] != "ja"), (13, d[12] > 0), (14, d[13] > 0), (16, d[15] > 0), (17, d[16] > 0), (18, d[17] > 0), (22, d[21] != "ok")]:
                if cond: ws.cell(row=row, column=col).fill = warn
        ws.freeze_panes = "C2"
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = max(9, min(28, max(len(str(c.value or "")) for c in col) + 2))
        if problems or dup:
            ws2 = wb.create_sheet("Probleme"); ws2.append(["Datei", "Problem"])
            for p in problems: ws2.append(list(p))
            for k, v in dup.items(): ws2.append([", ".join(v), f"{k[0]} ({k[1]}) hat mehrmals abgegeben"])
        if not out.endswith(".xlsx"): out += ".xlsx"
        wb.save(out)
    except ImportError:
        out = os.path.splitext(out)[0] + ".csv"
        with open(out, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f, delimiter=";"); w.writerow(head); w.writerows(data)
    md = [f"# Offene Aufgaben: {meta['title']}\n"]
    for t in [t for t in meta["tasks"] if t["type"] == "write"]:
        md.append(f"\n## {t['title']} ({t['max']:g} Punkte)\n")
        for r in sorted(rows, key=lambda x: (x["P"]["cls"], x["P"]["name"].lower())):
            pt = next((x for x in r["P"]["tasks"] if x["id"] == t["id"]), None)
            if pt is None: continue
            md.append(f"\n### {r['P']['name']} ({r['P']['cls']}) · {pt.get('words', 0)} Wörter\n")
            if pt.get("checks") is not None:
                md.append("Selbstcheck: " + ", ".join("ja" if c else "nein" for c in pt["checks"]) + "\n")
            md.append((pt.get("text") or "(kein Text)").strip() + "\n")
    tp = os.path.splitext(out)[0] + "_texte.md"
    open(tp, "w", encoding="utf-8").write("\n".join(md))
    print(f"{len(rows)} Abgaben gelesen → {out}, {tp}")
    for p in problems: print("Problem:", *p)
    for k, v in dup.items(): print(f"Mehrfach: {k[0]} ({k[1]}): {', '.join(v)}")
    bad = [r["file"] + " (" + (r["note"] or "Prüfsumme") + ")" for r in rows if not r["ok"] or r["note"]]
    if bad: print("Prüfung auffällig:", ", ".join(bad))


if __name__ == "__main__":
    main()
