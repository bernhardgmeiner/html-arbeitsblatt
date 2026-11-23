#!/usr/bin/env python3
"""Bild für ein Arbeitsblatt verkleinern und als WebP speichern.
  python3 tools/bild.py eingabe.png ausgabe.webp [--breite 1000] [--qualitaet 80]
Ziel: unter 150 KB. Größere Bilder machen die Datei am Handy langsam."""
import argparse, os
from PIL import Image
ap = argparse.ArgumentParser(); ap.add_argument("ein"); ap.add_argument("aus")
ap.add_argument("--breite", type=int, default=1000); ap.add_argument("--qualitaet", type=int, default=80)
a = ap.parse_args()
im = Image.open(a.ein).convert("RGB")
if im.width > a.breite: im = im.resize((a.breite, round(im.height * a.breite / im.width)), Image.LANCZOS)
q = a.qualitaet
while True:
    im.save(a.aus, "WEBP", quality=q, method=6)
    kb = os.path.getsize(a.aus) // 1024
    if kb <= 150 or q <= 50: break
    q -= 8
print(f"{a.aus}: {im.width}×{im.height} px, {kb} KB (Qualität {q})")
