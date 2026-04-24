const { chromium } = require("playwright");
const { chunkArray, parseNumber, randomBetween, sleep } = require("./utils");

const SELECTOR_HINTS = {
  subredditInput:
    'input[placeholder*="subreddit" i], input[name*="subreddit" i], input[id*="subreddit" i]',
  keywordsInput:
    'input[placeholder*="keyword" i], textarea[placeholder*="keyword" i], input[name*="keyword" i], textarea[name*="keyword" i]',
  addKeywordButton: 'button:has-text("Add"), button:has-text("add")',
  searchButton:
    'button:has-text("Analyze Trends"), button:has-text("Analyze"), button:has-text("Search"), button:has-text("search"), input[type="submit"], button[type="submit"]',
  resultTable: "table"
};

async function findFirstVisible(page, selectorList) {
  const selectors = selectorList.split(",").map((s) => s.trim());
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      try {
        await locator.waitFor({ state: "visible", timeout: 3000 });
        return locator;
      } catch (_error) {
        // Keep trying fallback selectors.
      }
    }
  }
  return null;
}

async function scrapeRowsFromTable(page, subreddit) {
  const table = page.locator(SELECTOR_HINTS.resultTable).first();
  await table.waitFor({ state: "visible", timeout: 20000 });

  const rows = await table.locator("tbody tr").all();
  if (!rows.length) return [];

  const data = [];
  for (const row of rows) {
    const cells = await row.locator("td").allTextContents();
    if (cells.length < 4) continue;
    const keyword = (cells[0] || "").trim();
    if (!keyword) continue;
    data.push({
      subreddit,
      keyword,
      posts_per_day: parseNumber(cells[1]),
      comments_per_day: parseNumber(cells[2]),
      comments_per_post: parseNumber(cells[3])
    });
  }

  return data;
}

async function runChunkSearch(page, subreddit, keywordChunk) {
  await page.goto("https://reddit-trends.pemavor.com/", {
    waitUntil: "domcontentloaded",
    timeout: 45000
  });

  const keywordsInput = await findFirstVisible(page, SELECTOR_HINTS.keywordsInput);
  const addKeywordButton = await findFirstVisible(page, SELECTOR_HINTS.addKeywordButton);
  const searchButton = await findFirstVisible(page, SELECTOR_HINTS.searchButton);

  if (!keywordsInput || !searchButton) {
    throw new Error(
      "Could not resolve one or more required selectors. Update SELECTOR_HINTS in src/scraper.js."
    );
  }

  for (const keyword of keywordChunk) {
    await keywordsInput.click({ timeout: 5000 });
    await keywordsInput.fill(keyword);
    if (addKeywordButton) {
      await addKeywordButton.click();
      await page.waitForTimeout(200);
    }
  }

  const trendsResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("reddit_trends") && response.status() === 200,
    { timeout: 30000 }
  );

  await searchButton.click();

  const trendsResponse = await trendsResponsePromise;
  const json = await trendsResponse.json();
  if (!Array.isArray(json)) return [];

  return json
    .map((item) => {
      const posts = parseNumber(item.posts_per_day);
      const comments = parseNumber(item.comments_per_day);
      const commentsPerPost =
        parseNumber(item.comments_per_post) ||
        parseNumber(item.engagement_score) ||
        (parseNumber(item.total_posts) > 0
          ? parseNumber(item.total_comments) / parseNumber(item.total_posts)
          : 0);
      return {
        // Preserve source subreddit context from our own pipeline.
        // Pemavor may return broad/global labels like r/all in keyword-only mode.
        subreddit,
        keyword: String(item.keyword || "").trim(),
        posts_per_day: posts,
        comments_per_day: comments,
        comments_per_post: commentsPerPost
      };
    })
    .filter((row) => row.keyword);
}

async function scrapeWithRetries(page, subreddit, keywordChunk, retryCount) {
  let lastError = null;
  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    try {
      return await runChunkSearch(page, subreddit, keywordChunk);
    } catch (error) {
      lastError = error;
      if (attempt < retryCount) {
        await sleep(1000 * attempt);
      }
    }
  }
  throw new Error(
    `Failed for ${subreddit} keywords [${keywordChunk.join(", ")}] after ${retryCount} attempts: ${lastError?.message}`
  );
}

function dedupeRows(rows) {
  const bestByKey = new Map();
  for (const row of rows) {
    const key = `${row.subreddit.toLowerCase()}::${row.keyword.toLowerCase()}`;
    const engagement = row.posts_per_day + row.comments_per_day + row.comments_per_post;
    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, row);
      continue;
    }
    const existingEngagement =
      existing.posts_per_day + existing.comments_per_day + existing.comments_per_post;
    if (engagement > existingEngagement) {
      bestByKey.set(key, row);
    }
  }
  return Array.from(bestByKey.values());
}

async function scrapePemavor(subredditMap, options) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const allRows = [];
  try {
    for (const [subreddit, keywords] of Object.entries(subredditMap)) {
      const chunks = chunkArray(keywords, options.chunkSize);
      for (const chunk of chunks) {
        const rows = await scrapeWithRetries(page, subreddit, chunk, options.retryCount);
        allRows.push(...rows);

        const delayMs = randomBetween(options.delayMsMin, options.delayMsMax);
        await sleep(delayMs);
      }
    }
  } finally {
    await browser.close();
  }

  return dedupeRows(allRows);
}

module.exports = {
  scrapePemavor,
  SELECTOR_HINTS
};
