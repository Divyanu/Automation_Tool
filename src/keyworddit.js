const { chromium } = require("playwright");
const { sleep, randomBetween } = require("./utils");
const { normalizeSubreddit, sanitizeSubredditMap } = require("./parser");

const KEYWORDDIT_PAGE = "https://www.highervisibility.com/seo/tools/keyworddit/";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bareSubredditName(line) {
  const normalized = normalizeSubreddit(line);
  if (!normalized) return "";
  return normalized.replace(/^r\//i, "");
}

function parseVolumeText(text) {
  const cleaned = String(text || "")
    .replace(/,/g, "")
    .replace(/[^\d.]/g, "")
    .trim();
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

async function acceptCookiesIfPresent(page) {
  await page.locator("#cn-accept-cookie").click({ timeout: 3000 }).catch(() => {});
}

async function scrapeOneSubreddit(page, bareName, options) {
  const suggestTimeout = options.keywordditSuggestTimeoutMs ?? 15000;
  const resultsTimeout = options.keywordditResultsTimeoutMs ?? 60000;

  await page.goto(KEYWORDDIT_PAGE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await acceptCookiesIfPresent(page);
  await page.locator("#keyworddit-failure-container").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});

  const input = page.locator('input[name="subreddit"]');
  await input.click({ timeout: 5000 });
  await input.fill("");
  await input.pressSequentially(bareName, { delay: options.keywordditKeyDelayMs ?? 100 });

  await page
    .locator(".subreddit-suggestion")
    .first()
    .waitFor({ state: "visible", timeout: suggestTimeout })
    .catch(() => null);

  const suggestionCount = await page.locator(".subreddit-suggestion").count();
  if (suggestionCount === 0) {
    return { keywords: [], volumes: [], reason: "no_suggestions" };
  }

  const exact = page.locator(".subreddit-suggestion").filter({
    hasText: new RegExp(`^\\s*${escapeRegex(bareName)}\\s*$`, "i")
  });
  if ((await exact.count()) > 0) {
    await exact.first().click();
  } else {
    await page.locator(".subreddit-suggestion").first().click();
  }

  await page.locator("#get-keywords").click({ timeout: 10000 });

  await page.locator("#loading").waitFor({ state: "hidden", timeout: resultsTimeout }).catch(() => {});

  const failedVisible = await page.locator("#keyworddit-failure-container").isVisible().catch(() => false);
  if (failedVisible) {
    return { keywords: [], volumes: [], reason: "keyworddit_failure_ui" };
  }

  await page
    .locator(".keyworddit-table-body tr")
    .first()
    .waitFor({ state: "visible", timeout: resultsTimeout })
    .catch(() => null);

  const rowLocator = page.locator(".keyworddit-table-body tr");
  const rowCount = await rowLocator.count();
  if (rowCount === 0) {
    return { keywords: [], volumes: [], reason: "no_rows" };
  }

  const keywords = [];
  const volumes = [];

  for (let i = 0; i < rowCount; i += 1) {
    const row = rowLocator.nth(i);
    const cells = await row.locator("td").all();
    if (cells.length < 2) continue;
    const keyword = (await cells[0].innerText()).trim();
    const volText = (await cells[1].innerText()).trim();
    if (!keyword) continue;
    keywords.push(keyword);
    volumes.push(parseVolumeText(volText));
  }

  if (keywords.length === 0) {
    return { keywords: [], volumes: [], reason: "empty_parse" };
  }

  return { keywords, volumes, reason: null };
}

async function fetchKeywordditWithRetries(page, bareName, options) {
  const retries = options.keywordditRetryCount ?? 2;
  let lastReason = "unknown";
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const result = await scrapeOneSubreddit(page, bareName, options);
      if (result.keywords.length > 0) {
        return result;
      }
      lastReason = result.reason || "empty";
    } catch (_error) {
      lastReason = "exception";
    }
    if (attempt < retries) {
      await sleep(800 * attempt);
    }
  }
  return { keywords: [], volumes: [], reason: lastReason };
}

/**
 * For each subreddit (with or without r/), load Keyworddit via Playwright,
 * pick autocomplete, scrape Keyword + Monthly Search Volume.
 * Unsupported / empty / errors → skip and record in failed_subreddits.
 */
async function buildSubredditMapFromKeyworddit(rawLines, options) {
  const keyworddit_rows = [];
  const combined = {};

  const uniqueR = [];
  const seen = new Set();
  for (const line of rawLines || []) {
    const r = normalizeSubreddit(String(line || "").trim());
    if (!r) continue;
    const key = r.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueR.push(r);
  }

  if (uniqueR.length === 0) {
    return {
      subredditMap: {},
      failed_subreddits: [],
      keyworddit_rows
    };
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  try {
    for (let idx = 0; idx < uniqueR.length; idx += 1) {
      const rName = uniqueR[idx];
      const bare = bareSubredditName(rName);
      if (!bare) {
        continue;
      }

      const { keywords, volumes } = await fetchKeywordditWithRetries(page, bare, options);

      if (!keywords.length) {
        continue;
      }

      for (let i = 0; i < keywords.length; i += 1) {
        keyworddit_rows.push({
          subreddit: rName,
          keyword: keywords[i],
          search_volume: volumes[i] != null ? volumes[i] : 0
        });
      }

      combined[rName] = (combined[rName] || []).concat(keywords);

      if (idx < uniqueR.length - 1) {
        const delayMs = randomBetween(
          options.keywordditDelayMsMin ?? 2000,
          options.keywordditDelayMsMax ?? 4500
        );
        await sleep(delayMs);
      }
    }
  } finally {
    await browser.close();
  }

  const subredditMap = sanitizeSubredditMap(combined, options.maxKeywordsPerSubreddit ?? 40);

  const failed = new Set();
  for (const rName of uniqueR) {
    if (!subredditMap[rName]?.length) {
      failed.add(rName);
    }
  }

  return {
    subredditMap,
    failed_subreddits: [...failed],
    keyworddit_rows
  };
}

module.exports = {
  buildSubredditMapFromKeyworddit,
  bareSubredditName,
  KEYWORDDIT_PAGE
};
