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

    const groups = [];
    for (const c of CONTROLS) {
      if (c.key === 'threshold') continue;
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
        ${g.items.map((c) => `
          <div class="ctl">
            <label for="w-${c.key}">${esc(c.label)}</label>
            <output id="o-${c.key}" for="w-${c.key}"></output>
            <input type="range" id="w-${c.key}" data-key="${c.key}" min="${c.min}" max="${c.max}" step="${c.step}" />
            <small>${esc(c.hint)}</small>
          </div>`).join('')}`).join('')}</div>`).join('');

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
    $('#k-mql').textContent = fmt(t.mql);
    $('#k-mql-sub').textContent = pct(t.mql, t.total).toFixed(0) + '% of all leads';
    $('#k-sql').textContent = fmt(t.sql);
    $('#k-sql-sub').textContent = 'accepted by sales';
    $('#k-rate').textContent = t.mql ? rate.toFixed(0) + '%' : '–';
    $('#k-rate-sub').textContent = fmt(t.mql - t.sql) + ' MQLs rejected';
    $('#k-missed').textContent = fmt(t.missed);
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
          <div class="stage-count">${fmt(s.n)}</div>
        </div>`;
    }).join('');
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
        <td><div class="who">${esc(l.company)}<small>${esc(l.name)}, ${esc(l.title)}</small></div></td>
        <td><div class="who">${esc(l.industry)}<small>${esc(l.size)} staff · ${esc(l.country)}</small></div></td>
        <td>${esc(l.source)}</td>
        <td class="num"><b>${r.score}</b><br><span class="score-split">fit ${r.fit} · activity ${r.engagement}</span></td>
        <td>${outcome}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" class="dim">No leads here with these settings.</td></tr>';
  }

  function render() {
    const res = evaluate(leads, state.weights);
    renderKpis(res.totals);
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
