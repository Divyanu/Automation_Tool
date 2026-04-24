function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function printTable(headers, rows) {
  const widths = headers.map((h) => h.length);
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index], String(cell).length);
    });
  }

  const headerLine = headers.map((h, i) => h.padEnd(widths[i], " ")).join(" | ");
  const separator = widths.map((w) => "-".repeat(w)).join("-+-");

  console.log(headerLine);
  console.log(separator);
  for (const row of rows) {
    console.log(row.map((cell, i) => String(cell).padEnd(widths[i], " ")).join(" | "));
  }
}

function printTopSubreddits(topSubreddits) {
  console.log("\n1) TOP SUBREDDITS TABLE");
  const rows = topSubreddits.map((item) => [item.subreddit, formatNumber(item.score)]);
  printTable(["subreddit", "score"], rows);
}

function printTopKeywords(topKeywords) {
  console.log("\n2) TOP KEYWORDS TABLE");
  const rows = topKeywords.map((item) => [
    item.keyword,
    item.subreddit,
    formatNumber(item.keyword_score)
  ]);
  printTable(["keyword", "subreddit", "score"], rows);
}

function printInsights(patterns, adAngles, hiddenOpportunities) {
  console.log("\n3) INSIGHTS");
  console.log("\n5 high-performing patterns:");
  patterns.forEach((item) => console.log(`- ${item}`));

  console.log("\n5 ad angles:");
  adAngles.forEach((item) => console.log(`- ${item}`));

  console.log("\n3 hidden opportunities:");
  hiddenOpportunities.forEach((item) => console.log(`- ${item}`));
}

module.exports = {
  printTopSubreddits,
  printTopKeywords,
  printInsights
};
