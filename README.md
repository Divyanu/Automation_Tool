# Reddit Ads Intelligence Tool (Node.js + Playwright)

Automates Pemavor Reddit Trends keyword checks and returns ranked subreddit + keyword opportunities for Reddit Ads research.

## Features

- Accepts subreddit-only input and auto-fetches keywords via Keyworddit
- Supports manual subreddit + keyword input mode
- Deduplicates and trims keywords (max 40 per subreddit)
- Splits keywords into chunks of 5 for Pemavor requests
- Scrapes visible Pemavor table values only:
  - Keyword
  - Posts/Day
  - Comments/Day
  - Comments/Post
- Retries failed runs (max 3)
- Adds randomized delay (3-5 seconds) between runs
- Saves output to JSON + CSV
- Scores and ranks:
  - Top 5 subreddits
  - Top 30 keywords
- Shows skipped subreddits when Keyworddit returns no data
- Prints actionable pattern + angle + opportunity insights

## Setup

1. Initialize npm project (if needed):

```bash
npm init -y
```

2. Install Playwright:

```bash
npm install playwright
```

3. (Recommended first run) Install browser binaries:

```bash
npx playwright install chromium
```

## Run (Recommended: Web UI)

If you prefer entering data in a form:

```bash
npm run ui
```

Then open:

`http://127.0.0.1:8787`

In the UI you can:

- Choose input mode:
  - Subreddits only (Keyworddit -> Pemavor)
  - Manual keywords per subreddit
- Add multiple subreddits
- Run analysis directly
- View top subreddits and top keywords
- View skipped subreddits (no Keyworddit data)
- Download output files (JSON and CSV)

## CLI (Optional)

If you still want CLI flow, run:

```bash
npm start
```

or

```bash
node src/index.js
```

## Output Files

Saved in `output/`:

- `output/results.json`
- `output/results.csv`

CSV columns:

`subreddit,keyword,posts_per_day,comments_per_day,comments_per_post,keyword_score`

## Selector Notes (Important)

The scraper uses robust fallback selectors in `src/scraper.js` (`SELECTOR_HINTS`) based on:

- input placeholders
- input names/ids
- button text and submit buttons
- table structure

If Pemavor changes UI markup, update `SELECTOR_HINTS` accordingly.
