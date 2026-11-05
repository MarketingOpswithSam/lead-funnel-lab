# Lead Funnel Lab

A single-page tool for playing with a B2B lead-scoring model. It generates 500 fictional leads, scores them with weights you control, and shows what happens to MQL volume, SQL volume and MQL-to-SQL conversion as you move the sliders.

It's plain HTML, CSS and JavaScript. No build step, no backend, no dependencies apart from Google Fonts, and it runs straight from the file system or from GitHub Pages.

## What you can do with it

Lead Funnel Lab is a one-page game for B2B marketers. Every one of the 500 sample leads is a dot on a live chart, placed by its score.

- **Drag the MQL line** across the chart, or move any weight, and watch the dots jump. Each dot is coloured by what happens to it: indigo for buyers sent to sales, coral for buyers missed, amber for wasted calls (MQLs sales rejects), grey for leads rightly left out. Hover a dot to meet the lead and see why sales took it or passed.
- **Chase a model grade** from F to A+. The grade balances two meters: sales trust (share of MQLs sales accepts) and buyers caught (share of real buyers you sent). Push one too far and the other drops, so only better weights get you an A.
- **Test hypotheses.** Five predict-then-reveal experiments, such as "pricing page views vs content downloads: which single signal finds more buyers in your top 100?" Every answer is computed live from the sample, so the reveal always matches what the lab shows.
- **Unlock challenges** like "Trusted by sales" or "Beat the default", with confetti when you get there.
- **Let the AI tune it.** One click runs a small optimiser that tries hundreds of weight changes against who really bought, live on the chart, then dares you to beat it by hand. It shows how predictive scoring learns, and how it can overfit when you shuffle the leads.
- **Six rules of lead scoring**, each with a "Try it" button that moves the dots: room for only 50 calls, show only the real buyers, score on fit only, make signals fade fast, sweep the line, let the AI tune it.
- **Meet your leads**: cards for buyers sent, buyers missed and wasted calls, each with the reason sales took it or passed. Hover a card to find its dot.

Four scoring styles (Balanced, Fit first, Intent first, Content-heavy) give you a one-click starting point. Progress, best grade and settings are saved in your browser.

## How marketers can use it

- Try a scoring change here before making it in HubSpot, Marketo or Dynamics 365 Customer Insights, and see what it does to MQL volume and sales acceptance.
- Open it in a sales and marketing meeting and agree on the MQL threshold together, with both teams watching the trade-off between more leads and better leads.
- Use the missed buyers list to make the case for SDR follow-up or a nurture track for leads sitting just under the line.
- Check channels. If one source keeps sending MQLs that sales turns down, give fewer points to the events that channel creates instead of raising the bar for everyone.

## Using your own data

`generateLeads()` in `assets/leads.js` returns an array of plain objects. To run the lab on a real export, replace that call in `assets/app.js` with your own array in the same shape:

```js
{
  id: 'L0001', name: 'Jane Doe', title: 'IT Director', seniority: 'Director',
  company: 'Example Co', industry: 'Healthcare', icp: true, size: '200–999',
  country: 'Australia', source: 'Webinar',
  events: [{ type: 'pricing_page', daysAgo: 4 }, { type: 'email_click', daysAgo: 12 }],  // most recent first
  salesReady: true,   // did sales accept it? take this from your CRM's lead status or disqualification reason
}
```

Seniority, size and event types must use the values listed in `assets/scoring.js`. `intent` and `fit` are only used for the reasons text in the leads table, so set them to rough 0 to 1 estimates (for example from deal stage). Keep real customer data out of a public repository.

## How the sample data works

`assets/leads.js` builds the leads from a seeded random number generator, so the same seed always gives the same 500 leads.

Each lead gets a company, contact name, job title, seniority, industry, company size, country (Australia, Netherlands, India, UK, Singapore, New Zealand) and lead source. All names are made up.

Each lead also has two hidden traits that the scoring model never reads:

- **intent**, between 0 and 1, which starts from a base level for the lead's source (partner referrals and contact form leads are warmer than content syndication or outbound) plus some noise
- **fit**, between 0 and 1, from seniority, company size and industry

