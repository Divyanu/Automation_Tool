const { normalizeSubreddit, sanitizeSubredditMap } = require("./parser");
const { sleep, randomBetween } = require("./utils");

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "but",
  "by",
  "can",
  "do",
  "for",
  "from",
  "get",
  "had",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "like",
  "me",
  "my",
  "not",
  "of",
  "on",
  "or",
  "our",
  "out",
  "so",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "too",
  "up",
  "was",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "you",
  "your"
]);

const REDDIT_BASE_URL = "https://www.reddit.com";
const REDDIT_USER_AGENT =
  process.env.REDDIT_PUBLIC_USER_AGENT || "reddit-ads-intelligence/1.0 (public-json)";

async function redditGetJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": REDDIT_USER_AGENT,
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Reddit request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function ngrams(tokens, minN = 2, maxN = 5) {
  const out = [];
  for (let n = minN; n <= maxN; n += 1) {
    for (let i = 0; i <= tokens.length - n; i += 1) {
      const gram = tokens.slice(i, i + n).join(" ");
      out.push(gram);
    }
  }
  return out;
}

function extractQuestionPhrases(rawText) {
  const text = cleanText(rawText);
  const matches = text.match(/\b(how|why|what|which|when)\b[^?.!]{8,120}[?.!]/gi) || [];
  return matches
    .map((m) =>
      m
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((m) => m.split(" ").length >= 3 && m.split(" ").length <= 12);
}

function extractProblemStatements(rawText) {
  const text = cleanText(rawText).toLowerCase();
  const patterns = [
    /\b(issue|problem|struggle|frustrat\w*|cannot|can't|failed|ruin\w*|broken|help)\b[^.!?]{6,120}/g
  ];
  const out = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    for (const m of matches) {
      const cleaned = m
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned.split(" ").length >= 3 && cleaned.split(" ").length <= 14) {
        out.push(cleaned);
      }
    }
  }
  return out;
}

