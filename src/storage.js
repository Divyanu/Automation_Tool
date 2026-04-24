const fs = require("fs/promises");
const path = require("path");

async function ensureOutputDir(outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
}

function toCsv(rows) {
  const header =
    "subreddit,keyword,posts_per_day,comments_per_day,comments_per_post,keyword_score";
  const data = rows.map((row) => {
    const safeKeyword = String(row.keyword).replaceAll('"', '""');
    return [
      row.subreddit,
      `"${safeKeyword}"`,
      row.posts_per_day,
      row.comments_per_day,
      row.comments_per_post,
      row.keyword_score
    ].join(",");
  });
  return [header, ...data].join("\n");
}

async function saveJson(jsonPath, payload) {
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function saveCsv(csvPath, rows) {
  const csv = toCsv(rows);
  await fs.writeFile(csvPath, `${csv}\n`, "utf8");
}

module.exports = {
  ensureOutputDir,
  saveJson,
  saveCsv
};
