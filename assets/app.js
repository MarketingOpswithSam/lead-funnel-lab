/* Lead Funnel Lab: interactive layer. Depends on leads.js, scoring.js and experiments.js. */
(function () {
  'use strict';

  const { CONTROLS, DEFAULT_WEIGHTS, PRESETS, evaluate } = window.Scoring;
  const { EXPERIMENTS, BADGES, SOURCES } = window.LabGames;
  const DEFAULT_SEED = 2611;
  const LEAD_COUNT = 500;
  const STORE_KEY = 'lead-funnel-lab:v2';
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (s) => document.querySelector(s);
  const fmt = (n) => Math.round(n).toLocaleString('en-AU');
  const pct = (a, b) => (b > 0 ? (100 * a) / b : 0);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const PRESET_BLURBS = { balanced: 'A bit of everything', fit: 'Right company, right role', intent: 'Buying signals win', content: 'Rewards downloads' };
  const QUICK = ['demoRequest', 'pricingPage', 'seniority'];
  const GRADES = [[0.5, 'A+'], [0.47, 'A'], [0.44, 'B'], [0.4, 'C'], [0.34, 'D'], [0, 'F']];
  const gradeOf = (f) => GRADES.find((g) => f >= g[0])[1];
  const gradeRank = (g) => GRADES.findIndex((x) => x[1] === g);
  const CAT = {
    tp: { label: 'Buyers sent to sales', color: 'var(--c-sql)' },
    fn: { label: 'Buyers missed', color: 'var(--c-missed)' },
    fp: { label: 'Wasted calls', color: 'var(--c-wasted)' },
    tn: { label: 'Rightly left out', color: 'var(--c-neutral)' },
  };
  const CAT_ORDER = ['tp', 'fn', 'fp', 'tn'];

  // ---------- State ----------
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { saved = {}; }
  const state = {
    seed: Number.isInteger(saved.seed) ? saved.seed : DEFAULT_SEED,
    weights: Object.assign({}, DEFAULT_WEIGHTS, saved.weights || {}),
    bestF1: typeof saved.bestF1 === 'number' ? saved.bestF1 : 0,
    badges: new Set(saved.badges || []),
    expDone: new Set(saved.expDone || []),
    expRight: saved.expRight || 0,
    expIdx: Number.isInteger(saved.expIdx) ? saved.expIdx % (EXPERIMENTS.length + 1) : 0,
    touched: !!saved.touched,
    table: 'mql',
    show: { tp: true, fn: true, fp: true, tn: true },
  };
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        seed: state.seed, weights: state.weights, bestF1: state.bestF1, badges: [...state.badges],
        expDone: [...state.expDone], expRight: state.expRight, expIdx: state.expIdx, touched: state.touched,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  let leads = window.LeadData.generateLeads(state.seed, LEAD_COUNT);
  let baseline = evaluate(leads, DEFAULT_WEIGHTS).totals;
  let current = null;
  let booted = false;
  let lastGrade = null;

  // ---------- Small motion helpers ----------
  function tweenNum(el, to, format) {
    const from = typeof el._v === 'number' ? el._v : to;
    el._v = to;
    if (REDUCED || from === to) { el.textContent = format(to); return; }
    const t0 = performance.now(), dur = 480;
    cancelAnimationFrame(el._raf);
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = format(from + (to - from) * e);
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }
  function bump(el) {
    if (REDUCED) return;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  function toast(html) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<span class="star" aria-hidden="true">★</span><span>' + html + '</span>';
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2800);
  }

  // Confetti in brand and chart colours.
  const confettiCanvas = $('#confetti');
  const cctx = confettiCanvas.getContext('2d');
  let parts = [], confettiRaf = 0;
  function confetti(amount) {
    if (REDUCED) return;
    const dpr = window.devicePixelRatio || 1;
    confettiCanvas.width = innerWidth * dpr; confettiCanvas.height = innerHeight * dpr;
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ['#311e70', '#4f3bb0', '#d98e00', '#14a38b', '#e2553b', '#ffd36b'];
    for (let i = 0; i < (amount || 140); i++) {
      parts.push({
        x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.5, y: innerHeight * 0.35,
        vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 12 - 4, g: 0.32 + Math.random() * 0.1,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        c: colors[i % colors.length], life: 0,
      });
    }
    if (!confettiRaf) confettiRaf = requestAnimationFrame(tickConfetti);
  }
  function tickConfetti() {
    cctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.y < innerHeight + 40 && p.life < 240);
    for (const p of parts) {
      p.life++; p.vy += p.g; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      cctx.save(); cctx.translate(p.x, p.y); cctx.rotate(p.r); cctx.fillStyle = p.c;
      cctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.life / 8))); cctx.restore();
    }
    confettiRaf = parts.length ? requestAnimationFrame(tickConfetti) : 0;
    if (!parts.length) cctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  // ---------- Controls ----------
  function ctlHtml(c) {
    return `<div class="ctl">
      <label for="w-${c.key}">${esc(c.label)}</label>
      <output id="o-${c.key}" for="w-${c.key}"></output>
      <input type="range" id="w-${c.key}" data-key="${c.key}" min="${c.min}" max="${c.max}" step="${c.step}">
      <small>${esc(c.hint)}</small>
    </div>`;
  }

  function buildControls() {
    $('#presets').innerHTML = Object.entries(PRESETS).map(([k, p]) => `
      <button class="preset" type="button" data-preset="${k}" aria-pressed="false">${esc(p.label.replace(/ \(.*\)$/, ''))}<small>${esc(PRESET_BLURBS[k] || '')}</small></button>`).join('');
    $('#quick').innerHTML = QUICK.map((k) => ctlHtml(CONTROLS.find((c) => c.key === k))).join('');
    const rest = CONTROLS.filter((c) => c.key !== 'threshold' && !QUICK.includes(c.key));
    const groups = {};
    for (const c of rest) (groups[c.group] = groups[c.group] || []).push(c);
    const names = { 'Fit: who they are': 'Who they are', 'Engagement: what they did': 'What they did', 'Handover and decay': 'Timing' };
    $('#controls').innerHTML = Object.entries(groups).map(([g, items]) => `<p class="group-h">${esc(names[g] || g)}</p>${items.map(ctlHtml).join('')}`).join('');

    document.addEventListener('input', (e) => {
      const key = e.target.dataset && e.target.dataset.key;
      if (!key) return;
      state.weights[key] = Number(e.target.value);
      state.touched = true;
      syncInputs();
      schedule();
    });
    document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      applyWeights(PRESETS[b.dataset.preset].weights);
    }));
    $('#reset').addEventListener('click', () => applyWeights(DEFAULT_WEIGHTS));
    $('#reseed').addEventListener('click', () => {
      state.seed = 1000 + Math.floor(Math.random() * 9000);
      loadSample();
      toast('New sample of 500 leads. Same rules, new people.');
    });
    document.querySelectorAll('[data-table]').forEach((b) => b.addEventListener('click', () => { state.table = b.dataset.table; renderLeadTable(); }));
    $('#leads-fold').addEventListener('toggle', renderLeadTable);
  }

  function applyWeights(w, opts) {
    state.weights = Object.assign({}, w);
    state.touched = state.touched || !(opts && opts.silent);
    syncInputs();
    stagger();
    schedule();
  }

  function syncInputs() {
    for (const c of CONTROLS) {
      const el = document.getElementById('w-' + c.key);
      const v = state.weights[c.key];
      if (el) {
        if (Number(el.value) !== v) el.value = v;
        el.style.setProperty('--fill', (100 * (v - c.min)) / (c.max - c.min) + '%');
      }
      const o = document.getElementById('o-' + c.key);
      if (o) {
        if (c.key === 'threshold') o.textContent = v;
        else o.textContent = (v > 0 && c.key !== 'halfLife' ? '+' : '') + v + ' ' + c.unit;
      }
    }
    const active = Object.entries(PRESETS).find(([, p]) => Object.keys(p.weights).every((k) => p.weights[k] === state.weights[k]));
    document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(!!active && b.dataset.preset === active[0])));
  }

  function loadSample() {
    leads = window.LeadData.generateLeads(state.seed, LEAD_COUNT);
    baseline = evaluate(leads, DEFAULT_WEIGHTS).totals;
    buildDots();
    stagger(true);
    schedule();
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
  let dotEls = [], pos = [], layout = null, dragging = false, hoverIdx = -1;
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  svg.innerHTML = '';
  const zone = mk('rect', { class: 'zone-sales', y: M.t - 26, height: H - M.b - M.t + 26, rx: 10 });
  const zoneL = mk('text', { class: 'zone-label', y: M.t - 10, x: M.l + 4 }); zoneL.textContent = '← Stays in nurture';
  const zoneR = mk('text', { class: 'zone-label', y: M.t - 10, 'text-anchor': 'end', x: W - M.r - 6 }); zoneR.textContent = 'Sent to sales →';
  const axis = mk('g', { class: 'axis' });
  const dotsG = mk('g', {});
  const lineG = mk('g', { class: 'line-g' });
  const lineHit = mk('line', { class: 'line-hit', y1: M.t - 30, y2: H - M.b });
  const line = mk('line', { class: 'mql-line', y1: M.t - 30, y2: H - M.b });
  const handle = mk('rect', { class: 'handle', y: M.t - 44, height: 26, width: 92, rx: 13 });
  const handleText = mk('text', { class: 'handle-text', y: M.t - 26, 'text-anchor': 'middle' });
  lineG.append(lineHit, line, handle, handleText);
  svg.append(zone, zoneL, zoneR, axis, dotsG, lineG);

  function buildDots() {
    dotsG.innerHTML = '';
    dotEls = leads.map((l, i) => {
      const c = mk('circle', { class: 'dot', r: 4, cx: 0, cy: 0, 'data-i': i });
      dotsG.appendChild(c);
      return c;
    });
    pos = leads.map(() => ({ x: W / 2, y: -20 }));
    dotEls.forEach((d) => { d.style.transform = `translate(${W / 2}px, -30px)`; });
  }

  function stagger(big) {
    if (REDUCED) return;
    dotEls.forEach((d, i) => { d.style.transitionDelay = ((i * 7) % (big ? 420 : 220)) + 'ms'; });
    clearTimeout(stagger._t);
    stagger._t = setTimeout(() => dotEls.forEach((d) => { d.style.transitionDelay = '0ms'; }), big ? 1300 : 900);
  }

  function computeLayout(rows) {
    const maxScore = rows.reduce((m, r) => Math.max(m, r.score), 0);
    const xMax = Math.max(40, Math.ceil((Math.max(maxScore, state.weights.threshold) + 6) / 10) * 10);
    const pw = W - M.l - M.r, ph = H - M.t - M.b;
    const pxPer = pw / xMax;
    const binW = Math.max(1, Math.ceil(8.5 / pxPer));
    const cols = new Map();
    rows.forEach((r, i) => {
      const b = Math.floor(r.score / binW);
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

  function sizeArena() {
    const narrow = $('#swarm-wrap').clientWidth < 640;
    const nw = narrow ? 420 : 960, nh = narrow ? 460 : 340;
    if (nw === W && nh === H) return false;
    W = nw; H = nh;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    zone.setAttribute('height', H - M.b - M.t + 26);
    [line, lineHit].forEach((l) => l.setAttribute('y2', H - M.b));
    zoneR.setAttribute('x', W - M.r - 6);
    return true;
  }
  window.addEventListener('resize', () => { if (sizeArena()) schedule(); });

  function renderArena(rows) {
    sizeArena();
    layout = computeLayout(rows);
    const th = state.weights.threshold;
    const lx = layout.sx(th);
    rows.forEach((r, i) => {
      const d = dotEls[i];
      const p = layout.pos[i];
      pos[i] = p;
      d.setAttribute('class', 'dot ' + r.cat + (state.show[r.cat] ? '' : ' dim') + (i === hoverIdx ? ' hot' : ''));
      d.setAttribute('r', i === hoverIdx ? layout.rad + 2.5 : layout.rad);
      d.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    });
    zone.setAttribute('x', lx); zone.setAttribute('width', Math.max(0, W - M.r - lx + 8));
    [line, lineHit].forEach((l) => { l.setAttribute('x1', lx); l.setAttribute('x2', lx); });
    const hw = 92, hx = Math.min(W - hw - 2, Math.max(2, lx - hw / 2));
    handle.setAttribute('x', hx);
    handleText.setAttribute('x', hx + hw / 2);
    handleText.textContent = '◂ MQL ≥ ' + th + ' ▸';
    zoneL.style.opacity = lx - M.l > 170 ? 1 : 0;
    zoneR.style.opacity = W - M.r - lx > 150 ? 1 : 0;
    zoneR.setAttribute('x', W - M.r - 6);
    const step = layout.xMax <= 60 ? 10 : layout.xMax <= 160 ? 20 : 50;
    let ax = `<line x1="${M.l}" x2="${W - M.r}" y1="${H - M.b + 2}" y2="${H - M.b + 2}"/>`;
    for (let v = 0; v <= layout.xMax; v += step) ax += `<text x="${layout.sx(v)}" y="${H - 10}" text-anchor="middle">${v}</text>`;
    axis.innerHTML = ax;
  }

  function toSvgX(e) {
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height, r };
  }
  const thc = CONTROLS.find((c) => c.key === 'threshold');
  function setThresholdFromX(x) {
    const v = Math.max(thc.min, Math.min(thc.max, Math.round(layout.inv(x))));
    if (v !== state.weights.threshold) { state.weights.threshold = v; state.touched = true; syncInputs(); schedule(); }
  }
  svg.addEventListener('pointerdown', (e) => {
    if (!layout) return;
    const p = toSvgX(e);
    const lx = layout.sx(state.weights.threshold);
    const onLine = Math.abs(p.x - lx) < 26 || e.target === handle || e.target === handleText;
    const onDot = e.target.classList && e.target.classList.contains('dot');
    if (onDot && !onLine) { showTip(Number(e.target.dataset.i), true); return; }
    dragging = true;
    svg.classList.add('dragging', 'instant');
    svg.setPointerCapture(e.pointerId);
    hideTip();
    if (!onLine) setThresholdFromX(p.x);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!layout) return;
    const p = toSvgX(e);
    if (dragging) { setThresholdFromX(p.x); return; }
    if (e.pointerType === 'touch') return;
    let best = -1, bd = 14 * 14;
    for (let i = 0; i < pos.length; i++) {
      const q = pos[i]; if (!q) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    if (best !== hoverIdx) { if (best >= 0) showTip(best); else hideTip(); }
  });
  const endDrag = () => { if (!dragging) return; dragging = false; svg.classList.remove('dragging', 'instant'); };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('pointerleave', () => { if (!dragging) hideTip(); });
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      state.weights.threshold = Math.max(thc.min, Math.min(thc.max, state.weights.threshold + (e.key === 'ArrowRight' ? 1 : -1)));
      state.touched = true; syncInputs(); schedule(); e.preventDefault();
    }
  });
  svg.setAttribute('tabindex', '0');

  function showTip(i) {
    if (!current) return;
    const prev = hoverIdx;
    hoverIdx = i;
    if (dotEls[prev]) { dotEls[prev].classList.remove('hot'); dotEls[prev].setAttribute('r', layout.rad); }
    dotEls[i].classList.add('hot'); dotEls[i].setAttribute('r', layout.rad + 2.5);
    const r = current.rows[i], l = r.lead;
    const cat = CAT[r.cat];
    const tip = $('#tip');
    tip.innerHTML = `<b>${esc(l.company)}</b><span class="tip-sub">${esc(l.name)}, ${esc(l.title)} · ${esc(l.source)}</span>
      <div class="tip-row"><span class="tag-pill" style="background:${cat.color};color:${r.cat === 'tn' ? 'var(--ink)' : '#fff'}">${cat.label}</span><span>Score ${r.score} (fit ${r.fit}, activity ${r.engagement})</span></div>
      <span>${esc(leadReason(r, !r.mql && l.salesReady))}</span>`;
    tip.hidden = false;
    const wrap = $('#swarm-wrap').getBoundingClientRect();
    const sx = wrap.width / W;
    const px = pos[i].x * sx, py = pos[i].y * sx;
    const tw = tip.offsetWidth, tht = tip.offsetHeight;
    let left = px + 14; if (left + tw > wrap.width) left = px - tw - 14;
    let top = py - tht - 10; if (top < 0) top = py + 14;
    tip.style.left = Math.max(0, left) + 'px'; tip.style.top = top + 'px';
  }
  function hideTip() {
    if (dotEls[hoverIdx]) { dotEls[hoverIdx].classList.remove('hot'); if (layout) dotEls[hoverIdx].setAttribute('r', layout.rad); }
    hoverIdx = -1; $('#tip').hidden = true;
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
  function leadReason(r, missed) {
    const l = r.lead;
    if (missed) {
      const w = state.weights;
      if (!r.engaged) return 'Would have bought (' + intentPhrase(l.intent) + '), but hadn’t touched marketing in 90 days, so the score treats them as cold.';
      const short = w.threshold - r.score;
      const lowFit = w.seniority + w.companySize + w.industry > 0 && r.fit < 0.5 * (w.seniority + w.companySize + w.industry);
      return 'Would have bought (' + intentPhrase(l.intent) + '). Missed the line by ' + short + (short === 1 ? ' point' : ' points') + (lowFit ? ': the title or company size scored low on fit.' : ': activity was light or old (' + activityPhrase(l) + ').');
    }
    if (r.sql) {
      const plus = [];
      if (l.intent >= 0.45) plus.push(intentPhrase(l.intent));
      if (SENIOR[l.seniority]) plus.push('a decision maker');
      if (BIG[l.size]) plus.push('right-sized company');
      if (l.icp) plus.push('target industry');
      return 'Sales took it: ' + (plus.length ? plus.join(', ') : 'enough fit to open a conversation') + '. Signal: ' + activityPhrase(l) + '.';
    }
    if (r.mql) {
      const minus = [];
      if (l.intent < 0.45) minus.push(intentPhrase(l.intent));
      if (l.seniority === 'Other' || l.seniority === 'Individual contributor') minus.push('no buying authority');
      else if (l.seniority === 'Manager') minus.push('manager would need sign-off');
      if (l.size === '1–49') minus.push('too small for the offer');
      return 'Sales passed: ' + (minus.length ? minus.join(', ') : 'real interest, but they had just signed with another vendor') + '. Score came from: ' + activityPhrase(l) + '.';
    }
    return 'Not ready (' + intentPhrase(l.intent) + '). Correctly kept in nurture.';
  }

  // ---------- Render ----------
  function render() {
    const res = evaluate(leads, state.weights);
    res.rows.forEach((r) => { r.cat = r.lead.salesReady ? (r.mql ? 'tp' : 'fn') : (r.mql ? 'fp' : 'tn'); });
    current = res;
    const t = res.totals;
    const rate = pct(t.sql, t.mql), recall = pct(t.sql, t.salesReady);
    const P = rate / 100, R = recall / 100;
    const f1 = P + R ? (2 * P * R) / (P + R) : 0;
    const baseRate = pct(baseline.sql, baseline.mql);

    renderArena(res.rows);
    renderScoreboard(t, rate, recall, f1);
    renderLegend(res.rows);
    renderInsight(t, rate, recall, res.rows);
    renderFunnel(t);
    renderSources(res.bySource);
    renderLeadTable();
    $('#seed').textContent = state.seed;

    // grade and badges
    const g = gradeOf(f1);
    if (booted && lastGrade && gradeRank(g) < gradeRank(lastGrade)) {
      toast('Grade up: ' + lastGrade + ' → <b>' + g + '</b>');
      if (g === 'A+' || g === 'A') confetti(90);
    }
    lastGrade = g;
    if (f1 > state.bestF1) state.bestF1 = f1;
    $('#best-grade').textContent = gradeOf(state.bestF1);
    checkBadges({ t, rate, recall, f1, base: baseline, baseRate, touched: state.touched, expsDone: state.expDone.size });
    booted = true;
  }

  function renderScoreboard(t, rate, recall, f1) {
    const g = gradeOf(f1);
    const gl = $('#grade');
    if (gl.textContent !== g) { gl.textContent = g; if (!REDUCED) { gl.classList.remove('pop'); void gl.offsetWidth; gl.classList.add('pop'); } }
    const C = 2 * Math.PI * 52;
    $('#ring-fill').style.strokeDashoffset = String(C * (1 - Math.min(1, f1 / 0.55)));
    tweenNum($('#m-trust'), rate, (v) => Math.round(v) + '%');
    tweenNum($('#m-caught'), recall, (v) => Math.round(v) + '%');
    $('#mf-trust').style.width = Math.min(100, rate) + '%';
    $('#mf-caught').style.width = Math.min(100, recall) + '%';
    const wasted = t.mql - t.sql, bWasted = baseline.mql - baseline.sql;
    const kp = [['mql', t.mql, baseline.mql, false], ['sql', t.sql, baseline.sql, false], ['wasted', wasted, bWasted, true], ['missed', t.missed, baseline.missed, true]];
    for (const [k, v, b, lowerBetter] of kp) {
      const el = $('#k-' + k);
      if (booted && el._v !== v) bump(el.parentElement);
      tweenNum(el, v, fmt);
      const d = v - b, de = $('#d-' + k);
      if (!d) { de.textContent = 'same as default'; de.className = 'kpi-delta'; }
      else { de.textContent = (d > 0 ? '▲ +' : '▼ ') + Math.abs(d) + ' vs default'; de.className = 'kpi-delta ' + ((lowerBetter ? d < 0 : d > 0) ? 'up' : 'down'); }
    }
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
      s = `Sales accepts <b>${Math.round(rate)} of every 100</b> leads you send, and you catch <b>${Math.round(recall)}%</b> of the real buyers. `;
      if (band.length) s += `Just left of the line sit ${band.length} leads, and ${buyers} of them are buyers (${Math.round(pct(buyers, band.length))}% vs ${Math.round(rate)}% for your current MQLs). `;
      s += rate < 35 ? 'Reps will start ignoring these leads.' : rate >= 58 ? 'Sales will love this list. Check how many buyers you left behind.' : 'Try changing the weights, not just the line, to lift both numbers.';
    }
    $('#insight').innerHTML = s;
  }

  function renderFunnel(t) {
    const stages = [
      { name: 'All leads', note: 'sample', n: t.total },
      { name: 'Engaged', note: Math.round(pct(t.engaged, t.total)) + '% active lately', n: t.engaged },
      { name: 'MQL', note: Math.round(pct(t.mql, t.engaged)) + '% of engaged', n: t.mql },
      { name: 'SQL', note: Math.round(pct(t.sql, t.mql)) + '% of MQLs', n: t.sql },
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
  }

  function renderSources(bySource) {
    const host = $('#sources');
    const rows = bySource.slice().sort((a, b) => (b.mql ? b.sql / b.mql : -1) - (a.mql ? a.sql / a.mql : -1) || b.mql - a.mql);
    if (!host.children.length) {
      host.innerHTML = bySource.map((s, i) => `<div class="src-row" tabindex="0" data-src="${esc(s.source)}"><span>${esc(s.source)}<span class="n" id="sn-${i}"></span></span>
        <div class="track"><div class="fill" id="sf-${i}"></div></div><span class="pct" id="sp-${i}"></span><span class="why">${esc(SOURCE_WHY[s.source] || '')}</span></div>`).join('');
      host._order = bySource.map((s) => s.source);
    }
    // keep DOM order stable; reorder with CSS order so rows glide
    rows.forEach((s, rank) => {
      const i = host._order.indexOf(s.source);
      const row = host.children[i];
      row.style.order = rank;
      const r = s.mql ? pct(s.sql, s.mql) : 0;
      $('#sf-' + i).style.width = r + '%';
      $('#sp-' + i).textContent = s.mql ? Math.round(r) + '%' : '–';
      $('#sn-' + i).textContent = s.sql + ' of ' + s.mql + ' MQLs accepted';
    });
    host.style.display = 'flex'; host.style.flexDirection = 'column';
  }

  function renderLeadTable() {
    if (!current || !$('#leads-fold').open) return;
    const missed = state.table === 'missed';
    document.querySelectorAll('[data-table]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.table === state.table)));
    const list = current.rows.filter((r) => (missed ? r.cat === 'fn' : r.mql)).sort((a, b) => b.score - a.score);
    $('#lead-count').textContent = missed ? list.length + ' buyers the score held back' : list.length + ' leads sent to sales, highest score first';
    $('#leads').innerHTML = list.length ? list.map((r) => {
      const l = r.lead;
      const pill = missed ? '<span class="pill missed">Missed</span>' : r.sql ? '<span class="pill sql">SQL</span>' : '<span class="pill rej">Wasted call</span>';
      return `<tr><td><div class="who">${esc(l.company)}<small>${esc(l.name)}, ${esc(l.title)}</small><small>${esc(l.industry)} · ${esc(l.size)} staff · ${esc(l.country)}</small></div></td>
        <td>${esc(l.source)}</td><td class="num"><b>${r.score}</b><br><span class="score-split">fit ${r.fit} · activity ${r.engagement}</span></td><td>${pill}</td><td class="reason">${esc(leadReason(r, missed))}</td></tr>`;
    }).join('') : '<tr><td colspan="5">No leads here with these settings.</td></tr>';
  }

  // ---------- Badges ----------
  function renderBadges(justWon) {
    $('#badges').innerHTML = BADGES.map((b) => `<div class="badge${state.badges.has(b.id) ? ' won' : ''}${justWon === b.id ? ' just' : ''}">
      <span class="medal" aria-hidden="true">★</span><div><b>${esc(b.title)}</b><small>${esc(b.desc)}</small></div></div>`).join('');
    $('#badge-count').textContent = state.badges.size + ' of ' + BADGES.length + ' done';
  }
  function checkBadges(ctx) {
    if (!ctx.touched) { if (!$('#badges').children.length) renderBadges(); return; }
    let won = null;
    for (const b of BADGES) {
      if (!state.badges.has(b.id) && b.check(ctx)) { state.badges.add(b.id); won = b; }
    }
    if (won && booted) { toast('Challenge complete: <b>' + esc(won.title) + '</b>'); confetti(); }
    if (won || !$('#badges').children.length) renderBadges(won && won.id);
  }

  // ---------- Experiments ----------
  const ZERO = { seniority: 0, companySize: 0, industry: 0, demoRequest: 0, eventMeeting: 0, webinarAttend: 0, pricingPage: 0, contentDownload: 0, emailClick: 0, webVisit: 0, unsubscribe: 0, halfLife: 30, threshold: 1 };
  function topModel(w) {
    const rows = evaluate(leads, Object.assign({}, ZERO, w)).rows.map((r, i) => ({ r, i }))
      .sort((a, b) => b.r.score - a.r.score || a.i - b.i).slice(0, 100);
    return { buyers: rows.filter((x) => x.r.lead.salesReady).length, cut: Math.max(1, rows[rows.length - 1].r.score) };
  }
  function metricOf(w, key) {
    const t = evaluate(leads, w).totals;
    return key === 'rate' ? pct(t.sql, t.mql) : t[key];
  }

  function renderExp() {
    const body = $('#exp-body');
    $('#exp-progress').textContent = state.expDone.size + ' of ' + EXPERIMENTS.length + ' · ' + state.expRight + ' right';
    if (state.expIdx >= EXPERIMENTS.length) {
      body.innerHTML = `<div class="exp-card"><p class="exp-hyp">All done</p><p class="exp-hyp-text">You called ${state.expRight} of ${EXPERIMENTS.length} correctly.</p>
        <p class="exp-q">Every answer came from this sample of 500 leads, computed live. Shuffle the leads and play again to see which lessons hold.</p>
        <div class="exp-actions"><button class="primary-btn" id="exp-restart" type="button">Play again</button></div></div>`;
      $('#exp-restart').onclick = () => { state.expIdx = 0; state.expRight = 0; state.expDone.clear(); persist(); renderExp(); };
      return;
    }
    const ex = EXPERIMENTS[state.expIdx];
    const n = state.expIdx + 1;
    let choices;
    if (ex.kind === 'duel') {
      choices = ['a', 'b'].map((k) => `<button class="choice" type="button" data-pick="${k}">${esc(ex[k].label)}<span class="num" id="num-${k}"></span><span class="bar"><i id="bar-${k}"></i></span></button>`).join('');
    } else {
      choices = `<button class="choice" type="button" data-pick="up">▲ Goes up</button><button class="choice" type="button" data-pick="down">▼ Goes down</button>`;
    }
    body.innerHTML = `<div class="exp-card"><p class="exp-hyp">Hypothesis ${n}</p><p class="exp-hyp-text">${esc(ex.hypothesis)}</p>
      <p class="exp-q">${esc(ex.question)} <b>Make your call:</b></p><div class="choices">${choices}</div><div id="exp-result"></div></div>`;
    body.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => runExp(ex, b.dataset.pick, b)));
  }

  function runExp(ex, pick, btn) {
    const body = $('#exp-body');
    body.querySelectorAll('[data-pick]').forEach((b) => { b.disabled = true; });
    btn.classList.add('picked');
    let right, actual, extra = '', winnerWeights = null;
    if (ex.kind === 'duel') {
      const A = topModel(ex.a.weights), B = topModel(ex.b.weights);
      actual = A.buyers >= B.buyers ? 'a' : 'b';
      right = pick === actual;
      ['a', 'b'].forEach((k) => {
        const m = k === 'a' ? A : B;
        tweenNum($('#num-' + k), m.buyers, (v) => Math.round(v) + ' buyers');
        requestAnimationFrame(() => { $('#bar-' + k).style.width = m.buyers + '%'; });
      });
      const win = actual === 'a' ? A : B;
      winnerWeights = Object.assign({}, ZERO, ex[actual].weights, { threshold: win.cut });
      setTimeout(() => body.querySelector(`[data-pick="${actual}"]`).classList.add('winner'), REDUCED ? 0 : 1100);
      extra = `<p class="src">Out of 100 top-scored leads. A random 100 would hold about ${Math.round(pct(leads.filter((l) => l.salesReady).length, leads.length))} buyers.</p>`;
    } else {
      const before = metricOf(DEFAULT_WEIGHTS, ex.metric);
      const nextW = Object.assign({}, DEFAULT_WEIGHTS, ex.patch);
      const after = metricOf(nextW, ex.metric);
      actual = after > before ? 'up' : 'down';
      right = pick === actual;
      applyWeights(nextW);
      const f = ex.metric === 'rate' ? (v) => Math.round(v) + '%' : fmt;
      const res = document.createElement('div');
      res.className = 'dir-row';
      res.innerHTML = `<span>${esc(ex.metricLabel)}</span><span class="dir-num" id="dir-a">${f(before)}</span><span class="dir-arrow">→</span><span class="dir-num" id="dir-b">${f(before)}</span>`;
      $('#exp-result').before(res);
      const nb = $('#dir-b'); nb._v = before; tweenNum(nb, after, f);
      extra = '<p class="src">The lab now shows this change. Look at the dots.</p>';
    }
    const matchesExpectation = actual === ex.expect;
    const src = ex.source && SOURCES[ex.source] ? `<p class="src">Source: <a href="${SOURCES[ex.source].url}" target="_blank" rel="noopener">${esc(SOURCES[ex.source].label)}</a></p>` : '';
    const lesson = matchesExpectation ? ex.lesson : 'This sample went against the usual pattern, which happens with small numbers. Shuffle the leads and try again to see if it holds.';
    if (!state.expDone.has(ex.id)) { state.expDone.add(ex.id); if (right) state.expRight++; }
    setTimeout(() => {
      $('#exp-result').innerHTML = `<div class="verdict ${right ? 'right' : 'wrong'}"><h3>${right ? 'You called it!' : 'Not this time.'}</h3><p>${esc(lesson)}</p>${extra}${src}</div>
        <div class="exp-actions">${winnerWeights ? '<button class="ghost-btn" style="width:auto;margin:0" id="exp-load" type="button">Load the winning model into the lab</button>' : ''}<button class="primary-btn" id="exp-next" type="button">Next experiment →</button></div>`;
      if (right) { toast('Correct! ' + state.expRight + ' right so far'); confetti(60); }
      $('#exp-next').onclick = () => { state.expIdx++; persist(); renderExp(); };
      const ld = $('#exp-load'); if (ld) ld.onclick = () => { applyWeights(winnerWeights); document.querySelector('.arena').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' }); };
      $('#exp-progress').textContent = state.expDone.size + ' of ' + EXPERIMENTS.length + ' · ' + state.expRight + ' right';
      persist(); schedule();
    }, REDUCED ? 0 : 1150);
  }

  function renderSourcesList() {
    $('#src-list').innerHTML = Object.values(SOURCES).map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join('');
  }

  // ---------- Boot ----------
  buildControls();
  buildDots();
  syncInputs();
  renderSourcesList();
  renderExp();
  void svg.getBoundingClientRect();
  requestAnimationFrame(() => { stagger(true); render(); });
})();
