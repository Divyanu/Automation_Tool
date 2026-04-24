function generatePatterns(topKeywords) {
  const patterns = [
    "Keywords with higher comments/post usually indicate stronger buying discussion depth.",
    "Subreddits with multiple high-scoring long-tail keywords consistently outperform broad terms.",
    "Comparison-driven keywords often rank high due to multi-reply evaluation threads.",
    "Niche pain-point terms can beat generic commercial terms on engagement quality.",
    "Clusters of related feature terms suggest clear audience intent segments."
  ];
  if (topKeywords.length < 10) {
    patterns[4] =
      "Limited keyword volume detected; gather more keyword variants per subreddit for clearer intent segmentation.";
  }
  return patterns;
}

function generateAdAngles() {
  return [
    "Run comparison creatives that position your offer against common alternatives.",
    "Lead with pain-point hooks, then follow with clear proof and outcomes.",
    "Use feature-specific headlines mapped to high-scoring keyword clusters.",
    "Deploy review-style ad copy with social proof for discussion-heavy segments.",
    "Sequence retargeting from research keywords to purchase-focused offers."
  ];
}

function generateHiddenOpportunities(rows) {
  const opportunities = [];
  const sorted = [...rows].sort((a, b) => b.keyword_score - a.keyword_score);
  for (const row of sorted) {
    const isLowerVolume = row.posts_per_day < 5;
    const isHighDepth = row.comments_per_post > 4;
    if (isLowerVolume && isHighDepth) {
      opportunities.push(
        `${row.keyword} in ${row.subreddit}: lower posting volume but high discussion depth.`
      );
    }
    if (opportunities.length === 3) break;
  }
  while (opportunities.length < 3) {
    opportunities.push("No additional low-competition/high-engagement pockets in current dataset.");
  }
  return opportunities;
}

module.exports = {
  generatePatterns,
  generateAdAngles,
  generateHiddenOpportunities
};
