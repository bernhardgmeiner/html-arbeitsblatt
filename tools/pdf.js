// html-arbeitsblatt · HTML-Datei (Lösungsblatt) mit Chromium als PDF drucken
// node tools/pdf.js <eingabe.html> <ausgabe.pdf>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [inp, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.resolve(inp));
  await p.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await b.close();
  console.log('Lösungsblatt: ' + out);
})().catch(e => { console.error(e); process.exit(1); });
