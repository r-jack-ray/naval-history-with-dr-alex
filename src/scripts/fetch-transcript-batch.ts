#!/usr/bin/env node
import {
  defaultTranscriptBatchInput,
  defaultTranscriptBatchStatusOutput,
  fetchAndStoreTranscriptBatch,
  type FetchTranscriptBatchOptions,
} from "../youtube/batch-transcripts.js";
import { defaultTranscriptStorageRoot } from "../youtube/transcripts.js";
import { defaultVideoMetadataOutput } from "../youtube/video-metadata.js";

type CliOptions = Omit<FetchTranscriptBatchOptions, "logger" | "metadataInput"> & {
  metadataInput: string | undefined;
  quiet: boolean;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const fetchOptions: FetchTranscriptBatchOptions = {
    inputPath: options.inputPath,
    outputRoot: options.outputRoot,
    statusOutput: options.statusOutput,
    requestDelayMs: options.requestDelayMs,
  };

  if (options.metadataInput !== undefined) {
    fetchOptions.metadataInput = options.metadataInput;
  }
  if (options.language !== undefined) {
    fetchOptions.language = options.language;
  }
  if (options.limit !== undefined) {
    fetchOptions.limit = options.limit;
  }
  if (options.retryFailed !== undefined) {
    fetchOptions.retryFailed = options.retryFailed;
  }
  if (options.force !== undefined) {
    fetchOptions.force = options.force;
  }
  if (options.dryRun !== undefined) {
    fetchOptions.dryRun = options.dryRun;
  }
  if (!options.quiet) {
    fetchOptions.logger = (message) => console.error(message);
  }

  const status = await fetchAndStoreTranscriptBatch(fetchOptions);
  console.error(
    [
      `Transcript batch complete: fetched=${status.stats.fetchedCount}`,
      `failed=${status.stats.failedCount}`,
      `stored-skipped=${status.stats.skippedStoredCount}`,
      `previous-failure-skipped=${status.stats.skippedPreviousFailureCount}`,
      `pending=${status.stats.pendingCount}`,
      `status=${options.statusOutput}`,
    ].join(" "),
  );
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: defaultTranscriptBatchInput,
    outputRoot: defaultTranscriptStorageRoot,
    statusOutput: defaultTranscriptBatchStatusOutput,
    metadataInput: defaultVideoMetadataOutput,
    requestDelayMs: 5_000,
    quiet: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--input":
        options.inputPath = readValue(args, ++index, arg);
        break;
      case "--output-root":
        options.outputRoot = readValue(args, ++index, arg);
        break;
      case "--status-output":
        options.statusOutput = readValue(args, ++index, arg);
        break;
      case "--metadata-input":
        options.metadataInput = readValue(args, ++index, arg);
        break;
      case "--no-metadata-lookup":
        options.metadataInput = undefined;
        break;
      case "--language":
        options.language = readValue(args, ++index, arg);
        break;
      case "--limit":
        options.limit = readPositiveInteger(readValue(args, ++index, arg), arg);
        break;
      case "--request-delay-ms":
        options.requestDelayMs = readPositiveInteger(readValue(args, ++index, arg), arg);
        break;
      case "--retry-failed":
        options.retryFailed = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--dry-run":
        options.dryRun = true;
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

function readPositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function printHelp(): void {
  console.log(`Usage: npm run alternate:fetch:transcripts -- [options]

Options:
  --input <path>          Episode master JSON. Defaults to src/channel/episodes.json.
  --output-root <path>    Local transcript store. Defaults to src/transcripts.
  --status-output <path>  Resume/status JSON. Defaults to src/transcripts/fetch-status.json.
  --metadata-input <path> Local video metadata JSON. Defaults to src/channel/video-metadata.json.
  --no-metadata-lookup    Do not read local metadata for title/timestamp naming.
  --language <name>       Optional transcript language code or label.
  --limit <count>         Maximum number of new transcript fetch attempts.
  --request-delay-ms <ms> Delay between YouTube requests. Defaults to 5000.
  --retry-failed          Retry videos listed in the status failure file.
  --force                 Refetch even when the transcript is already stored.
  --dry-run               Write status for pending work without calling YouTube.
  --quiet                 Suppress progress logs.
  --help                  Show this help.

Examples:
  npm run alternate:fetch:transcripts -- --limit 1 --request-delay-ms 5000
  npm run alternate:fetch:transcripts -- --limit 10 --retry-failed
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to fetch transcript batch: ${message}`);
  process.exitCode = 1;
});
