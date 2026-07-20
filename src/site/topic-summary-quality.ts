export const maximumTopicSummaryLength = 220;

const legacySummaryPatterns = [
  /\bWatch points covering\b/iu,
  /\bacross Dr\. Alex Clarke(?:'s)? videos\b/iu,
  /\bExplore study-guide entries\b/iu,
];

const forbiddenFramingPatterns = [
  /^\s*This topic covers\b/iu,
  /^\s*Learn about\b/iu,
  /^\s*Explore\b/iu,
  /^\s*Content about\b/iu,
  /^\s*Related videos\b/iu,
  /\bstudy-guide entries\b/iu,
  /\bwatch points?\b/iu,
  /\bacross (?:the )?(?:Dr\. Alex Clarke )?(?:archive|site|videos?)\b/iu,
];

export function topicSummaryQualityFindings(summary: string): string[] {
  const normalized = summary.replace(/\s+/gu, " ").trim();
  const findings: string[] = [];
  if (normalized.length === 0) {
    findings.push("summary is empty or pending");
    return findings;
  }
  if (normalized.length > maximumTopicSummaryLength) {
    findings.push(`summary exceeds ${maximumTopicSummaryLength} characters`);
  }
  if (legacySummaryPatterns.some((pattern) => pattern.test(normalized))) {
    findings.push("summary uses a legacy creator-oriented default");
  }
  if (forbiddenFramingPatterns.some((pattern) => pattern.test(normalized))) {
    findings.push("summary uses site-oriented or hollow framing");
  }
  return [...new Set(findings)];
}

export function isTopicSummaryReady(summary: string): boolean {
  return topicSummaryQualityFindings(summary).length === 0;
}

export function isLegacyTopicSummary(summary: string): boolean {
  return legacySummaryPatterns.some((pattern) => pattern.test(summary));
}
