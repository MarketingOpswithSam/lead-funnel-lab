/* Lead Funnel Lab: UI wiring and rendering. Depends on leads.js and scoring.js. */
(function () {
  'use strict';

  const { CONTROLS, DEFAULT_WEIGHTS, PRESETS, evaluate } = window.Scoring;
  const DEFAULT_SEED = 2611;
  const LEAD_COUNT = 500;
  const STORE_KEY = 'lead-funnel-lab:v1';

  const PRESET_BLURBS = {
    balanced: 'A bit of everything',
    fit: 'Right company, right role',
    intent: 'Buying signals count most',
    content: 'Rewards downloads and webinars',
  };
  const GROUP_NAMES = {
    'Fit: who they are': 'Who they are',
    'Engagement: what they did': 'What they did',
    'Handover and decay': 'Timing',
  };

  const $ = (sel) => document.querySelector(sel);
  const fmt = (n) => n.toLocaleString('en-AU');
  const pct = (a, b) => (b > 0 ? (100 * a) / b : 0);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // State, restored from this browser if available.
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { saved = {}; }
  const state = {
    seed: Number.isInteger(saved.seed) ? saved.seed : DEFAULT_SEED,
    weights: Object.assign({}, DEFAULT_WEIGHTS, saved.weights || {}),
    table: 'mql',
  };
  let leads = window.LeadData.generateLeads(state.seed, LEAD_COUNT);
  let baseline = evaluate(leads, DEFAULT_WEIGHTS).totals;

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ seed: state.seed, weights: state.weights })); } catch (e) { /* storage unavailable */ }
  }

  // ---------- Controls ----------
  function ctlHtml(c) {
    return `
          <div class="ctl">
            <label for="w-${c.key}">${esc(c.label)}</label>
            <output id="o-${c.key}" for="w-${c.key}"></output>
            <input type="range" id="w-${c.key}" data-key="${c.key}" min="${c.min}" max="${c.max}" step="${c.step}" />
            <small>${esc(c.hint)}</small>
          </div>`;
  }
  let histScale = null;
  const lastShown = {};
  function setNum(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    if (lastShown[id] !== undefined && lastShown[id] !== text) {
      el.classList.add('changed');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('changed')));
    }
    lastShown[id] = text;
    el.textContent = text;
  }
  function buildControls() {
    $('#presets').innerHTML = Object.entries(PRESETS).map(([k, p]) => `
      <button class="preset" type="button" data-preset="${k}" aria-pressed="false">
        <b>${esc(p.label.replace(/ \(.*\)$/, ''))}</b>
        <small>${esc(PRESET_BLURBS[k] || '')}</small>
      </button>`).join('');
    document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      state.weights = Object.assign({}, PRESETS[b.dataset.preset].weights);
      syncInputs();
      schedule();
    }));

    const QUICK = ['demoRequest', 'pricingPage', 'seniority'];
    $('#quick').innerHTML = QUICK.map((k) => CONTROLS.find((c) => c.key === k)).map((c) => ctlHtml(c)).join('');

    const groups = [];
    for (const c of CONTROLS) {
      if (c.key === 'threshold' || QUICK.includes(c.key)) continue;
      const name = GROUP_NAMES[c.group] || c.group;
      let g = groups.find((x) => x.name === name);
      if (!g) { g = { name, items: [] }; groups.push(g); }
      g.items.push(c);
    }
    // Show fit first, then engagement, then timing.
    const order = ['Who they are', 'What they did', 'Timing'];
    groups.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    // Put timing under fit so the three columns balance.
    const fitGroup = groups.find((g) => g.name === 'Who they are');
    const timing = groups.find((g) => g.name === 'Timing');
    const engagement = groups.find((g) => g.name === 'What they did');
    const half = Math.ceil(engagement.items.length / 2);
    const columns = [
      [fitGroup, timing],
      [{ name: 'What they did', items: engagement.items.slice(0, half) }],
      [{ name: ' ', items: engagement.items.slice(half) }],
    ];
    $('#controls').innerHTML = columns.map((col) => `<div class="group">${col.map((g) => `
        <h3>${esc(g.name)}</h3>
        ${g.items.map(ctlHtml).join('')}`).join('')}</div>`).join('');

    // Click the score chart to move the MQL line there.
    $('#hist').addEventListener('click', (e) => {
      const svg = e.currentTarget.querySelector('svg');
      if (!svg || !histScale) return;
      const box = svg.getBoundingClientRect();
      const vx = ((e.clientX - box.left) / box.width) * histScale.W;
      const score = Math.round(((vx - histScale.l) / histScale.pw) * histScale.xMax);
      const thc = CONTROLS.find((c) => c.key === 'threshold');
      state.weights.threshold = Math.max(thc.min, Math.min(thc.max, score));
      syncInputs();
      schedule();
    });

    document.addEventListener('input', (e) => {
      const key = e.target.dataset && e.target.dataset.key;
      if (!key) return;
      state.weights[key] = Number(e.target.value);
      syncPreset();
      syncOutputs();
      schedule();
    });

    $('#reset').addEventListener('click', () => {
      state.weights = Object.assign({}, DEFAULT_WEIGHTS);
      syncInputs();
      schedule();
    });
    $('#reseed').addEventListener('click', () => {
      state.seed = 1000 + Math.floor(Math.random() * 9000);
      loadSample();
    });
    $('#seed-reset').addEventListener('click', () => {
      state.seed = DEFAULT_SEED;
      loadSample();
    });
    document.querySelectorAll('[data-table]').forEach((b) => b.addEventListener('click', () => {
      state.table = b.dataset.table;
      render();
    }));
  }

  function loadSample() {
    leads = window.LeadData.generateLeads(state.seed, LEAD_COUNT);
    baseline = evaluate(leads, DEFAULT_WEIGHTS).totals;
    schedule();
  }

  function matchPreset() {
    for (const [k, p] of Object.entries(PRESETS)) {
      if (Object.keys(p.weights).every((key) => p.weights[key] === state.weights[key])) return k;
    }
    return null;
  }

  function syncPreset() {
    const active = matchPreset();
    document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === active)));
  }

  function syncInputs() {
    for (const c of CONTROLS) $('#w-' + c.key).value = state.weights[c.key];
    syncPreset();
    syncOutputs();
  }

  function syncOutputs() {
    for (const c of CONTROLS) {
      const v = state.weights[c.key];
      if (c.key === 'threshold') { $('#o-threshold').textContent = v + ' pts'; continue; }
      const sign = c.key === 'unsubscribe' || c.key === 'halfLife' ? '' : '+';
      $('#o-' + c.key).textContent = (v > 0 ? sign : '') + v + ' ' + c.unit;
    }
  }

  let raf = 0;
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; render(); persist(); });
  }


  // ---------- Plain-language explanations ----------
  const SOURCE_WHY = {
    'Partner referral': 'A partner sends them with a known problem and a warm intro.',
    'Website contact form': 'They came to you and asked to talk. Few signals are stronger.',
    'Organic search': 'Searching for a fix. Some are buying, many are researching.',
    'Webinar': 'Interested in the topic, which is not always the same as buying.',
    'Paid LinkedIn': 'Ads target the right roles and companies, but the click is light intent.',
    'Event booth': 'Badge scans and booth chats overstate interest. Many came for the coffee.',
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
  function fitPlus(l) {
    const out = [];
    if (SENIOR[l.seniority]) out.push('a decision maker');
    if (BIG[l.size]) out.push('right-sized company');
    if (l.icp) out.push('target industry');
    return out;
  }
  function fitMinus(l) {
    const out = [];
    if (l.seniority === 'Other' || l.seniority === 'Individual contributor') out.push('no buying authority');
    else if (l.seniority === 'Manager') out.push('manager would need sign-off');
    if (l.size === '1–49') out.push('too small for the offer');
    return out;
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
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);

  function leadReason(r, showMissed) {
    const l = r.lead;
    if (showMissed) {
      const w = state.weights;
      const maxFit = w.seniority + w.companySize + w.industry;
      if (!r.engaged) return 'Would have bought: ' + intentPhrase(l.intent) + '. Held back because they hadn\u2019t touched any marketing in 90 days, so the score treats them as cold.';
      const short = w.threshold - r.score;
      const lowFit = maxFit > 0 && r.fit < 0.5 * maxFit;
      const why = lowFit
        ? 'the job title or company size scored low on fit (' + l.seniority.toLowerCase() + ', ' + l.size + ' staff)'
        : 'their activity was light or old (' + activityPhrase(l) + ')';
      return 'Would have bought: ' + intentPhrase(l.intent) + '. Missed the line by ' + short + (short === 1 ? ' point' : ' points') + ' because ' + why + '.';
    }
    if (r.sql) {
      const plus = [];
      if (l.intent >= 0.45) plus.push(intentPhrase(l.intent));
      plus.push(...fitPlus(l));
      return 'Took it: ' + (plus.length ? plus.join(', ') : 'enough fit to open a conversation') + '. Signal: ' + activityPhrase(l) + '.';
    }
    const minus = [];
    if (l.intent < 0.45) minus.push(intentPhrase(l.intent));
    minus.push(...fitMinus(l));
    return 'Passed: ' + (minus.length ? minus.join(', ') : 'real interest, but they had just signed with another vendor') + '. Score came from: ' + activityPhrase(l) + '.';
  }

  function renderInsight(t, rows) {
    const rate = pct(t.sql, t.mql);
    let read;
    if (!t.mql) read = 'Nothing reaches sales at this threshold. Lower it or raise the weights.';
    else if (rate < 35) read = 'Most of what you send won’t turn into a conversation, and reps will start ignoring marketing leads.';
    else if (rate >= 55) read = 'Sales will trust this list. Check the missed buyers, though: a strict bar keeps real buyers waiting in nurture.';
    else read = 'That’s a workable balance. The score chart shows whether better weights could lift both numbers at once.';
    $('#insight').innerHTML = t.mql
      ? `Sales accepts <b>${Math.round(rate)} of every 100</b> leads you send (${fmt(t.sql)} of ${fmt(t.mql)}). Another <b>${fmt(t.missed)} buyers</b> were ready but never reached sales. ${read}`
      : read;

    const th = state.weights.threshold;
    const band = rows.filter((r) => r.engaged && r.score < th && r.score >= th - 10);
    const buyers = band.filter((r) => r.lead.salesReady).length;
    $('#hist-note').textContent = band.length
      ? `Just below the line (${th - 10} to ${th - 1} pts) there are ${fmt(band.length)} leads, and ${fmt(buyers)} of them are buyers. Dropping the threshold by 10 would add them at a ${pct(buyers, band.length).toFixed(0)}% hit rate, against ${rate.toFixed(0)}% for your current MQLs.`
      : '';
  }

  function renderSourceNote(bySource) {
    const ranked = bySource.filter((s) => s.mql >= 3).sort((a, b) => b.sql / b.mql - a.sql / a.mql);
    if (ranked.length < 2) { $('#src-note').textContent = ''; return; }
    const best = ranked[0], worst = ranked[ranked.length - 1];
    $('#src-note').textContent = `${best.source} converts best at ${pct(best.sql, best.mql).toFixed(0)}%. ${worst.source} is weakest at ${pct(worst.sql, worst.mql).toFixed(0)}%. If a channel stays low, cut the points for the events it creates instead of raising the bar for every lead.`;
  }

  // ---------- Rendering ----------
  function delta(el, now, base, opts) {
    const o = opts || {};
    const d = now - base;
    if (Math.abs(d) < (o.eps || 0.5)) { el.textContent = ''; el.className = 'kpi-delta'; return; }
    const good = o.lowerIsBetter ? d < 0 : d > 0;
    const shown = o.points ? d.toFixed(1).replace(/\.0$/, '') + ' pts' : fmt(Math.round(d));
    el.textContent = (d > 0 ? '▲ +' : '▼ ') + shown.replace('-', '−') + ' vs default';
    el.className = 'kpi-delta ' + (good ? 'up' : 'down');
  }

  function renderKpis(t) {
    const rate = pct(t.sql, t.mql);
    setNum('k-mql', fmt(t.mql));
    $('#k-mql-sub').textContent = pct(t.mql, t.total).toFixed(0) + '% of all leads';
    setNum('k-sql', fmt(t.sql));
    $('#k-sql-sub').textContent = 'accepted by sales';
    setNum('k-rate', t.mql ? rate.toFixed(0) + '%' : '–');
    $('#k-rate-sub').textContent = fmt(t.mql - t.sql) + ' MQLs rejected';
    setNum('k-missed', fmt(t.missed));
    $('#k-missed-sub').textContent = 'ready to buy, never sent to sales';
    delta($('#d-mql'), t.mql, baseline.mql);
    delta($('#d-sql'), t.sql, baseline.sql);
    delta($('#d-rate'), rate, pct(baseline.sql, baseline.mql), { points: true, eps: 0.05 });
    delta($('#d-missed'), t.missed, baseline.missed, { lowerIsBetter: true });
  }

  function renderFunnel(t) {
    const stages = [
      { name: 'All leads', note: 'sample set', n: t.total },
      { name: 'Engaged', note: pct(t.engaged, t.total).toFixed(0) + '% active in 90 days', n: t.engaged },
      { name: 'MQL', note: pct(t.mql, t.engaged).toFixed(0) + '% of engaged', n: t.mql },
      { name: 'SQL', note: pct(t.sql, t.mql).toFixed(0) + '% of MQLs', n: t.sql },
    ];
    $('#funnel').innerHTML = stages.map((s, i) => {
      const w = pct(s.n, t.total);
      return `
        <div class="stage">
          <div class="stage-name">${s.name}<small>${esc(s.note)}</small></div>
          <div class="stage-track"><div class="stage-bar" data-stage="${i}" style="width:${w.toFixed(2)}%"></div></div>
          <div class="stage-count" id="fc-${i}"></div>
        </div>`;
    }).join('');
    stages.forEach((s, i) => setNum('fc-' + i, fmt(s.n)));
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  function renderHistogram(rows) {
    const th = state.weights.threshold;
    const maxScore = rows.reduce((m, r) => Math.max(m, r.score), 0);
    const binW = maxScore > 150 ? 10 : 5;
    const xMax = Math.ceil(Math.max(maxScore + 1, th + binW) / 10) * 10;
    const nb = Math.ceil(xMax / binW);
    const bins = Array.from({ length: nb }, (_, i) => ({ x0: i * binW, yes: 0, no: 0 }));
    for (const r of rows) {
      const b = bins[Math.min(nb - 1, Math.floor(r.score / binW))];
      if (r.lead.salesReady) b.yes++; else b.no++;
    }
    const yMax = niceMax(Math.max(...bins.map((b) => b.yes + b.no)));

    const W = 560, H = 250, m = { l: 34, r: 10, t: 28, b: 28 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    histScale = { W, l: m.l, pw, xMax };
    const x = (v) => m.l + (v / xMax) * pw;
    const y = (v) => m.t + ph - (v / yMax) * ph;

    const yTicks = [0, yMax / 2, yMax];
    const xStep = xMax <= 60 ? 10 : xMax <= 160 ? 20 : 50;
    const xTicks = [];
    for (let v = 0; v <= xMax; v += xStep) xTicks.push(v);

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Score distribution of ${rows.length} leads with MQL threshold at ${th}">`;
    svg += '<g class="grid">' + yTicks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`).join('') + '</g>';
    svg += yTicks.map((v) => `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join('');
    svg += xTicks.map((v) => `<text x="${x(v)}" y="${H - m.b + 18}" text-anchor="middle">${v}</text>`).join('');

    const gap = 2;
    for (const b of bins) {
      const total = b.yes + b.no;
      if (!total) continue;
      const bx = x(b.x0) + gap / 2;
      const bw = Math.max(1, x(b.x0 + binW) - x(b.x0) - gap);
      const below = b.x0 + binW <= th ? ' below' : '';
      const title = `<title>${b.x0}–${b.x0 + binW - 1} pts: ${b.yes} sales would accept, ${b.no} would reject</title>`;
      svg += `<g class="bin${below}">${title}` +
        `<rect class="bar-yes" x="${bx}" y="${y(b.yes)}" width="${bw}" height="${y(0) - y(b.yes)}" rx="1.5"/>` +
        `<rect class="bar-no" x="${bx}" y="${y(total)}" width="${bw}" height="${y(b.yes) - y(total)}" rx="1.5"/></g>`;
    }
    const tx = x(th);
    const anchor = tx > W - 140 ? 'end' : 'start';
    svg += `<line class="thresh" x1="${tx}" x2="${tx}" y1="${m.t - 10}" y2="${y(0)}" stroke-linecap="round"/>`;
    svg += `<text class="thresh-label" x="${anchor === 'start' ? tx + 7 : tx - 7}" y="${m.t - 2}" text-anchor="${anchor}">MQL line: ${th} pts</text>`;
    svg += '</svg>';
    $('#hist').innerHTML = svg;
  }

  function renderSources(bySource) {
    const rows = bySource.slice().sort((a, b) => {
      const ra = a.mql ? a.sql / a.mql : -1, rb = b.mql ? b.sql / b.mql : -1;
      return rb - ra || b.mql - a.mql;
    });
    $('#sources').innerHTML = rows.map((s) => {
      const r = s.mql ? pct(s.sql, s.mql) : null;
      return `<tr>
        <td>${esc(s.source)}</td>
        <td class="num">${fmt(s.leads)}</td>
        <td class="num">${fmt(s.mql)}</td>
        <td class="num">${fmt(s.sql)}</td>
        <td><div class="rate-cell">
          <div class="rate-track"><div class="rate-fill" style="width:${r == null ? 0 : r.toFixed(1)}%"></div></div>
          <span class="rate-num">${r == null ? '<span class="dim">–</span>' : r.toFixed(0) + '%'}</span>
        </div></td>
        <td class="src-why">${esc(SOURCE_WHY[s.source] || '')}</td>
      </tr>`;
    }).join('');
  }

  function renderLeadTable(rows) {
    const showMissed = state.table === 'missed';
    document.querySelectorAll('[data-table]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.table === state.table)));
    const list = rows
      .filter((r) => (showMissed ? !r.mql && r.lead.salesReady : r.mql))
      .sort((a, b) => b.score - a.score);
    $('#lead-count').textContent = showMissed
      ? fmt(list.length) + ' leads sales would have taken, but the score kept them back'
      : fmt(list.length) + ' leads sent to sales, highest score first';
    $('#leads').innerHTML = list.length ? list.map((r) => {
      const l = r.lead;
      let outcome;
      if (showMissed) outcome = r.engaged ? '<span class="pill rej">Below line</span>' : '<span class="pill rej">Gone quiet</span>';
      else outcome = r.sql ? '<span class="pill sql">SQL</span>' : '<span class="pill rej">Rejected</span>';
      return `<tr>
        <td><div class="who">${esc(l.company)}<small>${esc(l.name)}, ${esc(l.title)}</small><small>${esc(l.industry)} · ${esc(l.size)} staff · ${esc(l.country)}</small></div></td>
        <td>${esc(l.source)}</td>
        <td class="num"><b>${r.score}</b><br><span class="score-split">fit ${r.fit} · activity ${r.engagement}</span></td>
        <td>${outcome}</td>
        <td class="reason">${esc(leadReason(r, showMissed))}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" class="dim">No leads here with these settings.</td></tr>';
  }

  function render() {
    const res = evaluate(leads, state.weights);
    renderKpis(res.totals);
    renderInsight(res.totals, res.rows);
    renderSourceNote(res.bySource);
    renderFunnel(res.totals);
    renderHistogram(res.rows);
    renderSources(res.bySource);
    renderLeadTable(res.rows);
    $('#seed').textContent = state.seed;
  }

  buildControls();
  syncInputs();
  render();
})();
