# Lead Funnel Lab

A single-page tool for playing with a B2B lead-scoring model. It generates 500 fictional leads, scores them with weights you control, and shows what happens to MQL volume, SQL volume and MQL-to-SQL conversion as you move the sliders.

It's plain HTML, CSS and JavaScript. No build step, no backend, no dependencies apart from Google Fonts, and it runs straight from the file system or from GitHub Pages.

## What you can do with it

Lead Funnel Lab answers one question: who should sales call? Every one of the 500 sample leads is a dot on a live chart, placed by its score. Drag the purple line. Dots on the right get a call from sales.

- **A three-step mission** gets anyone started: drag the line, try a different scoring style, let the AI tune it.
- **Two plain meters**: "Leads sales wanted" (sales trust, the MQL to SQL rate) and "Buyers you found" (the share of real buyers you sent).
- **A model grade from F to A+** that compares your weights with the default model on the same sample. Moving the line alone can't raise it. A dashed "sweet spot" shows the best line for your current weights.
- **Let the AI tune it** runs a small optimiser live on the chart, the way predictive scoring learns from won and lost deals. Then try to beat it by hand.
- **Five predict-then-reveal experiments**, computed live from the sample, and **seven challenges** with confetti.
- **Six rules, one tap each**: every rule has a "Try it" button that moves the dots.
- **Three leads, three stories**: one buyer you nailed, one you missed, one wasted call, with a "Deal new leads" button.
- **Where the buyers come from**: sales trust by lead source, with the reason each source behaves the way it does.

The four scoring styles (Balanced, Fit first, Intent first, Content-heavy) sit under the chart. Every weight is in the "Fine-tune what counts" panel. Progress and settings are saved in your browser.

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
