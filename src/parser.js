const fs = require("fs/promises");

function normalizeSubreddit(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";
  const withPrefix = cleaned.startsWith("r/") ? cleaned : `r/${cleaned}`;
  return `r/${withPrefix.replace(/^r\//i, "")}`;
}

function dedupeKeywords(keywords, maxCount) {
  const seen = new Set();
  const output = [];

  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(trimmed);
    if (output.length >= maxCount) break;
  }

  return output;
}

function parseInputText(text, maxKeywordsPerSubreddit) {
  const lines = text.split(/\r?\n/);
  const subredditMap = {};
  let currentSubreddit = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Support both "r/name:" and "r/name" as subreddit headers.
    if (line.toLowerCase().startsWith("r/")) {
      const candidate = line.endsWith(":") ? line.slice(0, -1) : line;
      currentSubreddit = normalizeSubreddit(candidate);
      if (!currentSubreddit) continue;
      if (!subredditMap[currentSubreddit]) {
        subredditMap[currentSubreddit] = [];
      }
      continue;
    }

    if (!currentSubreddit) continue;
    // Support both "- keyword" and plain "keyword" lines.
    let keyword = line;
    if (line.startsWith("-")) {
      keyword = line.slice(1).trim();
    }
    if (keyword) {
      subredditMap[currentSubreddit].push(keyword);
    }
  }

  for (const subreddit of Object.keys(subredditMap)) {
    subredditMap[subreddit] = dedupeKeywords(subredditMap[subreddit], maxKeywordsPerSubreddit);
  }

  return sanitizeSubredditMap(subredditMap, maxKeywordsPerSubreddit);
}

function sanitizeSubredditMap(inputMap, maxKeywordsPerSubreddit) {
  const output = {};
  const subredditKeys = Object.keys(inputMap || {});
  for (const rawSubreddit of subredditKeys) {
    const subreddit = normalizeSubreddit(rawSubreddit);
    if (!subreddit) continue;
    const keywords = Array.isArray(inputMap[rawSubreddit]) ? inputMap[rawSubreddit] : [];
    const deduped = dedupeKeywords(keywords, maxKeywordsPerSubreddit);
    if (deduped.length > 0) {
      output[subreddit] = deduped;
    }
  }
  return output;
}

function parseSubredditEntries(entries, maxKeywordsPerSubreddit) {
  const map = {};
  for (const entry of entries || []) {
    const subreddit = normalizeSubreddit(entry?.subreddit || "");
    if (!subreddit) continue;
    const keywords = Array.isArray(entry?.keywords) ? entry.keywords : [];
    if (!map[subreddit]) map[subreddit] = [];
    map[subreddit].push(...keywords);
  }

  return sanitizeSubredditMap(map, maxKeywordsPerSubreddit);
}

async function loadInputFile(inputPath, maxKeywordsPerSubreddit) {
  const text = await fs.readFile(inputPath, "utf8");
  return parseInputText(text, maxKeywordsPerSubreddit);
}

function parseSubredditLines(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    const normalized = normalizeSubreddit(line);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

module.exports = {
  normalizeSubreddit,
  loadInputFile,
  parseInputText,
  parseSubredditEntries,
  parseSubredditLines,
  sanitizeSubredditMap
};
