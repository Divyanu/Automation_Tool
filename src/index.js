const config = require("./config");
const { loadInputFile } = require("./parser");
const { runPipeline } = require("./pipeline");
const { printTopSubreddits, printTopKeywords, printInsights } = require("./report");

async function run() {
  console.log("Reddit Ads Intelligence Tool");
  console.log("----------------------------");
  console.log(`Input file: ${config.inputPath}`);

  const subredditMap = await loadInputFile(
    config.inputPath,
    config.maxKeywordsPerSubreddit
  );

  const result = await runPipeline(subredditMap);

  printTopSubreddits(result.topSubreddits);
  printTopKeywords(result.topKeywords);
  printInsights(result.patterns, result.adAngles, result.hiddenOpportunities);

  console.log("\nSaved files:");
  console.log(`- ${result.outputJsonPath}`);
  console.log(`- ${result.outputCsvPath}`);
  console.log("\nSelector fallback hints currently used:");
  console.log(result.selectors);
}

run().catch((error) => {
  console.error("\nRun failed:");
  console.error(error.message);
  process.exit(1);
});
