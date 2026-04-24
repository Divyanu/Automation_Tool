const fs = require("fs/promises");
const path = require("path");
const http = require("http");
const config = require("./config");
const { parseSubredditEntries, parseSubredditLines } = require("./parser");
const { runPipeline } = require("./pipeline");
const { buildSubredditMapFromKeyworddit } = require("./keyworddit");
const { buildScrapedKeywordsForSubreddits, merge_keywords } = require("./reddit-live");

const HOST = "127.0.0.1";
const BASE_PORT = Number.parseInt(process.env.PORT || "8787", 10);
const PORT_RANGE = 30;
let listenPort = BASE_PORT;
const PUBLIC_DIR = path.resolve(process.cwd(), "public");

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function serveFile(res, filePath, contentType) {
  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch (_error) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function serveDownload(res, filePath, downloadName, contentType) {
  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${downloadName}"`
    });
    res.end(content);
  } catch (_error) {
    sendJson(res, 404, { error: "File not found. Run analysis first." });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      await serveFile(res, path.join(PUBLIC_DIR, "index.html"), "text/html; charset=utf-8");
      return;
    }

    if (req.method === "GET" && req.url === "/app.js") {
      await serveFile(
        res,
        path.join(PUBLIC_DIR, "app.js"),
        "application/javascript; charset=utf-8"
      );
      return;
    }

    if (req.method === "GET" && req.url === "/styles.css") {
      await serveFile(res, path.join(PUBLIC_DIR, "styles.css"), "text/css; charset=utf-8");
      return;
    }

    if (req.method === "POST" && req.url === "/api/run") {
      const body = await readJsonBody(req);
      const mode = String(body.mode || "manual").toLowerCase();

      if (mode === "keyworddit") {
        const fromText = parseSubredditLines(body.subredditsText || "");
        const fromArray = Array.isArray(body.subreddits)
          ? body.subreddits.map((s) => String(s || "").trim()).filter(Boolean)
          : [];
        const lines = fromText.length ? fromText : fromArray;

        const { subredditMap, failed_subreddits, keyworddit_rows } = await buildSubredditMapFromKeyworddit(
          lines,
          config
        );

        // Run Reddit live extraction only for subreddits that Keyworddit failed to populate.
        const redditLiveTargets = failed_subreddits || [];
        const redditLive = await buildScrapedKeywordsForSubreddits(redditLiveTargets, config);
        const { mergedInventory, subredditMap: mergedSubredditMap } = merge_keywords(
          keyworddit_rows,
          redditLive.data,
          config.maxKeywordsPerSubreddit
        );

        const allFailed = [...new Set([...(failed_subreddits || []), ...(redditLive.failed || [])])];

        if (!mergedSubredditMap || Object.keys(mergedSubredditMap).length === 0) {
          sendJson(res, 400, {
            error:
              "No usable keywords from Keyworddit or Reddit live extraction. Check subreddit spelling, size, or Reddit API credentials.",
            failedSubreddits: allFailed,
            redditLiveErrors: redditLive.errors || []
          });
          return;
        }

        const result = await runPipeline(mergedSubredditMap, {
          failed_subreddits: allFailed,
          keyworddit_rows,
          merged_keyword_inventory: mergedInventory,
          reddit_live_errors: redditLive.errors || []
        });
        sendJson(res, 200, result);
        return;
      }

      const entries = Array.isArray(body.entries) ? body.entries : [];
      const subredditMap = parseSubredditEntries(entries, config.maxKeywordsPerSubreddit);
      const result = await runPipeline(subredditMap);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && req.url === "/download/json") {
      await serveDownload(
        res,
        config.outputJsonPath,
        "results.json",
        "application/json; charset=utf-8"
      );
      return;
    }

    if (req.method === "GET" && req.url === "/download/csv") {
      await serveDownload(res, config.outputCsvPath, "results.csv", "text/csv; charset=utf-8");
      return;
    }

    sendJson(res, 404, { error: "Route not found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal server error" });
  }
});

function onListening() {
  console.log(`UI running at http://${HOST}:${listenPort}`);
}

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    if (listenPort >= BASE_PORT + PORT_RANGE - 1) {
      console.error(
        `No free port between ${BASE_PORT} and ${BASE_PORT + PORT_RANGE - 1}. Stop the other process or set PORT, e.g. PORT=9000 npm run ui`
      );
      process.exit(1);
    }
    console.warn(`Port ${listenPort} in use, trying ${listenPort + 1}…`);
    listenPort += 1;
    server.listen(listenPort, HOST, onListening);
    return;
  }
  console.error(err);
  process.exit(1);
});

server.listen(listenPort, HOST, onListening);
