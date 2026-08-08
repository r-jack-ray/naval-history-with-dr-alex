import type { TopicNormalizationReviewFinding, } from "../site/topic-normalization-audit.js";

export const topicNormalizationReviewReportHeaderKeys = [
  "finding_type",
  "topic_slug",
  "related_topic_slug",
  "rule_id",
  "candidate_replacement",
  "collision_value",
  "source_count",
  "sources",
  "details",
  "recommended_action",
] as const;

export const topicNormalizationReviewReportHeaders =
    topicNormalizationReviewReportHeaderKeys.map((header) => header.replaceAll("_", " "));

type HeaderKey = typeof topicNormalizationReviewReportHeaderKeys[number];
type ReportValue = string | number;

export type TopicNormalizationReviewReportRow = Record<HeaderKey, ReportValue>;

export interface TopicNormalizationReviewReport {
  rows: TopicNormalizationReviewReportRow[];
  tsv: string;
  stats: {
    findingCount: number;
    ruleFindingCount: number;
    collisionFindingCount: number;
    topicCount: number;
  };
}

export function renderTopicNormalizationReviewReport(
    findings: readonly TopicNormalizationReviewFinding[],
): TopicNormalizationReviewReport {
  const rows = findings.map(reviewFindingRow);
  const matrix: ReportValue[][] = [
    topicNormalizationReviewReportHeaders,
    ...rows.map((row) => topicNormalizationReviewReportHeaderKeys.map((header) => row[header])),
  ];
  const topicSlugs = new Set(rows.flatMap((row) => (
      [String(row.topic_slug), String(row.related_topic_slug)].filter(Boolean)
  )));

  return {
    rows,
    tsv: `${matrix.map((row) => row.map(tsvValue).join("\t")).join("\n")}\n`,
    stats: {
      findingCount: rows.length,
      ruleFindingCount: findings.filter((finding) => finding.kind === "rule").length,
      collisionFindingCount: findings.filter((finding) => finding.kind === "collision").length,
      topicCount: topicSlugs.size,
    },
  };
}

function reviewFindingRow(
    finding: TopicNormalizationReviewFinding,
): TopicNormalizationReviewReportRow {
  if (finding.kind === "rule") {
    const candidateReplacement = finding.replacement === finding.slug
        ? ""
        : finding.replacement;
    const title = finding.canonicalTitle.length > 0
        ? ` Candidate title: ${finding.canonicalTitle}.`
        : "";
    return {
      finding_type: "review rule",
      topic_slug: finding.slug,
      related_topic_slug: "",
      rule_id: finding.ruleId,
      candidate_replacement: candidateReplacement,
      collision_value: "",
      source_count: finding.sources.length,
      sources: finding.sources.join(" | "),
      details: `${finding.notes}${title}`,
      recommended_action: finding.action,
    };
  }

  const [left, right] = finding.owners;
  const sources = [
    ...left.sources.map((source) => `${left.slug}: ${source}`),
    ...right.sources.map((source) => `${right.slug}: ${source}`),
  ];
  return {
    finding_type: "title or alias collision",
    topic_slug: left.slug,
    related_topic_slug: right.slug,
    rule_id: "",
    candidate_replacement: "",
    collision_value: `${finding.collisionKey}: ${left.slug}=${left.values.join(" | ")}; `
        + `${right.slug}=${right.values.join(" | ")}`,
    source_count: sources.length,
    sources: sources.join(" | "),
    details: `Distinct topic records expose the same normalized title or alias ${JSON.stringify(finding.collisionKey)}.`,
    recommended_action: finding.action,
  };
}

function tsvValue(value: ReportValue): string {
  return String(value).replace(/[\t\r\n]+/gu, " ").trim();
}
