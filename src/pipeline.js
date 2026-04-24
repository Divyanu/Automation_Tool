const config = require("./config");
const { scrapePemavor, SELECTOR_HINTS } = require("./scraper");
const {
  addKeywordScores,
  filterLowEngagement,
  rankSubreddits,
  rankKeywords
} = require("./scoring");
const { ensureOutputDir, saveJson, saveCsv } = require("./storage");
const {
  generatePatterns,
  generateAdAngles,
  generateHiddenOpportunities
} = require("./insights");

async function runPipeline(subredditMap, meta = {}) {
  if (!subredditMap || Object.keys(subredditMap).length === 0) {
    throw new Error("No valid subreddit/keyword input found.");
  }

  const failedSubreddits = Array.isArray(meta.failed_subreddits) ? meta.failed_subreddits : [];
  const keywordditRows = Array.isArray(meta.keyworddit_rows) ? meta.keyworddit_rows : [];

  const rawRows = await scrapePemavor(subredditMap, config);
  const scoredRows = addKeywordScores(rawRows);
  const filteredRows = filterLowEngagement(scoredRows, config.minEngagementThreshold);

  const topSubreddits = rankSubreddits(filteredRows).slice(0, 5);
  const topKeywords = rankKeywords(filteredRows).slice(0, 30);
  const patterns = generatePatterns(topKeywords);
  const adAngles = generateAdAngles();
  const hiddenOpportunities = generateHiddenOpportunities(filteredRows);

  await ensureOutputDir(config.outputDir);
  const payload = {
    generated_at: new Date().toISOString(),
    selectors_note:
      "Selector fallbacks are in src/scraper.js (SELECTOR_HINTS). If Pemavor UI changes, adjust these selectors.",
    top_subreddits: topSubreddits,
    top_keywords: topKeywords,
    all_rows: filteredRows,
    failed_subreddits: failedSubreddits,
    keyworddit_rows: keywordditRows,
    insights: {
      patterns,
      ad_angles: adAngles,
      hidden_opportunities: hiddenOpportunities
    }
  };
  await saveJson(config.outputJsonPath, payload);
  await saveCsv(config.outputCsvPath, filteredRows);

  return {
    topSubreddits,
    topKeywords,
    patterns,
    adAngles,
    hiddenOpportunities,
    failedSubreddits,
    keywordditRows,
    outputJsonPath: config.outputJsonPath,
    outputCsvPath: config.outputCsvPath,
    selectors: SELECTOR_HINTS
  };
}

module.exports = {
  runPipeline
};
