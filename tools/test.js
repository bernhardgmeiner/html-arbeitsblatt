// html-arbeitsblatt · Testdurchlauf mit Playwright
// NODE_PATH=$(npm root -g) node tools/test.js <blatt.json> [dist/<id>.html] [--shots ordner]
// Baut nicht selbst: vorher python3 tools/build.py <blatt.json> --salt test
// Prüft: Laden ohne Fehler und ohne Netzwerkzugriffe, CSP, alle Aufgaben richtig und falsch lösen, Punkte,
// Hinweise, Überspringen, Pause, Fenster verlassen, Einfügen, Kopieren, Neuladen, Wege, Abgabe-PDF mit Prüfsumme,
// Modus "end", kein waagrechtes Scrollen auf Handy, Tablet und Laptop.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const sheetPath = args[0];
if (!sheetPath) { console.error('Aufruf: node tools/test.js <blatt.json> [datei.html] [--shots ordner]'); process.exit(2); }
const S = JSON.parse(fs.readFileSync(sheetPath, 'utf8'));
const ROOT = path.dirname(__dirname);
const htmlPath = path.resolve(args[1] && !args[1].startsWith('--') ? args[1] : path.join(ROOT, 'dist', S.id + '.html'));
const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const META = JSON.parse(fs.readFileSync(htmlPath.replace(/\.html$/, '.meta.json'), 'utf8'));
const URL = 'file://' + htmlPath;
const KEY = 'ab:' + S.id + ':v' + (S.version || 1);

// Aufgaben nach id (mit Pool-Kindern), Stationen auto-id wie build.py
const TASKS = {};
S.stations.forEach((st, si) => { st.id = st.id || 's' + (si + 1); st.tasks.forEach((tk, ti) => { tk.id = tk.id || st.id + '-' + (ti + 1); if (tk.type === 'pool') tk.tasks.forEach((c, ci) => { c.id = c.id || tk.id + '-' + (ci + 1); TASKS[c.id] = c; }); else TASKS[tk.id] = tk; }); });
const parseGaps = text => { const g = []; String(text).replace(/\{\{(.+?)\}\}/g, (_, inner) => { const p = inner.split('|').map(s => s.trim()); if (p.some(x => x.startsWith('*'))) g.push({ pick: true, opts: p.map(x => x.replace(/^\*/, '')), ok: p.map((x, i) => x.startsWith('*') ? i : -1).filter(i => i >= 0) }); else g.push({ pick: false, ans: p }); return ''; }); return g; };
const maxPts = tk => tk.type === 'info' ? 0 : (tk.points != null ? tk.points : ({ choice: 1, order: 1, write: 1, gaps: parseGaps(tk.text || '').length, match: (tk.pairs || []).length, sort: (tk.items || []).length, mark: ((tk.text || '').match(/\[[^\]]+\]/g) || []).length })[tk.type]);

let fails = 0, passes = 0;
const results = [];
function ok(cond, msg) { if (cond) { passes++; } else { fails++; results.push('FEHLER: ' + msg); } }
function note(msg) { results.push('       ' + msg); }

async function open(ctx, opts) {
  const p = await ctx.newPage();
  p._errs = []; p._reqs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') p._errs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', e => p._errs.push('pageerror: ' + e.message));
  p.on('request', r => p._reqs.push(r.url()));
  await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  await p.goto(URL);
  await p.waitForTimeout(250);
  return p;
}
const state = p => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const curTask = p => p.evaluate(() => { const c = document.querySelector('[data-task]'); return c ? c.dataset.task : null; });
async function clickText(p, sel, text) {
  const done = await p.evaluate(([sel, text]) => {
    const n = s => s.replace(/\s+/g, ' ').trim();
    const els = Array.from(document.querySelectorAll(sel)).filter(e => !e.disabled);
    const own = e => { const c = e.cloneNode(true); c.querySelectorAll('.de,.sol,.box').forEach(x => x.remove()); return n(c.textContent); };
    const e = els.find(x => own(x) === n(text) && x.getAttribute('aria-pressed') !== 'true') || els.find(x => own(x) === n(text));
    if (!e) return false; e.scrollIntoView({ block: 'center' }); return true;
  }, [sel, text]);
  if (!done) throw new Error('nicht gefunden: ' + sel + ' "' + text + '"');
  const loc = p.locator(sel).filter({ hasText: text });
  const handles = await loc.elementHandles();
  for (const h of handles) {
    const own = await h.evaluate(e => { const c = e.cloneNode(true); c.querySelectorAll('.de,.sol,.box').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); });
    const pressed = await h.getAttribute('aria-pressed');
    const dis = await h.evaluate(e => e.disabled);
    if (own === text.replace(/\s+/g, ' ').trim() && pressed !== 'true' && !dis) { await h.click(); return; }
  }
  for (const h of handles) { const own = await h.evaluate(e => e.textContent.replace(/\s+/g, ' ').trim()); if (own.startsWith(text)) { await h.click(); return; } }
  throw new Error('nicht klickbar: ' + text);
}

