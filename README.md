# Dharma Programs & Events

A static webpage that displays upcoming programs from six organizations in a table
(**Organization · Event Name · Date · Link**). Event data is extracted with the
[Firecrawl](https://firecrawl.dev) API and refreshed **automatically every month**
by a GitHub Actions workflow. Hosted free on **GitHub Pages**.

## How it works

```
GitHub Actions (monthly cron)
      │  runs scripts/scrape.js with FIRECRAWL_API_KEY
      ▼
Firecrawl  ──scrapes──▶  the 6 sites in sites.json
      │
      ▼
data/events.json   ──committed back to the repo──▶  GitHub Pages serves index.html
                                                     which renders the table
```

## Files

| File | Purpose |
|------|---------|
| `index.html` | The page. Loads `data/events.json` and renders the searchable table. |
| `sites.json` | The 6 organizations and their URLs. Edit to add/remove sites. |
| `scripts/scrape.js` | Calls Firecrawl for each site and writes `data/events.json`. |
| `data/events.json` | The extracted event data (generated; committed by the workflow). |
| `.github/workflows/update-events.yml` | Monthly cron + manual "Run workflow" button. |

## One-time setup

1. **Create a GitHub repo** and push these files to it.

2. **Add your Firecrawl key as a secret** (it is never stored in the code):
   - Repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `FIRECRAWL_API_KEY`
   - Value: your Firecrawl key

3. **Enable GitHub Pages:**
   - Repo → **Settings → Pages**
   - Source: **Deploy from a branch**, Branch: **main**, Folder: **/ (root)**
   - Your site appears at `https://<username>.github.io/<repo>/`

4. **Test the automation now** (don't wait a month):
   - Repo → **Actions → "Update events (monthly)" → Run workflow**
   - It scrapes, commits an updated `data/events.json`, and Pages redeploys.

The cron `0 6 1 * *` runs at 06:00 UTC on the 1st of each month.

## Run locally

```bash
export FIRECRAWL_API_KEY=your_key_here
node scripts/scrape.js          # regenerates data/events.json
python3 -m http.server 4173     # then open http://localhost:4173
```

## Notes & limitations

- **Date quality varies by site.** Some sites (e.g. Dharma College) show dates without
  a year (`Jun - 30`), so the year can't always be determined. The page's *Hide past
  events* toggle only hides events it can confidently date in the past; undated events
  are always shown.
- **Firecrawl credits:** ~50 credits per site → ~300 credits per monthly run for 6 sites.
  Make sure your Firecrawl plan covers that.
- **Extraction is AI-based**, so occasional misses or stray rows are possible. Adjust the
  prompt in `scripts/scrape.js` if a site needs tuning.
