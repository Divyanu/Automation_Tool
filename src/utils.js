function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  if (value == null) return 0;
  const cleaned = String(value).replace(/,/g, "").trim();
  const numeric = Number.parseFloat(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
}

module.exports = {
  sleep,
  randomBetween,
  chunkArray,
  parseNumber
};