// Antworten eintragen (richtig oder absichtlich falsch)
async function answer(p, tk, right) {
  if (tk.type === 'choice') {
    const good = tk.options.filter(o => o.ok), bad = tk.options.filter(o => !o.ok);
    if (right) for (const o of good) await clickText(p, '.opt', o.t);
    else await clickText(p, '.opt', bad[0].t);
  } else if (tk.type === 'gaps') {
    const g = parseGaps(tk.text);
    for (let i = 0; i < g.length; i++) {
      if (g[i].pick) { const o = right ? g[i].opts[g[i].ok[0]] : g[i].opts.find((_, j) => !g[i].ok.includes(j)); await clickText(p, '.pick button[data-g="' + i + '"]', o); }
      else {
        const inp = p.locator('input.gap[data-g="' + i + '"]');
        if (await inp.getAttribute('readonly') !== null) continue;
        const fbk = Object.keys(tk.feedback || {})[0];
        await inp.fill(right ? g[i].ans[0] : (i === 0 && fbk ? fbk : 'xyzq'));
      }
    }
  } else if (tk.type === 'match') {
    for (let i = 0; i < tk.pairs.length; i++) {
      const target = right ? tk.pairs[i][1] : tk.pairs[(i + 1) % tk.pairs.length][1];
      await clickText(p, '[data-tile]', target);
      await p.click('[data-drop="s' + i + '"]');
    }
  } else if (tk.type === 'sort') {
    for (const it of tk.items) { await clickText(p, '[data-tile]', it.t); await p.click('[data-drop="c' + (right ? it.c : (it.c + 1) % tk.categories.length) + '"]'); }
  } else if (tk.type === 'order') {
    if (!right) return;
    for (let guard = 0; guard < 60; guard++) {
      const cur = await p.$$eval('.order li .txt', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
      const want = tk.items.map(x => x.replace(/\*\*|\*/g, ''));
      const pos = cur.findIndex((x, i) => x !== want[i]);
      if (pos < 0) break;
      const from = cur.indexOf(want[pos]);
      await p.click('[data-up="' + from + '"]');
    }
  } else if (tk.type === 'mark') {
    const targets = (tk.text.match(/\[([^\]]+)\]/g) || []).map(x => x.slice(1, -1));
    if (right) for (const w of targets) await clickText(p, '.w', w);
    else { const words = tk.text.replace(/\[[^\]]+\]/g, '').match(/[A-Za-z]+/g); await clickText(p, '.w', words[words.length - 1]); }
  } else if (tk.type === 'write') {
    await p.click('textarea.write');
    const base = 'Last weekend I went to the lake with my friends. Suddenly it started to rain and we ran under a big tree. Then we waited for an hour. Finally the sun came out again and we walked home together. It was a funny day and I laughed a lot.';
    await p.keyboard.type(base, { delay: 0 });
    const boxes = await p.$$('.selfcheck input[type=checkbox]');
    for (const b of boxes) await b.check();
  }
}

async function goTo(p, act) { await p.click('[data-act="' + act + '"]'); await p.waitForTimeout(120); }
async function noOverflow(p, label) {
  const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok(o.sw <= o.cw + 1, label + ': waagrechtes Scrollen (' + o.sw + ' > ' + o.cw + ')');
  const ph = await p.evaluate(() => (document.body.innerText.match(/\{[a-zA-Z]+\}|undefined|NaN/g) || []).join(' '));
  ok(!ph, label + ': Platzhalter oder undefined im Text: ' + ph);
}
async function start(p, name) {
  await p.fill('#ab-name', name);
  const cls = await p.$('#ab-cls'); if (cls) await cls.fill(S.class || '2A');
  const segs = await p.$$('[data-cls]'); if (segs.length) await segs[0].click();
  if (await p.$('#ab-decl')) await p.check('#ab-decl');
  await goTo(p, 'start');
}

