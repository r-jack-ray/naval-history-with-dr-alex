#!/usr/bin/env node
import {
  auditSiteContent,
  defaultSiteContentAuditManifest,
  defaultSiteContentAuditOutput,
  defaultSiteContentAuditSegmentsInput,
  defaultSiteContentProcessingConfig,
  defaultSiteContentProcessingLog,
  type AuditSiteContentOptions,
} from "../content/site-content-audit.js";

interface CliOptions extends AuditSiteContentOptions {
  failOnUncurated: boolean;
  quiet: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const audit = await auditSiteContent(options);

  if (!options.quiet) {
    console.error(
      [
        `Site content audit: transcripts=${audit.stats.storedTranscriptCount}`,
        `seeded-videos=${audit.stats.seededVideoCount}`,
        `segments=${audit.stats.curatedSegmentCount}`,
        `uncurated=${audit.stats.uncuratedStoredTranscriptCount}`,
        `completed-log-videos=${audit.stats.completedProcessingLogVideoCount}`,
        `errors=${audit.stats.errorCount}`,
        `warnings=${audit.stats.warningCount}`,
        `report=${options.output ?? "(none)"}`,
      ].join(" "),
    );
  }

  if (audit.stats.errorCount > 0) {
    process.exitCode = 1;
    return;
  }

  if (options.failOnUncurated && audit.stats.uncuratedStoredTranscriptCount > 0) {
    console.error(`Stored transcripts without curated segments: ${audit.stats.uncuratedStoredTranscriptCount}`);
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    manifestPath: defaultSiteContentAuditManifest,
    segmentsInput: defaultSiteContentAuditSegmentsInput,
    processingLog: defaultSiteContentProcessingLog,
    processingConfig: defaultSiteContentProcessingConfig,
    output: defaultSiteContentAuditOutput,
    limit: 25,
    failOnUncurated: false,
    quiet: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--manifest":
        options.manifestPath = readValue(args, ++index, arg);
        break;
      case "--segments-input":
        options.segmentsInput = readValue(args, ++index, arg);
        break;
      case "--processing-log":
        options.processingLog = readValue(args, ++index, arg);
        break;
      case "--processing-config":
        options.processingConfig = readValue(args, ++index, arg);
        break;
      case "--output":
        options.output = readValue(args, ++index, arg);
        break;
      case "--no-output":
        delete options.output;
        break;
      case "--limit":
        options.limit = readNonNegativeInteger(readValue(args, ++index, arg), arg);
        break;
      case "--fail-on-uncurated":
        options.failOnUncurated = true;
        break;
      case "--quiet":
        options.quiet = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }

  return options;
}

function readValue(args: string[], index: number, name: string): string {
  const value = args[index];
  if (!value) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

function readNonNegativeInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function printHelp(): void {
  console.log(`Usage: npm run audit:site-content -- [options]

Options:
  --manifest <path>        Transcript manifest. Defaults to src/transcripts/manifest.json.
  --segments-input <path>  Per-video curated content directory. Defaults to src/derived/video-segments.
  --processing-log <path>  One-line-per-file processing log. Defaults to src/derived/site-content-processing.log.
  --processing-config <path>
                           Processing rules config. Defaults to src/derived/site-content-processing.config.json.
  --output <path>          Markdown report path. Defaults to reports/site-content-backlog.md.
  --no-output              Do not write a report.
  --limit <count>          Number of uncurated transcripts to list. Defaults to 25.
  --fail-on-uncurated      Exit non-zero when stored transcripts lack curated segments.
  --quiet                  Suppress the one-line summary.
  --help                   Show this help.

Examples:
  npm run audit:site-content
  npm run audit:site-content -- --limit 10
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to audit site content: ${message}`);
  process.exitCode = 1;
});