Engagement events are drawn from intent. Higher intent means more events, more recent events, and more of the heavy ones. Pricing page views and demo requests rise sharply with intent. Email clicks and content downloads barely change with it, which is roughly how those signals behave in real marketing automation data.

Whether sales accepts a lead (`salesReady`) is a coin flip weighted by intent and fit. Somewhere between a fifth and a quarter of the leads would be accepted if sales saw them, depending on the sample.

The point of this setup is that the score has to guess intent from behaviour. Moving the sliders changes who you hand to sales. It doesn't change who is actually ready to buy. So the MQL → SQL rate tells you how well your weights read real buying intent, and the missed buyers number tells you what you left behind.

## How the scoring works

```
score  = fit points + engagement points
fit    = seniority share × seniority weight
       + size share × size weight
       + industry share × industry weight
event  = weight × 0.5 ^ (days ago ÷ half-life)
MQL    = score ≥ threshold, and at least one event in the last 90 days
SQL    = MQL that the simulated sales team accepts
```

Shares used for fit:

| Seniority | Share | Company size | Share |
| --- | --- | --- | --- |
| C-level | 100% | 1 to 49 | 10% |
| VP | 85% | 50 to 199 | 40% |
| Director | 70% | 200 to 999 | 80% |
| Manager | 45% | 1,000 to 4,999 | 100% |
| Individual contributor | 15% | 5,000+ | 90% |
| Other (student, recruiter, freelancer) | 0% | | |

Target industries (financial services, healthcare, government, energy & utilities) get 100% of the industry weight. Everything else gets 30%.

Only the most recent events of each type count: three of most types, ten web visits, one demo request. An unsubscribe subtracts its full penalty and doesn't decay. Scores below zero are shown as zero.

## Run it locally

Open `index.html` in a browser. That's it. The scripts are plain `<script>` tags, not ES modules, so they work from `file://` too.

If you'd rather serve it:

```bash
python3 -m http.server 8000
```

Then go to http://localhost:8000.

## Deploy to GitHub Pages

1. Create a new repository on GitHub and push these files to the `main` branch, with `index.html` at the root.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch", pick `main` and `/ (root)`, and save.
4. After a minute or so the site is live at `https://<your-username>.github.io/<repo-name>/`.

The empty `.nojekyll` file tells GitHub Pages to serve the files as they are without running Jekyll. All paths in `index.html` are relative, so the site works under a repository subpath.

## Files

```
index.html          page layout and the "How scoring works" panel
assets/styles.css   styles and brand colours
assets/leads.js     seeded sample lead generator
assets/scoring.js   weights, presets, scoring and funnel maths
assets/experiments.js  hypotheses, challenges and sources
assets/app.js       arena, scoreboard, motion and game logic
assets/logo*.png    Marketing Ops with Sam logo
.nojekyll           turns off Jekyll on GitHub Pages
```

## Changing it

- **Brand colours** are the first few lines of `assets/styles.css`: `--brand` (the accent colour) and `--brand-2` (the MQL threshold line). The page always shows a white background, whatever the system theme. The font is DM Sans, loaded in `index.html`.
- **Default weights and presets** are in `DEFAULT_WEIGHTS` and `PRESETS` in `assets/scoring.js`. Slider ranges and help text are in `CONTROLS` in the same file.
- **Fit shares, event caps and the 90-day activity window** are constants at the top of `assets/scoring.js`.
- **Lead sources, their share of volume and their base intent** are in `SOURCES` in `assets/leads.js`. Industries, seniority mix, countries and name pools sit next to it.
- **Number of leads** is `LEAD_COUNT` in `assets/app.js`.
- **How sales decides** is the `salesReady` line in `assets/leads.js`. Raise the intent coefficient and good engagement weights pay off more. Raise the fit coefficient and the Fit first preset starts to look better.

Slider settings and the current seed are saved in the browser's local storage, so a refresh keeps where you were. Nothing leaves the browser.
