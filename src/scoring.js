function calculateKeywordScore(row) {
  return (
    row.posts_per_day * 0.4 +
    row.comments_per_day * 0.4 +
    row.comments_per_post * 0.2
  );
}

function addKeywordScores(rows) {
  return rows.map((row) => ({
    ...row,
    keyword_score: calculateKeywordScore(row)
  }));
}

function filterLowEngagement(rows, minThreshold) {
  return rows.filter((row) => {
    const engagement = row.posts_per_day + row.comments_per_day + row.comments_per_post;
    return engagement >= minThreshold;
  });
}

function rankSubreddits(scoredRows) {
  const groups = new Map();

  for (const row of scoredRows) {
    if (!groups.has(row.subreddit)) groups.set(row.subreddit, []);
    groups.get(row.subreddit).push(row.keyword_score);
  }

  const ranked = [];
  for (const [subreddit, scores] of groups.entries()) {
    const topFive = [...scores].sort((a, b) => b - a).slice(0, 5);
    const subredditScore =
      topFive.length > 0
        ? topFive.reduce((sum, value) => sum + value, 0) / topFive.length
        : 0;
    ranked.push({ subreddit, score: subredditScore });
  }

  return ranked.sort((a, b) => b.score - a.score);
}

function rankKeywords(scoredRows) {
  const sorted = [...scoredRows].sort((a, b) => b.keyword_score - a.keyword_score);
  const seen = new Set();
  const deduped = [];
  for (const row of sorted) {
    const key = row.keyword.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

module.exports = {
  addKeywordScores,
  filterLowEngagement,
  rankSubreddits,
  rankKeywords
};
