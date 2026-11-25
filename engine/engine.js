/* html-arbeitsblatt · Engine
   Liest die verschleierten Blattdaten, steuert Ablauf, Prüfung, Hinweise, Protokoll und PDF-Abgabe.
   Alles läuft lokal im Browser: kein Server, keine externen Dateien (Content-Security-Policy: connect-src 'none'). */
(function () {
  'use strict';

  /* ---------- Hilfsfunktionen ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => Date.now();
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const round1 = x => Math.round(x * 10) / 10;
  const fmtPts = x => { const r = round1(x); return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', LANG === 'de' ? ',' : '.'); };
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (attrs[k] == null || attrs[k] === false) continue;
      if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* SHA-256 (für Prüfsumme und Seed) */
  function sha256(str) {
    const bytes = new TextEncoder().encode(str);
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const l = bytes.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
    m.set(bytes); m[l] = 0x80;
    const bits = l * 8, dv = new DataView(m.buffer);
    dv.setUint32(n - 4, bits >>> 0); dv.setUint32(n - 8, Math.floor(bits / 4294967296));
    const w = new Uint32Array(64), r = (x, k) => (x >>> k) | (x << (32 - k));
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  function rngFrom(seedStr) {
    let s = parseInt(sha256(seedStr).slice(0, 8), 16) >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffled(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const range = n => Array.from({ length: n }, (_, i) => i);
  function b64ToBytes(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function utf8ToB64(str) { const b = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }

  /* Text-Normalisierung für getippte Antworten */
  const CONTR = [
    [/\bcan't\b/g, 'can not'], [/\bcannot\b/g, 'can not'], [/\bwon't\b/g, 'will not'], [/\bshan't\b/g, 'shall not'],
    [/\b(\w+)n't\b/g, '$1 not'], [/\bi'm\b/g, 'i am'], [/\b(you|we|they)'re\b/g, '$1 are'], [/\b(he|she|it|that|there|what|who)'s\b/g, '$1 is'],
    [/\b(i|you|we|they)'ve\b/g, '$1 have'], [/\b(i|you|he|she|it|we|they)'ll\b/g, '$1 will']
  ];
  function norm(s, keepCase) {
    let x = String(s == null ? '' : s).replace(/[‘’‛`´]/g, "'").replace(/[“”„]/g, '"').replace(/ /g, ' ');
    x = x.trim().replace(/\s+/g, ' ').replace(/^["']+|["']+$/g, '').replace(/\s*([.!?]+)$/, '').replace(/\s+([,;:])/g, '$1');
    if (!keepCase) x = x.toLowerCase();
    let y = keepCase ? x.toLowerCase() : x;
    for (const [re, rep] of CONTR) y = y.replace(re, rep);
    if (keepCase) { return y === x.toLowerCase() ? x : y; }
    return y;
  }
  function dist(a, b) { // Damerau-Levenshtein (optimal string alignment)
    const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9;
    const d = range(m + 1).map(i => { const r = new Array(n + 1).fill(0); r[0] = i; return r; });
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  const countWords = s => (String(s || '').match(/[A-Za-zÄÖÜäöüß0-9]+(?:['’\-][A-Za-zÄÖÜäöüß0-9]+)*/g) || []).length;

  /* Markdown light: **fett**, *kursiv*, Absätze, Listen mit "- ", Zeilenumbruch */
  function mdInline(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\n/g, '<br>'); }
  function md(s) {
    return String(s || '').split(/\n{2,}/).map(block => {
      const lines = block.split('\n');
      if (lines.every(l => /^\s*-\s+/.test(l))) return '<ul>' + lines.map(l => '<li>' + mdInline(l.replace(/^\s*-\s+/, '')) + '</li>').join('') + '</ul>';
      return '<p>' + mdInline(block) + '</p>';
    }).join('');
  }

  /* Bild (vom Build als data-URI eingebettet) */
  function pic(img, cls) {
    if (!img || !img.src) return '';
    let src = img.src;
    if (src.startsWith('#img:')) { const n = document.getElementById('ab-img-' + src.slice(5)); src = n ? n.textContent.trim() : ''; }
    const cap = img.caption ? '<figcaption>' + mdInline(img.caption) + (HELP_DE && img.captionDe ? '<span class="de">' + esc(img.captionDe) + '</span>' : '') + '</figcaption>' : '';
    return '<figure class="pic protect' + (cls ? ' ' + cls : '') + '"><img src="' + esc(src) + '" alt="' + esc(img.alt || '') + '" draggable="false"' + (img.w && img.h ? ' width="' + img.w + '" height="' + img.h + '"' : '') + '>' + cap + '</figure>';
  }

  /* ---------- Daten laden ---------- */
  const dataEl = document.getElementById('ab-data');
  let S;
  try {
    const key = b64ToBytes(dataEl.getAttribute('data-k')), raw = b64ToBytes(dataEl.textContent.trim());
    for (let i = 0; i < raw.length; i++) raw[i] ^= key[i % key.length];
    S = JSON.parse(new TextDecoder().decode(raw));
  } catch (e) { document.body.innerHTML = '<main><div class="card"><h2>Dieses Arbeitsblatt ist beschädigt.</h2><p>Bitte die Datei neu herunterladen.</p></div></main>'; return; }
  const SALT = dataEl.getAttribute('data-k');

  const CFG = Object.assign({ feedback: 'instant', attempts: 2, laterFactor: 0.5, hintCost: 1, typoFactor: 1, allowSkip: true, allowPause: true, selfDeclaration: true, revealAfterSubmit: true }, S.settings || {});
  const SURV = Object.assign({ paste: true, copy: true, focus: true, time: true, print: true }, (S.settings || {}).surveillance || {});
  const LANG = S.lang === 'de' ? 'de' : 'en';
  const HELP_DE = LANG === 'en' && S.helpDe !== false;
  const SUBMIT_TO = S.submitTo || 'Google Classroom';
  const INSTANT = CFG.feedback !== 'end';

  /* ---------- Texte ---------- */
  const L = {
    en: {
      how: 'How it works', instant: 'You get feedback as soon as you check a task.',
      end: 'You only see your results after you hand in.',
      tries1: 'You have one try per task.', triesN: 'You have {n} tries per task. You get full points on the first try and {p} % of the points later.',
      hintsCost: 'Hints help you. Each hint costs {c}.', hintsFree: 'Hints help you and they are free.',
      pause: 'You can take a break and go on later. Your answers stay on this device.',
      skip: 'Stuck? Skip a task and come back to it later.',
      open: 'Your teacher marks the writing tasks.',
      submit: 'At the end you create a PDF and upload it to {to}.',
      logHead: 'Please note', logTime: 'This worksheet records how long you work on it.',
      logFocus: 'If you leave this window or tab, the tasks are hidden. This is written down in the record.',
      logPaste: 'Pasting into answer boxes is switched off. Attempts are written down.',
      logCopy: 'Copying the tasks is switched off.', logPdf: 'The record goes to your teacher with your PDF.',
      who: 'Who is working?', name: 'First name', nameHelp: 'If someone in your class has the same first name, add your surname.',
      cls: 'Class', declare: 'I am doing this worksheet on my own, without AI tools and without help from others.',
      go: "Let's go", needName: 'Please write your first name.', needCls: 'Please write your class.', needDecl: 'Please tick the box first.',
      check: 'Check', next: 'Next', back: 'Back', hint: 'Hint', skipBtn: 'Skip for now', save: 'Save', overview: 'Overview', pauseBtn: 'Pause',
      points: '{n} points', point: '1 point', correct: 'Correct!', allRight: 'All correct!', notYet: 'Not quite yet.',
      triesLeft: 'Try again. Tries left: {n}.', solution: 'Here is the solution.', partly: '{a} of {b} correct.',
      typo: 'Watch the spelling', teacherMarks: 'Your teacher marks this task.', saved: 'Saved.',
      words: '{n} words', aim: 'Aim: {min} to {max} words', aimMin: 'At least {min} words', tryUse: 'Try to use these words:', selfCheck: 'Check your text:',
      hintN: 'Hint {i} of {n}', hintCostNote: '(costs {c})', noHints: 'No more hints.',
      pausedH: 'Break', pausedP: 'Your answers are saved. The tasks are hidden while you take a break.', resume: 'Go on',
      awayH: 'Tasks hidden', awayP: 'You left the worksheet window. This is written down in the record.', awayBack: 'Back to the worksheet',
      pasteBlocked: 'Pasting is switched off here. Type your answer yourself.', copyBlocked: 'Copying is switched off on this worksheet.',
      ovTitle: 'Overview', stDone: 'done', stOpen: 'open', stSkip: 'skipped', stPart: 'started', stTeacher: 'for your teacher', stInfo: 'read',
      locked: 'Opens after: {s}', toEnd: 'Hand in',
      sumTitle: 'Hand in', sumIntro: 'Check the list. When you are ready, hand in and create your PDF.',
      warnOpen: 'Not finished yet:', warnShort: 'Too short:', handIn: 'Hand in and create PDF',
      sureH: 'Hand in now?', sureP: 'After handing in you cannot change your answers any more.', sureYes: 'Hand in', sureNo: 'Not yet',
      doneH: 'Handed in!', doneP: 'Your PDF {file} has been downloaded. Upload it to {to}.', again: 'Download the PDF again',
      doneFind: 'Can’t find it? Look in your Downloads folder. On an iPad or iPhone: Files app → Downloads.', results: 'Your results',
      welcome: 'Welcome back, {name}!', welcomeP: 'Your answers are still here. You can go on where you stopped.', cont: 'Go on', restart: 'Start again',
      restartH: 'Start again?', restartP: 'All your answers will be deleted. A new start is written down in the record.', restartYes: 'Delete and start again',
      noStore: 'This browser cannot save your progress. Do not close or reload the page.',
      station: 'Station', task: 'Task', of: 'of', variant: 'Version', pts: 'Points', total: 'Total', yourPts: 'Your points',
      pending: 'Your teacher still has to mark {n} points.', readOn: 'Read this, then go on.', newPath: 'The next tasks fit what you showed so far.'
    },
    de: {
      how: 'So funktioniert das Arbeitsblatt', instant: 'Nach dem Prüfen bekommst du sofort eine Rückmeldung.',
      end: 'Deine Ergebnisse siehst du erst nach der Abgabe.',
      tries1: 'Du hast pro Aufgabe einen Versuch.', triesN: 'Du hast pro Aufgabe {n} Versuche. Beim ersten Versuch bekommst du volle Punkte, danach {p} % der Punkte.',
      hintsCost: 'Hinweise helfen dir. Jeder Hinweis kostet {c}.', hintsFree: 'Hinweise helfen dir und kosten nichts.',
      pause: 'Du kannst Pause machen und später weitermachen. Deine Antworten bleiben auf diesem Gerät gespeichert.',
      skip: 'Kommst du nicht weiter, überspring die Aufgabe und mach sie später.',
      open: 'Die Schreibaufgaben bewertet deine Lehrperson.',
      submit: 'Am Ende erstellst du ein PDF und lädst es in {to} hoch.',
      logHead: 'Bitte beachten', logTime: 'Die Bearbeitungszeit wird protokolliert.',
      logFocus: 'Verlässt du dieses Fenster oder diesen Tab, werden die Aufgaben ausgeblendet. Das wird im Protokoll vermerkt.',
      logPaste: 'Einfügen in die Antwortfelder ist deaktiviert. Versuche werden protokolliert.',
      logCopy: 'Kopieren der Aufgaben ist deaktiviert.', logPdf: 'Das Protokoll geht mit deinem PDF an deine Lehrperson.',
      who: 'Wer arbeitet?', name: 'Vorname', nameHelp: 'Hat jemand in deiner Klasse denselben Vornamen, schreib auch deinen Nachnamen dazu.',
      cls: 'Klasse', declare: 'Ich bearbeite das Arbeitsblatt selbstständig, ohne KI-Werkzeuge und ohne Hilfe von anderen.',
      go: "Los geht's", needName: 'Bitte schreib deinen Vornamen.', needCls: 'Bitte schreib deine Klasse.', needDecl: 'Bitte zuerst das Kästchen ankreuzen.',
      check: 'Prüfen', next: 'Weiter', back: 'Zurück', hint: 'Hinweis', skipBtn: 'Später', save: 'Speichern', overview: 'Übersicht', pauseBtn: 'Pause',
      points: '{n} Punkte', point: '1 Punkt', correct: 'Richtig!', allRight: 'Alles richtig!', notYet: 'Noch nicht ganz.',
      triesLeft: 'Versuch es noch einmal. Übrige Versuche: {n}.', solution: 'Hier ist die Lösung.', partly: '{a} von {b} richtig.',
      typo: 'Achte auf die Schreibung', teacherMarks: 'Diese Aufgabe bewertet deine Lehrperson.', saved: 'Gespeichert.',
      words: '{n} Wörter', aim: 'Ziel: {min} bis {max} Wörter', aimMin: 'Mindestens {min} Wörter', tryUse: 'Versuch, diese Wörter zu verwenden:', selfCheck: 'Überprüfe deinen Text:',
      hintN: 'Hinweis {i} von {n}', hintCostNote: '(kostet {c})', noHints: 'Keine weiteren Hinweise.',
      pausedH: 'Pause', pausedP: 'Deine Antworten sind gespeichert. Während der Pause sind die Aufgaben ausgeblendet.', resume: 'Weitermachen',
      awayH: 'Aufgaben ausgeblendet', awayP: 'Du hast das Fenster des Arbeitsblatts verlassen. Das wird im Protokoll vermerkt.', awayBack: 'Zurück zum Arbeitsblatt',
      pasteBlocked: 'Einfügen ist hier deaktiviert. Tipp deine Antwort selbst ein.', copyBlocked: 'Kopieren ist bei diesem Arbeitsblatt deaktiviert.',
      ovTitle: 'Übersicht', stDone: 'erledigt', stOpen: 'offen', stSkip: 'übersprungen', stPart: 'begonnen', stTeacher: 'für die Lehrperson', stInfo: 'gelesen',
      locked: 'Öffnet sich nach: {s}', toEnd: 'Abgabe',
      sumTitle: 'Abgabe', sumIntro: 'Schau die Liste durch. Wenn du fertig bist, gib ab und erstelle dein PDF.',
      warnOpen: 'Noch nicht fertig:', warnShort: 'Zu kurz:', handIn: 'Abgeben und PDF erstellen',
      sureH: 'Jetzt abgeben?', sureP: 'Nach der Abgabe kannst du deine Antworten nicht mehr ändern.', sureYes: 'Abgeben', sureNo: 'Noch nicht',
      doneH: 'Abgegeben!', doneP: 'Dein PDF {file} wurde heruntergeladen. Lade es in {to} hoch.', again: 'PDF noch einmal herunterladen',
      doneFind: 'Du findest es nicht? Schau im Ordner „Downloads“ nach. Am iPad oder iPhone: App „Dateien“ → „Downloads“.', results: 'Deine Ergebnisse',
      welcome: 'Willkommen zurück, {name}!', welcomeP: 'Deine Antworten sind noch da. Du kannst dort weitermachen, wo du aufgehört hast.', cont: 'Weitermachen', restart: 'Neu beginnen',
      restartH: 'Neu beginnen?', restartP: 'Alle Antworten werden gelöscht. Der Neustart wird im Protokoll vermerkt.', restartYes: 'Löschen und neu beginnen',
      noStore: 'Dieser Browser kann deinen Fortschritt nicht speichern. Schließ die Seite nicht und lade sie nicht neu.',
      station: 'Station', task: 'Aufgabe', of: 'von', variant: 'Variante', pts: 'Punkte', total: 'Gesamt', yourPts: 'Deine Punkte',
      pending: 'Deine Lehrperson bewertet noch {n} Punkte.', readOn: 'Lies das, dann geht es weiter.', newPath: 'Die nächsten Aufgaben passen zu dem, was du bisher gezeigt hast.'
    }
  };
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : '{' + k + '}'));
  const t = (k, v) => fill(L[LANG][k] != null ? L[LANG][k] : L.de[k], v);
  const tde = (k, v) => fill(L.de[k], v);
  /* zweisprachig: englischer Text, darunter Deutsch (nur bei englischen Blättern mit helpDe) */
  const tb = (k, v) => HELP_DE ? esc(t(k, v)) + '<span class="de">' + esc(tde(k, v)) + '</span>' : esc(t(k, v));
  const ptsLabel = n => (n === 1 ? t('point') : t('points', { n: fmtPts(n) }));
  const costLabel = c => (LANG === 'de' ? (c === 1 ? '1 Punkt' : fmtPts(c) + ' Punkte') : (c === 1 ? '1 point' : fmtPts(c) + ' points'));
  const sx = (o, k) => (o && o[k] != null ? o[k] : '');
  const deLine = (o, k) => (HELP_DE && o && o[k + 'De'] ? '<span class="de">' + mdInline(o[k + 'De']) + '</span>' : '');

  /* ---------- Speicher ---------- */
  const KEY = 'ab:' + S.id + ':v' + (S.version || 1);
  const KEY_RS = KEY + ':neustarts';
  let canStore = true;
  function sGet(k) { try { return localStorage.getItem(k); } catch (e) { canStore = false; return null; } }
  function sSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { canStore = false; return false; } }
  function sDel(k) { try { localStorage.removeItem(k); } catch (e) { /* egal */ } }
  try { const tk = KEY + ':probe'; localStorage.setItem(tk, '1'); localStorage.removeItem(tk); } catch (e) { canStore = false; }

  let state = null;
  try { state = JSON.parse(sGet(KEY) || 'null'); } catch (e) { state = null; }
  if (state && state.sheetHash !== S.hash) state = null; // Blatt wurde geändert: alter Stand passt nicht mehr
  let saveTimer = null;
  function save(soon) {
    if (!state) return;
    state.savedAt = now();
    if (soon) { clearTimeout(saveTimer); saveTimer = setTimeout(() => sSet(KEY, JSON.stringify(state)), 400); }
    else { clearTimeout(saveTimer); sSet(KEY, JSON.stringify(state)); }
  }
  function log(k, d) { if (!state) return; state.log.push(Object.assign({ t: now(), k: k }, d || {})); save(true); }

  /* ---------- Aufgaben-Verzeichnis ---------- */
  const STATIONS = S.stations || [];
  const TASKS = {};          // id -> Aufgabe (mit _station)
  const POOLS = {};          // id -> Pool
  STATIONS.forEach(st => (st.tasks || []).forEach(tk => {
    if (tk.type === 'pool') { POOLS[tk.id] = tk; tk.tasks.forEach(c => { c._station = st.id; c._pool = tk.id; TASKS[c.id] = c; }); }
    else { tk._station = st.id; TASKS[tk.id] = tk; }
  }));
  const STATION = id => STATIONS.find(s => s.id === id);

  function newState(name, cls, declared) {
    const code = makeCode();
    const st = {
      v: 1, sheetHash: S.hash, status: 'run', name, cls, declared, code,
      startedAt: now(), submittedAt: null, savedAt: now(), track: null,
      cur: 0, screen: 'task', tasks: {}, picks: {}, views: {}, log: [], activeMs: 0,
      restarts: parseInt(sGet(KEY_RS) || '0', 10) || 0
    };
    const rnd = rngFrom(code + '|pool');
    Object.values(POOLS).forEach(p => { st.picks[p.id] = shuffled(p.tasks.map(c => c.id), rnd).slice(0, p.pick || 1); });
    return st;
  }
  function makeCode() {
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', u = new Uint32Array(6);
    (window.crypto || window.msCrypto).getRandomValues(u);
    return Array.from(u, x => A[x % A.length]).join('');
  }
  function taskList(station) {
    const out = [];
    (station.tasks || []).forEach(tk => { if (tk.type === 'pool') (state.picks[tk.id] || []).forEach(id => out.push(TASKS[id])); else out.push(tk); });
    return out;
  }
  function stationVisible(st) { return !st.track || !S.route || state.track === null || st.track === state.track; }
  function stationLocked(st) { return !!(st.track && S.route && state.track === null); }
  function flow() {
    const f = [];
    STATIONS.forEach(st => { if (stationVisible(st)) taskList(st).forEach(tk => f.push({ s: st, t: tk, locked: stationLocked(st) })); });
    return f;
  }

  /* ---------- Aufgabenzustand ---------- */
  function TS(id) { return state.tasks[id] || (state.tasks[id] = { resp: null, att: 0, hints: 0, f: 0, raw: 0, final: false, skipped: false, time: 0, items: null, done: false }); }
  function rnd(id, salt) { return rngFrom(state.code + '|' + id + '|' + (salt || '')); }
  function view(tk) { // gemischte Reihenfolgen, einmal pro Variante festgelegt
    if (state.views[tk.id]) return state.views[tk.id];
    const v = TYPES[tk.type].view ? TYPES[tk.type].view(tk, rnd(tk.id)) : {};
    state.views[tk.id] = v; return v;
  }
  const isTeacher = tk => tk.type === 'write';
  const isInfo = tk => tk.type === 'info';
  function maxPts(tk) { if (isInfo(tk)) return 0; if (tk.points != null) return tk.points; return TYPES[tk.type].items(tk); }
  function earned(tk) {
    const st = state.tasks[tk.id]; if (!st || isTeacher(tk) || isInfo(tk)) return 0;
    return Math.max(0, st.raw * maxPts(tk) - st.hints * (CFG.hintCost || 0));
  }
  function status(tk) {
    const st = state.tasks[tk.id];
    if (isInfo(tk)) return st && st.seen ? 'info' : 'open';
    if (!st) return 'open';
    if (isTeacher(tk)) return st.done ? 'teacher' : (st.skipped ? 'skip' : (st.resp && st.resp.text ? 'part' : 'open'));
    if (INSTANT) { if (st.final) return 'done'; if (st.skipped) return 'skip'; if (st.att > 0 || hasResp(tk, st.resp)) return 'part'; return 'open'; }
    if (st.done) return 'done'; if (st.skipped) return 'skip'; return hasResp(tk, st.resp) ? 'part' : 'open';
  }
  function hasResp(tk, r) {
    if (r == null) return false;
    if (Array.isArray(r)) return r.some(x => x != null && x !== '' && !(Array.isArray(x) && !x.length));
    if (typeof r === 'object') return !!r.text;
    return r !== '';
  }

  /* ---------- Aufgabentypen ---------- */
  const TYPES = {};

  /* Auswahl (eine oder mehrere richtige Antworten) */
  TYPES.choice = {
    items: tk => 1,
    view: (tk, r) => ({ order: tk.shuffle === false ? range(tk.options.length) : shuffled(range(tk.options.length), r) }),
    multi: tk => tk.multi || tk.options.filter(o => o.ok).length > 1,
    render(tk, st, box, api) {
      const v = view(tk), multi = this.multi(tk), sel = new Set(st.resp || []);
      const hasPics = tk.options.some(o => o.img);
      const wrap = el('div', { class: 'opts' + (hasPics ? ' pics' : ''), role: multi ? 'group' : 'radiogroup' });
      v.order.forEach(i => {
        const o = tk.options[i];
        const b = el('button', { type: 'button', class: 'opt protect' + (multi ? ' multi' : ''), 'aria-pressed': sel.has(i) ? 'true' : 'false', 'data-i': i },
          '<span class="box" aria-hidden="true"></span><span class="otxt">' + (o.img ? pic(o.img, 'opt-pic') : '') + mdInline(o.t) + (HELP_DE && o.de ? '<span class="de">' + esc(o.de) + '</span>' : '') + '</span>');
        if (st.final) b.disabled = true;
        if (st.items) {
          if (sel.has(i) && st.items.ok) b.classList.add('ok');
          if (sel.has(i) && st.items.wrongSel && st.items.wrongSel.includes(i)) b.classList.add('no');
          if (st.final && o.ok && !sel.has(i)) b.classList.add('should');
        }
        b.addEventListener('click', () => {
          if (st.final) return;
          if (multi) { sel.has(i) ? sel.delete(i) : sel.add(i); b.setAttribute('aria-pressed', sel.has(i)); }
          else { sel.clear(); sel.add(i); $$('.opt', wrap).forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); }
          $$('.opt', wrap).forEach(x => x.classList.remove('ok', 'no'));
          st.resp = Array.from(sel); api.changed();
        });
        wrap.appendChild(b);
      });
      box.appendChild(wrap);
    },
    grade(tk, resp) {
      const sel = resp || [], good = tk.options.map((o, i) => o.ok ? i : -1).filter(i => i >= 0);
      const wrongSel = sel.filter(i => !tk.options[i].ok), rightSel = sel.filter(i => tk.options[i].ok);
      const f = this.multi(tk) ? clamp((rightSel.length - wrongSel.length) / good.length, 0, 1) : (rightSel.length === 1 && sel.length === 1 ? 1 : 0);
      const fbs = wrongSel.map(i => tk.options[i].fb).filter(Boolean);
      return { f, items: { ok: f === 1, wrongSel, fbs, n: good.length, right: rightSel.length } };
    },
    feedback(tk, st) { return (st.items.fbs || []).map(mdInline); },
    progress(tk, st) { return st.items.ok ? null : (this.multi(tk) ? [st.items.right, st.items.n] : null); },
    solution(tk) { return tk.options.filter(o => o.ok).map(o => o.t).join(' | '); },
    answer(tk, st) { return (st.resp || []).map(i => tk.options[i].t).join(' | ') || '—'; }
  };

  /* Lückentext: {{went}}, {{didn't go|did not go}}, Auswahl {{*went|goed}} */
  function parseGaps(tk) {
    if (tk._gaps) return tk._gaps;
    const gaps = [];
    String(tk.text).replace(/\{\{(.+?)\}\}/g, (_, inner) => {
      const parts = inner.split('|').map(s => s.trim());
      if (parts.some(p => p.startsWith('*'))) gaps.push({ pick: true, opts: parts.map(p => p.replace(/^\*/, '')), ok: parts.map((p, i) => p.startsWith('*') ? i : -1).filter(i => i >= 0) });
      else gaps.push({ pick: false, ans: parts });
      return '';
    });
    tk._gaps = gaps; return gaps;
  }
  TYPES.gaps = {
    items: tk => parseGaps(tk).length,
    view(tk, r) {
      const g = parseGaps(tk), v = { picks: g.map(x => x.pick ? shuffled(range(x.opts.length), r) : null) };
      if (tk.bank) v.bank = shuffled(g.filter(x => !x.pick).map(x => x.ans[0]).concat(tk.bankExtra || []), r);
      return v;
    },
    render(tk, st, box, api) {
      const g = parseGaps(tk), v = view(tk), resp = st.resp || g.map(() => '');
      st.resp = resp;
      const items = st.items || [];
      let lastFocus = null;
      if (v.bank) {
        const bank = el('div', { class: 'bank protect' }, '<span class="lbl">' + (LANG === 'de' ? 'Wörter' : 'Word bank') + '</span>');
        v.bank.forEach(w => {
          const b = el('button', { type: 'button' }, esc(w));
          b.addEventListener('click', () => {
            const inp = lastFocus && !lastFocus.readOnly ? lastFocus : $$('input.gap', box).find(x => !x.readOnly && !x.value.trim());
            if (!inp) return;
            inp.value = w; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus();
          });
          bank.appendChild(b);
        });
        box.appendChild(bank);
      }
      let n = 0;
      const ph = String(tk.text).replace(/\{\{(.+?)\}\}/g, () => '\u0001' + (n++) + '\u0002');
      let html = md(ph);
      html = html.replace(/\u0001(\d+)\u0002/g, (_, i) => {
        i = +i; const gp = g[i], it = items[i] || {}, cls = it.ok === true ? ' ok' : it.ok === 'typo' ? ' typo' : (it.ok === false && st.att > 0 ? ' no' : '');
        const lock = st.final || it.ok === true || it.ok === 'typo';
        const num = g.length > 1 ? '<span class="gapnum">' + (i + 1) + '</span>' : '';
        if (gp.pick) {
          return '<span class="pick' + cls + '" role="radiogroup" data-g="' + i + '">' + v.picks[i].map(j =>
            '<button type="button" data-g="' + i + '" data-o="' + j + '" aria-pressed="' + (resp[i] === gp.opts[j] ? 'true' : 'false') + '"' + (lock ? ' disabled' : '') + '>' + esc(gp.opts[j]) + '</button>').join('') + '</span>' + num;
        }
        const w = clamp(Math.max.apply(null, gp.ans.map(a => a.length)) + 2, 4, 34);
        return '<input class="gap' + cls + '" data-g="' + i + '" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" size="' + w + '" style="width:' + (w * 0.62 + 1) + 'em;max-width:100%" aria-label="' + (LANG === 'de' ? 'Lücke ' : 'Gap ') + (i + 1) + '" value="' + esc(resp[i] || '') + '"' + (lock ? ' readonly' : '') + '>' + num;
      });
      const txt = el('div', { class: 'gaptext' }, html);
      box.appendChild(txt);
      $$('input.gap', txt).forEach(inp => {
        inp.addEventListener('focus', () => { lastFocus = inp; });
        inp.addEventListener('input', () => { resp[+inp.dataset.g] = inp.value; inp.classList.remove('no'); markBank(); api.changed(); });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const all = $$('input.gap', txt).filter(x => !x.readOnly); const k = all.indexOf(inp); if (k >= 0 && k < all.length - 1) all[k + 1].focus(); else api.enter(); } });
      });
      $$('.pick button', txt).forEach(b => b.addEventListener('click', () => {
        const i = +b.dataset.g; resp[i] = g[i].opts[+b.dataset.o];
        $$('button[data-g="' + i + '"]', txt).forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        b.parentElement.classList.remove('no'); api.changed();
      }));
      function markBank() { if (!v.bank) return; const used = resp.map(x => norm(x)); $$('.bank button', box).forEach(b => b.classList.toggle('used', used.includes(norm(b.textContent)))); }
      markBank();
    },
    grade(tk, resp, st) {
      const g = parseGaps(tk), fbMap = {}, gfb = tk.gapFeedback || {};
      Object.keys(tk.feedback || {}).forEach(k => { fbMap[norm(k)] = tk.feedback[k]; });
      const prev = (st && st.items) || [];
      const items = g.map((gp, i) => {
        if (prev[i] && (prev[i].ok === true || prev[i].ok === 'typo')) return prev[i];
        const given = (resp || [])[i] || '';
        if (gp.pick) {
          const j = gp.opts.indexOf(given);
          const ok = j >= 0 && gp.ok.includes(j);
          const specific = (gfb[i + 1] || {})[given] || fbMap[norm(given)];
          return { ok, fb: ok ? null : (given ? specific || null : null), empty: !given };
        }
        const n = norm(given, tk.caseSensitive);
        if (!n) return { ok: false, empty: true };
        if (gp.ans.some(a => norm(a, tk.caseSensitive) === n)) return { ok: true };
        const gmap = {}; Object.keys(gfb[i + 1] || {}).forEach(k => { gmap[norm(k)] = gfb[i + 1][k]; });
        const specific = gmap[n] || fbMap[n];
        if (tk.typo && !specific && gp.ans.some(a => norm(a).length >= 5 && dist(norm(a), n) <= 1)) return { ok: 'typo' };
        return { ok: false, fb: specific || null };
      });
      const f = items.reduce((s, it) => s + (it.ok === true ? 1 : it.ok === 'typo' ? CFG.typoFactor : 0), 0) / g.length;
      return { f, items };
    },
    feedback(tk, st) {
      const out = [];
      st.items.forEach((it, i) => {
        const lab = parseGaps(tk).length > 1 ? (i + 1) + ': ' : '';
        if (it.ok === 'typo') out.push(lab + esc(t('typo')) + ' → <span class="sol">' + esc(parseGaps(tk)[i].ans[0]) + '</span>');
        else if (it.ok === false && it.fb) out.push(lab + mdInline(it.fb));
      });
      return out;
    },
    progress(tk, st) { const ok = st.items.filter(x => x.ok === true || x.ok === 'typo').length; return ok < st.items.length ? [ok, st.items.length] : null; },
    reveal(tk, st, box) { // Lösung neben falsche Lücken schreiben
      parseGaps(tk).forEach((gp, i) => {
        const it = st.items[i]; if (!it || it.ok === true || it.ok === 'typo') return;
        const anchor = gp.pick ? $('.pick[data-g="' + i + '"]', box) : $('input.gap[data-g="' + i + '"]', box);
        if (anchor) anchor.insertAdjacentHTML('afterend', ' <span class="sol">✓ ' + esc(gp.pick ? gp.opts[gp.ok[0]] : gp.ans[0]) + '</span>');
      });
    },
    solution(tk) { return parseGaps(tk).map((gp, i) => (i + 1) + ') ' + (gp.pick ? gp.ok.map(j => gp.opts[j]).join(' / ') : gp.ans.join(' / '))).join('   '); },
    answer(tk, st) { return parseGaps(tk).map((gp, i) => (i + 1) + ') ' + (((st.resp || [])[i] || '').trim() || '—')).join('   '); },
    itemMarks(tk, st) { return (st.items || []).map(x => x.ok === true ? '+' : x.ok === 'typo' ? '~' : '-'); }
  };

  /* Kacheln ziehen oder antippen (Zuordnen und Sortieren) */
  function tileBoard(box, opts) {
    // opts: tiles [{id,label}], targets [{id, el}], place(tileId, targetId|null), getPos(tileId)->targetId|null, locked(tileId)->bool, multi
    let armed = null;
    const pool = el('div', { class: 'pool', 'data-drop': 'pool' }, '<span class="lbl">' + (LANG === 'de' ? 'Tippe eine Karte an, dann ihr Ziel. Oder zieh sie hin.' : 'Tap a card, then tap where it goes. Or drag it.') + '</span>');
    box.insertBefore(pool, box.firstChild);
    const tiles = {};
    opts.tiles.forEach(tl => { tiles[tl.id] = el('button', { type: 'button', class: 'tile protect', 'data-tile': tl.id, 'aria-pressed': 'false' }, mdInline(tl.label)); });
    function layout() {
      opts.tiles.forEach(tl => {
        const pos = opts.getPos(tl.id), b = tiles[tl.id];
        const host = pos == null ? pool : opts.targetIn(pos);
        if (b.parentElement !== host) host.appendChild(b);
        b.disabled = !!opts.locked(tl.id);
        b.classList.remove('ok', 'no');
        const m = opts.mark(tl.id); if (m) b.classList.add(m);
      });
      $$('[data-drop]', box).forEach(x => x.classList.toggle('armed', !!armed && x.dataset.drop !== 'pool'));
    }
    function arm(id) { armed = armed === id ? null : id; Object.keys(tiles).forEach(k => tiles[k].setAttribute('aria-pressed', k === String(armed) ? 'true' : 'false')); layout(); }
    function drop(target) { if (armed == null) return; opts.place(armed, target === 'pool' ? null : target); armed = null; Object.values(tiles).forEach(b => b.setAttribute('aria-pressed', 'false')); layout(); }
    box.addEventListener('click', e => {
      const tile = e.target.closest('[data-tile]');
      if (tile && box.contains(tile)) {
        if (tile.disabled) return; if (tile._dragged) { tile._dragged = false; return; }
        // Eine Karte ist gewählt und man tippt auf eine schon abgelegte Karte: dorthin ablegen (volle Spalten am Tablet)
        const host = tile.parentElement && tile.parentElement.closest('[data-drop]');
        if (armed != null && String(armed) !== tile.dataset.tile && host && box.contains(host) && host.dataset.drop !== 'pool') { drop(host.dataset.drop); e.stopPropagation(); return; }
        arm(tile.dataset.tile); e.stopPropagation(); return;
      }
      const d = e.target.closest('[data-drop]');
      if (d && box.contains(d) && armed != null) drop(d.dataset.drop);
    });
    // Ziehen mit Zeiger (Maus, Finger, Stift)
    let drag = null;
    box.addEventListener('pointerdown', e => {
      const tile = e.target.closest('[data-tile]'); if (!tile || tile.disabled || e.button > 0) return;
      drag = { tile, x: e.clientX, y: e.clientY, on: false, ghost: null, id: e.pointerId };
    });
    window.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) {
        drag.on = true; drag.ghost = drag.tile.cloneNode(true); drag.ghost.classList.add('ghost'); drag.ghost.style.width = drag.tile.offsetWidth + 'px'; document.body.appendChild(drag.ghost);
        drag.tile.style.opacity = '.35';
      }
      if (drag.on) {
        e.preventDefault();
        drag.ghost.style.left = (e.clientX - drag.tile.offsetWidth / 2) + 'px'; drag.ghost.style.top = (e.clientY - 22) + 'px';
        const under = document.elementFromPoint(e.clientX, e.clientY), d = under && under.closest('[data-drop]');
        $$('[data-drop]', box).forEach(x => x.classList.toggle('over', x === d));
      }
    }, { passive: false });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.on) {
        const under = document.elementFromPoint(e.clientX, e.clientY), d = under && under.closest('[data-drop]');
        drag.ghost.remove(); drag.tile.style.opacity = ''; drag.tile._dragged = true;
        setTimeout(() => { if (drag && drag.tile) drag.tile._dragged = false; }, 0);
        $$('[data-drop]', box).forEach(x => x.classList.remove('over'));
        if (d && box.contains(d)) { armed = drag.tile.dataset.tile; drop(d.dataset.drop); }
      }
      drag = null;
    }
    window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', e => { if (drag && drag.ghost) drag.ghost.remove(); if (drag) drag.tile.style.opacity = ''; drag = null; });
    // Tastatur: Ziele sind fokussierbar, Eingabe oder Leertaste legt die gewählte Karte ab
    $$('[data-drop]', box).forEach(d => {
      d.tabIndex = 0; d.setAttribute('role', 'button');
      d.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === d) { e.preventDefault(); if (armed != null) drop(d.dataset.drop); } });
    });
    layout();
    return { layout };
  }

  /* Zuordnen: pairs [["go","went"], ...], extra [...] */
  TYPES.match = {
    items: tk => tk.pairs.length,
    view: (tk, r) => ({ right: shuffled(range(tk.pairs.length + (tk.extra || []).length), r) }),
    label(tk, j) { return j < tk.pairs.length ? tk.pairs[j][1] : tk.extra[j - tk.pairs.length]; },
    render(tk, st, box, api) {
      const v = view(tk), n = tk.pairs.length; st.resp = st.resp || new Array(n).fill(null);
      const resp = st.resp, items = st.items || [];
      const list = el('div', { class: 'pairs' });
      tk.pairs.forEach((p, i) => {
        const row = el('div', { class: 'pair' }, '<div class="left protect">' + mdInline(p[0]) + '</div>');
        const slot = el('div', { class: 'slot', 'data-drop': 's' + i, 'aria-label': p[0] });
        if (items[i] && st.att > 0) slot.classList.add(items[i].ok ? 'ok' : 'no');
        row.appendChild(slot); list.appendChild(row);
      });
      box.appendChild(list);
      tileBoard(box, {
        tiles: v.right.map(j => ({ id: String(j), label: this.label(tk, j) })),
        getPos: id => { const i = resp.indexOf(+id); return i < 0 ? null : 's' + i; },
        targetIn: pos => $('[data-drop="' + pos + '"]', list),
        locked: id => { const i = resp.indexOf(+id); return st.final || (i >= 0 && items[i] && items[i].ok); },
        mark: () => null,
        place: (id, target) => {
          const j = +id, old = resp.indexOf(j); if (old >= 0) resp[old] = null;
          if (target) { const i = +target.slice(1); if (items[i] && items[i].ok) { if (old >= 0) resp[old] = j; return; } resp[i] = j; const s = $('[data-drop="' + target + '"]', list); s.classList.remove('no'); }
          api.changed();
        }
      });
    },
    grade(tk, resp, st) {
      const items = tk.pairs.map((p, i) => ({ ok: (resp || [])[i] === i, empty: (resp || [])[i] == null }));
      return { f: items.filter(x => x.ok).length / items.length, items };
    },
    progress(tk, st) { const ok = st.items.filter(x => x.ok).length; return ok < st.items.length ? [ok, st.items.length] : null; },
    reveal(tk, st, box) { tk.pairs.forEach((p, i) => { if (!st.items[i].ok) { const s = $('[data-drop="s' + i + '"]', box); s && s.insertAdjacentHTML('beforeend', '<span class="sol">✓ ' + esc(p[1]) + '</span>'); } }); },
    solution(tk) { return tk.pairs.map(p => p[0] + ' = ' + p[1]).join('   '); },
    answer(tk, st) { return tk.pairs.map((p, i) => p[0] + ' = ' + ((st.resp || [])[i] == null ? '—' : this.label(tk, st.resp[i]))).join('   '); },
    itemMarks(tk, st) { return (st.items || []).map(x => x.ok ? '+' : '-'); }
  };

  /* Sortieren: categories ["Regular","Irregular"], items [{t:"played", c:0}] */
  TYPES.sort = {
    items: tk => tk.items.length,
    view: (tk, r) => ({ order: shuffled(range(tk.items.length), r) }),
    render(tk, st, box, api) {
      const v = view(tk); st.resp = st.resp || new Array(tk.items.length).fill(null);
      const resp = st.resp, items = st.items || [];
      const wrap = el('div', { class: 'buckets' });
      tk.categories.forEach((c, k) => {
        const b = el('div', { class: 'bucket', 'data-drop': 'c' + k }, '<h3 class="protect">' + mdInline(c) + '</h3><div class="in"></div>');
        wrap.appendChild(b);
      });
      box.appendChild(wrap);
      tileBoard(box, {
        tiles: v.order.map(i => ({ id: String(i), label: tk.items[i].t })),
        getPos: id => resp[+id] == null ? null : 'c' + resp[+id],
        targetIn: pos => $('[data-drop="' + pos + '"] .in', wrap),
        locked: id => st.final || (items[+id] && items[+id].ok),
        mark: id => (st.att > 0 && items[+id] && resp[+id] != null) ? (items[+id].ok ? 'ok' : 'no') : null,
        place: (id, target) => { if (items[+id] && items[+id].ok) return; resp[+id] = target ? +target.slice(1) : null; if (items[+id]) items[+id] = { ok: false }; api.changed(); }
      });
    },
    grade(tk, resp) { const items = tk.items.map((it, i) => ({ ok: (resp || [])[i] === it.c })); return { f: items.filter(x => x.ok).length / items.length, items }; },
    progress(tk, st) { const ok = st.items.filter(x => x.ok).length; return ok < st.items.length ? [ok, st.items.length] : null; },
    reveal(tk, st, box) { tk.items.forEach((it, i) => { if (!st.items[i].ok) { const b = $('[data-tile="' + i + '"]', box); b && b.insertAdjacentHTML('beforeend', ' <span class="sol">→ ' + esc(tk.categories[it.c]) + '</span>'); } }); },
    solution(tk) { return tk.categories.map((c, k) => c + ': ' + tk.items.filter(i => i.c === k).map(i => i.t).join(', ')).join('   '); },
    answer(tk, st) { return tk.categories.map((c, k) => c + ': ' + tk.items.filter((it, i) => (st.resp || [])[i] === k).map(i => i.t).join(', ')).join('   '); },
    itemMarks(tk, st) { return (st.items || []).map(x => x.ok ? '+' : '-'); }
  };

  /* Reihenfolge: items in richtiger Reihenfolge, angezeigt gemischt */
  TYPES.order = {
    items: tk => 1,
    view(tk, r) { let o; let k = 0; do { o = shuffled(range(tk.items.length), r); k++; } while (o.every((x, i) => x === i) && k < 20); return { order: o }; },
    render(tk, st, box, api) {
      st.resp = st.resp || view(tk).order.slice();
      const resp = st.resp, ol = el('ol', { class: 'order' });
      const lock = st.final;
      function draw() {
        ol.innerHTML = '';
        resp.forEach((ix, pos) => {
          const li = el('li', { 'data-pos': pos });
          if (st.att > 0 && st.items && st.items.pos) li.classList.add(st.items.pos[pos] ? 'ok' : 'no');
          li.innerHTML = (lock ? '' : '<span class="grip" aria-hidden="true"></span>') + '<span class="num">' + (pos + 1) + '</span><span class="txt protect">' + mdInline(tk.items[ix]) + '</span>' +
            (lock ? '' : '<span class="mv"><button type="button" data-up="' + pos + '" aria-label="' + (LANG === 'de' ? 'nach oben' : 'move up') + '"' + (pos === 0 ? ' disabled' : '') + '>▲</button><button type="button" data-down="' + pos + '" aria-label="' + (LANG === 'de' ? 'nach unten' : 'move down') + '"' + (pos === resp.length - 1 ? ' disabled' : '') + '>▼</button></span>');
          ol.appendChild(li);
        });
      }
      function move(a, b) { const x = resp.splice(a, 1)[0]; resp.splice(b, 0, x); if (st.items) st.items.pos = null; draw(); api.changed(); }
      ol.addEventListener('click', e => {
        const u = e.target.closest('[data-up]'), d = e.target.closest('[data-down]');
        if (u) { const p = +u.dataset.up; move(p, p - 1); const nb = $('[data-up="' + (p - 1) + '"]', ol) || $('[data-down="' + (p - 1) + '"]', ol); nb && nb.focus(); }
        if (d) { const p = +d.dataset.down; move(p, p + 1); const nb = $('[data-down="' + (p + 1) + '"]', ol) || $('[data-up="' + (p + 1) + '"]', ol); nb && nb.focus(); }
      });
      let drag = null;
      ol.addEventListener('pointerdown', e => { const g = e.target.closest('.grip'); if (!g || lock) return; const li = g.closest('li'); drag = { from: +li.dataset.pos, li, id: e.pointerId }; li.classList.add('lift'); e.preventDefault(); });
      window.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return; e.preventDefault();
        const lis = $$('li', ol); let to = lis.length - 1;
        for (let i = 0; i < lis.length; i++) { const r = lis[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { to = i; break; } }
        if (to !== drag.from) { move(drag.from, to); drag.from = to; drag.li = $$('li', ol)[to]; drag.li.classList.add('lift'); }
      }, { passive: false });
      window.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) { drag.li && drag.li.classList.remove('lift'); drag = null; } });
      draw(); box.appendChild(ol);
    },
    grade(tk, resp) {
      const r = resp || [], n = r.length; let adj = 0;
      for (let i = 0; i < n - 1; i++) if (r[i + 1] === r[i] + 1) adj++;
      const pos = r.map((x, i) => x === i), f = n > 1 ? adj / (n - 1) : 1;
      return { f: pos.every(Boolean) ? 1 : f, items: { ok: pos.every(Boolean), pos, adj, n } };
    },
    progress(tk, st) { return st.items.ok ? null : [st.items.pos.filter(Boolean).length, st.items.n]; },
    reveal(tk, st, box) { const sol = tk.items.map((x, i) => (i + 1) + '. ' + x); box.insertAdjacentHTML('beforeend', '<div class="fb info"><b>' + esc(t('solution')) + '</b><ol class="protect" style="margin:.3em 0 0;padding-left:1.4em">' + tk.items.map(x => '<li>' + mdInline(x) + '</li>').join('') + '</ol></div>'); },
    solution(tk) { return tk.items.map((x, i) => (i + 1) + '. ' + x).join('   '); },
    answer(tk, st) { return (st.resp || []).map((ix, i) => (i + 1) + '. ' + tk.items[ix]).join('   '); },
    itemMarks(tk, st) { return st.items && st.items.pos ? st.items.pos.map(x => x ? '+' : '-') : []; }
  };

  /* Markieren: text mit [Ziel] oder [Ziel aus mehreren Wörtern] */
  function parseMark(tk) {
    if (tk._mark) return tk._mark;
    const toks = [], re = /\[([^\]]+)\]|([A-Za-zÄÖÜäöüß0-9’'\-]+)|(\n{2,})|(\s+)|([^\sA-Za-zÄÖÜäöüß0-9’'\-\[\]]+)/g;
    let m, wi = 0;
    while ((m = re.exec(tk.text))) {
      if (m[1]) toks.push({ w: true, i: wi++, target: true, s: m[1] });
      else if (m[2]) toks.push({ w: true, i: wi++, target: false, s: m[2] });
      else if (m[3]) toks.push({ br: true });
      else toks.push({ s: m[0] });
    }
    tk._mark = toks; return toks;
  }
  TYPES.mark = {
    items: tk => parseMark(tk).filter(x => x.target).length,
    render(tk, st, box, api) {
      const toks = parseMark(tk), sel = new Set(st.resp || []), it = st.items;
      const p = el('div', { class: 'marktext' });
      let html = '';
      toks.forEach(x => {
        if (x.br) html += '<br><br>';
        else if (x.w) {
          let cls = 'w';
          if (it && st.att > 0) { if (sel.has(x.i)) cls += x.target ? ' ok' : ' no'; else if (st.final && x.target) cls += ' miss'; }
          html += '<button type="button" class="' + cls + '" data-w="' + x.i + '" aria-pressed="' + (sel.has(x.i) ? 'true' : 'false') + '"' + (st.final || (it && sel.has(x.i) && x.target && st.att > 0) ? ' disabled' : '') + '>' + esc(x.s) + '</button>';
        } else html += esc(x.s);
      });
      p.innerHTML = html;
      p.addEventListener('click', e => {
        const b = e.target.closest('[data-w]'); if (!b || b.disabled) return;
        const i = +b.dataset.w; sel.has(i) ? sel.delete(i) : sel.add(i);
        b.setAttribute('aria-pressed', sel.has(i)); b.classList.remove('no', 'ok');
        st.resp = Array.from(sel); api.changed();
      });
      box.appendChild(p);
    },
    grade(tk, resp) {
      const toks = parseMark(tk), targets = toks.filter(x => x.target).map(x => x.i), sel = new Set(resp || []);
      const hits = targets.filter(i => sel.has(i)).length, falses = Array.from(sel).filter(i => !targets.includes(i)).length;
      return { f: clamp((hits - falses) / targets.length, 0, 1), items: { hits, falses, n: targets.length, ok: hits === targets.length && falses === 0 } };
    },
    feedback(tk, st) {
      const it = st.items, out = [];
      if (it.ok) return out;
      if (it.hits < it.n) out.push(LANG === 'de' ? 'Es fehlen noch ' + (it.n - it.hits) + ' Stellen.' : (it.n - it.hits) + (it.n - it.hits === 1 ? ' word is' : ' words are') + ' still missing.');
      if (it.falses) out.push(LANG === 'de' ? it.falses + ' Markierung(en) passen nicht (rot).' : it.falses + (it.falses === 1 ? ' marked word does not fit (red).' : ' marked words do not fit (red).'));
      return out;
    },
    progress() { return null; },
    solution(tk) { return parseMark(tk).filter(x => x.target).map(x => x.s).join(', '); },
    answer(tk, st) { const toks = parseMark(tk); return (st.resp || []).slice().sort((a, b) => a - b).map(i => toks.find(x => x.w && x.i === i).s).join(', ') || '—'; },
    itemMarks(tk, st) { return st.items ? [st.items.hits + '/' + st.items.n + (st.items.falses ? ', ' + st.items.falses + ' falsch markiert' : '')] : []; }
  };

  /* Freies Schreiben: bewertet die Lehrperson */
  TYPES.write = {
    items: () => 1,
    render(tk, st, box, api) {
      st.resp = st.resp || { text: '', checks: (tk.checklist || []).map(() => false) };
      const r = st.resp;
      if (tk.useWords && tk.useWords.length) {
        box.insertAdjacentHTML('beforeend', '<div class="small protect">' + tb('tryUse') + '</div>');
        const uw = el('div', { class: 'usewords protect' }); tk.useWords.forEach(w => uw.appendChild(el('span', { 'data-w': w }, esc(w)))); box.appendChild(uw);
      }
      if (tk.starter) box.appendChild(el('div', { class: 'starter protect' }, mdInline(tk.starter)));
      const ta = el('textarea', { class: 'text write', rows: tk.rows || 10, spellcheck: 'false', autocorrect: 'off', autocapitalize: 'sentences', 'aria-label': LANG === 'de' ? 'Dein Text' : 'Your text' });
      ta.value = r.text || ''; if (st.final) ta.readOnly = true;
      box.appendChild(ta);
      const wc = el('div', { class: 'wc' }); box.appendChild(wc);
      function upd() {
        const n = countWords(ta.value), mn = tk.minWords || 0, mx = tk.maxWords || 0;
        const cls = mn && n < mn ? 'low' : (mx && n > mx ? 'high' : 'good');
        wc.innerHTML = '<span class="count ' + cls + '">' + esc(t('words', { n })) + '</span><span class="small">' + esc(mx ? t('aim', { min: mn, max: mx }) : (mn ? t('aimMin', { min: mn }) : '')) + '</span>';
        const low = ta.value.toLowerCase();
        $$('.usewords span', box).forEach(s => { const w = s.dataset.w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); s.classList.toggle('used', new RegExp('(^|[^a-z])' + w + '([^a-z]|$)').test(low)); });
      }
      ta.addEventListener('input', () => { r.text = ta.value; st.done = false; upd(); api.changed(true); });
      upd();
      if (tk.checklist && tk.checklist.length) {
        const sc = el('div', { class: 'selfcheck' }, '<div class="prompt">' + tb('selfCheck') + '</div>');
        tk.checklist.forEach((c, i) => {
          const lab = el('label', { class: 'check' });
          const cb = el('input', { type: 'checkbox' }); cb.checked = !!r.checks[i]; if (st.final) cb.disabled = true;
          cb.addEventListener('change', () => { r.checks[i] = cb.checked; api.changed(); });
          lab.appendChild(cb); lab.appendChild(el('span', { class: 'protect' }, mdInline(c) + (HELP_DE && tk.checklistDe && tk.checklistDe[i] ? '<span class="de">' + esc(tk.checklistDe[i]) + '</span>' : '')));
          sc.appendChild(lab);
        });
        box.appendChild(sc);
      }
    },
    solution(tk) { return LANG === 'de' ? 'Bewertet die Lehrperson.' : 'Marked by the teacher.'; },
    answer(tk, st) { return (st.resp && st.resp.text) || '—'; }
  };

  /* Information, Lesetext, Mustertext, Wortschatz */
  TYPES.info = {
    items: () => 0,
    render(tk, st, box) {
      const style = tk.style || 'text';
      let inner = '';
      if (tk.text) {
        if (tk.lines) inner += '<ol class="lines">' + String(tk.text).split(/\n+/).filter(x => x.trim()).map(x => '<li>' + mdInline(x) + '</li>').join('') + '</ol>';
        else inner += md(tk.text);
      }
      if (tk.textDe && HELP_DE) inner += '<div class="de">' + md(tk.textDe) + '</div>';
      if (tk.glossary) inner += '<div class="glossary">' + tk.glossary.map(g => '<b>' + esc(g[0]) + '</b><span>' + esc(g[1]) + '</span>').join('') + '</div>';
      box.appendChild(el('div', { class: 'info-text protect ' + style }, inner));
    },
    solution: () => '', answer: () => ''
  };

  /* ---------- Bildschirmaufbau ---------- */
  const root = el('div', { id: 'app' });
  document.body.appendChild(root);
  let screenTask = null; // aktuelle Aufgabe für Zeitmessung
  let away = null, paused = false;

  function setAccent() { if (S.accent) { document.documentElement.style.setProperty('--accent', S.accent); if (S.accentInk) document.documentElement.style.setProperty('--accent-ink', S.accentInk); if (S.accentSoft) document.documentElement.style.setProperty('--accent-soft', S.accentSoft); } }
  setAccent();
  document.title = S.title + (S.class ? ' · ' + S.class : '');

  function totals() {
    let auto = 0, autoMax = 0, open = 0;
    flow().forEach(x => { if (x.locked) return; const m = maxPts(x.t); if (isTeacher(x.t)) open += m; else { autoMax += m; auto += earned(x.t); } });
    return { auto, autoMax, open };
  }

  function header(withNav) {
    const f = withNav ? flow() : [], tt = withNav ? totals() : null;
    const top = el('header', { class: 'top' });
    let row = '<div class="top-row"><div class="top-title">' + esc(S.title) + '</div>';
    if (withNav) {
      if (INSTANT) row += '<span class="chip" title="' + esc(t('yourPts')) + '"><b>' + fmtPts(tt.auto) + '</b>&nbsp;/ ' + fmtPts(tt.autoMax) + '</span>';
      if (CFG.allowPause) row += '<button class="icon-btn" type="button" data-act="pause">' + esc(t('pauseBtn')) + '</button>';
      row += '<button class="icon-btn" type="button" data-act="ov">' + esc(t('overview')) + '</button>';
    }
    row += '</div>';
    top.innerHTML = row;
    if (withNav) {
      const pr = el('div', { class: 'progress', 'aria-hidden': 'true' });
      f.forEach((x, i) => { const s = status(x.t); pr.appendChild(el('span', { class: i === state.cur && state.screen === 'task' ? 'cur' : (s === 'done' || s === 'teacher' || s === 'info' ? 'done' : s === 'skip' ? 'skip' : '') })); });
      top.appendChild(pr);
    }
    top.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (!a) return; if (a.dataset.act === 'pause') doPause(); if (a.dataset.act === 'ov') go('ov'); });
    return top;
  }
  function actions(btns) {
    const bar = el('div', { class: 'actions' }), inn = el('div', { class: 'actions-in' });
    btns.forEach(b => { if (b === '|') inn.appendChild(el('span', { class: 'spacer' })); else if (b) inn.appendChild(b); });
    bar.appendChild(inn); return bar;
  }
  const btn = (label, cls, fn, attrs) => { const b = el('button', Object.assign({ type: 'button', class: 'btn ' + (cls || '') }, attrs || {}), label); b.addEventListener('click', fn); return b; };

  function render() {
    root.innerHTML = ''; screenTask = null;
    if (!state) renderStart();
    else if (state.status === 'done') renderDone();
    else if (state.screen === 'welcome') renderWelcome();
    else if (state.screen === 'ov') renderOverview();
    else if (state.screen === 'sum') renderSummary();
    else renderTask();
    fitPad();
  }
  /* Freiraum unter dem Inhalt = Höhe der Knopfleiste, damit nichts verdeckt wird */
  function fitPad() {
    const a = $('.actions', root), m = $('main', root);
    if (a && m) m.style.paddingBottom = (a.offsetHeight + 28) + 'px';
  }
  window.addEventListener('resize', fitPad);
  function go(screen, cur) {
    if (screen) state.screen = screen;
    if (cur != null) state.cur = cur;
    save(); render(); window.scrollTo(0, 0);
    const h = $('main h1, main h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  /* Startbildschirm */
  function renderStart() {
    root.appendChild(header(false));
    const m = el('main');
    const meta = [S.subject, S.class, S.level].filter(Boolean).join(' · ');
    m.appendChild(el('section', { class: 'hero' + (S.image ? ' with-pic' : '') }, (S.image ? pic(S.image, 'hero-pic') : '') + (meta ? '<div class="meta">' + esc(meta) + '</div>' : '') + '<h1>' + esc(S.title) + '</h1>' + (S.subtitle ? '<p>' + esc(S.subtitle) + deLine(S, 'subtitle') + '</p>' : '') + (S.intro ? md(S.intro) : '')));
    const rules = [];
    rules.push(INSTANT ? tb('instant') : tb('end'));
    if (INSTANT) rules.push(CFG.attempts > 1 ? tb('triesN', { n: CFG.attempts, p: Math.round(CFG.laterFactor * 100) }) : tb('tries1'));
    if (Object.values(TASKS).some(x => x.hints && x.hints.length)) rules.push(CFG.hintCost > 0 ? (HELP_DE ? esc(t('hintsCost', { c: costLabel(CFG.hintCost) })) + '<span class="de">' + esc(fill(L.de.hintsCost, { c: CFG.hintCost === 1 ? '1 Punkt' : fmtPts(CFG.hintCost) + ' Punkte' })) + '</span>' : esc(t('hintsCost', { c: costLabel(CFG.hintCost) }))) : tb('hintsFree'));
    if (CFG.allowPause) rules.push(tb('pause'));
    if (CFG.allowSkip) rules.push(tb('skip'));
    if (Object.values(TASKS).some(isTeacher)) rules.push(tb('open'));
    rules.push(tb('submit', { to: SUBMIT_TO }));
    m.appendChild(el('section', { class: 'card' }, '<h2>' + tb('how') + '</h2><ul class="rules">' + rules.map(r => '<li>' + r + '</li>').join('') + '</ul>'));
    const logs = [];
    if (SURV.time) logs.push(tb('logTime'));
    if (SURV.focus) logs.push(tb('logFocus'));
    if (SURV.paste) logs.push(tb('logPaste'));
    if (SURV.copy) logs.push(tb('logCopy'));
    if (logs.length) { logs.push(tb('logPdf')); m.appendChild(el('div', { class: 'notice' }, '<b>' + tb('logHead') + '</b><ul style="margin:.4em 0 0;padding-left:1.2em">' + logs.map(x => '<li>' + x + '</li>').join('') + '</ul>')); }
    if (!canStore) m.appendChild(el('div', { class: 'notice' }, tb('noStore')));
    const form = el('section', { class: 'card' }, '<h2>' + tb('who') + '</h2>');
    form.insertAdjacentHTML('beforeend', '<label class="field" for="ab-name">' + tb('name') + '</label><input class="text" id="ab-name" autocomplete="given-name" maxlength="40"><div class="small" style="margin-top:4px">' + tb('nameHelp') + '</div>');
    const classes = S.classes || (S.class ? [S.class] : null);
    if (classes && classes.length > 1) form.insertAdjacentHTML('beforeend', '<label class="field">' + tb('cls') + '</label><div class="seg" role="radiogroup">' + classes.map(c => '<button type="button" class="btn ghost" data-cls="' + esc(c) + '" aria-pressed="false">' + esc(c) + '</button>').join('') + '</div>');
    else if (!classes) form.insertAdjacentHTML('beforeend', '<label class="field" for="ab-cls">' + tb('cls') + '</label><input class="text" id="ab-cls" maxlength="12" style="max-width:10em">');
    else form.insertAdjacentHTML('beforeend', '<p class="small" style="margin-top:12px">' + esc(t('cls')) + ': <b>' + esc(classes[0]) + '</b></p>');
    if (CFG.selfDeclaration) form.insertAdjacentHTML('beforeend', '<label class="check"><input type="checkbox" id="ab-decl"><span>' + tb('declare') + '</span></label>');
    const err = el('div', { class: 'fb no', hidden: true, role: 'alert' }); form.appendChild(err);
    let cls = classes && classes.length === 1 ? classes[0] : null;
    form.addEventListener('click', e => { const b = e.target.closest('[data-cls]'); if (!b) return; cls = b.dataset.cls; $$('[data-cls]', form).forEach(x => { const on = x === b; x.setAttribute('aria-pressed', on); x.classList.toggle('ghost', !on); }); });
    m.appendChild(form); root.appendChild(m);
    root.appendChild(actions(['|', btn(esc(t('go')), 'accent', () => {
      const name = $('#ab-name').value.trim().replace(/\s+/g, ' ');
      if (!cls && $('#ab-cls')) cls = $('#ab-cls').value.trim().toUpperCase();
      const decl = CFG.selfDeclaration ? $('#ab-decl').checked : null;
      err.hidden = true;
      if (!name) { err.innerHTML = tb('needName'); err.hidden = false; $('#ab-name').focus(); return; }
      if (!cls) { err.innerHTML = tb('needCls'); err.hidden = false; return; }
      if (CFG.selfDeclaration && !decl) { err.innerHTML = tb('needDecl'); err.hidden = false; $('#ab-decl').focus(); return; }
      state = newState(name, cls, decl);
      log('start', { ua: navigator.userAgent.slice(0, 160), w: window.innerWidth, h: window.innerHeight });
      go('task', 0);
    }, { 'data-act': 'start' })]));
  }

  function renderWelcome() {
    root.appendChild(header(false));
    const m = el('main');
    const done = flow().filter(x => ['done', 'teacher', 'info'].includes(status(x.t))).length;
    m.appendChild(el('section', { class: 'hero' }, '<h1>' + esc(t('welcome', { name: state.name })) + '</h1><p>' + tb('welcomeP') + '</p><p class="small">' + esc(state.cls) + ' · ' + esc(t('variant')) + ' ' + esc(state.code) + ' · ' + done + ' / ' + flow().length + '</p>'));
    root.appendChild(m);
    root.appendChild(actions([btn(esc(t('restart')), 'ghost', () => {
      modal(tb('restartH'), tb('restartP'), t('restartYes'), t('sureNo'), () => {
        const rs = (state.restarts || 0) + 1; sSet(KEY_RS, String(rs)); sDel(KEY);
        state = null; render();
      });
    }), '|', btn(esc(t('cont')), 'accent', () => { log('weiter'); go(state.resumeScreen || 'task'); }, { 'data-act': 'continue' })]));
  }

  /* Aufgabenbildschirm */
  function renderTask() {
    const f = flow();
    if (!f.length) return go('sum');
    state.cur = clamp(state.cur, 0, f.length - 1);
    const x = f[state.cur];
    if (x.locked) { maybeRoute(); const f2 = flow(); if (f2[state.cur] && f2[state.cur].locked) { return go('ov'); } return render(); }
    const tk = x.t, st = TS(tk.id), type = TYPES[tk.type];
    screenTask = tk.id; st.seen = true;
    root.appendChild(header(true));
    const m = el('main'), card = el('section', { class: 'card', 'data-task': tk.id });
    const stList = taskList(x.s), idx = stList.indexOf(tk);
    let head = '<div class="station-tag">' + esc(x.s.title) + (stList.length > 1 ? ' · ' + (idx + 1) + '/' + stList.length : '') + '</div>';
    if (!isInfo(tk)) head += '<span class="pts">' + esc(ptsLabel(maxPts(tk))) + (isTeacher(tk) ? ' · ' + esc(t('stTeacher')) : '') + '</span>';
    head += '<h2 class="protect">' + mdInline(tk.title || (isInfo(tk) ? '' : t('task'))) + '</h2>';
    if (tk.prompt) head += '<div class="prompt protect">' + mdInline(tk.prompt) + deLine(tk, 'prompt') + '</div>';
    if (tk.image) head += pic(tk.image);
    card.innerHTML = head;
    const body = el('div', { class: 'task-body' }); card.appendChild(body);
    const hintBox = el('div'); card.appendChild(hintBox);
    const fbBox = el('div', { 'aria-live': 'polite' }); card.appendChild(fbBox);
    const api = {
      changed(text) { if (st.skipped) st.skipped = false; if (!INSTANT && !isTeacher(tk)) st.done = hasResp(tk, st.resp); save(true); if (!text) fbBox.innerHTML = ''; },
      enter() { const b = $('[data-act="check"]'); if (b && !b.disabled) b.click(); }
    };
    type.render(tk, st, body, api);
    // Hinweise
    function drawHints() {
      hintBox.innerHTML = '';
      (tk.hints || []).slice(0, st.hints).forEach((h, i) => hintBox.appendChild(el('div', { class: 'hint protect' }, '<b>' + esc(t('hintN', { i: i + 1, n: tk.hints.length })) + ':</b> ' + mdInline(h) + (HELP_DE && tk.hintsDe && tk.hintsDe[i] ? '<span class="de">' + esc(tk.hintsDe[i]) + '</span>' : ''))));
    }
    drawHints();
    // Rückmeldung zeigen, wenn schon geprüft
    if (INSTANT && st.att > 0 && st.items && !isTeacher(tk)) showFeedback(tk, st, fbBox, body);
    if (isTeacher(tk)) fbBox.innerHTML = '<div class="fb info">' + tb('teacherMarks') + '</div>';
    if (isInfo(tk) && tk.note !== false) fbBox.innerHTML = '';
    m.appendChild(card); root.appendChild(m);

    const last = state.cur === f.length - 1;
    const nextBtn = btn(esc(last ? t('toEnd') : t('next')), INSTANT && !isInfo(tk) && !isTeacher(tk) && !st.final ? 'ghost' : 'accent', () => {
      if (isTeacher(tk)) { st.done = countWords(st.resp && st.resp.text) > 0; if (st.done) log('text', { id: tk.id, w: countWords(st.resp.text) }); }
      if (!INSTANT && !isInfo(tk) && !isTeacher(tk)) st.done = hasResp(tk, st.resp);
      if (isInfo(tk)) st.seen = true;
      next();
    }, { 'data-act': 'next' });
    const backBtn = state.cur > 0 ? btn(esc(t('back')), 'ghost', () => { go('task', state.cur - 1); }, { 'data-act': 'back' }) : null;
    let hintBtn = null, skipBtn = null, checkBtn = null;
    if (!isInfo(tk) && tk.hints && tk.hints.length && !st.final && !isTeacher(tk) || (isTeacher(tk) && tk.hints && tk.hints.length)) {
      const left = tk.hints.length - st.hints;
      hintBtn = btn(esc(t('hint')) + (left > 0 ? ' (' + left + ')' : ''), 'ghost', () => {
        if (st.hints >= tk.hints.length) { toast(t('noHints')); return; }
        st.hints++; log('hinweis', { id: tk.id, n: st.hints }); save(); drawHints(); render();
      }, { 'data-act': 'hint', disabled: left <= 0 ? true : null, title: CFG.hintCost > 0 && !isTeacher(tk) && maxPts(tk) > 0 ? t('hintCostNote', { c: costLabel(CFG.hintCost) }) : null });
    }
    if (CFG.allowSkip && !isInfo(tk) && !(INSTANT && st.final) && !last) skipBtn = btn(esc(t('skipBtn')), 'ghost', () => { st.skipped = true; log('übersprungen', { id: tk.id }); next(); }, { 'data-act': 'skip' });
    if (INSTANT && !isInfo(tk) && !isTeacher(tk) && !st.final) checkBtn = btn(esc(t('check')), 'accent', () => check(tk, st), { 'data-act': 'check' });
    root.appendChild(actions([backBtn, hintBtn, skipBtn, '|', checkBtn, nextBtn]));
  }
  function next() {
    const f = flow();
    maybeRoute();
    const f2 = flow();
    const curId = f[state.cur] && f[state.cur].t.id, pos = f2.findIndex(x => x.t.id === curId);
    const n = (pos >= 0 ? pos : state.cur) + 1;
    if (n >= f2.length) return go('sum');
    if (f2[n].locked) return go('ov');
    go('task', n);
  }
  function check(tk, st) {
    const type = TYPES[tk.type];
    if (!hasResp(tk, st.resp)) { toast(LANG === 'de' ? 'Gib zuerst eine Antwort.' : 'Answer first.'); return; }
    st.att++;
    const g = type.grade(tk, st.resp, st);
    const gain = Math.max(0, g.f - st.f);
    st.raw = clamp(st.raw + gain * (st.att === 1 ? 1 : CFG.laterFactor), 0, 1);
    st.f = Math.max(st.f, g.f); st.items = g.items;
    st.final = g.f >= 1 || st.att >= CFG.attempts;
    st.skipped = false;
    log('prüfen', { id: tk.id, a: st.att, f: round1(g.f * 100) / 100 });
    save(); render();
    const fb = $('[aria-live]'); fb && fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function showFeedback(tk, st, box, body) {
    const type = TYPES[tk.type], allOk = st.f >= 1, lines = type.feedback ? type.feedback(tk, st) : [];
    let html = '';
    if (allOk) html = '<b>' + esc(st.att === 1 && st.hints === 0 ? t('allRight') : t('correct')) + '</b>';
    else {
      const pr = type.progress ? type.progress(tk, st) : null;
      html = '<b>' + esc(st.final ? t('solution') : t('notYet')) + '</b>' + (pr ? ' ' + esc(t('partly', { a: pr[0], b: pr[1] })) : '');
      if (!st.final) html += ' ' + esc(t('triesLeft', { n: CFG.attempts - st.att }));
    }
    if (lines.length) html += '<ul>' + lines.map(l => '<li>' + l + '</li>').join('') + '</ul>';
    if (st.final && !allOk && tk.explain) html += '<p style="margin:.5em 0 0">' + mdInline(tk.explain) + deLine(tk, 'explain') + '</p>';
    if (allOk && tk.explainOk) html += '<p style="margin:.5em 0 0">' + mdInline(tk.explainOk) + '</p>';
    if (st.final) html += '<div class="small" style="margin-top:6px">' + esc(t('yourPts')) + ': ' + fmtPts(earned(tk)) + ' / ' + fmtPts(maxPts(tk)) + '</div>';
    box.innerHTML = '<div class="fb ' + (allOk ? 'ok' : (st.final ? 'info' : 'no')) + '">' + html + '</div>';
    if (st.final && !allOk && type.reveal) type.reveal(tk, st, body);
    if (st.final && !allOk && tk.type === 'choice') { /* richtige Option ist gestrichelt markiert */ }
  }

  /* Weg nach der Einstufung */
  function maybeRoute() {
    if (!S.route || state.track) return;
    const from = S.route.from || [];
    const ts = [].concat.apply([], from.map(id => taskList(STATION(id))));
    const scorable = ts.filter(x => !isInfo(x) && !isTeacher(x));
    const ready = scorable.every(x => { const s = state.tasks[x.id]; return s && (INSTANT ? (s.final || s.skipped) : (s.done || s.skipped)); });
    if (!ready) return;
    let got = 0, max = 0;
    scorable.forEach(x => {
      max += maxPts(x);
      if (INSTANT) got += earned(x); else { const g = TYPES[x.type].grade(x, state.tasks[x.id].resp, null); got += g.f * maxPts(x); }
    });
    const ratio = max ? got / max : 0;
    state.track = ratio < (S.route.threshold != null ? S.route.threshold : 0.6) ? 'basis' : 'plus';
    log('weg', { track: state.track, quote: Math.round(ratio * 100) });
    save();
    toast(t('newPath'));
  }

  /* Übersicht */
  function renderOverview() {
    root.appendChild(header(true));
    const m = el('main'); m.appendChild(el('h1', null, esc(t('ovTitle'))));
    const f = flow();
    STATIONS.forEach(st => {
      if (!stationVisible(st)) return;
      const sec = el('section', { class: 'card ov-station' }, '<h2>' + esc(st.title) + deLine(st, 'title') + '</h2>');
      if (stationLocked(st)) sec.insertAdjacentHTML('beforeend', '<p class="small">' + esc(t('locked', { s: (S.route.from || []).map(id => STATION(id).title).join(', ') })) + '</p>');
      const ul = el('ul', { class: 'ov-list' });
      taskList(st).forEach(tk => {
        const i = f.findIndex(x => x.t === tk), s = status(tk);
        const lab = { done: t('stDone'), open: t('stOpen'), skip: t('stSkip'), part: t('stPart'), teacher: t('stTeacher'), info: t('stInfo') }[s];
        const pts = !isInfo(tk) && !isTeacher(tk) && INSTANT && (state.tasks[tk.id] || {}).final ? ' · ' + fmtPts(earned(tk)) + '/' + fmtPts(maxPts(tk)) : '';
        const b = el('button', { type: 'button', disabled: stationLocked(st) ? true : null }, '<span class="dot ' + s + '"></span><span>' + mdInline(tk.title || t('task')) + '</span><span class="st">' + esc(lab) + pts + '</span>');
        b.addEventListener('click', () => go('task', i));
        const li = el('li'); li.appendChild(b); ul.appendChild(li);
      });
      sec.appendChild(ul); m.appendChild(sec);
    });
    root.appendChild(m);
    root.appendChild(actions([btn(esc(t('back')), 'ghost', () => go('task')), '|', btn(esc(t('toEnd')), 'accent', () => { maybeRoute(); go('sum'); }, { 'data-act': 'tosum' })]));
  }

  /* Abgabe-Übersicht */
  function renderSummary() {
    maybeRoute();
    root.appendChild(header(true));
    const m = el('main'), f = flow();
    m.appendChild(el('section', { class: 'hero' }, '<h1>' + esc(t('sumTitle')) + '</h1><p>' + tb('sumIntro') + '</p>'));
    const open = f.filter(x => !x.locked && !isInfo(x.t) && (maxPts(x.t) > 0 || isTeacher(x.t)) && ['open', 'skip', 'part'].includes(status(x.t)));   // Aufgaben ohne Punkte (Bonus) gelten nicht als offen
    const short = f.filter(x => isTeacher(x.t) && x.t.minWords && countWords((state.tasks[x.t.id] || {}).resp && state.tasks[x.t.id].resp.text) < x.t.minWords);
    if (open.length || short.length) {
      let h = '';
      if (open.length) h += '<p><b>' + esc(t('warnOpen')) + '</b> ' + open.map(x => esc(x.t.title || t('task'))).join(', ') + '</p>';
      if (short.length) h += '<p style="margin:0"><b>' + esc(t('warnShort')) + '</b> ' + short.map(x => esc(x.t.title) + ' (' + countWords((state.tasks[x.t.id] || {}).resp && state.tasks[x.t.id].resp.text) + '/' + x.t.minWords + ')').join(', ') + '</p>';
      m.appendChild(el('div', { class: 'notice' }, h));
    }
    if (f.some(x => x.locked)) m.appendChild(el('div', { class: 'notice' }, esc(t('locked', { s: (S.route.from || []).map(id => STATION(id).title).join(', ') }))));
    m.appendChild(el('section', { class: 'card' }, resultTable(INSTANT)));
    root.appendChild(m);
    root.appendChild(actions([btn(esc(t('overview')), 'ghost', () => go('ov')), '|', btn(esc(t('handIn')), 'accent', () => {
      modal(tb('sureH'), tb('sureP'), t('sureYes'), t('sureNo'), submit);
    }, { 'data-act': 'handin' })]));
  }
  function resultTable(withPts) {
    const f = flow(); let h = '<table class="sum"><thead><tr><th>' + esc(t('station')) + '</th><th>' + esc(t('stDone')) + '</th>' + (withPts ? '<th class="n">' + esc(t('pts')) + '</th>' : '') + '</tr></thead><tbody>';
    STATIONS.forEach(st => {
      if (!stationVisible(st) || stationLocked(st)) return;
      const ts = taskList(st).filter(x => !isInfo(x)); if (!ts.length) return;
      const done = ts.filter(x => ['done', 'teacher'].includes(status(x))).length;
      const auto = ts.filter(x => !isTeacher(x)), teach = ts.filter(isTeacher);
      let p = '';
      if (withPts) p = auto.length ? fmtPts(auto.reduce((s, x) => s + earned(x), 0)) + ' / ' + fmtPts(auto.reduce((s, x) => s + maxPts(x), 0)) : '';
      if (withPts && teach.length) p += (p ? ' + ' : '') + fmtPts(teach.reduce((s, x) => s + maxPts(x), 0)) + ' ' + (LANG === 'de' ? '(Lehrperson)' : '(teacher)');
      h += '<tr><td>' + esc(st.title) + '</td><td>' + done + ' / ' + ts.length + '</td>' + (withPts ? '<td class="n">' + p + '</td>' : '') + '</tr>';
    });
    const tt = totals();
    if (withPts) h += '<tr><th>' + esc(t('total')) + '</th><th></th><th class="n">' + fmtPts(tt.auto) + ' / ' + fmtPts(tt.autoMax) + '</th></tr>';
    h += '</tbody></table>';
    if (withPts && tt.open) h += '<p class="small" style="margin-top:8px">' + esc(t('pending', { n: fmtPts(tt.open) })) + '</p>';
    return h;
  }

  /* Abgabe */
  function submit() {
    if (!INSTANT) { // im Modus "end" erst jetzt auswerten
      flow().forEach(x => { if (x.locked || isInfo(x.t) || isTeacher(x.t)) return; const st = TS(x.t.id); if (!hasResp(x.t, st.resp)) { st.items = null; st.f = 0; st.raw = 0; return; } const g = TYPES[x.t.type].grade(x.t, st.resp, null); st.att = 1; st.items = g.items; st.f = g.f; st.raw = g.f; st.final = true; });
    }
    state.status = 'done'; state.submittedAt = now(); log('abgabe');
    save();
    downloadPdf();
    render();
  }
  function fileName() {
    const clean = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return clean(S.fileTitle || S.id) + '_' + clean(state.name) + '_' + clean(state.cls) + '.pdf';
  }
  function renderDone() {
    root.appendChild(header(false));
    const m = el('main');
    m.appendChild(el('section', { class: 'hero' }, '<h1>' + esc(t('doneH')) + '</h1><p>' + tb('doneP', { file: fileName(), to: SUBMIT_TO }) + '</p><p class="small">' + tb('doneFind') + '</p>'));
    if (CFG.revealAfterSubmit || INSTANT) m.appendChild(el('section', { class: 'card' }, '<h2>' + esc(t('results')) + '</h2>' + resultTable(true)));
    root.appendChild(m);
    root.appendChild(actions(['|', btn(esc(t('again')), 'accent', downloadPdf, { 'data-act': 'pdf' })]));
  }

  /* ---------- Überlagerungen ---------- */
  function modal(h, p, yes, no, onYes) {
    const mo = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, '<div class="box"><h2>' + h + '</h2><p>' + p + '</p><div class="row"></div></div>');
    const row = $('.row', mo);
    row.appendChild(btn(esc(no), 'ghost', () => mo.remove(), { 'data-act': 'no' }));
    row.appendChild(btn(esc(yes), 'accent', () => { mo.remove(); onYes(); }, { 'data-act': 'yes' }));
    document.body.appendChild(mo); $('[data-act="yes"]', mo).focus();
  }
  let toastTimer;
  function toast(msg) { let tst = $('.toast'); if (!tst) { tst = el('div', { class: 'toast', role: 'status' }); document.body.appendChild(tst); } tst.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => tst.remove(), 3200); }
  function overlay(h, p, label, onClick, act) {
    let ov = $('#ab-ov'); if (ov) ov.remove();
    ov = el('div', { class: 'overlay', id: 'ab-ov', role: 'dialog', 'aria-modal': 'true' }, '<div class="box"><h2>' + h + '</h2><p>' + p + '</p></div>');
    $('.box', ov).appendChild(btn(esc(label), 'accent', onClick, { 'data-act': act }));
    document.body.appendChild(ov);
    return ov;
  }
  function running() { return state && state.status === 'run' && state.screen !== 'welcome'; }
  function doPause() {
    if (!running() || paused) return;
    paused = true; log('pause');
    overlay(tb('pausedH'), tb('pausedP'), t('resume'), () => { paused = false; log('pause-ende'); const o = $('#ab-ov'); o && o.remove(); }, 'resume');
  }

  /* ---------- Protokoll: Fenster verlassen ---------- */
  let unloading = false;
  function goAway(why) {
    if (!SURV.focus || !running() || paused || away || unloading) return;
    away = { at: now(), why };
    log('verlassen', { why });
    overlay(tb('awayH'), tb('awayP'), t('awayBack'), () => { const o = $('#ab-ov'); o && o.remove(); if (away && !away.back) comeBack(); away = null; }, 'return');
  }
  function comeBack() {
    if (!away || away.back) return;
    away.back = now();
    log('zurück', { ms: away.back - away.at });
  }
  window.addEventListener('blur', () => goAway('blur'));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { goAway('hidden'); save(); } else comeBack(); });
  window.addEventListener('focus', comeBack);

  /* ---------- Protokoll: Einfügen, Kopieren, große Einschübe, Drucken ---------- */
  const editable = n => n && (n.tagName === 'TEXTAREA' || (n.tagName === 'INPUT' && /^(text|search|)$/.test(n.type || '')) || n.isContentEditable);
  const curTaskId = () => screenTask || null;
  document.addEventListener('paste', e => {
    if (!SURV.paste || !running()) return;
    if (editable(e.target)) { e.preventDefault(); let n = 0; try { n = (e.clipboardData && e.clipboardData.getData('text') || '').length; } catch (x) { /* egal */ } log('einfügen', { id: curTaskId(), z: n }); toast(t('pasteBlocked')); }
  }, true);
  document.addEventListener('beforeinput', e => {
    if (!SURV.paste || !running()) return;
    if (/^insertFrom(Paste|Drop|PasteAsQuotation|Yank)/.test(e.inputType || '')) { e.preventDefault(); log('einfügen', { id: curTaskId(), via: e.inputType }); toast(t('pasteBlocked')); }
  }, true);
  document.addEventListener('drop', e => { if (!running()) return; if (editable(e.target) && SURV.paste) { e.preventDefault(); log('einfügen', { id: curTaskId(), via: 'drop' }); toast(t('pasteBlocked')); } }, true);
  document.addEventListener('dragover', e => { if (editable(e.target) && SURV.paste) e.preventDefault(); }, true);
  let lastCopyLog = 0;
  function blockCopy(e) {
    if (!SURV.copy || !state) return;
    if (editable(e.target) && !e.target.readOnly) return; // eigener Text darf kopiert werden
    e.preventDefault();
    if (now() - lastCopyLog > 1500) { lastCopyLog = now(); if (running()) log('kopieren', { id: curTaskId() }); toast(t('copyBlocked')); }
  }
  document.addEventListener('copy', blockCopy, true);
  document.addEventListener('cut', blockCopy, true);
  document.addEventListener('contextmenu', e => { if (SURV.copy && state && !editable(e.target)) e.preventDefault(); }, true);
  document.addEventListener('dragstart', e => { if (SURV.copy && !e.target.closest('[data-tile]')) e.preventDefault(); }, true);
  const lens = new WeakMap();
  document.addEventListener('focusin', e => { if (editable(e.target)) lens.set(e.target, e.target.value.length); });
  document.addEventListener('input', e => {
    const n = e.target; if (!editable(n) || !running()) return;
    const before = lens.has(n) ? lens.get(n) : 0, after = n.value.length, delta = after - before;
    lens.set(n, after);
    const lim = n.tagName === 'TEXTAREA' ? 30 : 18;
    if (delta >= lim && !/^insertFrom/.test(e.inputType || '')) log('einschub', { id: curTaskId(), z: delta, via: e.inputType || '' });
  }, true);
  window.addEventListener('beforeprint', () => { if (SURV.print && running()) log('drucken'); });

  /* ---------- Zeitmessung ---------- */
  let lastTick = performance.now();
  setInterval(() => {
    const t0 = performance.now(), d = Math.min(t0 - lastTick, 5000); lastTick = t0;
    if (!running() || paused || away || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    state.activeMs += d;
    if (screenTask && state.screen === 'task') TS(screenTask).time += d;
  }, 1000);
  setInterval(() => { if (running()) save(); }, 10000);
  window.addEventListener('beforeunload', () => { unloading = true; });
  window.addEventListener('pageshow', e => { if (e.persisted) unloading = false; });
  window.addEventListener('pagehide', e => {
    if (e.persisted) { save(); return; } // Seite bleibt im Speicher (Handy im Hintergrund): Fensterwechsel bleibt protokolliert
    unloading = true;
    if (!state) return;
    // Beim Neuladen oder Schließen meldet der Browser zuerst "verborgen". Das ist kein Fensterwechsel.
    if (away && !away.back && now() - away.at < 2000) {
      for (let i = state.log.length - 1; i >= 0; i--) if (state.log[i].k === 'verlassen') { state.log.splice(i, 1); break; }
      away = null;
    }
    if (running()) log('seite-zu');
    save();
  });

  /* ---------- PDF ---------- */
  const CP1252 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function pdfSafe(s) {
    return String(s == null ? '' : s).replace(/[✓✔]/g, '+').replace(/[✗✘]/g, 'x').replace(/[→⇒]/g, '->').replace(/[▲]/g, '^').replace(/[▼]/g, 'v').replace(/ /g, ' ').replace(/\t/g, '  ')
      .replace(/[^\n\r\x20-\x7E\xA0-\xFF]/g, c => CP1252.includes(c) ? c : '?');
  }
  function plain(s) { return String(s || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1'); }
  function fmtClock(ms) { const d = new Date(ms); const p = x => String(x).padStart(2, '0'); return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }
  function fmtDur(ms) { const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return (h ? h + ' h ' : '') + (h || m ? m + ' min ' : '') + r + ' s'; }
  function stats() {
    const L2 = state.log, c = k => L2.filter(x => x.k === k).length;
    let awayMs = 0; L2.filter(x => x.k === 'zurück').forEach(x => { awayMs += x.ms || 0; });
    let pauseMs = 0, ps = null; L2.forEach(x => { if (x.k === 'pause') ps = x.t; if (x.k === 'pause-ende' && ps) { pauseMs += x.t - ps; ps = null; } });
    let closedMs = 0, lastT = null; L2.forEach(x => { if (x.k === 'weiter' && lastT) closedMs += x.t - lastT; lastT = x.t; });
    return { leaves: c('verlassen'), awayMs, paste: c('einfügen'), copy: c('kopieren'), inserts: c('einschub'), pauses: c('pause'), pauseMs, reopen: c('weiter'), closedMs, hints: Object.values(state.tasks).reduce((s, x) => s + (x.hints || 0), 0), print: c('drucken') };
  }
  function payload() {
    const tt = totals(), f = flow().filter(x => !x.locked);
    const tasks = f.filter(x => !isInfo(x.t)).map(x => {
      const st = state.tasks[x.t.id] || {}, ty = TYPES[x.t.type];
      return { id: x.t.id, s: x.s.id, title: x.t.title || '', type: x.t.type, max: maxPts(x.t), pts: isTeacher(x.t) ? null : round1(earned(x.t)), att: st.att || 0, hints: st.hints || 0, ms: Math.round(st.time || 0), skipped: !!st.skipped, status: status(x.t), marks: ty.itemMarks ? ty.itemMarks(x.t, st) : [], answer: isTeacher(x.t) ? undefined : plain(ty.answer(x.t, st)),
        words: isTeacher(x.t) ? countWords(st.resp && st.resp.text) : undefined, text: isTeacher(x.t) ? ((st.resp && st.resp.text) || '') : undefined,
        checks: isTeacher(x.t) && x.t.checklist ? x.t.checklist.map((c, i) => !!(st.resp && st.resp.checks && st.resp.checks[i])) : undefined };
    });
    return { v: 1, sheet: S.id, ver: S.version || 1, hash: S.hash, title: S.title, name: state.name, cls: state.cls, code: state.code, declared: state.declared, start: state.startedAt, end: state.submittedAt, activeMs: Math.round(state.activeMs), track: state.track, restarts: state.restarts || 0, auto: round1(tt.auto), autoMax: tt.autoMax, open: tt.open, stats: stats(), tasks };
  }
  function downloadPdf() {
    let doc;
    try { doc = makePdf(); } catch (e) { toast((LANG === 'de' ? 'PDF-Fehler: ' : 'PDF error: ') + e.message); throw e; }
    const blob = doc.output('blob'), url = URL.createObjectURL(blob), a = el('a', { href: url, download: fileName() });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    if (state.status === 'done') { state.pdfCount = (state.pdfCount || 0) + 1; save(); }
  }
  function makePdf() {
    const { jsPDF } = window.jspdf;
    const fmtPts = x => { const r = round1(x); return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ','); };
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const W = 210, M = 16, CW = W - 2 * M, BOT = 282;
    let y = M;
    const P = payload(), st = P.stats;
    const color = (r, g, b) => doc.setTextColor(r, g, b);
    function need(h) { if (y + h > BOT) { doc.addPage(); y = M; } }
    function text(s, x, opt) {
      opt = opt || {}; doc.setFont('helvetica', opt.bold ? 'bold' : (opt.italic ? 'italic' : 'normal')); doc.setFontSize(opt.size || 10);
      const lines = doc.splitTextToSize(pdfSafe(s), opt.w || CW - (x - M)); const lh = (opt.size || 10) * 0.42 + 0.8;
      lines.forEach(l => { need(lh); doc.text(l, x, y + lh * 0.75); y += lh; });
      return lines.length;
    }
    function rule() { need(3); doc.setDrawColor(200, 190, 175); doc.setLineWidth(0.2); doc.line(M, y + 1, W - M, y + 1); y += 3; }
    function kv(rows) {
      rows.forEach(([k, v, warn]) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
        const lines = doc.splitTextToSize(pdfSafe(v), CW - 52); const h = lines.length * 4.6 + 1.2;
        need(h); color(80, 86, 96); doc.text(pdfSafe(k), M, y + 3.6);
        doc.setFont('helvetica', 'normal'); warn ? color(160, 60, 40) : color(30, 36, 44);
        lines.forEach((l, i) => doc.text(l, M + 52, y + 3.6 + i * 4.6)); y += h; color(30, 36, 44);
      });
    }
    // Kopf
    color(143, 59, 44); text((S.subject || '') + (S.class ? ' · ' + S.class : '') + ' · Abgabeprotokoll', M, { size: 9, bold: true });
    color(30, 36, 44); text(S.title, M, { size: 18, bold: true }); y += 1; rule();
    const pct = P.autoMax ? Math.round(P.auto / P.autoMax * 100) : 0;
    kv([
      ['Name', P.name], ['Klasse', P.cls], ['Variante', P.code],
      ['Beginn', fmtClock(P.start)], ['Abgabe', fmtClock(P.end)],
      ['Aktive Bearbeitungszeit', SURV.time ? fmtDur(P.activeMs) : 'nicht erfasst'],
      ['Punkte (automatisch)', fmtPts(P.auto) + ' von ' + fmtPts(P.autoMax) + ' (' + pct + ' %)'],
      ['Offene Aufgaben', P.open ? fmtPts(P.open) + ' Punkte, bewertet die Lehrperson' : 'keine'],
      ['Selbstständigkeit', P.declared === true ? 'bestätigt' : (P.declared === false ? 'NICHT bestätigt' : 'nicht abgefragt'), P.declared === false],
      ['Weg', P.track ? (P.track === 'basis' ? 'Basis' : 'Plus') : 'ohne Verzweigung'],
      ['Neustarts', String(P.restarts), P.restarts > 0]
    ]);
    y += 2; color(30, 36, 44); text('Protokoll', M, { size: 12, bold: true });
    const rows = [];
    if (SURV.focus) rows.push(['Fenster verlassen', st.leaves + '-mal' + (st.leaves ? ', zusammen ' + fmtDur(st.awayMs) + ' außerhalb' : ''), st.leaves > 0]);
    if (SURV.paste) rows.push(['Einfüge-Versuche', st.paste + ' (blockiert)', st.paste > 0]);
    if (SURV.copy) rows.push(['Kopier-Versuche', st.copy + ' (blockiert)', st.copy > 0]);
    rows.push(['Große Texteinschübe', st.inserts + (st.inserts ? ' (Diktat, Autokorrektur oder Wortvorschlag möglich)' : ''), st.inserts > 0]);
    rows.push(['Pausen', st.pauses + (st.pauses ? ', zusammen ' + fmtDur(st.pauseMs) : '')]);
    rows.push(['Seite geschlossen', st.reopen + '-mal' + (st.reopen ? ', zusammen ' + fmtDur(st.closedMs) : '')]);
    rows.push(['Hinweise genutzt', String(st.hints)]);
    if (st.print) rows.push(['Druckversuche', String(st.print), true]);
    kv(rows);
    color(100, 106, 116); text('Das Protokoll zeigt Auffälligkeiten, es beweist nichts. Fensterwechsel entstehen auch durch Benachrichtigungen oder Bildschirmsperre.', M, { size: 8, italic: true });
    color(30, 36, 44);
    // Aufgaben
    y += 3; text('Aufgaben', M, { size: 12, bold: true }); rule();
    flow().filter(x => !x.locked && !isInfo(x.t)).forEach(x => {
      const tk = x.t, s = state.tasks[tk.id] || {}, ty = TYPES[tk.type];
      need(14);
      const head = x.s.title + ' · ' + plain(tk.title || 'Aufgabe');
      const res = isTeacher(tk) ? '____ / ' + fmtPts(maxPts(tk)) + ' (Lehrperson)' : fmtPts(earned(tk)) + ' / ' + fmtPts(maxPts(tk));
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); const rw = doc.getTextWidth(pdfSafe(res));
      const hl = doc.splitTextToSize(pdfSafe(head), CW - rw - 6);
      hl.forEach((l, i) => { need(5); doc.text(l, M, y + 3.8); if (i === 0) { const full = !isTeacher(tk) && earned(tk) >= maxPts(tk) - 0.001; full ? color(47, 122, 66) : (isTeacher(tk) ? color(30, 36, 44) : color(178, 65, 47)); doc.text(pdfSafe(res), W - M, y + 3.8, { align: 'right' }); color(30, 36, 44); } y += 5; });
      const meta = [];
      if (!isTeacher(tk)) meta.push('Versuche ' + (s.att || 0));
      if (s.hints) meta.push('Hinweise ' + s.hints);
      if (SURV.time) meta.push('Zeit ' + fmtDur(s.time || 0));
      if (s.skipped) meta.push('übersprungen');
      if (!isTeacher(tk) && INSTANT && !s.final && s.att > 0) meta.push('nicht abgeschlossen');
      if (!isTeacher(tk) && !hasResp(tk, s.resp)) meta.push('keine Antwort');
      const marks = ty.itemMarks ? ty.itemMarks(tk, s) : [];
      if (marks.length && tk.type !== 'mark') meta.push('Einzelergebnis ' + marks.join(' '));
      if (marks.length && tk.type === 'mark') meta.push('Treffer ' + marks[0]);
      color(90, 96, 106); text(meta.join(' · '), M, { size: 8.5 }); color(30, 36, 44);
      if (isTeacher(tk)) {
        const r = s.resp || {}, n = countWords(r.text);
        text('Wörter: ' + n + (tk.minWords ? ' (Ziel ' + tk.minWords + (tk.maxWords ? ' bis ' + tk.maxWords : '') + ')' : ''), M, { size: 8.5 });
        if (tk.checklist && tk.checklist.length) text('Selbstcheck: ' + tk.checklist.map((c, i) => ((r.checks || [])[i] ? '[x] ' : '[ ] ') + plain(c)).join('   '), M, { size: 8.5 });
        y += 1; text(r.text || '(kein Text)', M + 3, { size: 10.5 }); y += 2;
      } else {
        text('Antwort: ' + plain(ty.answer(tk, s)), M + 3, { size: 9 });
        if (earned(tk) < maxPts(tk) - 0.001) { color(47, 122, 66); text('Lösung: ' + plain(ty.solution(tk)), M + 3, { size: 9 }); color(30, 36, 44); }
      }
      y += 1.5; rule();
    });
    // Ereignisliste
    if (state.log.length) {
      need(20); y += 2; text('Ereignisse', M, { size: 12, bold: true });
      const names = { start: 'Start', 'verlassen': 'Fenster verlassen', 'zurück': 'zurück', 'einfügen': 'Einfügen blockiert', 'kopieren': 'Kopieren blockiert', 'einschub': 'großer Einschub', pause: 'Pause', 'pause-ende': 'Pause beendet', 'prüfen': 'geprüft', 'hinweis': 'Hinweis', 'übersprungen': 'übersprungen', 'weg': 'Weg festgelegt', 'seite-zu': 'Seite geschlossen', 'weiter': 'wieder geöffnet', text: 'Text gespeichert', abgabe: 'Abgabe', drucken: 'Druckversuch' };
      const relevant = state.log.filter(x => x.k !== 'prüfen' && x.k !== 'text');
      const shown = relevant.slice(0, 300);
      shown.forEach(x => {
        const d = new Date(x.t), clock = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
        let det = '';
        if (x.id) det += ' · ' + plain((TASKS[x.id] || {}).title || x.id);
        if (x.ms) det += ' · ' + fmtDur(x.ms);
        if (x.z) det += ' · ' + x.z + ' Zeichen';
        if (x.track) det += ' · ' + (x.track === 'basis' ? 'Basis' : 'Plus') + ' (' + x.quote + ' %)';
        if (x.why) det += x.why === 'hidden' ? ' · Tab/App gewechselt oder Bildschirm aus' : ' · anderes Fenster';
        color(60, 66, 76); text(clock + '  ' + (names[x.k] || x.k) + det, M, { size: 8 });
      });
      if (relevant.length > shown.length) text('… ' + (relevant.length - shown.length) + ' weitere Einträge', M, { size: 8 });
      color(30, 36, 44);
    }
    // Fußzeile und Daten
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); color(120, 126, 136);
      doc.text(pdfSafe(S.title + ' · ' + P.name + ' · ' + P.cls + ' · Variante ' + P.code), M, 291);
      doc.text('Seite ' + i + ' von ' + pages, W - M, 291, { align: 'right' });
    }
    const json = JSON.stringify(P);
    doc.setProperties({ title: pdfSafe(S.title + ' · ' + P.name + ' · ' + P.cls), subject: 'AB1:' + utf8ToB64(json), keywords: 'ab-sum:' + sha256(json + '|' + SALT).slice(0, 24), creator: 'html-arbeitsblatt', author: pdfSafe(P.name) });
    return doc;
  }

  /* ---------- Start ---------- */
  if (state && state.status === 'run') { state.resumeScreen = state.screen === 'welcome' ? state.resumeScreen : state.screen; state.screen = 'welcome'; }
  render();
})();
