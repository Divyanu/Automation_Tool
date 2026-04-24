# Reddit Ads Intelligence Tool (Node.js + Playwright)

Automates Pemavor Reddit Trends keyword checks and returns ranked subreddit + keyword opportunities for Reddit Ads research.

## Features

- Accepts subreddit-only input and auto-fetches keywords via Keyworddit
- Adds parallel Reddit live extraction (posts + comments) for conversational/problem keywords
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

2. Install dependencies:

```bash
npm install
```

3. (Recommended first run) Install browser binaries:

```bash
npx playwright install chromium
```

## Reddit Live Source (No App Credentials Required)

Live extraction uses public Reddit JSON endpoints:

- `https://www.reddit.com/r/<subreddit>/top.json?t=month`
- `https://www.reddit.com/r/<subreddit>/hot.json`
- `https://www.reddit.com/<post-permalink>.json`

No Reddit app/client credentials are required.

Optional: set a custom user-agent:

```bash
export REDDIT_PUBLIC_USER_AGENT="reddit-ads-intel/1.0"
```

## Exact Workflow

### Mode A: Subreddits only (Keyworddit + Reddit live + Pemavor)

1. **Input**
   - You provide a list of subreddits in the UI (one per line, with or without `r/`).

2. **Keyworddit extraction**
   - The tool opens Keyworddit with Playwright.
   - For each subreddit:
     - Selects subreddit suggestion
     - Scrapes keyword + monthly search volume
   - Subreddits with no suggestions/data are tracked in `failed_subreddits`.

3. **Reddit live extraction (parallel signal source)**
   - Uses public Reddit JSON endpoints (no auth).
   - For each subreddit:
     - Fetches top posts from last 30 days (+ optional hot posts)
     - Fetches top-level comments per post
     - Filters low-signal content by score and length
     - Extracts phrases from post/comment text:
       - 2-5 word n-grams
       - question-style phrases
       - problem statements
     - Ranks phrases by frequency

4. **Keyword merge and normalization**
   - Combines Keyworddit keywords + Reddit-live keywords
   - Normalizes (lowercase, trim), deduplicates, caps to 40 keywords per subreddit
   - Keeps source metadata:
     - `keyworddit`
     - `scraped`
     - `keyworddit+scraped`

5. **Pemavor validation**
   - Sends only keyword chunks (5 at a time) to Pemavor (no subreddit input field used)
   - Scrapes:
     - `posts_per_day`
     - `comments_per_day`
     - `comments_per_post`

6. **Scoring and ranking**
   - Keyword score:
     - `0.4 * posts_per_day + 0.4 * comments_per_day + 0.2 * comments_per_post`
   - Subreddit score:
     - average of top 5 keyword scores in that subreddit
   - Outputs:
     - Top 5 subreddits
     - Top 30 keywords
     - Skipped subreddits

### Mode B: Manual keywords per subreddit

1. You enter subreddit + keyword list manually.
2. Tool skips Keyworddit/Reddit-live extraction.
3. It runs Pemavor + scoring/ranking with the same output format.

## Keyword Selection Logic (Conceptual)

The system uses two keyword sources and merges them:

1. **Keyworddit source**
   - Pulls keyword suggestions directly from HigherVisibility Keyworddit.
   - These represent known search-style terms for a subreddit.

2. **Reddit live source (fallback for Keyworddit-failed subreddits)**
   - Scrapes recent subreddit discussions from Reddit public JSON:
     - top posts (last 30 days)
     - optional hot posts
     - top-level comments per post
   - Keeps only high-signal content:
     - posts above score threshold
     - comments above score threshold
     - removes deleted/removed and very short comments

From high-signal text, the tool extracts candidate phrases using:

- **2-5 word n-grams** (captures repeated phrase patterns)
- **question-style phrases** (how/why/what/which/when)
- **problem statements** (issue/problem/struggle/broken/help style language)

Then it ranks phrases by **frequency** (how often they appear) and keeps top phrases per subreddit.

### Why this works

- Keyworddit captures established keyword demand.
- Reddit live extraction captures fresh, conversational, and pain-point phrasing.
- Merging both gives a more complete keyword set for Pemavor validation and scoring.

### Final merge behavior

- Normalize all keywords (lowercase + trimmed spaces)
- Deduplicate across sources
- Keep source traceability per keyword:
  - `keyworddit`
  - `scraped`
  - `keyworddit+scraped`

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
