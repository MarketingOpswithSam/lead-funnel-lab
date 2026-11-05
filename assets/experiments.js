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
    gartner: { short: 'Gartner 2025', label: 'Gartner, survey of B2B buyers, press release, June 2025 (73% avoid suppliers who send irrelevant outreach)', url: 'https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-sales-survey-finds-61-percent-of-b2b-buyers-prefer-a-rep-free-buying-experience' },
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
      how: 'We sort all 500 leads twice: once by pricing page visits only, once by guide downloads only. More visits or downloads means a higher place, and recent ones count more. Then we take the top 100 from each list and count the real buyers.',
      a: { label: 'Looking at pricing', weights: { pricingPage: 10 } },
      b: { label: 'Downloading a guide', weights: { contentDownload: 10 } },
      expect: 'a',
      lesson: 'Give pricing visits more points than guide downloads. People look at pricing when they are weighing up a purchase. Guides get downloaded by students, job hunters, competitors and people doing homework, so a download says much less about whether someone is ready to buy.',
    },
    {
      id: 'fit-vs-behaviour',
      kind: 'duel',
      title: 'Who they are, or what they do?',
      ask: 'You can rank leads by who they are (job title, company size, industry) or by what they did (demo requests, pricing visits, webinars). Which finds more real buyers?',
      how: 'We sort all 500 leads twice: once by who they are only, once by what they did only. Then we take the top 100 from each list and count the real buyers.',
      a: { label: 'Who they are', weights: { seniority: 20, companySize: 15, industry: 10 } },
      b: { label: 'What they did', weights: { demoRequest: 30, eventMeeting: 15, webinarAttend: 10, pricingPage: 8, contentDownload: 6, emailClick: 3, webVisit: 1, unsubscribe: -15 } },
      expect: 'b',
      lesson: 'Score what people do first, then add who they are. A perfect-fit company that isn’t shopping right now won’t take the meeting. Research for the LinkedIn B2B Institute estimates that only about 5% of B2B buyers are looking to buy in any given quarter, so what people do right now tells you more. Who they are still helps: the best scoring uses both.',
      source: 'b2bi',
    },
    {
      id: 'demo-vs-visits',
      kind: 'duel',
      title: 'Demo requests or page visits?',
      ask: 'Asking for a demo is the clearest sign of interest there is. But across your whole list, which finds more real buyers: demo requests, or ordinary page visits?',
      how: 'We sort all 500 leads twice: once by demo requests only, once by page visits only. More of them means a higher place, and recent ones count more. Then we take the top 100 from each list and count the real buyers.',
      a: { label: 'Demo requests', weights: { demoRequest: 10 } },
      b: { label: 'Page visits', weights: { webVisit: 5 } },
      expect: 'b',
      lesson: (r) => `Don’t score on demo requests alone. Only ${r.demoLeads} of the ${r.total} leads asked for a demo, and ${r.demoBuyers} of them are real buyers. That’s a good hit rate, but it can’t fill a top 100. The other places go to leads with no demo request, and the score can’t tell those apart, so they’re as good as picked at random. Page visits say less each, but almost everyone has some, so they can sort the whole list. Use both.`,
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
      lesson: 'A stricter cut-off gives sales fewer wasted calls, but you pay for it in missed buyers. A higher cut-off means a lead needs more points before sales calls. The real buyers who score between 45 and 60 now get no call at all, and marketing just keeps emailing them. Some will score higher later, but late costs you: in Harvard Business Review’s study of online leads, firms that tried to reach a lead within an hour were nearly 7 times as likely to get a real conversation with a decision maker as firms that waited longer.',
      source: 'hbr',
    },
    {
      id: 'lower-the-bar',
      kind: 'direction',
      title: 'What happens when you get looser?',
      ask: 'You lower the cut-off score from 45 to 30, so more leads go to sales. Of the leads sales gets, will a bigger or smaller share be real buyers?',
      how: 'We start from the default settings and change only the cut-off score.',
      up: 'A bigger share are real buyers',
      down: 'A smaller share are real buyers',
      patch: { threshold: 30 },
      metric: 'rate',
      metricLabel: 'Real buyers among leads sent to sales',
      expect: 'down',
      lesson: 'A looser cut-off feeds sales more leads, but more of them are wasted calls. More leads reach sales, but a bigger share of them aren’t ready, so reps spend more of their calls on people who won’t buy. Buyers notice too: in a 2025 Gartner survey, 73% said they avoid suppliers who send irrelevant outreach.',
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
