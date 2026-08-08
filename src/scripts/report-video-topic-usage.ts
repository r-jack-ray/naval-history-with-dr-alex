import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { renderTopicNormalizationReviewReport } from "../content/topic-normalization-review-report.js";
import type { VideoTopicUsageReport } from "../content/video-topic-usage-report.js";
import type { TopicNormalizationAuditResult } from "../site/topic-normalization-audit.js";

export interface VideoTopicUsageCliOptions {
  segmentsInput: string;
  normalizationPatterns: string;
  output: string;
  reviewOutput: string;
  quiet: boolean;
}

export async function writeVideoTopicUsageReports(
    options: VideoTopicUsageCliOptions,
    report: VideoTopicUsageReport,
    normalizationAudit: TopicNormalizationAuditResult,
    extraSummaryFields: readonly string[] = [],
): Promise<void> {
  const reviewReport = renderTopicNormalizationReviewReport(normalizationAudit.reviewFindings);
  await Promise.all([
    mkdir(dirname(options.output), {recursive: true}),
    mkdir(dirname(options.reviewOutput), {recursive: true}),
  ]);
  await Promise.all([
    writeFile(options.output, report.tsv, "utf8"),
    writeFile(options.reviewOutput, reviewReport.tsv, "utf8"),
  ]);
  if (!options.quiet) {
    console.log([
      "Video topic usage report:",
      `topics=${report.stats.reportTopicCount}`,
      `videos=${report.stats.videoCount}`,
      `used=${report.stats.usedTopicCount}`,
      `unused=${report.stats.unusedTopicCount}`,
      `unregistered=${report.stats.unregisteredUsedTopicCount}`,
      `duplicate_review=${report.stats.potentialDuplicateReviewCount}`,
      `normalization_blockers=${normalizationAudit.blockers.length}`,
      `normalization_reviews=${reviewReport.stats.findingCount}`,
      ...extraSummaryFields,
      `output=${options.output}`,
      `review_output=${options.reviewOutput}`,
    ].join(" "));
  }
}

export function parseVideoTopicUsageArgs(args: string[]): VideoTopicUsageCliOptions {
  const options: VideoTopicUsageCliOptions = {
    segmentsInput: "src/derived/video-segments",
    normalizationPatterns: "src/derived/topic-normalization-patterns.tsv",
    output: "reports/video-topic-usage.tsv",
    reviewOutput: "reports/topic-normalization-review.tsv",
    quiet: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
    case "--segments-input":
      options.segmentsInput = readVideoTopicUsageArgValue(args, ++index, arg);
      break;
    case "--normalization-patterns":
      options.normalizationPatterns = readVideoTopicUsageArgValue(args, ++index, arg);
      break;
    case "--output":
      options.output = readVideoTopicUsageArgValue(args, ++index, arg);
      break;
    case "--review-output":
      options.reviewOutput = readVideoTopicUsageArgValue(args, ++index, arg);
      break;
    case "--quiet":
      options.quiet = true;
      break;
    case "--help":
    case "-h":
      printVideoTopicUsageHelp();
      process.exit(0);
    default:
      throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }
  return options;
}

export function readVideoTopicUsageArgValue(
    args: string[],
    index: number,
    name: string,
): string {
  const value = args[index];
  if (!value) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

export function printVideoTopicUsageHelp(): void {
  console.log(`Usage: npm run report:video-topic-usage -- [options]

Generates the topic-usage TSV plus an exact normalization-review TSV for taxonomy curation.

Options:
  --segments-input <path>          Curated shard directory. Defaults to src/derived/video-segments.
  --normalization-patterns <path>  Topic normalization TSV. Defaults to src/derived/topic-normalization-patterns.tsv.
  --output <path>                  TSV output. Defaults to reports/video-topic-usage.tsv.
  --review-output <path>           Actionable exact-review TSV. Defaults to reports/topic-normalization-review.tsv.
  --quiet                          Suppress the one-line summary; run time is still printed.
  --help                           Show this help.
`);
}
