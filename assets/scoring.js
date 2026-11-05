/*
 * Lead Funnel Lab: scoring model.
 *
 * score = fit points + engagement points
 *   fit points        = seniority share x seniority weight
 *                     + company size share x size weight
 *                     + industry share x industry weight
 *   engagement points = sum over events of (event weight x 0.5 ^ (days ago / half-life))
 *                       counting only the most recent N events of each type
 *   an unsubscribe subtracts its penalty in full, with no decay
 *
 * MQL = score >= threshold AND at least one non-unsubscribe event in the last 90 days
 * SQL = MQL AND the simulated sales team accepts the lead (lead.salesReady)
 */
(function (g) {
  'use strict';

  const SENIORITY_SHARE = { 'C-level': 1, VP: 0.85, Director: 0.7, Manager: 0.45, 'Individual contributor': 0.15, Other: 0 };
  const SIZE_SHARE = { '1–49': 0.1, '50–199': 0.4, '200–999': 0.8, '1,000–4,999': 1, '5,000+': 0.9 };
  const NON_ICP_SHARE = 0.3;
  const ENGAGED_WINDOW_DAYS = 90;

  // Max counted occurrences per event type (most recent first).
  const EVENT_CAP = {
    email_click: 3, web_visit: 10, pricing_page: 3, content_download: 3,
    webinar_attend: 3, event_meeting: 3, demo_request: 1, unsubscribe: 1,
  };

  const EVENT_WEIGHT_KEY = {
    email_click: 'emailClick', web_visit: 'webVisit', pricing_page: 'pricingPage',
    content_download: 'contentDownload', webinar_attend: 'webinarAttend',
    event_meeting: 'eventMeeting', demo_request: 'demoRequest', unsubscribe: 'unsubscribe',
  };

  const CONTROLS = [
    { group: 'Handover and decay', key: 'threshold', label: 'MQL line', min: 1, max: 150, step: 1, unit: 'pts', hint: 'Score needed to hand a lead to sales' },
    { group: 'Handover and decay', key: 'halfLife', label: 'Engagement half-life', min: 7, max: 180, step: 1, unit: 'days', hint: 'An event this old counts half' },

    { group: 'Fit: who they are', key: 'seniority', label: 'Role seniority', min: 0, max: 40, step: 1, unit: 'pts', hint: 'Full points for C-level, 70% for directors, 15% for individual contributors' },
    { group: 'Fit: who they are', key: 'companySize', label: 'Company size', min: 0, max: 40, step: 1, unit: 'pts', hint: 'Full points at 1,000 to 4,999 staff, 10% under 50' },
    { group: 'Fit: who they are', key: 'industry', label: 'Target industry', min: 0, max: 40, step: 1, unit: 'pts', hint: 'Full points for financial services, healthcare, government, energy & utilities' },

    { group: 'Engagement: what they did', key: 'demoRequest', label: 'Demo request', min: 0, max: 60, step: 1, unit: 'pts', hint: 'Counted once' },
    { group: 'Engagement: what they did', key: 'eventMeeting', label: 'Event booth meeting', min: 0, max: 40, step: 1, unit: 'pts', hint: 'Badge scan with a conversation logged' },
    { group: 'Engagement: what they did', key: 'webinarAttend', label: 'Webinar attended', min: 0, max: 30, step: 1, unit: 'pts', hint: 'Attended live or watched on demand' },
    { group: 'Engagement: what they did', key: 'pricingPage', label: 'Pricing page view', min: 0, max: 30, step: 1, unit: 'pts', hint: 'Up to 3 counted' },
    { group: 'Engagement: what they did', key: 'contentDownload', label: 'Content download', min: 0, max: 20, step: 1, unit: 'pts', hint: 'Gated asset, e.g. a guide or report' },
    { group: 'Engagement: what they did', key: 'emailClick', label: 'Email click', min: 0, max: 10, step: 1, unit: 'pts', hint: 'Opens are ignored, clicks only' },
    { group: 'Engagement: what they did', key: 'webVisit', label: 'Web page visit', min: 0, max: 5, step: 1, unit: 'pts', hint: 'Up to 10 counted' },
    { group: 'Engagement: what they did', key: 'unsubscribe', label: 'Unsubscribe penalty', min: -40, max: 0, step: 1, unit: 'pts', hint: 'Applied in full, no decay' },
  ];

  const DEFAULT_WEIGHTS = {
    seniority: 20, companySize: 15, industry: 10,
    demoRequest: 30, eventMeeting: 15, webinarAttend: 10, pricingPage: 8,
    contentDownload: 6, emailClick: 3, webVisit: 1, unsubscribe: -15,
    halfLife: 30, threshold: 45,
  };

  const PRESETS = {
    balanced: { label: 'Balanced (default)', weights: DEFAULT_WEIGHTS },
    fit: {
      label: 'Fit first',
      weights: {
        seniority: 35, companySize: 25, industry: 20,
        demoRequest: 25, eventMeeting: 10, webinarAttend: 6, pricingPage: 5,
        contentDownload: 4, emailClick: 2, webVisit: 1, unsubscribe: -10,
        halfLife: 60, threshold: 60,
      },
    },
    intent: {
      label: 'Intent first',
      weights: {
        seniority: 12, companySize: 10, industry: 6,
        demoRequest: 40, eventMeeting: 18, webinarAttend: 12, pricingPage: 14,
        contentDownload: 5, emailClick: 4, webVisit: 2, unsubscribe: -20,
        halfLife: 21, threshold: 40,
      },
    },
    content: {
      label: 'Content-heavy (common mistake)',
      weights: {
        seniority: 10, companySize: 8, industry: 5,
        demoRequest: 20, eventMeeting: 10, webinarAttend: 15, pricingPage: 4,
        contentDownload: 15, emailClick: 6, webVisit: 2, unsubscribe: -5,
        halfLife: 120, threshold: 55,
      },
    },
  };

  function scoreLead(lead, w) {
    const fit =
      SENIORITY_SHARE[lead.seniority] * w.seniority +
      SIZE_SHARE[lead.size] * w.companySize +
      (lead.icp ? 1 : NON_ICP_SHARE) * w.industry;

    let engagement = 0;
    let engaged = false;
    const seen = {};
    // lead.events is sorted most recent first, so caps keep the freshest events.
    for (const e of lead.events) {
      seen[e.type] = (seen[e.type] || 0) + 1;
      if (seen[e.type] > EVENT_CAP[e.type]) continue;
      const weight = w[EVENT_WEIGHT_KEY[e.type]];
      if (e.type === 'unsubscribe') { engagement += weight; continue; }
      if (e.daysAgo <= ENGAGED_WINDOW_DAYS) engaged = true;
      engagement += weight * Math.pow(0.5, e.daysAgo / w.halfLife);
    }
    const score = Math.max(0, Math.round(fit + engagement));
    return { score, fit: Math.round(fit), engagement: Math.round(engagement), engaged };
  }

  function evaluate(leads, w) {
    const rows = leads.map((lead) => {
      const s = scoreLead(lead, w);
      const mql = s.engaged && s.score >= w.threshold;
      return { lead, ...s, mql, sql: mql && lead.salesReady };
    });

    const total = rows.length;
    const engaged = rows.filter((r) => r.engaged).length;
    const mql = rows.filter((r) => r.mql).length;
    const sql = rows.filter((r) => r.sql).length;
    const salesReady = rows.filter((r) => r.lead.salesReady).length;
    const missed = salesReady - sql;

    const bySource = {};
    for (const r of rows) {
      const k = r.lead.source;
      if (!bySource[k]) bySource[k] = { source: k, leads: 0, mql: 0, sql: 0 };
      bySource[k].leads++;
      if (r.mql) bySource[k].mql++;
      if (r.sql) bySource[k].sql++;
    }

    return {
      rows,
      totals: { total, engaged, mql, sql, salesReady, missed },
      bySource: Object.values(bySource),
    };
  }

  g.Scoring = {
    CONTROLS, DEFAULT_WEIGHTS, PRESETS, EVENT_CAP, ENGAGED_WINDOW_DAYS,
    scoreLead, evaluate,
  };
})(typeof window !== 'undefined' ? window : globalThis);
