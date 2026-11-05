/*
 * Lead Funnel Lab: experiments, badges and sources.
 * Every answer is computed live from the current sample, never hard-coded,
 * so the reveal always matches what the lab shows.
 */
(function (g) {
  'use strict';

  const SOURCES = {
    hbr: { short: 'HBR 2011', label: 'Oldroyd, McElheran & Elkington, "The Short Life of Online Sales Leads", Harvard Business Review, 2011', url: 'https://hbr.org/2011/03/the-short-life-of-online-sales-leads' },
    b2bi: { short: 'Ehrenberg-Bass 2021', label: 'Dawes, "The 95:5 Rule", Ehrenberg-Bass Institute for the LinkedIn B2B Institute, 2021', url: 'https://marketingscience.info/news-and-insights/the-955-rule-why-b2b-growth-starts-long-before-the-purchase' },
    gartner: { short: 'Gartner 2025', label: 'Gartner press release, "61% of B2B buyers prefer a rep-free buying experience", June 2025', url: 'https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-sales-survey-finds-61-percent-of-b2b-buyers-prefer-a-rep-free-buying-experience' },
    apple: { short: 'Apple 2021', label: 'Apple, Mail Privacy Protection announcement, June 2021', url: 'https://www.apple.com/newsroom/2021/06/apple-advances-its-privacy-leadership-with-ios-15-ipados-15-macos-monterey-and-watchos-8/' },
    salesforce: { short: 'Salesforce State of Sales', label: 'Salesforce, State of Sales report (reps spend about 30% of their time selling)', url: 'https://www.salesforce.com/resources/research-reports/state-of-sales/' },
    sabnis: { short: 'Journal of Marketing 2013', label: 'Sabnis, Chatterjee, Grewal & Lilien, "The Sales Lead Black Hole", Journal of Marketing, 2013', url: 'https://opus.lib.uts.edu.au/handle/10453/117150' },
    forrester: { short: 'Forrester 2023', label: 'Forrester, "Saying Goodbye To MQLs: Six MQL Myths Squashed", 2023', url: 'https://www.forrester.com/blogs/saying-goodbye-to-mqls-6-mql-myths-squashed-to-shift-your-leads-based-culture' },
    microsoft: { short: 'Microsoft Learn', label: 'Microsoft Learn, Configure predictive lead scoring (Dynamics 365 Sales)', url: 'https://learn.microsoft.com/en-us/dynamics365/sales/configure-predictive-lead-scoring' },
  };

  // lesson can be a string or a function of the live result: ({ demoLeads, total }) => string
  const EXPERIMENTS = [
    {
      id: 'pricing-vs-content',
      kind: 'duel',
      hypothesis: 'Signals close to a buying decision find more buyers than signals of general interest.',
      question: 'Score leads on ONE signal only. Which puts more buyers in your top 100?',
      a: { label: 'Pricing page views', weights: { pricingPage: 10 } },
      b: { label: 'Content downloads', weights: { contentDownload: 10 } },
      expect: 'a',
      lesson: 'People look at pricing when they are weighing up a purchase. Gated guides pull in students, job hunters, competitors and people doing homework, so a download says much less about timing.',
    },
    {
      id: 'fit-vs-behaviour',
      kind: 'duel',
      hypothesis: 'Who a lead is tells you if they could buy. What they do tells you if they are buying now.',
      question: 'Which model puts more buyers in its top 100?',
      a: { label: 'Fit only (role, size, industry)', weights: { seniority: 20, companySize: 15, industry: 10 } },
      b: { label: 'Behaviour only (what they did)', weights: { demoRequest: 30, eventMeeting: 15, webinarAttend: 10, pricingPage: 8, contentDownload: 6, emailClick: 3, webVisit: 1, unsubscribe: -15 } },
      expect: 'b',
      lesson: 'A perfect-fit account that isn’t in a buying cycle won’t take the meeting. Research for the LinkedIn B2B Institute estimates only about 5% of B2B buyers are in market at any time, so timing signals carry a lot of weight. Fit still matters: try the Fit first and Intent first styles and watch the grade. The best models use both.',
      source: 'b2bi',
    },
    {
      id: 'demo-vs-visits',
      kind: 'duel',
      hypothesis: 'The strongest signal is the best way to rank a whole list.',
      question: 'Which single signal puts more buyers in your top 100?',
      a: { label: 'Demo requests', weights: { demoRequest: 10 } },
      b: { label: 'Web page visits', weights: { webVisit: 5 } },
      expect: 'b',
      lesson: (r) => `Plot twist. A demo request is the strongest single signal per lead, but only ${r.demoLeads} of ${r.total} leads asked for one. The rest of the demo model’s top 100 is a coin toss, because it can’t tell about 9 in 10 leads apart. A frequent, medium signal ranks more of the list. Good models mix rare strong signals with common ones.`,
    },
    {
      id: 'raise-the-bar',
      kind: 'direction',
      hypothesis: 'A higher MQL line makes sales happier but leaves more buyers behind.',
      question: 'Starting from the default model, raise the MQL line from 45 to 60. What happens to missed buyers?',
      patch: { threshold: 60 },
      metric: 'missed',
      metricLabel: 'Missed buyers',
      expect: 'up',
      lesson: 'Every point you add to the line pushes some buyers back into nurture, where they wait longer to hear from sales. Speed matters: in Harvard Business Review’s study of online leads, firms that tried to reach a lead within an hour were nearly 7 times as likely to qualify it as firms that tried an hour later.',
      source: 'hbr',
    },
    {
      id: 'lower-the-bar',
      kind: 'direction',
      hypothesis: 'A lower MQL line creates more pipeline AND keeps quality.',
      question: 'Starting from the default model, drop the MQL line from 45 to 30. What happens to sales trust?',
      patch: { threshold: 30 },
      metric: 'rate',
      metricLabel: 'Sales trust',
      expect: 'down',
      lesson: 'More leads reach sales, but a bigger share of them aren’t ready, so reps spend more calls on people who won’t buy. Buyers notice: in a 2025 Gartner survey, 73% said they avoid suppliers who send irrelevant outreach.',
      source: 'gartner',
    },
  ];

  // ctx: { t, rate, recall, lift, touched, expsDone, sweet }
  const BADGES = [
    { id: 'first-move', title: 'First move', desc: 'Change any weight or drag the MQL line', check: (c) => c.touched },
    { id: 'sweet-spot', title: 'Sweet spot', desc: 'Land the MQL line on the dashed sweet spot', check: (c) => c.touched && c.sweet },
    { id: 'trusted', title: 'Trusted by sales', desc: 'Sales trust of 55% or more on at least 60 MQLs', check: (c) => c.touched && c.t.mql >= 60 && c.rate >= 55 },
    { id: 'net', title: 'Wide net', desc: 'Catch 60% of buyers while sales trust stays at 40%', check: (c) => c.touched && c.recall >= 60 && c.rate >= 40 },
    { id: 'beat-default', title: 'Beat the default', desc: 'Find weights that score higher than the default model', check: (c) => c.lift >= 1 },
    { id: 'grade-a', title: 'Straight A', desc: 'Reach a model grade of A or better', check: (c) => c.lift >= 3 },
    { id: 'scientist', title: 'Lab scientist', desc: 'Finish three experiments', check: (c) => c.expsDone >= 3 },
  ];

  g.LabGames = { EXPERIMENTS, BADGES, SOURCES };
})(typeof window !== 'undefined' ? window : globalThis);
