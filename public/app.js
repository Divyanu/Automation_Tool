const subredditList = document.getElementById("subreddit-list");
const addSubredditBtn = document.getElementById("add-subreddit");
const runBtn = document.getElementById("run-btn");
const runManualBtn = document.getElementById("run-manual-btn");
const statusEl = document.getElementById("status");
const manualStatusEl = document.getElementById("manual-status");
const modeRadios = document.querySelectorAll('input[name="input-mode"]');
const keywordditPanel = document.getElementById("keyworddit-panel");
const manualPanel = document.getElementById("manual-panel");
const subredditLinesEl = document.getElementById("subreddit-lines");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getMode() {
  const selected = document.querySelector('input[name="input-mode"]:checked');
  return selected ? selected.value : "keyworddit";
}

function syncPanels() {
  const mode = getMode();
  if (mode === "manual") {
    keywordditPanel.classList.add("hidden");
    manualPanel.classList.remove("hidden");
  } else {
    keywordditPanel.classList.remove("hidden");
    manualPanel.classList.add("hidden");
  }
}

modeRadios.forEach((radio) => {
  radio.addEventListener("change", syncPanels);
});

function createSubredditCard(subreddit = "", keywords = []) {
  const wrapper = document.createElement("div");
  wrapper.className = "subreddit-card";
  const subEsc = escapeHtml(subreddit);
  const kwEsc = escapeHtml(keywords.join("\n"));
  wrapper.innerHTML = `
    <div class="row between">
      <strong>Subreddit block</strong>
      <button type="button" class="danger remove-btn">Remove</button>
    </div>
    <label>Subreddit</label>
    <input class="subreddit-input" placeholder="r/your-subreddit" value="${subEsc}" />
    <label>Keywords (one per line)</label>
    <textarea class="keywords-input" placeholder="keyword one&#10;keyword two">${kwEsc}</textarea>
  `;
  wrapper.querySelector(".remove-btn").addEventListener("click", () => wrapper.remove());
  return wrapper;
}

function collectEntries() {
  const cards = Array.from(subredditList.querySelectorAll(".subreddit-card"));
  return cards.map((card) => {
    const subreddit = card.querySelector(".subreddit-input").value.trim();
    const keywords = card
      .querySelector(".keywords-input")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return { subreddit, keywords };
  });
}

function renderTable(containerId, headers, rows) {
  const container = document.getElementById(containerId);
  if (!rows.length) {
    container.innerHTML = "<p class=\"muted\">No rows for this run.</p>";
    return;
  }
  const thead = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  const tbody = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join("")}</tr>`)
    .join("");
  container.innerHTML = `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function renderSkipped(list) {
  const el = document.getElementById("skipped-subreddits");
  if (!list || !list.length) {
    el.innerHTML = "<p class=\"muted\">None — every subreddit returned Keyworddit data (or manual mode).</p>";
    return;
  }
  el.innerHTML = `<ul class="skip-list">${list.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;
}

function renderOutputFiles(result) {
  const files = document.getElementById("output-files");
  files.innerHTML = `
    <p><strong>JSON:</strong> ${escapeHtml(result.outputJsonPath)}</p>
    <p><strong>CSV:</strong> ${escapeHtml(result.outputCsvPath)}</p>
    <div class="row">
      <a class="download-link" href="/download/json">Download JSON</a>
      <a class="download-link" href="/download/csv">Download CSV</a>
    </div>
  `;
}

function renderResults(data) {
  renderTable(
    "top-subreddits",
    ["Subreddit", "Score"],
    (data.topSubreddits || []).map((x) => [x.subreddit, Number(x.score).toFixed(2)])
  );
  renderTable(
    "top-keywords",
    ["Keyword", "Subreddit", "Score"],
    (data.topKeywords || []).map((x) => [
      x.keyword,
      x.subreddit,
      Number(x.keyword_score).toFixed(2)
    ])
  );
  renderSkipped(data.failedSubreddits || []);
  renderOutputFiles(data);
}

async function postRun(body, statusElement, buttonEl) {
  statusElement.textContent = "Running… this may take several minutes.";
  buttonEl.disabled = true;
  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) {
      renderSkipped(data.failedSubreddits || []);
      throw new Error(data.error || "Run failed");
    }
    renderResults(data);
    statusElement.textContent = "Completed successfully.";
  } catch (error) {
    statusElement.textContent = `Error: ${error.message}`;
  } finally {
    buttonEl.disabled = false;
  }
}

addSubredditBtn.addEventListener("click", () => {
  subredditList.appendChild(createSubredditCard());
});

runBtn.addEventListener("click", async () => {
  await postRun(
    {
      mode: "keyworddit",
      subredditsText: subredditLinesEl.value
    },
    statusEl,
    runBtn
  );
});

runManualBtn.addEventListener("click", async () => {
  const entries = collectEntries().filter((e) => e.subreddit && e.keywords.length);
  if (!entries.length) {
    manualStatusEl.textContent = "Error: add at least one subreddit with keywords.";
    return;
  }
  await postRun({ mode: "manual", entries }, manualStatusEl, runManualBtn);
});

subredditList.appendChild(createSubredditCard());
syncPanels();
