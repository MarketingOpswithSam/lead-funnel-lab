/* Lead Funnel Lab: UI wiring and rendering. Depends on leads.js and scoring.js. */
(function () {
  'use strict';

  const { CONTROLS, DEFAULT_WEIGHTS, PRESETS, evaluate } = window.Scoring;
  const DEFAULT_SEED = 2611;
  const LEAD_COUNT = 500;
  const STORE_KEY = 'lead-funnel-lab:v1';

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
    const host = $('#controls');
    const groups = [];
    for (const c of CONTROLS) {
      let g = groups.find((x) => x.name === c.group);
      if (!g) { g = { name: c.group, items: [] }; groups.push(g); }
      g.items.push(c);
    }
    host.innerHTML = groups.map((g) => `
      <fieldset>
        <legend>${esc(g.name)}</legend>
        ${g.items.map((c) => `
          <div class="ctl${c.key === 'threshold' ? ' is-threshold' : ''}">
            <label for="w-${c.key}">${esc(c.label)}</label>
            <output id="o-${c.key}" for="w-${c.key}"></output>
            <input type="range" id="w-${c.key}" data-key="${c.key}" min="${c.min}" max="${c.max}" step="${c.step}" />
            <small>${esc(c.hint)}</small>
          </div>`).join('')}
      </fieldset>`).join('');

    host.addEventListener('input', (e) => {
      const key = e.target.dataset && e.target.dataset.key;
      if (!key) return;
      state.weights[key] = Number(e.target.value);
      $('#preset').value = matchPreset();
      syncOutputs();
      schedule();
    });

    const presetSel = $('#preset');
    presetSel.innerHTML = Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('') +
      '<option value="custom" hidden>Custom</option>';
    presetSel.addEventListener('change', () => {
      const p = PRESETS[presetSel.value];
      if (!p) return;
      state.weights = Object.assign({}, p.weights);
      syncInputs();
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
    return 'custom';
  }

  function syncInputs() {
    for (const c of CONTROLS) $('#w-' + c.key).value = state.weights[c.key];
    $('#preset').value = matchPreset();
    syncOutputs();
  }

  function syncOutputs() {
    for (const c of CONTROLS) {
      const v = state.weights[c.key];
      const sign = c.key === 'unsubscribe' || c.key === 'halfLife' || c.key === 'threshold' ? '' : '+';
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
    if (Math.abs(d) < (o.eps || 0.5)) { el.textContent = 'same as default model'; el.className = 'kpi-delta'; return; }
    const good = o.lowerIsBetter ? d < 0 : d > 0;
    const shown = o.points ? d.toFixed(1).replace(/\.0$/, '') + ' pts' : fmt(Math.round(d));
    el.textContent = (d > 0 ? '+' : '') + shown + ' vs default model';
    el.className = 'kpi-delta ' + (good ? 'up' : 'down');
  }

  function renderKpis(t) {
    const rate = pct(t.sql, t.mql);
    const baseRate = pct(baseline.sql, baseline.mql);
    $('#k-mql').textContent = fmt(t.mql);
    $('#k-mql-sub').textContent = pct(t.mql, t.total).toFixed(1) + '% of all leads';
    $('#k-sql').textContent = fmt(t.sql);
    $('#k-sql-sub').textContent = 'accepted by sales';
    $('#k-rate').textContent = t.mql ? rate.toFixed(1) + '%' : '–';
    $('#k-rate-sub').textContent = fmt(t.mql - t.sql) + ' MQLs rejected';
    $('#k-missed').textContent = fmt(t.missed);
    $('#k-missed-sub').textContent = 'of ' + fmt(t.salesReady) + ' sales-ready leads never handed over';
    delta($('#d-mql'), t.mql, baseline.mql);
    delta($('#d-sql'), t.sql, baseline.sql);
    delta($('#d-rate'), rate, baseRate, { points: true, eps: 0.05 });
    delta($('#d-missed'), t.missed, baseline.missed, { lowerIsBetter: true });
  }

  function renderFunnel(t) {
    const stages = [
      { name: 'All leads', note: 'sample set', n: t.total, rate: null },
      { name: 'Engaged', note: 'active in last 90 days', n: t.engaged, rate: pct(t.engaged, t.total) },
      { name: 'MQL', note: 'score ≥ ' + state.weights.threshold, n: t.mql, rate: pct(t.mql, t.engaged) },
      { name: 'SQL', note: 'accepted by sales', n: t.sql, rate: pct(t.sql, t.mql) },
    ];
    $('#funnel').innerHTML = stages.map((s, i) => {
      const w = pct(s.n, t.total);
      return `
        <div class="stage">
          <div class="stage-name">${s.name}<small>${esc(s.note)}</small></div>
          <div class="stage-track"><div class="stage-bar${w < 12 ? ' is-narrow' : ''}" data-stage="${i}" style="width:${w.toFixed(2)}%">${fmt(s.n)}</div></div>
          <div class="stage-rate">${i === 0 ? '<b>' + fmt(s.n) + '</b>100%' : '<b>' + fmt(s.n) + '</b>' + s.rate.toFixed(0) + '% step'}</div>
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

    const W = 640, H = 250, m = { l: 38, r: 14, t: 26, b: 30 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const x = (v) => m.l + (v / xMax) * pw;
    const y = (v) => m.t + ph - (v / yMax) * ph;

    const yTicks = [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax];
    const xStep = xMax <= 60 ? 10 : xMax <= 160 ? 20 : 50;
    const xTicks = [];
    for (let v = 0; v <= xMax; v += xStep) xTicks.push(v);

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Score distribution of ${rows.length} leads with MQL threshold at ${th}">`;
    svg += '<g class="grid">' + yTicks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`).join('') + '</g>';
    svg += yTicks.map((v) => `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join('');
    svg += xTicks.map((v) => `<text x="${x(v)}" y="${H - m.b + 16}" text-anchor="middle">${v}</text>`).join('');
    svg += `<text x="${W - m.r}" y="${H - 2}" text-anchor="end">score</text>`;
    svg += `<text x="${m.l - 6}" y="${m.t - 12}" text-anchor="end">leads</text>`;

    const gap = 1.5;
    for (const b of bins) {
      const total = b.yes + b.no;
      if (!total) continue;
      const bx = x(b.x0) + gap / 2;
      const bw = Math.max(1, x(b.x0 + binW) - x(b.x0) - gap);
      const below = b.x0 + binW <= th ? ' below' : '';
      const title = `<title>${b.x0}–${b.x0 + binW - 1} pts: ${b.yes} sales-ready, ${b.no} not</title>`;
      svg += `<g class="bin${below}">${title}` +
        `<rect class="bar-yes" x="${bx}" y="${y(b.yes)}" width="${bw}" height="${y(0) - y(b.yes)}"/>` +
        `<rect class="bar-no" x="${bx}" y="${y(total)}" width="${bw}" height="${y(b.yes) - y(total)}"/></g>`;
    }
    svg += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
    const tx = x(th);
    const anchor = tx > W - 120 ? 'end' : 'start';
    svg += `<line class="thresh" x1="${tx}" x2="${tx}" y1="${m.t - 6}" y2="${y(0)}"/>`;
    svg += `<text class="thresh-label" x="${anchor === 'start' ? tx + 6 : tx - 6}" y="${m.t + 4}" text-anchor="${anchor}">MQL ≥ ${th}</text>`;
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
        <td class="num">${fmt(s.mql)} <span class="dim">(${pct(s.mql, s.leads).toFixed(0)}%)</span></td>
        <td class="num">${fmt(s.sql)}</td>
        <td><div class="rate-cell">
          <div class="rate-track"><div class="rate-fill" style="width:${r == null ? 0 : r.toFixed(1)}%"></div></div>
          <span class="rate-num">${r == null ? '<span class="dim">no MQLs</span>' : r.toFixed(0) + '%'}</span>
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
      ? fmt(list.length) + ' sales-ready leads the model left below the line'
      : fmt(list.length) + ' leads handed to sales, highest score first';
    const lastEvent = (l) => {
      const e = l.events.find((x) => x.type !== 'unsubscribe');
      return e ? e.daysAgo + 'd ago' : 'never';
    };
    $('#leads').innerHTML = list.length ? list.map((r) => {
      const l = r.lead;
      let outcome;
      if (showMissed) outcome = r.engaged ? '<span class="pill rej">Below threshold</span>' : '<span class="pill rej">Inactive 90d+</span>';
      else outcome = r.sql ? '<span class="pill sql">SQL</span>' : '<span class="pill rej">Rejected</span>';
      return `<tr>
        <td><div class="who">${esc(l.company)}<small>${esc(l.name)}, ${esc(l.title)}</small></div></td>
        <td><div class="who">${esc(l.industry)}<small>${esc(l.size)} staff · ${esc(l.country)}</small></div></td>
        <td>${esc(l.source)}</td>
        <td class="num">${l.events.length}<br><span class="score-split">${lastEvent(l)}</span></td>
        <td class="num"><b>${r.score}</b><br><span class="score-split">fit ${r.fit} · eng ${r.engagement}</span></td>
        <td>${outcome}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="dim">No leads here with the current settings.</td></tr>';
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