function rankPhrases(phrases, maxCount) {
  const freq = new Map();
  for (const phrase of phrases) {
    const normalized = cleanText(phrase).toLowerCase();
    if (!normalized) continue;
    const words = normalized.split(" ");
    if (words.length < 2 || words.length > 14) continue;
    if (words.every((w) => STOPWORDS.has(w))) continue;
    freq.set(normalized, (freq.get(normalized) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([keyword, frequency]) => ({ keyword, frequency }));
}

async function fetch_posts(subredditName, options) {
  const bare = normalizeSubreddit(subredditName).replace(/^r\//i, "");
  const topUrl = `${REDDIT_BASE_URL}/r/${bare}/top.json?t=month&limit=${options.redditTopPostsLimit ?? 40}`;
  const hotUrl = `${REDDIT_BASE_URL}/r/${bare}/hot.json?limit=${Math.min(15, options.redditTopPostsLimit ?? 40)}`;

  const [topMonthJson, hotJson] = await Promise.all([
    redditGetJson(topUrl),
    options.redditIncludeHotPosts ? redditGetJson(hotUrl) : Promise.resolve(null)
  ]);

  const topMonth = topMonthJson?.data?.children || [];
  const hot = hotJson?.data?.children || [];
  const seen = new Set();
  const merged = [...topMonth, ...hot];
  const posts = [];
  for (const node of merged) {
    const post = node?.data;
    if (!post || !post.id || seen.has(post.id)) continue;
    seen.add(post.id);
    posts.push({
      post_id: post.id,
      title: cleanText(post.title),
      selftext: cleanText(post.selftext),
      score: Number(post.score || 0),
      permalink: post.permalink || ""
    });
  }
  return posts;
}

async function fetch_comments(postPermalink, options) {
  const normalizedPath = String(postPermalink || "").startsWith("http")
    ? new URL(postPermalink).pathname
    : String(postPermalink || "");
  if (!normalizedPath) return [];
  const commentsUrl = `${REDDIT_BASE_URL}${normalizedPath}.json?limit=${options.redditCommentsPerPostLimit ?? 30}&sort=top`;
  const json = await redditGetJson(commentsUrl);
  const listing = json?.[1]?.data?.children || [];
  const comments = [];
  for (const item of listing) {
    const comment = item?.data;
    if (!comment || !comment.body) continue;
    comments.push({
      body: cleanText(comment.body),
      score: Number(comment.score || 0)
    });
    if (comments.length >= (options.redditCommentsPerPostLimit ?? 30)) break;
  }
  return comments;
}

function filterHighSignalContent(posts, commentsByPost, options) {
  const goodPosts = posts.filter((p) => p.score >= (options.redditPostScoreThreshold ?? 20));
  const goodCommentsByPost = new Map();

  for (const post of goodPosts) {
    const comments = commentsByPost.get(post.post_id) || [];
    const filtered = comments.filter((c) => {
      const body = cleanText(c.body).toLowerCase();
      if (!body || body === "[deleted]" || body === "[removed]") return false;
      if (c.score < (options.redditCommentScoreThreshold ?? 5)) return false;
      if (body.split(" ").length < (options.redditMinCommentWords ?? 5)) return false;
      return true;
    });
    goodCommentsByPost.set(post.post_id, filtered);
  }

  return { goodPosts, goodCommentsByPost };
}

function extract_keywords(posts, commentsByPost, options) {
  const allText = [];
  const phrasePool = [];

  for (const post of posts) {
    const base = `${post.title} ${post.selftext}`.trim();
    if (base) {
      allText.push(base);
      phrasePool.push(...ngrams(tokenize(base), 2, 5));
      phrasePool.push(...extractQuestionPhrases(base));
      phrasePool.push(...extractProblemStatements(base));
    }

    const comments = commentsByPost.get(post.post_id) || [];
    for (const comment of comments) {
      if (!comment.body) continue;
      allText.push(comment.body);
      phrasePool.push(...ngrams(tokenize(comment.body), 2, 5));
      phrasePool.push(...extractQuestionPhrases(comment.body));
      phrasePool.push(...extractProblemStatements(comment.body));
    }
  }

  return rankPhrases(phrasePool, options.redditMaxPhrasesPerSubreddit ?? 40);
}

function merge_keywords(keywordditRows, scrapedBySubreddit, maxKeywordsPerSubreddit = 40) {
  const grouped = new Map();

  for (const row of keywordditRows || []) {
    const subreddit = normalizeSubreddit(row.subreddit || "");
    if (!subreddit) continue;
    if (!grouped.has(subreddit)) grouped.set(subreddit, new Map());
    const byKeyword = grouped.get(subreddit);
    const key = cleanText(row.keyword).toLowerCase();
    if (!key) continue;
    if (!byKeyword.has(key)) {
      byKeyword.set(key, {
        keyword: key,
        source: "keyworddit",
        frequency: null
      });
    }
  }

  for (const [subredditRaw, rows] of Object.entries(scrapedBySubreddit || {})) {
    const subreddit = normalizeSubreddit(subredditRaw);
    if (!subreddit) continue;
    if (!grouped.has(subreddit)) grouped.set(subreddit, new Map());
    const byKeyword = grouped.get(subreddit);
    for (const row of rows || []) {
      const key = cleanText(row.keyword).toLowerCase();
      if (!key) continue;
      const existing = byKeyword.get(key);
      if (!existing) {
        byKeyword.set(key, {
          keyword: key,
          source: "scraped",
          frequency: Number(row.frequency || 0)
        });
      } else {
        const mergedSource =
          existing.source === "keyworddit" ? "keyworddit+scraped" : existing.source;
        byKeyword.set(key, {
          keyword: key,
          source: mergedSource,
          frequency: Number(row.frequency || existing.frequency || 0) || null
        });
      }
    }
  }

  const mergedInventory = [];
  const subredditMapRaw = {};
  for (const [subreddit, byKeyword] of grouped.entries()) {
    const list = [...byKeyword.values()]
      .sort((a, b) => (b.frequency || 0) - (a.frequency || 0))
      .slice(0, maxKeywordsPerSubreddit);
    mergedInventory.push({
      subreddit,
      keywords: list
    });
    subredditMapRaw[subreddit] = list.map((x) => x.keyword);
  }

  return {
    mergedInventory,
    subredditMap: sanitizeSubredditMap(subredditMapRaw, maxKeywordsPerSubreddit)
  };
}

async function buildScrapedKeywordsForSubreddits(subreddits, options) {
  const failed = [];
  const errors = [];
  const data = {};

  for (const rawName of subreddits || []) {
    const subreddit = normalizeSubreddit(rawName);
    if (!subreddit) continue;
    try {
      const posts = await fetch_posts(subreddit, options);
      const commentsByPost = new Map();
      for (const post of posts) {
        const comments = await fetch_comments(post.permalink, options);
        commentsByPost.set(post.post_id, comments);
      }
      const { goodPosts, goodCommentsByPost } = filterHighSignalContent(
        posts,
        commentsByPost,
        options
      );
      const keywords = extract_keywords(goodPosts, goodCommentsByPost, options);
      if (!keywords.length) {
        failed.push(subreddit);
      } else {
        data[subreddit] = keywords;
      }
    } catch (err) {
      failed.push(subreddit);
      errors.push(`${subreddit}: ${err.message}`);
    }

    await sleep(randomBetween(options.redditDelayMsMin ?? 400, options.redditDelayMsMax ?? 1200));
  }

  return {
    enabled: true,
    data,
    failed,
    errors
  };
}

module.exports = {
  fetch_posts,
  fetch_comments,
  extract_keywords,
  merge_keywords,
  buildScrapedKeywordsForSubreddits
};
