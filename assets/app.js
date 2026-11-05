/* Lead Funnel Lab: interactive layer. Depends on leads.js, scoring.js and experiments.js. */
(function () {
  'use strict';

  const { CONTROLS, DEFAULT_WEIGHTS, PRESETS, evaluate } = window.Scoring;
  const { EXPERIMENTS, BADGES, SOURCES } = window.LabGames;
  const DEFAULT_SEED = 2611;
  const LEAD_COUNT = 500;
  const STORE_KEY = 'lead-funnel-lab:v3';
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const $ = (s) => document.querySelector(s);
  const fmt = (n) => Math.round(n).toLocaleString('en-AU');
  const pct = (a, b) => (b > 0 ? (100 * a) / b : 0);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CTL = Object.fromEntries(CONTROLS.map((c) => [c.key, c]));

  const PRESET_BLURBS = { balanced: 'A bit of everything', fit: 'Right company, right role', intent: 'Buying signals win', content: 'Rewards downloads' };
  // Grade = how much better the weights score than the default model on the same sample (points of F1 x 100 at each model's best line).
  const GRADES = [[5, 'A+'], [3, 'A'], [1, 'B'], [-1, 'C'], [-3, 'D'], [-Infinity, 'F']];
  const gradeOf = (lift) => GRADES.find((g) => lift >= g[0])[1];
  const nextGrade = (lift) => { const i = GRADES.findIndex((g) => lift >= g[0]); return i > 0 ? GRADES[i - 1] : null; };
  const CAT = {
    tp: { label: 'Buyer, sent to sales', color: 'var(--c-sql)', ink: '#fff' },
    fn: { label: 'Buyer, missed', color: 'var(--c-missed)', ink: 'var(--ink)' },
    fp: { label: 'Wasted calls', color: 'var(--c-wasted)', ink: 'var(--ink)' },
    tn: { label: 'Not a buyer', color: 'var(--c-neutral)', ink: 'var(--ink)' },
  };
  const CAT_ORDER = ['tp', 'fn', 'fp', 'tn'];

  function cleanWeights(w) {
    const out = {};
    for (const c of CONTROLS) {
      const v = Number(w && w[c.key]);
      out[c.key] = Number.isFinite(v) ? clamp(Math.round(v), c.min, c.max) : DEFAULT_WEIGHTS[c.key];
    }
    return out;
  }

  // ---------- State ----------
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { saved = {}; }
  const state = {
    seed: Number.isInteger(saved.seed) ? saved.seed : DEFAULT_SEED,
    weights: cleanWeights(Object.assign({}, DEFAULT_WEIGHTS, saved.weights || {})),
    bestLift: typeof saved.bestLift === 'number' ? saved.bestLift : 0,
    badges: new Set(saved.badges || []),
    expDone: new Set(saved.expDone || []),
    expRight: saved.expRight || 0,
    expIdx: Number.isInteger(saved.expIdx) ? clamp(saved.expIdx, 0, EXPERIMENTS.length) : 0,
    touched: !!saved.touched,
    quest: Object.assign({ drag: false, style: false, ai: false }, saved.quest || {}),
    table: 'tp',
    show: { tp: true, fn: true, fp: true, tn: true },
    myWeights: null,
  };
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        seed: state.seed, weights: state.weights, bestLift: state.bestLift, badges: [...state.badges],
        expDone: [...state.expDone], expRight: state.expRight, expIdx: state.expIdx, touched: state.touched, quest: state.quest,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  let leads = [];
  let baseline = null;     // default model totals on this sample
  let baseBest = 0;        // default model best-line F1 on this sample
  let current = null;      // last evaluation
  let model = { best: 0, bestTh: 45, lift: 0 };
  let booted = false;

  // Best F1 a set of weights can reach at any MQL line, plus where that line sits.
  function bestLine(rows) {
    const eng = rows.filter((r) => r.engaged).sort((a, b) => b.score - a.score);
    const R = leads.reduce((n, l) => n + (l.salesReady ? 1 : 0), 0);
    let tp = 0, best = 0, th = 45;
    for (let i = 0; i < eng.length; i++) {
      if (eng[i].lead.salesReady) tp++;
      if (i + 1 < eng.length && eng[i + 1].score === eng[i].score) continue;
      if (eng[i].score < 1) break;
      const P = tp / (i + 1), Rc = R ? tp / R : 0, f = P + Rc ? (2 * P * Rc) / (P + Rc) : 0;
      if (f > best) { best = f; th = eng[i].score; }
    }
    return { best, th };
  }

  function loadLeads() {
    leads = window.LeadData.generateLeads(state.seed, LEAD_COUNT);
    const base = evaluate(leads, DEFAULT_WEIGHTS);
    baseline = base.totals;
    baseBest = bestLine(base.rows).best;
    countSignals();
  }

  // ---------- Small motion helpers ----------
  function tweenNum(el, to, format, dur) {
    const from = typeof el._v === 'number' ? el._v : to;
    el._v = to;
    if (REDUCED || from === to) { el.textContent = format(to); return; }
    const t0 = performance.now(), d = dur || 480;
    cancelAnimationFrame(el._raf);
    const step = (t) => {
      const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
      el.textContent = format(from + (to - from) * e);
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }
  function bump(el) {
    if (REDUCED || !el) return;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  // Feedback is a quiet line under the stats, not a pop-up.
  let noteTimer = 0;
  function toast(html) {
    const n = $('#note'); if (!n) return;
    n.innerHTML = html;
    n.classList.remove('show'); void n.offsetWidth; n.classList.add('show');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { n.textContent = ''; }, 6000);
  }
  function confetti() { /* intentionally calm: no confetti */ }

  // ---------- Controls ----------
  function ctlHtml(c) {
    return `<div class="ctl" data-ctl="${c.key}">
      <label for="w-${c.key}">${esc(c.label)}</label>
      <output id="o-${c.key}" for="w-${c.key}"></output>
      <input type="range" id="w-${c.key}" data-key="${c.key}" min="${c.min}" max="${c.max}" step="${c.step}" aria-describedby="x-${c.key}">
      <small class="say" id="x-${c.key}"></small>
      <small class="reach" id="r-${c.key}"></small>
    </div>`;
  }

  // ---------- Plain-language slider help ----------
  const EVENT_OF = { demoRequest: 'demo_request', eventMeeting: 'event_meeting', webinarAttend: 'webinar_attend', pricingPage: 'pricing_page', contentDownload: 'content_download', emailClick: 'email_click', webVisit: 'web_visit', unsubscribe: 'unsubscribe' };
  const pts = (v) => Math.round(v) + (Math.round(v) === 1 ? ' point' : ' points');
  const SAY = {
    demoRequest: (v) => v ? `Asking for a demo adds ${pts(v)}.` : 'Asking for a demo adds nothing.',
    eventMeeting: (v) => v ? `A conversation at an event booth adds ${pts(v)}.` : 'Event booth conversations add nothing.',
    webinarAttend: (v) => v ? `Each webinar they attend adds ${pts(v)}, up to 3 webinars.` : 'Webinars add nothing.',
    pricingPage: (v) => v ? `Each visit to your pricing page adds ${pts(v)}, up to 3 visits.` : 'Pricing page visits add nothing.',
    contentDownload: (v) => v ? `Each guide or report they download adds ${pts(v)}, up to 3.` : 'Downloads add nothing.',
    emailClick: (v) => v ? `Each email click adds ${pts(v)}, up to 3. Opens don\u2019t count.` : 'Email clicks add nothing.',
    webVisit: (v) => v ? `Each page they visit adds ${pts(v)}, up to 10 pages.` : 'Page visits add nothing.',
    unsubscribe: (v) => v ? `Unsubscribing takes away ${pts(-v)}.` : 'Unsubscribing costs nothing.',
    seniority: (v) => v ? `A C-level contact gets ${pts(v)}, a director ${pts(v * 0.7)}, junior staff ${pts(v * 0.15)}.` : 'Job title adds nothing.',
    companySize: (v) => v ? `Companies with 1,000 to 4,999 staff get ${pts(v)}. Under 50 staff get ${pts(v * 0.1)}.` : 'Company size adds nothing.',
    industry: (v) => v ? `Financial services, healthcare, government and energy get ${pts(v)}. Other industries get ${pts(v * 0.3)}.` : 'Industry adds nothing.',
    halfLife: (v) => `Activity loses half its points every ${v} days. After ${v * 2} days it\u2019s worth a quarter.`,
  };
  const HAS = {
    seniority: (l) => l.seniority === 'C-level' || l.seniority === 'VP' || l.seniority === 'Director',
    companySize: (l) => l.size === '1,000–4,999',
    industry: (l) => l.icp,
  };
  Object.keys(EVENT_OF).forEach((k) => { HAS[k] = (l) => l.events.some((e) => e.type === EVENT_OF[k]); });
  const WHO = {
    seniority: (n) => `${n} of these leads are directors or above.`,
    companySize: (n) => `${n} of these leads work at companies with 1,000 to 4,999 staff.`,
    industry: (n) => `${n} of these leads are in a target industry.`,
  };
  let counts = {};
  function countSignals() {
    counts = {};
    for (const k of Object.keys(HAS)) counts[k] = leads.reduce((n, l) => n + (HAS[k](l) ? 1 : 0), 0);
  }
  function sayFor(key) {
    const v = state.weights[key], th = state.weights.threshold;
    const x = document.getElementById('x-' + key), r = document.getElementById('r-' + key);
    if (x) x.textContent = SAY[key] ? SAY[key](v) : '';
    if (!r) return;
    const parts = [];
    if (key !== 'halfLife' && key !== 'unsubscribe' && v > 0) {
      parts.push(v >= th ? 'On its own, that\u2019s enough to reach sales.' : `That\u2019s ${Math.round((100 * v) / th)}% of the way to the cut-off of ${th}.`);
    }
    if (counts[key] !== undefined) parts.push(WHO[key] ? WHO[key](counts[key]) : `${counts[key]} of ${leads.length} leads did this.`);
    r.textContent = parts.join(' ');
  }
  const DID = { demoRequest: 'asked for a demo', eventMeeting: 'talked to you at an event', webinarAttend: 'attended a webinar', pricingPage: 'viewed your pricing page', contentDownload: 'downloaded a guide or report', emailClick: 'clicked an email', webVisit: 'visited your site', unsubscribe: 'unsubscribed', seniority: 'are directors or above', companySize: 'work at companies with 1,000 to 4,999 staff', industry: 'are in a target industry' };
  let focusKey = null, focusTimer = 0;
  function focusSignal(key) {
    const k = key && HAS[key] ? key : null;
    if (k === focusKey) return;
    focusKey = k;
    schedule();
  }

  function buildControls() {
    $('#presets').innerHTML = Object.entries(PRESETS).map(([k, p]) => `
      <button class="preset" type="button" data-preset="${k}" aria-pressed="false">${esc(p.label.replace(/ \(.*\)$/, ''))}<small>${esc(PRESET_BLURBS[k] || '')}</small></button>`).join('');
    const rest = CONTROLS.filter((c) => c.key !== 'threshold');
    const groups = {};
    for (const c of rest) (groups[c.group] = groups[c.group] || []).push(c);
    const names = { 'Engagement: what they did': 'What they did', 'Fit: who they are': 'Who they are', 'Handover and decay': 'How fast points fade' };
    const order = ['Engagement: what they did', 'Fit: who they are', 'Handover and decay'];
    $('#controls').innerHTML = order.filter((g) => groups[g]).map((g) => `<p class="dock-label">${esc(names[g])}</p>${groups[g].map(ctlHtml).join('')}`).join('');
    const ctls = $('#controls');
    ctls.addEventListener('pointerover', (e) => { const c = e.target.closest('[data-ctl]'); if (c && e.pointerType === 'mouse') focusSignal(c.dataset.ctl); });
    ctls.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') focusSignal(null); });
    ctls.addEventListener('focusin', (e) => { const c = e.target.closest('[data-ctl]'); if (c) focusSignal(c.dataset.ctl); });
    ctls.addEventListener('focusout', () => focusSignal(null));
    ctls.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('[data-ctl]'); if (!c || e.pointerType === 'mouse') return;
      focusSignal(c.dataset.ctl); clearTimeout(focusTimer);
    });
    ctls.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') { clearTimeout(focusTimer); focusTimer = setTimeout(() => focusSignal(null), 1600); } });

    document.addEventListener('input', (e) => {
      const key = e.target.dataset && e.target.dataset.key;
      if (!key || !CTL[key]) return;
      state.weights[key] = clamp(Number(e.target.value), CTL[key].min, CTL[key].max);
      state.touched = true;
      hideQuizbar();
      syncInputs();
      schedule();
      settleSoon(450);
    });
    document.addEventListener('change', (e) => { if (e.target.dataset && CTL[e.target.dataset.key]) settleSoon(0); });
    document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => { applyWeights(PRESETS[b.dataset.preset].weights); if (b.dataset.preset !== 'balanced') setTimeout(() => questDone('style'), 900); }));
    $('#reset').addEventListener('click', () => applyWeights(DEFAULT_WEIGHTS));
    $('#reseed').addEventListener('click', () => {
      state.seed = 1000 + Math.floor(Math.random() * 9000);
      loadSample();
      toast('New sample loaded: 500 different leads, same rules.');
    });
    $('#deal').addEventListener('click', () => { spotSeed++; renderLeadTable(true); });
    $('#spotlight').addEventListener('pointerover', (e) => { const c = e.target.closest('[data-lead]'); if (c) highlightDot(Number(c.dataset.lead)); });
    $('#spotlight').addEventListener('pointerleave', () => highlightDot(-1));
    $('#spotlight').addEventListener('click', (e) => {
      const c = e.target.closest('[data-lead]'); if (!c) return;
      const i = Number(c.dataset.lead);
      document.querySelector('.arena').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
      setTimeout(() => showTip(i), REDUCED ? 0 : 450);
    });
    document.querySelectorAll('[data-try]').forEach((b) => b.addEventListener('click', () => tryRule(b.dataset.try, b)));
    $('#ai-btn').addEventListener('click', aiTune);
    $('#quizbar-back').addEventListener('click', restoreMine);
    $('#quizbar-quiz').addEventListener('click', () => { const e = $('#exp-body'); const top = e.getBoundingClientRect().top + window.scrollY - 80; window.scrollTo({ top, behavior: REDUCED ? 'auto' : 'smooth' }); });
    $('#sources').addEventListener('click', (e) => { const r = e.target.closest('.src-row'); if (r) r.classList.toggle('open'); });
  }

  function applyWeights(w, opts) {
    state.weights = cleanWeights(w);
    if (!(opts && opts.silent)) state.touched = true;
    syncInputs();
    stagger();
    schedule();
    settleSoon(700);
  }

  function syncInputs() {
    for (const c of CONTROLS) {
      const v = state.weights[c.key];
      const fill = (100 * (v - c.min)) / (c.max - c.min) + '%';
      for (const id of c.key === 'threshold' ? ['w-threshold', 'w-threshold-m'] : ['w-' + c.key]) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (Number(el.value) !== v) el.value = v;
        el.style.setProperty('--fill', fill);
      }
      const o = document.getElementById('o-' + c.key);
      if (o) o.textContent = c.key === 'threshold' ? v : c.key === 'unsubscribe' && v < 0 ? '\u2212' + (-v) + ' pts' : v + ' ' + (c.unit === 'pts' && v === 1 ? 'pt' : c.unit);
      if (c.key !== 'threshold') sayFor(c.key);
    }
    const om = $('#o-threshold-m'); if (om) om.textContent = state.weights.threshold;
    const active = Object.entries(PRESETS).find(([, p]) => Object.keys(p.weights).every((k) => p.weights[k] === state.weights[k]));
    document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(!!active && b.dataset.preset === active[0])));
  }

  function loadSample() {
    hideTip();
    loadLeads();
    syncInputs();
    buildDots();
    stagger(true);
    lastSettledGrade = null;
    schedule();
    settleSoon(900, { quiet: true });
  }

  let raf = 0;
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; render(); persist(); });
  }

  // ---------- Arena ----------
  let W = 960, H = 340;
  const M = { l: 22, r: 22, t: 48, b: 34 };
  const svg = $('#swarm');
  const NS = 'http://www.w3.org/2000/svg';
  let dotEls = [], pos = [], layout = null, dragging = false, hoverIdx = -1, frozenXMax = null;
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  svg.innerHTML = '';
  const zone = mk('rect', { class: 'zone-sales', y: M.t - 26, height: H - M.b - M.t + 26, rx: 10, x: W / 2, width: 0 });
  const zoneL = mk('text', { class: 'zone-label', y: M.t - 10, x: M.l + 4 }); zoneL.textContent = '← Below the cut-off: marketing keeps nurturing';
  const zoneR = mk('text', { class: 'zone-label', y: M.t - 10, 'text-anchor': 'end', x: W - M.r - 6 }); zoneR.textContent = 'At or above: goes to sales →';
  const axis = mk('g', { class: 'axis' });
  const sweet = mk('line', { class: 'sweet', y1: M.t - 4, y2: H - M.b });
  const sweetLabel = mk('text', { class: 'sweet-label', y: H - M.b - 6 }); sweetLabel.textContent = 'sweet spot';
  const dotsG = mk('g', {});
  const lineG = mk('g', { class: 'line-g', tabindex: '0', role: 'slider', 'aria-label': 'Cut-off score', 'aria-valuemin': CTL.threshold.min, 'aria-valuemax': CTL.threshold.max });
  const lineHit = mk('line', { class: 'line-hit', y1: M.t - 30, y2: H - M.b });
  const line = mk('line', { class: 'mql-line', y1: M.t - 30, y2: H - M.b });
  const handle = mk('rect', { class: 'handle', y: M.t - 44, height: 26, width: 112, rx: 13 });
  const handleText = mk('text', { class: 'handle-text', y: M.t - 26, 'text-anchor': 'middle' });
  const hint = mk('text', { class: 'drag-hint', y: M.t - 26 }); hint.textContent = 'drag me';
  lineG.append(lineHit, line, handle, handleText, hint);
  svg.append(zone, zoneL, zoneR, axis, sweet, sweetLabel, dotsG, lineG);

  function buildDots() {
    dotsG.innerHTML = '';
    dotEls = leads.map((l, i) => {
      const c = mk('circle', { class: 'dot', r: 4, cx: 0, cy: 0, 'data-i': i });
      c.style.transform = `translate(${W / 2}px, -30px)`;
      dotsG.appendChild(c);
      return c;
    });
    pos = leads.map(() => ({ x: W / 2, y: -30 }));
  }

  function stagger(big) {
    if (REDUCED) return;
    dotEls.forEach((d, i) => { d.style.transitionDelay = ((i * 7) % (big ? 420 : 220)) + 'ms'; });
    clearTimeout(stagger._t);
    stagger._t = setTimeout(() => dotEls.forEach((d) => { d.style.transitionDelay = '0ms'; }), big ? 1300 : 900);
  }

  function sizeArena() {
    const narrow = $('#swarm-wrap').clientWidth < 640;
    const nw = narrow ? 420 : 960, nh = narrow ? 460 : 340;
    if (nw === W && nh === H) return false;
    W = nw; H = nh;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.classList.toggle('narrow', narrow);
    zone.setAttribute('height', H - M.b - M.t + 26);
    [line, lineHit, sweet].forEach((l) => l.setAttribute('y2', H - M.b));
    sweetLabel.setAttribute('y', H - M.b - 6);
    return true;
  }
  window.addEventListener('resize', () => { if (sizeArena()) schedule(); });

  function computeLayout(rows) {
    const maxScore = rows.reduce((m, r) => Math.max(m, r.score), 0);
    const xMax = frozenXMax || Math.max(40, Math.ceil((Math.max(maxScore, state.weights.threshold) + 6) / 10) * 10);
    const pw = W - M.l - M.r, ph = H - M.t - M.b;
    const pxPer = pw / xMax;
    const binW = Math.max(1, Math.ceil(8.5 / pxPer));
    const cols = new Map();
    rows.forEach((r, i) => {
      const b = Math.floor(Math.min(r.score, xMax - 1) / binW);
      if (!cols.has(b)) cols.set(b, []);
      cols.get(b).push(i);
    });
    let maxCol = 0;
    cols.forEach((v) => { maxCol = Math.max(maxCol, v.length); });
    const rad = Math.max(2.4, Math.min(4.4, binW * pxPer * 0.44));
    const step = Math.min(rad * 2 + 1, ph / Math.max(1, maxCol));
    const out = new Array(rows.length);
    cols.forEach((idxs, b) => {
      idxs.sort((a, c) => CAT_ORDER.indexOf(rows[a].cat) - CAT_ORDER.indexOf(rows[c].cat) || a - c);
      const x = M.l + (b * binW + binW / 2) * pxPer;
      idxs.forEach((i, k) => { out[i] = { x, y: H - M.b - rad - k * step }; });
    });
    return { xMax, pxPer, rad, pos: out, sx: (v) => M.l + v * pxPer, inv: (x) => (x - M.l) / pxPer };
  }

  function renderArena(rows) {
    sizeArena();
    svg.classList.toggle('focusing', !!focusKey);
    const fc = $('#focus-cap');
    document.querySelector('.stage').classList.toggle('focusing', !!focusKey);
    if (fc) { fc.hidden = !focusKey; if (focusKey) fc.textContent = `Showing the ${counts[focusKey]} leads who ${DID[focusKey]}`; }
    layout = computeLayout(rows);
    const th = state.weights.threshold;
    const lx = layout.sx(Math.min(th, layout.xMax));
    rows.forEach((r, i) => {
      const d = dotEls[i];
      const p = layout.pos[i];
      pos[i] = p;
      d.setAttribute('class', 'dot ' + r.cat + (state.show[r.cat] ? '' : ' dim') + (i === hoverIdx ? ' hot' : '') + (focusKey && HAS[focusKey](r.lead) ? ' has' : ''));
      d.setAttribute('r', i === hoverIdx ? layout.rad + 2.5 : layout.rad);
      d.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    });
    zone.setAttribute('x', lx); zone.setAttribute('width', Math.max(0, W - M.r - lx + 8));
    [line, lineHit].forEach((l) => { l.setAttribute('x1', lx); l.setAttribute('x2', lx); });
    const hw = 112, hx = Math.min(W - hw - 2, Math.max(2, lx - hw / 2));
    hint.setAttribute('x', hx + hw + 10);
    lineG.classList.toggle('hinting', !state.touched);
    handle.setAttribute('x', hx);
    handleText.setAttribute('x', hx + hw / 2);
    handleText.textContent = '◂ Cut-off ' + th + ' ▸';
    lineG.setAttribute('aria-valuenow', th);
    lineG.setAttribute('aria-valuetext', `Cut-off score ${th}, ${current ? current.totals.mql : 0} MQLs, grade ${gradeOf(model.lift)}`);
    const sx = layout.sx(Math.min(model.bestTh, layout.xMax));
    sweet.setAttribute('x1', sx); sweet.setAttribute('x2', sx);
    sweetLabel.setAttribute('x', sx + 6);
    const onSweet = Math.abs(th - model.bestTh) <= 2;
    sweet.style.opacity = onSweet ? 0.35 : 1;
    sweetLabel.style.opacity = onSweet ? 0 : 1;
    const narrow = W < 600;
    zoneL.textContent = narrow ? '← Marketing keeps' : '← Below the cut-off: marketing keeps nurturing';
    zoneR.textContent = narrow ? 'Goes to sales →' : 'At or above: goes to sales →';
    zoneL.style.opacity = lx - M.l > (narrow ? 140 : 320) ? 1 : 0;
    zoneR.style.opacity = W - M.r - lx > (narrow ? 130 : 210) ? 1 : 0;
    zoneR.setAttribute('x', W - M.r - 6);
    const step = layout.xMax <= 60 ? 10 : layout.xMax <= 160 ? 20 : 50;
    let ax = `<line x1="${M.l}" x2="${W - M.r}" y1="${H - M.b + 2}" y2="${H - M.b + 2}"/>`;
    for (let v = 0; v <= layout.xMax; v += step) ax += `<text x="${layout.sx(v)}" y="${H - 10}" text-anchor="middle">${v}</text>`;
    axis.innerHTML = ax;
  }

  // Pointer handling: mouse can click anywhere to move the line; touch only drags the line itself, so scrolling stays scrolling.
  function toSvg(e) {
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height, scale: W / r.width };
  }
  function nearestDot(p, radiusUnits) {
    let best = -1, bd = radiusUnits * radiusUnits;
    for (let i = 0; i < pos.length; i++) {
      const q = pos[i]; if (!q || !state.show[current.rows[i].cat]) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function setThresholdFromX(x) {
    const v = clamp(Math.round(layout.inv(x)), CTL.threshold.min, CTL.threshold.max);
    if (v !== state.weights.threshold) { state.weights.threshold = v; state.touched = true; syncInputs(); schedule(); }
  }
  let dragFrom = null;
  function startDrag(e) {
    dragging = true;
    dragFrom = state.weights.threshold;
    frozenXMax = layout.xMax;
    svg.classList.add('dragging', 'instant');
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    hideTip();
  }
  svg.addEventListener('pointerdown', (e) => {
    if (!layout || !current) return;
    const p = toSvg(e);
    const lx = layout.sx(Math.min(state.weights.threshold, layout.xMax));
    const onLine = Math.abs(p.x - lx) < 26 || e.target === handle || e.target === handleText;
    if (e.pointerType !== 'mouse') {
      if (onLine) { startDrag(e); return; }
      const i = nearestDot(p, 20 * p.scale);
      if (i >= 0) showTip(i); else hideTip();
      return;
    }
    if (!onLine && e.target.classList && e.target.classList.contains('dot')) { showTip(Number(e.target.dataset.i)); return; }
    startDrag(e);
    if (!onLine) setThresholdFromX(p.x);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!layout || !current) return;
    const p = toSvg(e);
    if (dragging) { setThresholdFromX(p.x); return; }
    if (e.pointerType !== 'mouse') return;
    const best = nearestDot(p, 14);
    if (best !== hoverIdx) { if (best >= 0) showTip(best); else hideTip(); }
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false; frozenXMax = null;
    if (dragFrom !== null && dragFrom !== state.weights.threshold) setTimeout(() => questDone('drag'), 700);
    svg.classList.remove('dragging', 'instant');
    schedule();
    settleSoon(0);
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !dragging) hideTip(); });
  document.addEventListener('pointerdown', (e) => { if (!svg.contains(e.target) && !e.target.closest('[data-lead]')) hideTip(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
  lineG.addEventListener('keydown', (e) => {
    const th = state.weights.threshold;
    const map = { ArrowRight: th + 1, ArrowUp: th + 1, ArrowLeft: th - 1, ArrowDown: th - 1, PageUp: th + 10, PageDown: th - 10, Home: CTL.threshold.min, End: CTL.threshold.max };
    if (!(e.key in map)) return;
    e.preventDefault();
    state.weights.threshold = clamp(map[e.key], CTL.threshold.min, CTL.threshold.max);
    state.touched = true; syncInputs(); schedule(); settleSoon(450);
  });

  function showTip(i) {
    if (!current || !layout || !dotEls[i]) return;
    const prev = hoverIdx;
    hoverIdx = i;
    if (dotEls[prev]) { dotEls[prev].classList.remove('hot'); dotEls[prev].setAttribute('r', layout.rad); }
    dotEls[i].classList.add('hot'); dotEls[i].setAttribute('r', layout.rad + 2.5);
    const r = current.rows[i], l = r.lead;
    const cat = CAT[r.cat];
    const tip = $('#tip');
    tip.innerHTML = `<b>${esc(l.company)}</b><span class="tip-sub">${esc(l.name)}, ${esc(l.title)} · ${esc(l.source)}</span>
      <div class="tip-row"><span class="tag-pill" style="background:${cat.color};color:${cat.ink}">${cat.label}</span><span>Score ${r.score} (fit ${r.fit}, activity ${r.engagement})</span></div>
      <span>${esc(leadReason(r))}</span>`;
    tip.hidden = false;
    const wrap = $('#swarm-wrap').getBoundingClientRect();
    const sx = wrap.width / W;
    const px = pos[i].x * sx, py = pos[i].y * sx;
    const tw = tip.offsetWidth, tht = tip.offsetHeight;
    let left = px + 14; if (left + tw > wrap.width) left = px - tw - 14;
    let top = py - tht - 10; if (top < 0) top = py + 14;
    tip.style.left = clamp(left, 0, Math.max(0, wrap.width - tw)) + 'px'; tip.style.top = top + 'px';
  }
  function hideTip() {
    if (dotEls[hoverIdx]) { dotEls[hoverIdx].classList.remove('hot'); if (layout) dotEls[hoverIdx].setAttribute('r', layout.rad); }
    hoverIdx = -1;
    const tip = $('#tip'); if (tip) tip.hidden = true;
  }
  function highlightDot(i) {
    dotEls.forEach((d) => d.classList.remove('spot'));
    if (i >= 0 && dotEls[i]) dotEls[i].classList.add('spot');
  }

  // ---------- Explanations ----------
  const SOURCE_WHY = {
    'Partner referral': 'A partner sends them with a known problem and a warm intro.',
    'Website contact form': 'They came to you and asked to talk. Few signals are stronger.',
    'Organic search': 'Searching for a fix. Some are buying, many are researching.',
    'Webinar': 'Interested in the topic, which is not always the same as buying.',
    'Paid LinkedIn': 'Ads reach the right roles and companies, but a click is light intent.',
    'Event booth': 'Badge scans overstate interest. Many came for the coffee.',
    'Content syndication': 'Downloaded a guide on someone else’s site. Mostly readers.',
    'Outbound SDR': 'Right accounts, but you reached out to them, not the other way round.',
  };
  const SENIOR = { 'C-level': 1, VP: 1, Director: 1 };
  const BIG = { '200–999': 1, '1,000–4,999': 1, '5,000+': 1 };
  function intentPhrase(i) {
    if (i >= 0.62) return 'live project with budget this quarter';
    if (i >= 0.45) return 'comparing options, timing still open';
    if (i >= 0.3) return 'early research, no project yet';
    return 'no project, just reading';
  }
  function fitWords(l) {
    const plus = [];
    if (SENIOR[l.seniority]) plus.push('a decision maker');
    if (BIG[l.size]) plus.push('right-sized company');
    if (l.icp) plus.push('target industry');
    return plus;
  }
  function activityPhrase(l) {
    const recent = l.events.filter((e) => e.daysAgo <= 30);
    const n = (t) => recent.filter((e) => e.type === t).length;
    const bits = [];
    if (n('demo_request')) bits.push('asked for a demo');
    if (n('pricing_page')) bits.push('viewed pricing' + (n('pricing_page') > 1 ? ' ' + n('pricing_page') + ' times' : ''));
    if (n('event_meeting')) bits.push('met us at an event');
    if (n('webinar_attend')) bits.push('joined a webinar');
    if (bits.length) return bits.join(', ') + ' in the last 30 days';
    if (!l.events.some((e) => e.type !== 'unsubscribe' && e.daysAgo <= 90)) return 'nothing in the last 90 days';
    if (recent.length) return 'only email clicks, page visits or downloads lately';
    return 'activity is more than a month old';
  }
  function leadReason(r) {
    const l = r.lead, w = state.weights;
    if (r.cat === 'fn') {
      const why = l.intent >= 0.45 ? intentPhrase(l.intent) : (fitWords(l).join(', ') || 'right timing') + ', even though they were still early';
      if (!r.engaged) return 'Sales would have taken this one (' + why + '), but they hadn’t touched marketing in 90 days, so the score treats them as cold.';
      const short = w.threshold - r.score;
      const maxFit = w.seniority + w.companySize + w.industry;
      const lowFit = maxFit > 0 && r.fit < 0.5 * maxFit;
      return 'Sales would have taken this one (' + why + '). Missed the line by ' + short + (short === 1 ? ' point' : ' points') + (lowFit ? ': the title or company size scored low on fit.' : ': activity was light or old (' + activityPhrase(l) + ').');
    }
    if (r.cat === 'tp') {
      const plus = [];
      if (l.intent >= 0.45) plus.push(intentPhrase(l.intent));
      plus.push(...fitWords(l));
      return 'Sales took it: ' + (plus.length ? plus.join(', ') : 'enough fit to open a conversation') + '. Signal: ' + activityPhrase(l) + '.';
    }
    if (r.cat === 'fp') {
      const minus = [];
      if (l.intent < 0.45) minus.push(intentPhrase(l.intent));
      if (l.seniority === 'Other') minus.push('a student, recruiter or freelancer with no buying power');
      else if (l.seniority === 'Individual contributor') minus.push('no buying authority');
      else if (l.seniority === 'Manager') minus.push('manager would need sign-off');
      if (l.size === '1–49') minus.push('too small for the offer');
      return 'Sales passed: ' + (minus.length ? minus.join(', ') : 'looked good on paper and active lately, but the timing wasn’t right. Even strong scores miss sometimes') + '. Score came from: ' + activityPhrase(l) + '.';
    }
    return 'Not ready (' + intentPhrase(l.intent) + '). Rightly kept in nurture.';
  }

  // ---------- Render (every frame while you play) ----------
  function render() {
    const res = evaluate(leads, state.weights);
    res.rows.forEach((r) => { r.cat = r.lead.salesReady ? (r.mql ? 'tp' : 'fn') : (r.mql ? 'fp' : 'tn'); });
    current = res;
    const bl = bestLine(res.rows);
    model = { best: bl.best, bestTh: bl.th, lift: Math.round((bl.best - baseBest) * 1000) / 10 };
    const t = res.totals;
    const rate = pct(t.sql, t.mql), recall = pct(t.sql, t.salesReady);
    current.rate = rate; current.recall = recall;

    renderArena(res.rows);
    renderScoreboard(t, rate, recall);
    renderLegend(res.rows);
    if (!tuning) renderInsight(t, rate, recall, res.rows);
    renderFunnel(t);
    if (!dragging && !tuning && !sweeping) renderSources(res.bySource, false);
    $('#seed').textContent = state.seed;
    booted = true;
  }

  // ---------- Settle (once a gesture ends): rewards, lists, reorders ----------
  let settleTimer = 0, lastSettledGrade = null, wasSweet = false;
  function settleSoon(ms, opts) {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => settle(opts || {}), ms);
  }
  function settle(opts) {
    if (dragging || tuning || sweeping || !current) { settleSoon(300, opts); return; }
    const t = current.totals;
    const g = gradeOf(model.lift);
    if (!opts.quiet && state.touched) {
      if (model.lift > state.bestLift + 0.05) {
        const before = gradeOf(state.bestLift);
        state.bestLift = model.lift;
        if (g !== before) {
          toast(`Your best yet: grade ${g}, ${model.lift > 0 ? '+' : ''}${model.lift} points on the default model.`);
          if (g === 'A' || g === 'A+') confetti(100);
        }
      } else if (lastSettledGrade && g !== lastSettledGrade && GRADES.findIndex((x) => x[1] === g) > GRADES.findIndex((x) => x[1] === lastSettledGrade)) {
        flashRing();
      }
    }
    lastSettledGrade = g;
    const sweetNow = Math.abs(state.weights.threshold - model.bestTh) <= 2;
    if (!opts.quiet && state.touched && sweetNow && !wasSweet) toast('You found the sweet spot: the best cut-off for these weights.');
    wasSweet = sweetNow;
    checkBadges({ t, rate: current.rate, recall: current.recall, lift: model.lift, touched: state.touched, expsDone: state.expDone.size, sweet: sweetNow }, opts.quiet);
    const bg = $('#best-grade'); if (bg) bg.textContent = gradeOf(state.bestLift);
    renderSources(current.bySource, true);
    renderLeadTable();
    persist();
  }
  function flashRing() {
    if (!document.querySelector('.grade-card')) return;
    if (REDUCED) return;
    const c = document.querySelector('.grade-card');
    c.classList.remove('drop'); void c.offsetWidth; c.classList.add('drop');
  }

  function renderScoreboard(t, rate, recall) {
    const g = gradeOf(model.lift);
    const gl = $('#grade');
    if (gl.textContent !== g) { gl.textContent = g; if (!REDUCED && booted) { gl.classList.remove('pop'); void gl.offsetWidth; gl.classList.add('pop'); } }
    const mg = $('#mini-grade'); if (mg) mg.textContent = g;
    const C = 2 * Math.PI * 52;
    const rf = $('#ring-fill'); if (rf) rf.style.strokeDashoffset = String(C * (1 - clamp((model.lift + 8) / 14, 0, 1)));
    $('#grade-sub').textContent = `score ${Math.round(model.best * 100)}, default ${Math.round(baseBest * 100)}`;
    const nx = nextGrade(model.lift);
    $('#grade-next').textContent = nx ? `${nx[1]} at ${nx[0] > 0 ? '+' : ''}${nx[0]}` : 'top grade';
    tweenNum($('#m-trust'), rate, (v) => Math.round(v) + '%');
    tweenNum($('#m-caught'), recall, (v) => Math.round(v) + '%');
    $('#mf-trust').style.width = Math.min(100, rate) + '%';
    $('#mf-caught').style.width = Math.min(100, recall) + '%';
  }

  function renderLegend(rows) {
    const counts = { tp: 0, fn: 0, fp: 0, tn: 0 };
    rows.forEach((r) => counts[r.cat]++);
    const el = $('#legend');
    if (!el.children.length) {
      el.innerHTML = CAT_ORDER.map((k) => `<button type="button" data-cat="${k}" aria-pressed="true"><i style="background:${CAT[k].color}"></i>${CAT[k].label} <b id="lc-${k}">0</b></button>`).join('');
      el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.cat; state.show[k] = !state.show[k];
        b.setAttribute('aria-pressed', String(state.show[k])); schedule();
      }));
    }
    CAT_ORDER.forEach((k) => tweenNum($('#lc-' + k), counts[k], fmt));
  }

  function renderInsight(t, rate, recall, rows) {
    const th = state.weights.threshold;
    const band = rows.filter((r) => r.engaged && r.score < th && r.score >= th - 10);
    const buyers = band.filter((r) => r.lead.salesReady).length;
    let s;
    if (!t.mql) s = 'Nothing crosses the line. Drag it left or raise some weights.';
    else {
      s = `Sales trusts <b>${Math.round(rate)}%</b> of the leads you send, and you catch <b>${Math.round(recall)}%</b> of the buyers. `;
      if (band.length) s += `Just left of the line sit ${band.length} leads, and ${buyers} of them are buyers. `;
      s += Math.abs(th - model.bestTh) <= 2 ? 'You are on the sweet spot, the best cut-off for these weights. To score higher, change the weights.' : `The dashed green line at ${model.bestTh} is the sweet spot: the best cut-off for these weights.`;
    }
    $('#insight').innerHTML = s;
  }

  function renderFunnel(t) {
    if (!$('#funnel')) return;
    const stages = [
      { name: 'All leads', note: 'sample', n: t.total },
      { name: 'Engaged', note: Math.round(pct(t.engaged, t.total)) + '% active lately', n: t.engaged },
      { name: 'MQL', note: Math.round(pct(t.mql, t.engaged)) + '% of engaged', n: t.mql },
      { name: 'SQL', note: Math.round(pct(t.sql, t.mql)) + '% sales trust', n: t.sql },
    ];
    const host = $('#funnel');
    if (!host.children.length) {
      host.innerHTML = stages.map((s, i) => `<div class="stage"><div class="stage-name"><span id="fn-${i}"></span><small id="fs-${i}"></small></div>
        <div class="stage-track"><div class="stage-bar" data-stage="${i}" id="fb-${i}"></div></div><div class="stage-count" id="fc-${i}">0</div></div>`).join('');
    }
    stages.forEach((s, i) => {
      $('#fn-' + i).textContent = s.name; $('#fs-' + i).textContent = s.note;
      $('#fb-' + i).style.width = Math.max(1.2, pct(s.n, t.total)) + '%';
      tweenNum($('#fc-' + i), s.n, fmt);
    });
    const drops = [1, 2, 3].map((i) => ({ from: stages[i - 1], to: stages[i], lost: stages[i - 1].n - stages[i].n }));
    const big = drops.sort((a, b) => b.lost - a.lost)[0];
    const tip = big.to.name === 'MQL' ? 'Most engaged leads never reach the line. Lift the signals that matter, or lower the line, and watch this shrink.'
      : big.to.name === 'SQL' ? 'Sales is turning away a lot of your MQLs. Cut points for weak signals like downloads and email clicks.'
      : 'Many leads have gone quiet. Nurture them back before scoring can help.';
    $('#leak').innerHTML = `<b>Biggest leak:</b> ${big.from.name} to ${big.to.name} loses ${fmt(big.lost)} leads. ${tip}`;
  }

  function renderSources(bySource, reorder) {
    const host = $('#sources');
    if (!host.children.length) {
      host.innerHTML = bySource.map((s, i) => `<div class="src-row" data-src="${esc(s.source)}"><span>${esc(s.source)}<span class="n" id="sn-${i}"></span></span>
        <div class="track"><div class="fill" id="sf-${i}"></div></div><span class="pct" id="sp-${i}"></span><span class="why">${esc(SOURCE_WHY[s.source] || '')}</span></div>`).join('');
      host._order = bySource.map((s) => s.source);
      reorder = true;
    }
    bySource.forEach((s) => {
      const i = host._order.indexOf(s.source);
      const r = s.mql ? pct(s.sql, s.mql) : 0;
      $('#sf-' + i).style.width = r + '%';
      $('#sp-' + i).textContent = s.mql ? Math.round(r) + '%' : '–';
      $('#sn-' + i).textContent = s.sql + ' of ' + s.mql + ' MQLs accepted';
    });
    if (!reorder) return;
    // FLIP: rows glide to their new rank
    const rows = [...host.children];
    const first = rows.map((r) => r.getBoundingClientRect().top);
    const ranked = bySource.slice().sort((a, b) => (b.mql ? b.sql / b.mql : -1) - (a.mql ? a.sql / a.mql : -1) || b.mql - a.mql);
    ranked.forEach((s, rank) => { host.children[host._order.indexOf(s.source)].style.order = rank; });
    if (REDUCED) return;
    rows.forEach((r, i) => {
      const dy = first[i] - r.getBoundingClientRect().top;
      if (!dy) return;
      r.style.transition = 'none'; r.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => { r.style.transition = 'transform 450ms var(--spring)'; r.style.transform = ''; });
    });
  }

  let spotSeed = 0;
  function renderLeadTable(animate) {
    if (!current) return;
    const slots = [
      { cat: 'tp', title: 'A buyer you reached', pill: 'Sent to sales', cls: 'sql' },
      { cat: 'fn', title: 'A buyer you missed', pill: 'Missed buyer', cls: 'missed' },
      { cat: 'fp', title: 'A call sales didn\u2019t want', pill: 'Wasted call', cls: 'rej' },
    ];
    $('#spotlight').innerHTML = slots.map((sl, n) => {
      const list = current.rows.map((r, i) => ({ r, i })).filter((x) => x.r.cat === sl.cat);
      if (!list.length) return `<div class="spot-card empty ${sl.cat}"><p class="spot-title">${sl.title}</p><p class="spot-why">Nobody here right now. Move the line and see who turns up.</p></div>`;
      list.sort((a, b) => hash(a.r.lead.id + spotSeed) - hash(b.r.lead.id + spotSeed));
      const { r, i } = list[0], l = r.lead;
      return `<button type="button" class="spot-card ${sl.cat}${animate ? ' deal' : ''}" style="animation-delay:${n * 90}ms" data-lead="${i}">
        <span class="spot-title">${sl.title}</span>
        <span class="spot-company">${esc(l.company)}</span>
        <span class="spot-who">${esc(l.name)}, ${esc(l.title)}</span>
        <span class="spot-meta"><span class="pill ${sl.cls}">${sl.pill}</span>Score ${r.score} · ${esc(l.source)}</span>
        <span class="spot-why">${esc(leadReason(r))}</span>
        <span class="spot-go">See it on the chart</span>
      </button>`;
    }).join('');
  }

  // ---------- Badges ----------
  function renderBadges(justWon) {
    if (!$('#badges')) return;
    const just = new Set(justWon || []);
    $('#badges').innerHTML = BADGES.map((b) => `<div class="badge${state.badges.has(b.id) ? ' won' : ''}${just.has(b.id) ? ' just' : ''}">
      <span class="medal" aria-hidden="true">★</span><div><b>${esc(b.title)}</b><small>${esc(b.desc)}</small></div></div>`).join('');
    $('#badge-count').textContent = state.badges.size + ' of ' + BADGES.length + ' done';
  }
  function checkBadges(ctx, quiet) {
    const won = BADGES.filter((b) => !state.badges.has(b.id) && b.check(ctx));
    won.forEach((b) => state.badges.add(b.id));

    if ($('#badges') && (won.length || !$('#badges').children.length)) renderBadges(won.map((b) => b.id));
  }

  // ---------- Experiments ----------
  const ZERO = { seniority: 0, companySize: 0, industry: 0, demoRequest: 0, eventMeeting: 0, webinarAttend: 0, pricingPage: 0, contentDownload: 0, emailClick: 0, webVisit: 0, unsubscribe: 0, halfLife: 30, threshold: 1 };
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function topModel(w) {
    const rows = evaluate(leads, Object.assign({}, ZERO, w)).rows
      .map((r) => ({ r, k: hash(r.lead.id + ':' + state.seed) }))
      .sort((a, b) => b.r.score - a.r.score || a.k - b.k).slice(0, 100);
    return { buyers: rows.filter((x) => x.r.lead.salesReady).length, cut: Math.max(CTL.threshold.min, rows[rows.length - 1].r.score) };
  }
  function metricOf(w, key) {
    const t = evaluate(leads, w).totals;
    return key === 'rate' ? pct(t.sql, t.mql) : t[key];
  }
  function expProgress() {
    const p = $('#exp-progress'); if (!p) return;
    p.textContent = state.expDone.size ? `You've answered ${state.expDone.size} of ${EXPERIMENTS.length} and got ${state.expRight} right.` : '';
  }
  function dotsHtml() {
    return `<div class="exp-dots" aria-hidden="true">${EXPERIMENTS.map((e, i) => `<i class="${i === state.expIdx ? 'now' : state.expDone.has(e.id) ? 'done' : ''}"></i>`).join('')}</div>`;
  }

  function markWinner(body, actual, pick, tag) {
    const w = body.querySelector(`[data-pick="${actual}"]`);
    w.classList.add('winner');
    w.querySelector('.choice-label').insertAdjacentHTML('afterend', `<span class="win-tag">${tag}</span>`);
    if (pick !== actual) body.querySelector(`[data-pick="${pick}"]`).classList.add('wrong-pick');
  }
  function showChartTop() {
    const qb = $('#quizbar');
    const pinned = getComputedStyle(document.querySelector('.stage')).position === 'sticky';
    const anchor = !pinned && qb && !qb.hidden ? qb : document.getElementById('play');
    const top = anchor.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo({ top: Math.max(0, top), behavior: REDUCED ? 'auto' : 'smooth' });
  }
  function hideQuizbar() { const q = $('#quizbar'); if (q) q.hidden = true; }
  function restoreMine() {
    if (state.myWeights) applyWeights(state.myWeights);
    state.myWeights = null;
    hideQuizbar();
    const b = $('#exp-back'); if (b) b.remove();
  }

  function renderExp(focusFirst) {
    const body = $('#exp-body');
    expProgress();
    if (state.expIdx >= EXPERIMENTS.length) {
      body.innerHTML = `<div class="exp-card">${dotsHtml()}<p class="exp-step">All five done</p>
        <h3 class="exp-title" tabindex="-1" id="exp-focus">You got ${state.expRight} of ${EXPERIMENTS.length} right.</h3>
        <p class="exp-ask">Every answer came from these 500 leads, worked out live. Press "Shuffle leads" at the top for a new set of leads and see if the answers still hold.</p>
        <div class="exp-actions"><button class="primary-btn" id="exp-restart" type="button">Start again</button></div></div>`;
      $('#exp-restart').onclick = () => { state.expIdx = 0; state.expRight = 0; state.expDone.clear(); persist(); renderExp(true); };
      if (focusFirst) $('#exp-focus').focus();
      return;
    }
    const ex = EXPERIMENTS[state.expIdx];
    const keys = ex.kind === 'duel' ? ['a', 'b'] : ['up', 'down'];
    const label = (k) => (ex.kind === 'duel' ? ex[k].label : ex[k]);
    const choices = keys.map((k) => `<button class="choice" type="button" data-pick="${k}"><span class="choice-label">${esc(label(k))}</span><span class="choice-result" id="res-${k}"></span></button>`).join('');
    body.innerHTML = `<div class="exp-card">${dotsHtml()}<p class="exp-step">Question ${state.expIdx + 1} of ${EXPERIMENTS.length}</p>
      <h3 class="exp-title">${esc(ex.title)}</h3>
      <p class="exp-ask">${esc(ex.ask)}</p>
      <p class="exp-pick">Pick your answer:</p>
      <div class="choices">${choices}</div>
      <p class="exp-how"><b>How we check:</b> ${esc(ex.how)}</p>
      <div id="exp-result" aria-live="polite"></div></div>`;
    body.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => runExp(ex, b.dataset.pick, b)));
    if (focusFirst) body.querySelector('[data-pick]').focus();
  }

  function runExp(ex, pick, btn) {
    const body = $('#exp-body');
    body.querySelectorAll('[data-pick]').forEach((b) => { b.setAttribute('aria-disabled', 'true'); b.disabled = true; });
    btn.classList.add('picked');
    btn.querySelector('.choice-label').insertAdjacentHTML('afterend', '<span class="your-pick">Your pick</span>');
    const SPEED = REDUCED ? 0 : 1100;
    let right, actual, loadWeights, showLabel, quizNote = '';
    if (ex.kind === 'duel') {
      const A = topModel(ex.a.weights), B = topModel(ex.b.weights);
      actual = A.buyers >= B.buyers ? 'a' : 'b';
      right = pick === actual;
      const random = Math.round(pct(leads.filter((l) => l.salesReady).length, leads.length));
      ['a', 'b'].forEach((k) => {
        const m = k === 'a' ? A : B;
        $('#res-' + k).innerHTML = `<span class="r-num"><b id="num-${k}">0</b> of the top 100 are real buyers</span>
          <span class="r-bar"><i id="bar-${k}"></i><s style="left:${random}%"><em>chance: ${random}</em></s></span>`;
        const n = $('#num-' + k); n._v = 0;
        tweenNum(n, m.buyers, (v) => Math.round(v), SPEED);
        requestAnimationFrame(() => requestAnimationFrame(() => { $('#bar-' + k).style.width = m.buyers + '%'; }));
      });
      const win = actual === 'a' ? A : B;
      loadWeights = Object.assign({}, ZERO, ex[actual].weights, { threshold: win.cut });
      setTimeout(() => markWinner(body, actual, pick, ex.kind === 'duel' ? 'Most buyers' : 'Right answer'), SPEED);
      body.querySelector('.choices').insertAdjacentHTML('afterend', `<p class="exp-under">Picking 100 leads at random would find about ${random} real buyers.</p>`);
      showLabel = 'See these 100 leads on the chart';
      quizNote = `Showing question ${state.expIdx + 1}: ${ex[actual].label.toLowerCase()} only. Every other point value is set to 0, and the cut-off is placed so about 100 leads go to sales. One signal on its own scores low, so a low grade here is expected.`;
    } else {
      const before = metricOf(DEFAULT_WEIGHTS, ex.metric);
      loadWeights = Object.assign({}, DEFAULT_WEIGHTS, ex.patch);
      const after = metricOf(loadWeights, ex.metric);
      actual = after > before ? 'up' : 'down';
      right = pick === actual;
      const f = ex.metric === 'rate' ? (v) => Math.round(v) + '%' : fmt;
      const totalBuyers = leads.filter((l) => l.salesReady).length;
      body.querySelector('.choices').insertAdjacentHTML('afterend', `<p class="exp-under exp-dir">${esc(ex.metricLabel)}: <b>${f(before)}</b> → <b id="dir-b">${f(before)}</b>${ex.metric === 'missed' ? ` <span>(out of ${totalBuyers} real buyers)</span>` : ''}</p>`);
      const nb = $('#dir-b'); nb._v = before; tweenNum(nb, after, f, SPEED);
      setTimeout(() => markWinner(body, actual, pick, ex.kind === 'duel' ? 'Most buyers' : 'Right answer'), SPEED);
      showLabel = 'See this cut-off on the chart';
      quizNote = `Showing question ${state.expIdx + 1}: the default settings with the cut-off at ${ex.patch.threshold}.`;
    }
    const demoers = leads.filter((l) => l.events.some((e) => e.type === 'demo_request'));
    const ctx = { demoLeads: demoers.length, demoBuyers: demoers.filter((l) => l.salesReady).length, total: leads.length };
    const lessonText = typeof ex.lesson === 'function' ? ex.lesson(ctx) : ex.lesson;
    const lesson = actual === ex.expect ? lessonText : 'These 500 leads went against the usual pattern, which can happen with a small sample. Press "Shuffle leads" at the top and try this question again.';
    const src = ex.source && SOURCES[ex.source] ? `<p class="src">Source: <a href="${SOURCES[ex.source].url}" target="_blank" rel="noopener">${esc(SOURCES[ex.source].label)}</a></p>` : '';
    if (!state.expDone.has(ex.id)) { state.expDone.add(ex.id); if (right) state.expRight++; }
    setTimeout(() => {
      const last = state.expIdx >= EXPERIMENTS.length - 1;
      $('#exp-result').innerHTML = `<div class="verdict ${right ? 'right' : 'wrong'}"><h3 tabindex="-1" id="verdict-h">${right ? 'Right.' : 'Not quite.'}</h3><p><b>Why:</b> ${esc(lesson)}</p>${src}</div>
        <div class="exp-actions"><button class="primary-btn" id="exp-next" type="button">${last ? 'See how you did' : 'Next question'}</button><button class="ghost-btn" id="exp-load" type="button">${showLabel}</button></div>`;
      $('#verdict-h').focus({ preventScroll: true });
      $('#exp-next').onclick = () => { state.expIdx++; persist(); renderExp(true); };
      const ld = $('#exp-load');
      ld.onclick = () => {
        if (!state.myWeights) state.myWeights = Object.assign({}, state.weights);
        const qb = $('#quizbar'); $('#quizbar-text').textContent = quizNote; qb.hidden = false;
        showChartTop();
        setTimeout(() => applyWeights(loadWeights), REDUCED ? 0 : 350);
        ld.outerHTML = '<button class="ghost-btn" id="exp-back" type="button">Put my settings back</button>';
        $('#exp-back').onclick = () => restoreMine();
      };
      expProgress();
      persist();
      settleSoon(0);
    }, SPEED + 50);
  }

  // ---------- Six rules: try it ----------
  function f1At(w) { return bestLine(evaluate(leads, w).rows).best; }
  function focusArena() {
    const a = document.querySelector('.arena');
    const r = a.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) a.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
  }
  let sweeping = 0;
  function tryRule(kind, btn) {
    focusArena();
    if (kind === 'capacity') {
      const sorted = current.rows.filter((r) => r.engaged).map((r) => r.score).sort((a, b) => b - a);
      const cut = sorted[Math.min(49, sorted.length - 1)] || 1;
      applyWeights(Object.assign({}, state.weights, { threshold: cut }));
      setTimeout(() => toast('If sales only has time for about 50 calls, these are the leads that get them.'), 500);
    } else if (kind === 'buyers') {
      const only = !(state.show.fp === false && state.show.tn === false);
      state.show = { tp: true, fn: true, fp: !only, tn: !only };
      document.querySelectorAll('#legend [data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(state.show[b.dataset.cat])));
      btn.textContent = only ? 'Show everyone again' : 'Try it: show only real buyers';
      if (only) toast('These are the only leads sales would take. Everything else is hidden.');
      schedule();
    } else if (kind === 'fit') {
      applyWeights(Object.assign({}, DEFAULT_WEIGHTS, { demoRequest: 0, eventMeeting: 0, webinarAttend: 0, pricingPage: 0, contentDownload: 0, emailClick: 0, webVisit: 0, unsubscribe: 0, threshold: 30 }));
      setTimeout(() => toast('Scoring on job title and company alone. Watch how many coral dots get left behind.'), 500);
    } else if (kind === 'fade') {
      applyWeights(Object.assign({}, DEFAULT_WEIGHTS, { halfLife: 7 }));
      setTimeout(() => toast('Activity now loses half its value every 7 days. Last month barely counts.'), 500);
    } else if (kind === 'sweep') {
      if (sweeping) return;
      const start = state.weights.threshold;
      const path = [];
      for (let v = start; v >= 20; v -= 1) path.push(v);
      for (let v = 20; v <= 80; v += 1) path.push(v);
      for (let v = 80; v >= start; v -= 1) path.push(v);
      let k = 0;
      state.touched = true;
      frozenXMax = layout.xMax;
      svg.classList.add('instant');
      sweeping = setInterval(() => {
        state.weights.threshold = path[k++]; syncInputs(); schedule();
        if (k >= path.length) {
          clearInterval(sweeping); sweeping = 0; frozenXMax = null; svg.classList.remove('instant');
          toast('Further left reaches more buyers and wastes more calls. Further right does the opposite.');
          schedule(); settleSoon(200);
        }
      }, REDUCED ? 1 : 28);
    } else if (kind === 'ai') {
      aiTune();
    }
  }

  // ---------- AI tune: hill-climb on this sample's real outcomes ----------
  let tuning = false;
  function aiTune() {
    if (tuning) return;
    tuning = true;
    focusArena();
    const btn = $('#ai-btn'), label = $('#ai-label');
    btn.classList.add('running');
    let w = Object.assign({}, state.weights);
    let best = f1At(w);
    const start = best;
    let step = 0, kept = 0;
    const STEPS = 120, TRIES = 6;
    const keys = CONTROLS.filter((c) => c.key !== 'threshold');
    const tick = () => {
      for (let n = 0; n < TRIES; n++) {
        const c = keys[Math.floor(Math.random() * keys.length)];
        const cand = Object.assign({}, w);
        cand[c.key] = clamp(Math.round(w[c.key] + (Math.random() - 0.5) * (c.max - c.min) * 0.3), c.min, c.max);
        const f = f1At(cand);
        if (f > best + 1e-9) { best = f; w = cand; kept++; }
      }
      step++;
      // keep the line on the sweet spot of the improving model
      w.threshold = clamp(bestLine(evaluate(leads, w).rows).th, CTL.threshold.min, CTL.threshold.max);
      state.weights = Object.assign({}, w);
      syncInputs();
      schedule();
      label.textContent = 'Trying weights… ' + Math.round((100 * step) / STEPS) + '%';
      if (step < STEPS) { setTimeout(tick, REDUCED ? 0 : 35); return; }
      tuning = false;
      btn.classList.remove('running');
      label.textContent = 'Try again';
      setTimeout(() => questDone('ai'), 1400);
      wasSweet = true;
      state.touched = true;
      const gained = best > start + 1e-6;
      toast(gained ? `The computer reached grade ${gradeOf(Math.round((best - baseBest) * 1000) / 10)} by learning from who sales took. Try to beat it by hand.` : 'The computer found nothing better from here. Your weights were already strong.');
      setTimeout(() => {
        $('#insight').innerHTML = `<b>What the computer did:</b> it tried ${STEPS * TRIES} small weight changes and kept the ${kept} that lifted the score, using who sales really took in this sample. Predictive scoring in HubSpot, Salesforce or Dynamics 365 works on the same idea, learning from your won and lost deals. It can also overfit: hit Shuffle leads and see if its weights still hold up.`;
      }, 60);
      settleSoon(100);
    };
    tick();
  }

  function renderSourcesList() {
    $('#src-list').innerHTML = Object.values(SOURCES).map((s) => `<a class="ss-chip" href="${s.url}" target="_blank" rel="noopener" title="${esc(s.label)}">${esc(s.short || s.label)}</a>`).join('');
  }

  // ---------- Mission ----------
  function renderQuest() {
    if (!$('#quest')) return;
    document.querySelectorAll('#quest [data-q]').forEach((li) => li.classList.toggle('done', !!state.quest[li.dataset.q]));
    const all = state.quest.drag && state.quest.style && state.quest.ai;
    $('#quest-done').hidden = !all;
  }
  function questDone(key) {
    if (state.quest[key] || !$('#quest')) return;
    state.quest[key] = true;
    renderQuest();
    const li = document.querySelector(`#quest [data-q="${key}"]`);
    if (li && !REDUCED) { li.classList.remove('pop'); void li.offsetWidth; li.classList.add('pop'); }
    if (state.quest.drag && state.quest.style && state.quest.ai) { toast('Mission complete. You\u2019re a lead-scoring pro!'); confetti(180); }
    else toast('Nice! ' + ['drag', 'style', 'ai'].filter((k) => state.quest[k]).length + ' of 3 done');
    persist();
  }

  // ---------- Boot ----------
  loadLeads();
  buildControls();
  buildDots();
  syncInputs();
  renderSourcesList();
  renderExp(false);
  renderQuest();
  ['#m-trust', '#m-caught'].forEach((s) => { $(s)._v = 0; });
  void svg.getBoundingClientRect();
  requestAnimationFrame(() => {
    stagger(true);
    render();
    lastSettledGrade = gradeOf(model.lift);
    settle({ quiet: true });
  });
})();
