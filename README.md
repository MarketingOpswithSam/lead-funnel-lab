# Lead Funnel Lab

A single-page tool for playing with a B2B lead-scoring model. It generates 500 fictional leads, scores them with weights you control, and shows what happens to MQL volume, SQL volume and MQL-to-SQL conversion as you move the sliders.

It's plain HTML, CSS and JavaScript. No build step, no backend, no dependencies apart from Google Fonts, and it runs straight from the file system or from GitHub Pages.

## What you can do with it

- Drag the scoring weights for fit (seniority, company size, target industry) and engagement (demo requests, event meetings, webinars, pricing page views, content downloads, email clicks, web visits, unsubscribes).
- Set the engagement half-life, which controls how fast old activity stops counting.
- Set the MQL threshold.
- Switch between four presets: Balanced, Fit first, Intent first, and Content-heavy. The last one copies a pattern that shows up in a lot of real scoring models, where gated content and webinars carry most of the points.
- Load a new random sample, or go back to the original one (seed 2611).

Everything updates as you drag:

| Output | What it shows |
| --- | --- |
| MQLs | Leads at or above the threshold that were active in the last 90 days |
| SQLs | MQLs the simulated sales team accepts |
| MQL → SQL | SQLs divided by MQLs |
| Missed buyers | Leads sales would have accepted that never became MQLs |
| Funnel | All leads → engaged → MQL → SQL, drawn to scale |
| Score distribution | Histogram of every lead's score, split by whether sales would accept it, with the threshold marked |
| Conversion by source | Leads, MQLs, SQLs and MQL → SQL rate for each of the eight lead sources |
| Leads table | Every MQL with its score split into fit and engagement, or every missed buyer |

Each headline number also shows the change against the default model, so you can see the cost of a change as well as the gain.

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
assets/styles.css   styles, light and dark themes
assets/leads.js     seeded sample lead generator
assets/scoring.js   weights, presets, scoring and funnel maths
assets/app.js       sliders, charts and tables
.nojekyll           turns off Jekyll on GitHub Pages
```

## Changing it

- **Default weights and presets** are in `DEFAULT_WEIGHTS` and `PRESETS` in `assets/scoring.js`. Slider ranges and help text are in `CONTROLS` in the same file.
- **Fit shares, event caps and the 90-day activity window** are constants at the top of `assets/scoring.js`.
- **Lead sources, their share of volume and their base intent** are in `SOURCES` in `assets/leads.js`. Industries, seniority mix, countries and name pools sit next to it.
- **Number of leads** is `LEAD_COUNT` in `assets/app.js`.
- **How sales decides** is the `salesReady` line in `assets/leads.js`. Raise the intent coefficient and good engagement weights pay off more. Raise the fit coefficient and the Fit first preset starts to look better.

Slider settings and the current seed are saved in the browser's local storage, so a refresh keeps where you were. Nothing leaves the browser.
