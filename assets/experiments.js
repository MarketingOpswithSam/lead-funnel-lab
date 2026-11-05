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

  // Each experiment is a plain question. Duels compare two ways of ranking the 500 leads by how many real buyers land in the top 100.
  // Direction experiments change one setting from the default and ask which way a number moves.
  // lesson can be a string or a function of the live result: ({ demoLeads, total }) => string
  const EXPERIMENTS = [
    {
      id: 'pricing-vs-content',
      kind: 'duel',
      title: 'Which is the stronger buying signal?',
      ask: 'One person looks at your pricing page. Another downloads one of your guides. Which kind of person is more likely to be a real buyer?',
      how: 'We rank all 500 leads using only that one action, take the top 100, and count how many are real buyers.',
      a: { label: 'Looking at pricing', weights: { pricingPage: 10 } },
      b: { label: 'Downloading a guide', weights: { contentDownload: 10 } },
      expect: 'a',
      lesson: 'People look at pricing when they are weighing up a purchase. Guides get downloaded by students, job hunters, competitors and people doing homework, so a download says much less about whether someone is ready to buy.',
    },
    {
      id: 'fit-vs-behaviour',
      kind: 'duel',
      title: 'Who they are, or what they do?',
      ask: 'You can rank leads by who they are (job title, company size, industry) or by what they did (demo requests, pricing visits, webinars). Which finds more real buyers?',
      how: 'We rank all 500 leads each way, take the top 100, and count how many are real buyers.',
      a: { label: 'Who they are', weights: { seniority: 20, companySize: 15, industry: 10 } },
      b: { label: 'What they did', weights: { demoRequest: 30, eventMeeting: 15, webinarAttend: 10, pricingPage: 8, contentDownload: 6, emailClick: 3, webVisit: 1, unsubscribe: -15 } },
      expect: 'b',
      lesson: 'A perfect-fit company that isn’t shopping right now won’t take the meeting. Research for the LinkedIn B2B Institute estimates only about 5% of B2B buyers are in market at any time, so what people do right now tells you more. Who they are still helps: the best scoring uses both.',
      source: 'b2bi',
    },
    {
      id: 'demo-vs-visits',
      kind: 'duel',
      title: 'Is the strongest signal always the most useful?',
      ask: 'Asking for a demo is the clearest sign of interest there is. But across your whole list, which finds more real buyers: demo requests, or ordinary page visits?',
      how: 'We rank all 500 leads using only that one action, take the top 100, and count how many are real buyers.',
      a: { label: 'Demo requests', weights: { demoRequest: 10 } },
      b: { label: 'Page visits', weights: { webVisit: 5 } },
      expect: 'b',
      lesson: (r) => `Only ${r.demoLeads} of the ${r.total} leads asked for a demo. Those are great leads, but the rest of a demo-only top 100 is picked at random, because the score can’t tell the other leads apart. Page visits are weaker, but almost everyone has some, so they rank far more of the list. Good scoring mixes rare strong signals with common ones.`,
    },
    {
      id: 'raise-the-bar',
      kind: 'direction',
      title: 'What happens when you get stricter?',
      ask: 'You raise the cut-off score from 45 to 60, so fewer leads go to sales. What happens to the number of real buyers you miss?',
      how: 'We start from the default settings and change only the cut-off score.',
      up: 'We miss more buyers',
      down: 'We miss fewer buyers',
      patch: { threshold: 60 },
      metric: 'missed',
      metricLabel: 'Real buyers missed',
      expect: 'up',
      lesson: 'Every point you add to the cut-off pushes some real buyers back into marketing nurture, where they wait longer to hear from sales. Speed matters: in Harvard Business Review’s study of online leads, firms that tried to reach a lead within an hour were nearly 7 times as likely to qualify it as firms that tried an hour later.',
      source: 'hbr',
    },
    {
      id: 'lower-the-bar',
      kind: 'direction',
      title: 'What happens when you get looser?',
      ask: 'You lower the cut-off score from 45 to 30, so more leads go to sales. Of the leads sales gets, what share will they actually want?',
      how: 'We start from the default settings and change only the cut-off score.',
      up: 'A bigger share',
      down: 'A smaller share',
      patch: { threshold: 30 },
      metric: 'rate',
      metricLabel: 'Share of leads sales wants',
      expect: 'down',
      lesson: 'More leads reach sales, but a bigger share of them aren’t ready, so reps spend more of their calls on people who won’t buy. Buyers notice too: in a 2025 Gartner survey, 73% said they avoid suppliers who send irrelevant outreach.',
      source: 'gartner',
    },
  ];

  // ctx: { t, rate, recall, lift, touched, expsDone, sweet }
  const BADGES = [
    { id: 'first-move', title: 'First move', desc: 'Change any weight or drag the cut-off', check: (c) => c.touched },
    { id: 'sweet-spot', title: 'Sweet spot', desc: 'Land the cut-off on the dashed sweet spot', check: (c) => c.touched && c.sweet },
    { id: 'trusted', title: 'Trusted by sales', desc: 'Sales trust of 55% or more on at least 60 MQLs', check: (c) => c.touched && c.t.mql >= 60 && c.rate >= 55 },
    { id: 'net', title: 'Wide net', desc: 'Catch 60% of buyers while sales trust stays at 40%', check: (c) => c.touched && c.recall >= 60 && c.rate >= 40 },
    { id: 'beat-default', title: 'Beat the default', desc: 'Find weights that score higher than the default model', check: (c) => c.lift >= 1 },
    { id: 'grade-a', title: 'Straight A', desc: 'Reach a model grade of A or better', check: (c) => c.lift >= 3 },
    { id: 'scientist', title: 'Lab scientist', desc: 'Finish three experiments', check: (c) => c.expsDone >= 3 },
  ];

  g.LabGames = { EXPERIMENTS, BADGES, SOURCES };
})(typeof window !== 'undefined' ? window : globalThis);
