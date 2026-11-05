/*
 * Lead Funnel Lab: sample lead generator.
 *
 * Builds a deterministic set of fictional B2B leads from a numeric seed.
 * Every lead carries two hidden traits that the scoring model never sees:
 *   intent  (0..1) how close the buyer really is to a purchase
 *   fit     (0..1) how well the account matches the ideal customer profile
 * Engagement events are drawn from intent (with noise), and the simulated
 * sales decision (salesReady) is drawn from intent and fit. The scoring
 * model only sees the visible attributes and events, so it has to infer
 * intent from behaviour, the same way a real MAP scoring model does.
 */
(function (g) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const SOURCES = [
    { name: 'Organic search',       share: 18, intent: 0.38 },
    { name: 'Paid LinkedIn',        share: 16, intent: 0.30 },
    { name: 'Content syndication',  share: 14, intent: 0.20 },
    { name: 'Webinar',              share: 14, intent: 0.46 },
    { name: 'Event booth',          share: 10, intent: 0.42 },
    { name: 'Outbound SDR',         share: 10, intent: 0.26 },
    { name: 'Website contact form', share: 9,  intent: 0.58 },
    { name: 'Partner referral',     share: 9,  intent: 0.62 },
  ];

  const SENIORITY = [
    { level: 'C-level',  share: 7,  titles: ['CIO', 'CTO', 'CFO', 'COO', 'Chief Digital Officer', 'Chief Data Officer'] },
    { level: 'VP',       share: 8,  titles: ['VP Technology', 'VP Operations', 'GM Information Technology', 'VP Digital'] },
    { level: 'Director', share: 17, titles: ['IT Director', 'Director of Digital Transformation', 'Head of Data & Analytics', 'Head of Infrastructure', 'Head of Workplace Technology'] },
    { level: 'Manager',  share: 28, titles: ['IT Manager', 'Collaboration Platform Manager', 'Security Manager', 'Data Platform Manager', 'Project Manager', 'Procurement Manager'] },
    { level: 'Individual contributor', share: 33, titles: ['Systems Administrator', 'Power Platform Developer', 'Business Analyst', 'Cloud Engineer', 'Data Analyst', 'Marketing Coordinator'] },
    { level: 'Other',    share: 7,  titles: ['Student', 'Freelance Consultant', 'Recruiter'] },
  ];

  const SIZES = [
    { band: '1–49',        share: 15 },
    { band: '50–199',      share: 22 },
    { band: '200–999',     share: 28 },
    { band: '1,000–4,999', share: 22 },
    { band: '5,000+',      share: 13 },
  ];

  const INDUSTRIES = [
    { name: 'Financial services',    share: 14, icp: true,  suffix: ['Capital', 'Bank', 'Insurance', 'Wealth', 'Credit Union', 'Super'] },
    { name: 'Healthcare',            share: 12, icp: true,  suffix: ['Health', 'Medical Group', 'Care', 'Pathology', 'Hospital Network'] },
    { name: 'Government',            share: 10, icp: true,  suffix: ['City Council', 'Shire Council', 'Water Authority', 'Transport Agency'] },
    { name: 'Energy & utilities',    share: 8,  icp: true,  suffix: ['Energy', 'Power', 'Utilities', 'Water'] },
    { name: 'Education',             share: 9,  icp: false, suffix: ['University', 'Grammar School', 'Institute of Technology'] },
    { name: 'Manufacturing',         share: 12, icp: false, suffix: ['Industries', 'Manufacturing', 'Foods', 'Packaging'] },
    { name: 'Professional services', share: 13, icp: false, suffix: ['Partners', 'Advisory', 'Legal', 'Consulting'] },
    { name: 'Retail',                share: 9,  icp: false, suffix: ['Retail Group', 'Outfitters', 'Supermarkets', 'Home'] },
    { name: 'Technology',            share: 8,  icp: false, suffix: ['Software', 'Systems', 'Labs', 'Digital'] },
    { name: 'Logistics',             share: 5,  icp: false, suffix: ['Logistics', 'Freight', 'Transport'] },
  ];

  const COUNTRIES = [
    { name: 'Australia',      share: 30, pool: 'anglo' },
    { name: 'Netherlands',    share: 22, pool: 'dutch' },
    { name: 'India',          share: 20, pool: 'indian' },
    { name: 'United Kingdom', share: 10, pool: 'anglo' },
    { name: 'Singapore',      share: 10, pool: 'sg' },
    { name: 'New Zealand',    share: 8,  pool: 'anglo' },
  ];

  const NAMES = {
    anglo: {
      first: ['Olivia', 'Jack', 'Charlotte', 'Liam', 'Mia', 'Noah', 'Amelia', 'Oliver', 'Isla', 'William', 'Grace', 'Lachlan', 'Chloe', 'Thomas', 'Ruby', 'Harrison', 'Zoe', 'Mitchell', 'Hannah', 'Callum', 'Aroha', 'Tane'],
      last: ['Smith', 'Nguyen', 'Williams', 'Brown', 'Taylor', 'Wilson', 'Martin', 'Anderson', 'Walker', 'Thompson', 'Kelly', 'Ryan', 'Murphy', 'Clarke', 'Patel', 'Singh', "O'Brien", 'Hughes'],
    },
    dutch: {
      first: ['Daan', 'Sanne', 'Lars', 'Femke', 'Bram', 'Lotte', 'Joost', 'Eva', 'Ruben', 'Anouk', 'Thijs', 'Marloes', 'Sem', 'Iris', 'Pieter', 'Noor'],
      last: ['de Vries', 'Jansen', 'van Dijk', 'Bakker', 'Visser', 'Smit', 'Meijer', 'de Boer', 'Mulder', 'van den Berg', 'Dekker', 'Hendriks', 'Vos', 'Peters'],
    },
    indian: {
      first: ['Priya', 'Arjun', 'Ananya', 'Rohan', 'Kavya', 'Vikram', 'Sneha', 'Aditya', 'Meera', 'Rahul', 'Divya', 'Karthik', 'Pooja', 'Siddharth', 'Neha', 'Aravind'],
      last: ['Sharma', 'Iyer', 'Reddy', 'Nair', 'Menon', 'Gupta', 'Rao', 'Kulkarni', 'Desai', 'Pillai', 'Joshi', 'Banerjee', 'Krishnan', 'Mehta'],
    },
    sg: {
      first: ['Wei Ling', 'Jun Hao', 'Hui Min', 'Darren', 'Shu Fen', 'Marcus', 'Mei Xin', 'Ryan', 'Nurul', 'Faizal'],
      last: ['Tan', 'Lim', 'Ng', 'Wong', 'Lee', 'Chua', 'Goh', 'Teo', 'Rahman', 'Koh'],
    },
  };

  const COMPANY_STEMS = {
    anglo: ['Northbridge', 'Harbourline', 'Kestrel', 'Wattle', 'Southern Cross', 'Coastal', 'Ironbark', 'Bluegum', 'Summit', 'Meridian', 'Lantern', 'Granite', 'Copperleaf', 'Beacon', 'Tasman', 'Riverbend', 'Redgum', 'Eastgate', 'Fernhill', 'Atlas'],
    dutch: ['Dijkhaven', 'Polderveld', 'Noordkade', 'Waterveld', 'Lindeboom', 'Zeewolde', 'Brugstede', 'Kanaalzijde', 'Oranjelaan', 'Molenhoek', 'Duinrand', 'Havenpoort'],
    indian: ['Banyan', 'Saffron', 'Lotus', 'Monsoon', 'Indus', 'Deccan', 'Kaveri', 'Sahyadri', 'Neelam', 'Tarang', 'Vistara', 'Arjuna'],
    sg: ['Marina', 'Straits', 'Orchid', 'Lion Gate', 'Keppel Bay', 'Temasek Park', 'Jade', 'Sentosa Point'],
  };

  const EVENT_TYPES = ['email_click', 'web_visit', 'pricing_page', 'content_download', 'webinar_attend', 'event_meeting', 'demo_request', 'unsubscribe'];

  function generateLeads(seed, count) {
    const rand = mulberry32(seed);
    const n = count || 500;

    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const pickWeighted = (arr) => {
      const total = arr.reduce((s, x) => s + x.share, 0);
      let r = rand() * total;
      for (const x of arr) { r -= x.share; if (r <= 0) return x; }
      return arr[arr.length - 1];
    };
    const normal = () => {
      const u = 1 - rand(), v = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    const poisson = (lambda) => {
      const L = Math.exp(-lambda);
      let k = 0, p = 1;
      do { k++; p *= rand(); } while (p > L);
      return k - 1;
    };
    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const sigmoid = (x) => 1 / (1 + Math.exp(-x));

    const seniorityFit = { 'C-level': 1, VP: 0.85, Director: 0.7, Manager: 0.45, 'Individual contributor': 0.15, Other: 0 };
    const sizeFit = { '1–49': 0.1, '50–199': 0.4, '200–999': 0.8, '1,000–4,999': 1, '5,000+': 0.9 };

    const leads = [];
    for (let i = 0; i < n; i++) {
      const source = pickWeighted(SOURCES);
      const country = pickWeighted(COUNTRIES);
      const industry = pickWeighted(INDUSTRIES);
      const size = pickWeighted(SIZES);

      // Outbound, paid social and events skew senior; syndication skews junior.
      let sen = pickWeighted(SENIORITY);
      const skewUp = ['Outbound SDR', 'Paid LinkedIn', 'Event booth'].includes(source.name);
      const skewDown = source.name === 'Content syndication';
      if (skewUp && (sen.level === 'Individual contributor' || sen.level === 'Other') && rand() < 0.5) sen = pickWeighted(SENIORITY);
      if (skewDown && (sen.level === 'C-level' || sen.level === 'VP') && rand() < 0.6) sen = pickWeighted(SENIORITY);

      const names = NAMES[country.pool];
      const stem = pick(COMPANY_STEMS[country.pool]);
      let company;
      if (industry.name === 'Government' && country.name === 'Netherlands') company = 'Gemeente ' + stem;
      else company = stem + ' ' + pick(industry.suffix);

      const fit = clamp01(0.45 * seniorityFit[sen.level] + 0.35 * sizeFit[size.band] + 0.2 * (industry.icp ? 1 : 0.3));
      const intent = clamp01(source.intent + 0.18 * normal());

      // Engagement events. Higher intent means more events, heavier events, and more recent ones.
      const events = [];
      const recencyMean = 12 + (1 - intent) * 75;
      const dormant = rand() < 0.15 * (1 - intent);
      const when = () => {
        if (dormant) return 91 + Math.floor(rand() * 90);
        return Math.min(180, Math.floor(-Math.log(1 - rand()) * recencyMean));
      };
      const add = (type, k) => { for (let j = 0; j < k; j++) events.push({ type, daysAgo: when() }); };

      // Clicks and downloads are weak signals; pricing views and demo requests are strong ones.
      add('email_click', poisson(1 + 2 * intent));
      add('web_visit', poisson(0.5 + 7 * intent));
      add('pricing_page', poisson(2.6 * Math.pow(intent, 2.5)));
      add('content_download', poisson(0.6 + 0.4 * intent));
      add('webinar_attend', poisson(0.15 + 0.35 * intent));
      add('event_meeting', poisson(0.25 * intent));
      if (rand() < 0.6 * Math.pow(intent, 3)) add('demo_request', 1);

      if (source.name === 'Webinar' && rand() < 0.7) add('webinar_attend', 1);
      if (source.name === 'Event booth' && rand() < 0.6) add('event_meeting', 1);
      if (source.name === 'Content syndication') add('content_download', 1);
      if (source.name === 'Website contact form' && rand() < 0.35) add('demo_request', 1);
      if (rand() < 0.14 * (1 - intent)) add('unsubscribe', 1);

      events.sort((a, b) => a.daysAgo - b.daysAgo);

      // Students, recruiters and freelancers can be very active, but sales never takes them.
      const salesReady = rand() < sigmoid(-5.1 + 5.6 * intent + 2.4 * fit) && sen.level !== 'Other';

      leads.push({
        id: 'L' + String(i + 1).padStart(4, '0'),
        name: pick(names.first) + ' ' + pick(names.last),
        title: pick(sen.titles),
        seniority: sen.level,
        company,
        industry: industry.name,
        icp: industry.icp,
        size: size.band,
        country: country.name,
        source: source.name,
        events,
        // Hidden traits. The scoring model never reads these.
        intent,
        fit,
        salesReady,
      });
    }
    return leads;
  }

  g.LeadData = {
    generateLeads,
    SOURCES: SOURCES.map((s) => s.name),
    EVENT_TYPES,
    ICP_INDUSTRIES: INDUSTRIES.filter((i) => i.icp).map((i) => i.name),
  };
})(typeof window !== 'undefined' ? window : globalThis);
