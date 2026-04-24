const path = require("path");

module.exports = {
  inputPath: path.resolve(process.cwd(), "input.txt"),
  outputDir: path.resolve(process.cwd(), "output"),
  outputJsonPath: path.resolve(process.cwd(), "output", "results.json"),
  outputCsvPath: path.resolve(process.cwd(), "output", "results.csv"),
  maxKeywordsPerSubreddit: 40,
  chunkSize: 5,
  retryCount: 3,
  delayMsMin: 3000,
  delayMsMax: 5000,
  minEngagementThreshold: 0.1,
  keywordditDelayMsMin: 2000,
  keywordditDelayMsMax: 4500,
  keywordditSuggestTimeoutMs: 15000,
  keywordditResultsTimeoutMs: 60000,
  keywordditRetryCount: 2,
  keywordditKeyDelayMs: 100,
  redditTopPostsLimit: 40,
  redditCommentsPerPostLimit: 30,
  redditPostScoreThreshold: 20,
  redditCommentScoreThreshold: 5,
  redditMinCommentWords: 5,
  redditDelayMsMin: 400,
  redditDelayMsMax: 1200,
  redditMaxPhrasesPerSubreddit: 40,
  redditIncludeHotPosts: true
};