// Ganzer Durchlauf; mode: 'right' | 'wrong' (erst falsch, dann richtig) | 'skipfirst'
async function playThrough(p, mode, extra) {
  const seen = [];
  for (let guard = 0; guard < 200; guard++) {
    const id = await curTask(p);
    if (!id) break;
    if (seen.includes(id) && mode !== 'skipfirst') throw new Error('Aufgabe doppelt besucht: ' + id);
    seen.push(id);
    const tk = TASKS[id];
    if (extra && extra.before) await extra.before(p, tk);
    if (tk.type !== 'info') {
      if (mode === 'wrong' && tk.type !== 'write') {
        await answer(p, tk, false);
        if (await p.$('[data-act="check"]')) {
          await goTo(p, 'check');
          const fb = await p.$('.fb.no, .fb.info');
          ok(!!fb, id + ': nach falscher Antwort keine Rückmeldung');
          if ((S.settings || {}).attempts > 1 || (S.settings || {}).attempts === undefined) {
            if (await p.$('[data-act="check"]')) { await answer(p, tk, true); await goTo(p, 'check'); ok(!!(await p.$('.fb.ok')), id + ': zweiter Versuch richtig, aber keine grüne Rückmeldung'); }
          }
        }
      } else {
        await answer(p, tk, true);
        if (await p.$('[data-act="check"]')) { await goTo(p, 'check'); ok(!!(await p.$('.fb.ok')), id + ': richtige Antwort nicht als richtig erkannt'); }
      }
    }
    if (shotsDir && extra && extra.shot) await extra.shot(p, id);
    await goTo(p, 'next');
  }
  return seen;
}

function pdfPayload(file) {
  const out = execFileSync('python3', ['-I', '-c', `
import sys,json,base64,hashlib
from pypdf import PdfReader
r=PdfReader(sys.argv[1]); m=r.metadata
raw=base64.b64decode(str(m['/Subject'])[4:]).decode()
want=hashlib.sha256((raw+'|'+sys.argv[2]).encode()).hexdigest()[:24]
txt='\\n'.join(p.extract_text() or '' for p in r.pages)
print(json.dumps({'P':json.loads(raw),'sum':str(m['/Keywords'])=='ab-sum:'+want,'pages':len(r.pages),'text':txt}))
`, file, META.salt]);
  return JSON.parse(out.toString());
}

