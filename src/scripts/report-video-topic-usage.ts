#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { renderTopicNormalizationReviewReport } from "../content/topic-normalization-review-report.js";
import { renderVideoTopicUsageReport } from "../content/video-topic-usage-report.js";
import { loadCuratedTopicUsageSeed } from "../site/curated-seed.js";
import { auditTopicNormalization } from "../site/topic-normalization-audit.js";

interface CliOptions {
  segmentsInput: string;
  normalizationPatterns: string;
  output: string;
  reviewOutput: string;
  quiet: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const [seed, normalizationAudit] = await Promise.all([
    loadCuratedTopicUsageSeed(options.segmentsInput),
    auditTopicNormalization({
      patternsInput: options.normalizationPatterns,
      segmentsInput: options.segmentsInput,
    }),
  ]);
  const report = renderVideoTopicUsageReport(seed, normalizationAudit.catalog.rules);
  const reviewReport = renderTopicNormalizationReviewReport(normalizationAudit.reviewFindings);
  await Promise.all([
    mkdir(dirname(options.output), { recursive: true }),
    mkdir(dirname(options.reviewOutput), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(options.output, report.tsv, "utf8"),
    writeFile(options.reviewOutput, reviewReport.tsv, "utf8"),
  ]);
  if (!options.quiet) {
    console.error([
      "Video topic usage report:",
      `topics=${report.stats.reportTopicCount}`,
      `videos=${report.stats.videoCount}`,
      `used=${report.stats.usedTopicCount}`,
      `unused=${report.stats.unusedTopicCount}`,
      `unregistered=${report.stats.unregisteredUsedTopicCount}`,
      `duplicate_review=${report.stats.potentialDuplicateReviewCount}`,
      `normalization_blockers=${normalizationAudit.blockers.length}`,
      `normalization_reviews=${reviewReport.stats.findingCount}`,
      `output=${options.output}`,
      `review_output=${options.reviewOutput}`,
    ].join(" "));
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    segmentsInput: "src/derived/video-segments",
    normalizationPatterns: "src/derived/topic-normalization-patterns.tsv",
    output: "reports/video-topic-usage.tsv",
    reviewOutput: "reports/topic-normalization-review.tsv",
    quiet: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--segments-input": options.segmentsInput = readValue(args, ++index, arg); break;
      case "--normalization-patterns": options.normalizationPatterns = readValue(args, ++index, arg); break;
      case "--output": options.output = readValue(args, ++index, arg); break;
      case "--review-output": options.reviewOutput = readValue(args, ++index, arg); break;
      case "--quiet": options.quiet = true; break;
      case "--help":
      case "-h": printHelp(); process.exit(0);
      default: throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }
  return options;
}

function readValue(args: string[], index: number, name: string): string {
  const value = args[index];
  if (!value) throw new Error(`Missing value for ${name}.`);
  return value;
}

function printHelp(): void {
  console.log(`Usage: npm run report:video-topic-usage -- [options]

Generates the topic-usage TSV plus an exact normalization-review TSV for taxonomy curation.

Options:
  --segments-input <path>          Curated shard directory. Defaults to src/derived/video-segments.
  --normalization-patterns <path>  Topic normalization TSV. Defaults to src/derived/topic-normalization-patterns.tsv.
  --output <path>                  TSV output. Defaults to reports/video-topic-usage.tsv.
  --review-output <path>           Actionable exact-review TSV. Defaults to reports/topic-normalization-review.tsv.
  --quiet                          Suppress the one-line summary.
  --help                           Show this help.
`);
}

main().catch((error: unknown) => {
  console.error(`Failed to report video topic usage: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
