#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { renderVideoTopicUsageReport } from "../content/video-topic-usage-report.js";
import { loadCuratedArchiveSeed } from "../site/curated-seed.js";
import { loadTopicNormalizationCatalog } from "../site/topic-normalization.js";

interface CliOptions {
  segmentsInput: string;
  normalizationPatterns: string;
  output: string;
  quiet: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const [seed, normalization] = await Promise.all([
    loadCuratedArchiveSeed(options.segmentsInput),
    loadTopicNormalizationCatalog(options.normalizationPatterns),
  ]);
  const report = renderVideoTopicUsageReport(seed, normalization.rules);
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, report.tsv, "utf8");
  if (!options.quiet) {
    console.error([
      "Video topic usage report:",
      `topics=${report.stats.reportTopicCount}`,
      `videos=${report.stats.videoCount}`,
      `used=${report.stats.usedTopicCount}`,
      `unused=${report.stats.unusedTopicCount}`,
      `unregistered=${report.stats.unregisteredUsedTopicCount}`,
      `duplicate_review=${report.stats.potentialDuplicateReviewCount}`,
      `output=${options.output}`,
    ].join(" "));
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    segmentsInput: "src/derived/video-segments",
    normalizationPatterns: "src/derived/topic-normalization-patterns.tsv",
    output: "reports/video-topic-usage.tsv",
    quiet: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--segments-input": options.segmentsInput = readValue(args, ++index, arg); break;
      case "--normalization-patterns": options.normalizationPatterns = readValue(args, ++index, arg); break;
      case "--output": options.output = readValue(args, ++index, arg); break;
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

Generates a TSV of all registered and referenced video topics, sorted by unique-video usage count.

Options:
  --segments-input <path>          Curated shard directory. Defaults to src/derived/video-segments.
  --normalization-patterns <path>  Topic normalization TSV. Defaults to src/derived/topic-normalization-patterns.tsv.
  --output <path>                  TSV output. Defaults to reports/video-topic-usage.tsv.
  --quiet                          Suppress the one-line summary.
  --help                           Show this help.
`);
}

main().catch((error: unknown) => {
  console.error(`Failed to report video topic usage: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