(async () => {
  const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  const tmp = fs.mkdtempSync('/tmp/abtest-');
  if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

  /* 1: alles richtig, mit Hinweis, Pause, Fenster verlassen, Einfügen, Kopieren, Neuladen */
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    const p = await open(ctx);
    ok(p._errs.length === 0, 'Konsole beim Laden: ' + p._errs.join(' | '));
    await goTo(p, 'start');
    ok(await p.isVisible('.fb.no'), 'Start ohne Namen wird nicht verhindert');
    await start(p, 'Anna');
    let st = await state(p);
    ok(st && st.status === 'run' && /^[A-Z2-9]{6}$/.test(st.code), 'Startzustand/Variantencode fehlt');
    let usedHint = false, pasted = false, copied = false, blurred = false, reloaded = false, paused = false;
    const seen = await playThrough(p, 'right', {
      before: async (p, tk) => {
        if (tk.type === 'gaps' && !pasted && parseGaps(tk.text).some(g => !g.pick)) {
          pasted = true;
          await p.evaluate(() => navigator.clipboard.writeText('pasted text'));
          await p.click('input.gap:not([readonly])');
          await p.keyboard.press('Control+V');
          const v = await p.$eval('input.gap:not([readonly])', e => e.value);
          ok(v === '', 'Einfügen per Strg+V wurde nicht blockiert (Wert: "' + v + '")');
          await p.evaluate(() => { const i = document.querySelector('input.gap:not([readonly])'); const dt = new DataTransfer(); dt.setData('text/plain', 'x'); i.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
          ok(await p.isVisible('.toast'), 'kein Hinweis nach blockiertem Einfügen');
          await p.fill('input.gap:not([readonly])', 'a long dictated phrase here');
          await p.fill('input.gap:not([readonly])', '');
        }
        if (tk.hints && tk.hints.length && !usedHint && tk.type === 'gaps') { usedHint = true; await goTo(p, 'hint'); ok(await p.isVisible('.hint'), 'Hinweis wird nicht angezeigt'); }
        if (tk.type === 'choice' && !copied) {
          copied = true;
          await p.evaluate(() => { const h = document.querySelector('main h2'); const r = document.createRange(); r.selectNodeContents(h); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
          await p.keyboard.press('Control+C');
          const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
          ok(!clip.includes(tk.title), 'Aufgabentext ließ sich kopieren');
        }
        if (tk.type === 'match' || (tk.type === 'mark' && !blurred)) {
          if (!blurred) {
            blurred = true;
            const other = await ctx.newPage(); await other.goto('about:blank'); await other.bringToFront(); await p.waitForTimeout(300);
            const realBlur = await p.isVisible('#ab-ov');
            note('echter Fensterwechsel (zweiter Tab) blendet aus: ' + (realBlur ? 'ja' : 'nein, headless meldet keinen Fokusverlust'));
            await other.close(); await p.bringToFront();
            if (!realBlur) { await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await p.waitForTimeout(100); }
            ok(await p.isVisible('#ab-ov [data-act="return"]'), 'Aufgaben werden beim Verlassen nicht ausgeblendet');
            const hiddenCovers = await p.evaluate(() => { const o = document.getElementById('ab-ov'); const r = o.getBoundingClientRect(); return r.width >= innerWidth - 1 && r.height >= innerHeight - 1 && getComputedStyle(o).backgroundColor !== 'rgba(0, 0, 0, 0)'; });
            ok(hiddenCovers, 'Überlagerung deckt die Aufgaben nicht vollständig ab');
            await p.evaluate(() => window.dispatchEvent(new Event('focus')));
            await goTo(p, 'return');
          }
          if (!paused) {
            paused = true;
            await p.click('[data-act="pause"]'); await p.waitForTimeout(100);
            ok(await p.isVisible('#ab-ov [data-act="resume"]'), 'Pause zeigt keine Überlagerung');
            await p.evaluate(() => window.dispatchEvent(new Event('blur')));
            await goTo(p, 'resume');
          }
        }
        if (tk.type === 'order' && !reloaded) {
          reloaded = true;
          const before = await curTask(p);
          await p.reload(); await p.waitForTimeout(250);
          ok(await p.isVisible('[data-act="continue"]'), 'nach Neuladen kein Willkommen-zurück-Bildschirm');
          await goTo(p, 'continue');
          ok(await curTask(p) === before, 'nach Neuladen nicht dieselbe Aufgabe');
        }
      }
    });
    st = await state(p);
    const kinds = k => st.log.filter(x => x.k === k).length;
    ok(kinds('einfügen') >= 1, 'Einfüge-Versuch nicht protokolliert');
    ok(kinds('kopieren') >= 1, 'Kopier-Versuch nicht protokolliert');
    ok(kinds('verlassen') === 1 && kinds('zurück') === 1, 'Fensterwechsel falsch protokolliert: ' + st.log.filter(x => !['prüfen','text'].includes(x.k)).map(x => x.k + (x.why ? '(' + x.why + ')' : '')).join(' > '));
    ok(kinds('pause') === 1 && kinds('pause-ende') === 1, 'Pause falsch protokolliert');
    ok(kinds('einschub') >= 1, 'großer Einschub nicht protokolliert');
    ok(kinds('weiter') === 1, 'Neuladen nicht protokolliert');
    if (S.route) ok(st.track === 'plus', 'Weg sollte plus sein, ist ' + st.track);
    ok(seen.length > 0, 'keine Aufgaben besucht');
    // Abgabe
    ok(await p.isVisible('[data-act="handin"]'), 'Abgabe-Bildschirm fehlt');
    await goTo(p, 'handin');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.modal [data-act="yes"]')]);
    const pdfFile = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(pdfFile);
    ok(/_Anna_/.test(dl.suggestedFilename()), 'Dateiname ohne Namen: ' + dl.suggestedFilename());
    const R = pdfPayload(pdfFile);
    ok(R.sum, 'Prüfsumme im PDF stimmt nicht');
    const visibleTasks = seen.map(id => TASKS[id]).filter(t => t.type !== 'info' && t.type !== 'write');
    const expectMax = visibleTasks.reduce((s, t) => s + maxPts(t), 0);
    const hintTask = visibleTasks.find(t => t.type === 'gaps' && t.hints && t.hints.length);
    const expectAuto = expectMax - (hintTask ? ((S.settings || {}).hintCost != null ? S.settings.hintCost : 1) : 0);
    ok(R.P.autoMax === expectMax, 'Maximalpunkte im PDF ' + R.P.autoMax + ', erwartet ' + expectMax);
    ok(Math.abs(R.P.auto - expectAuto) < 0.01, 'Punkte im PDF ' + R.P.auto + ', erwartet ' + expectAuto);
    ok(R.P.name === 'Anna' && R.P.declared === true, 'Name/Selbstständigkeit fehlt im PDF');
    ok(R.text.includes('Abgabeprotokoll') && R.text.includes('Anna'), 'PDF-Text unvollständig');
    const w = R.P.tasks.find(t => t.type === 'write');
    if (w) ok(w.text && w.text.startsWith('Last weekend') && w.words > 30, 'offener Text fehlt in den PDF-Daten');
    ok(R.P.stats.leaves === 1 && R.P.stats.paste >= 1, 'Protokollzahlen im PDF falsch');
    ok(!/[?]{2,}/.test(R.text), 'PDF enthält ?? (Zeichen nicht darstellbar)');
    note('PDF: ' + R.pages + ' Seiten, ' + R.P.auto + '/' + R.P.autoMax + ' Punkte, aktive Zeit ' + Math.round(R.P.activeMs / 1000) + ' s');
    fs.copyFileSync(pdfFile, path.join(tmp, 'abgabe_richtig.pdf'));
    // nach der Abgabe gesperrt, PDF neu ladbar
    await p.reload(); await p.waitForTimeout(250);
    ok(await p.isVisible('[data-act="pdf"]'), 'nach Abgabe und Neuladen kein „PDF noch einmal“');
    ok(!(await p.$('[data-task]')), 'nach der Abgabe sind Aufgaben noch erreichbar');
    // Auswertung
    const out = execFileSync('python3', [path.join(ROOT, 'tools', 'auswerten.py'), '--meta', htmlPath.replace(/\.html$/, '.meta.json'), '--out', path.join(tmp, 'uebersicht.xlsx'), pdfFile]).toString();
    ok(/1 Abgaben gelesen/.test(out) && !/auffällig/.test(out), 'auswerten.py: ' + out.trim());
    ok(p._errs.length === 0, 'Konsolenfehler im Durchlauf: ' + p._errs.join(' | '));
    const csp = await p.evaluate(() => window.__csp); ok(csp.length === 0, 'CSP-Verstöße: ' + csp.join(', '));
    const ext = p._reqs.filter(u => !u.startsWith('file://') && !u.startsWith('blob:') && !u.startsWith('data:'));
    ok(ext.length === 0, 'Netzwerkzugriffe: ' + ext.join(', '));
    await ctx.close();
  }

  /* 2: Fehler, zweiter Versuch, Lösung, Weg basis, Neustart */
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, isMobile: true, hasTouch: true });
    const p = await open(ctx);
    await start(p, 'Ben');
    const code1 = (await state(p)).code;
    // Neustart prüfen
    await p.reload(); await p.waitForTimeout(200); await goTo(p, 'continue');
    await p.reload(); await p.waitForTimeout(200);
    await p.click('text=' + (S.lang === 'de' ? 'Neu beginnen' : 'Start again'));
    await goTo(p, 'yes');
    ok(await p.isVisible('#ab-name'), 'Neu beginnen führt nicht zum Start');
    await start(p, 'Ben');
    const st0 = await state(p);
    ok(st0.restarts === 1 && st0.code !== code1, 'Neustart nicht gezählt oder gleicher Code');
    // Weg basis erzwingen: erste Station falsch und beim zweiten Versuch ebenfalls falsch
    for (let guard = 0; guard < 100; guard++) {
      const id = await curTask(p); if (!id) break;
      const tk = TASKS[id];
      const inRoute = S.route && S.route.from.includes(tk._st || S.stations.find(s => s.tasks.some(x => x.id === id || (x.tasks || []).some(c => c.id === id))).id);
      if (tk.type !== 'info' && tk.type !== 'write') {
        await answer(p, tk, false);
        if (await p.$('[data-act="check"]')) {
          await goTo(p, 'check');
          if (await p.$('[data-act="check"]')) {
            if (inRoute) { await goTo(p, 'check'); } else { await answer(p, tk, true); await goTo(p, 'check'); }
          }
          if (inRoute) {
            ok(!!(await p.$('.fb.info')), id + ': nach dem letzten Versuch keine Lösung');
            const sol = await p.$('.sol, .opt.should, .w.miss, .fb.info ol');
            ok(!!sol, id + ': Lösung wird nicht angezeigt');
          }
        }
      }
      if (tk.type === 'write') await answer(p, tk, true);
      await noOverflow(p, 'Handy ' + id);
      await goTo(p, 'next');
    }
    const st = await state(p);
    if (S.route) ok(st.track === 'basis', 'Weg sollte basis sein, ist ' + st.track);
    const later = Object.entries(st.tasks).filter(([id, s]) => s.att === 2 && s.f === 1);
    ok(later.every(([id, s]) => Math.abs(s.raw - (S.settings && S.settings.laterFactor != null ? S.settings.laterFactor : 0.5)) < 0.01 || s.raw < 1), 'Teilpunkte im zweiten Versuch falsch');
    await goTo(p, 'handin');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.modal [data-act="yes"]')]);
    const pdfFile = path.join(tmp, 'abgabe_fehler.pdf'); await dl.saveAs(pdfFile);
    const R = pdfPayload(pdfFile);
    ok(R.sum && R.P.restarts === 1, 'PDF nach Neustart: Prüfsumme/Neustarts falsch');
    ok(R.text.includes('Lösung:'), 'PDF zeigt keine Lösungen bei Fehlern');
    note('Handy-Durchlauf mit Fehlern: ' + R.P.auto + '/' + R.P.autoMax + ' Punkte, Weg ' + R.P.track);
    ok(p._errs.length === 0, 'Konsolenfehler (Handy): ' + p._errs.join(' | '));
    await ctx.close();
  }

  /* 3: Modus "end" (Rückmeldung erst nach der Abgabe) mit derselben Datei, umgebaut */
  {
    const endSheet = JSON.parse(JSON.stringify(S)); endSheet.id = S.id + '-end'; endSheet.settings = Object.assign({}, S.settings, { feedback: 'end' }); endSheet.lang = 'de'; endSheet.class = null; endSheet.classes = null;
    const sp = path.join(tmp, 'end.json'); fs.writeFileSync(sp, JSON.stringify(endSheet));
    execFileSync('python3', [path.join(ROOT, 'tools', 'build.py'), sp, '--salt', 'test', '--out', tmp]);
    const ctx = await b.newContext({ viewport: { width: 1024, height: 768 }, acceptDownloads: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + path.join(tmp, endSheet.id + '.html'));
    await start(p, 'Cem');
    for (let guard = 0; guard < 100; guard++) {
      const id = await curTask(p); if (!id) break;
      ok(!(await p.$('[data-act="check"]')), id + ': Modus end zeigt trotzdem „Prüfen“');
      await noOverflow(p, 'Deutsch/end ' + id);
      if (TASKS[id].type !== 'info') await answer(p, TASKS[id], true);
      await goTo(p, 'next');
    }
    await noOverflow(p, 'Deutsch/end Abgabe');
    ok(await p.isVisible('text=Abgeben und PDF erstellen'), 'deutscher Abgabeknopf fehlt');
    await goTo(p, 'handin');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.modal [data-act="yes"]')]);
    await p.waitForTimeout(200); await noOverflow(p, 'Deutsch/end Ergebnis');
    const f = path.join(tmp, 'abgabe_end.pdf'); await dl.saveAs(f);
    const m2 = JSON.parse(fs.readFileSync(path.join(tmp, endSheet.id + '.meta.json')));
    const raw = JSON.parse(execFileSync('python3', ['-I', '-c', "import sys,base64;from pypdf import PdfReader;print(base64.b64decode(str(PdfReader(sys.argv[1]).metadata['/Subject'])[4:]).decode())", f]).toString());
    ok(raw.auto === raw.autoMax, 'Modus end: alles richtig, aber ' + raw.auto + '/' + raw.autoMax);
    ok(errs.length === 0, 'Modus end Fehler: ' + errs.join(' | '));
    await ctx.close();
  }

  /* 3b: Zuordnen und Sortieren nur mit der Tastatur */
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await open(ctx);
    await start(p, 'Eva');
    const kb = Object.values(TASKS).find(t => t.type === 'match' || t.type === 'sort');
    if (kb) {
      // zur Aufgabe springen über die Übersicht
      let found = false;
      for (let guard = 0; guard < 40 && !found; guard++) { const id = await curTask(p); if (!id) break; if (TASKS[id] === kb) { found = true; break; } if (TASKS[id].type !== 'info' && TASKS[id].type !== 'write') { await answer(p, TASKS[id], false); while (await p.$('[data-act="check"]')) await goTo(p, 'check'); } await goTo(p, 'next'); }
      if (found) {
        const pairs = kb.type === 'match' ? kb.pairs.map((pr, i) => [pr[1], 's' + i]) : kb.items.map(it => [it.t, 'c' + it.c]);
        for (const [label, target] of pairs) {
          const tiles = await p.$$('[data-tile]');
          for (const h of tiles) { if ((await h.innerText()).trim() === label && !(await h.evaluate(e => e.disabled))) { await h.focus(); await p.keyboard.press('Enter'); break; } }
          await p.focus('[data-drop="' + target + '"]'); await p.keyboard.press('Enter');
        }
        await p.focus('[data-act="check"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
        ok(!!(await p.$('.fb.ok')), 'Zuordnen/Sortieren mit Tastatur nicht lösbar');
      } else note('Tastaturtest: Aufgabe liegt auf einem anderen Weg, übersprungen');
    }
    await ctx.close();
  }

  /* 4: Layout auf drei Größen, jede Aufgabe einmal */
  for (const vp of [{ w: 390, h: 844, n: 'handy' }, { w: 768, h: 1024, n: 'tablet' }, { w: 1366, h: 768, n: 'laptop' }]) {
    const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 500, hasTouch: vp.w < 1000 });
    const p = await open(ctx);
    await noOverflow(p, vp.n + ' Start');
    if (shotsDir) await p.screenshot({ path: path.join(shotsDir, vp.n + '_00_start.png'), fullPage: true });
    await start(p, 'Dora');
    let k = 0;
    for (let guard = 0; guard < 100; guard++) {
      const id = await curTask(p); if (!id) break;
      await noOverflow(p, vp.n + ' ' + id);
      const covered = await p.evaluate(() => { const a = document.querySelector('.actions'), c = document.querySelector('[data-task]'); if (!a || !c) return false; const pad = parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom); return a.offsetHeight > pad; });
      ok(!covered, vp.n + ' ' + id + ': Knopfleiste höher als der Freiraum unten');
      if (shotsDir) await p.screenshot({ path: path.join(shotsDir, vp.n + '_' + String(++k).padStart(2, '0') + '_' + id + '.png'), fullPage: true });
      if (TASKS[id].type !== 'info') { await answer(p, TASKS[id], true); if (await p.$('[data-act="check"]')) await goTo(p, 'check'); }
      if (shotsDir) await p.screenshot({ path: path.join(shotsDir, vp.n + '_' + String(k).padStart(2, '0') + 'b_' + id + '.png'), fullPage: true });
      await goTo(p, 'next');
    }
    await noOverflow(p, vp.n + ' Abgabe');
    if (shotsDir) await p.screenshot({ path: path.join(shotsDir, vp.n + '_99_abgabe.png'), fullPage: true });
    ok(p._errs.length === 0, vp.n + ': ' + p._errs.join(' | '));
    await ctx.close();
  }

  await b.close();
  results.forEach(r => console.log(r));
  console.log((fails ? 'NICHT BESTANDEN' : 'BESTANDEN') + ': ' + passes + ' Prüfungen ok, ' + fails + ' Fehler. Testdateien: ' + tmp);
  process.exit(fails ? 1 : 0);
})().catch(e => { results.forEach(r => console.log(r)); console.error('ABBRUCH:', e.message); process.exit(1); });
