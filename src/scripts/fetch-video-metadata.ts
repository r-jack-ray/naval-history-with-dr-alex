#!/usr/bin/env node
import {
  defaultVideoMetadataInput,
  defaultVideoMetadataOutput,
  fetchAndStoreVideoMetadata,
  type FetchVideoMetadataOptions,
} from "../youtube/video-metadata.js";
import { resolveYoutubeApiKey } from "./youtube-api-key-file.js";

type CliOptions = Omit<FetchVideoMetadataOptions, "apiKey"> & {
  apiKey?: string;
  apiKeyFile?: string;
  quiet: boolean;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = await resolveYoutubeApiKey(options);
  if (!apiKey) {
    throw new Error("Set YOUTUBE_API_KEY, pass --api-key, or pass --api-key-file.");
  }

  const fetchOptions: FetchVideoMetadataOptions = {
    apiKey,
    inputPath: options.inputPath,
    outputPath: options.outputPath,
    requestDelayMs: options.requestDelayMs,
    batchSize: options.batchSize,
  };
  if (options.limit !== undefined) {
    fetchOptions.limit = options.limit;
  }
  if (options.additionalVideoIds !== undefined) {
    fetchOptions.additionalVideoIds = options.additionalVideoIds;
  }
  if (options.refreshVideoIds !== undefined) {
    fetchOptions.refreshVideoIds = options.refreshVideoIds;
  }
  if (options.force !== undefined) {
    fetchOptions.force = options.force;
  }
  if (!options.quiet) {
    fetchOptions.logger = (message) => console.error(message);
  }

  const store = await fetchAndStoreVideoMetadata(fetchOptions);
  console.error(
    `Stored metadata for ${store.stats.storedVideoCount}/${store.stats.inputVideoCount} videos in ${options.outputPath}`,
  );
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: defaultVideoMetadataInput,
    outputPath: defaultVideoMetadataOutput,
    requestDelayMs: 1_000,
    batchSize: 50,
    quiet: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--input":
        options.inputPath = readValue(args, ++index, arg);
        break;
      case "--output":
        options.outputPath = readValue(args, ++index, arg);
        break;
      case "--api-key":
        options.apiKey = readValue(args, ++index, arg);
        break;
      case "--api-key-file":
        options.apiKeyFile = readValue(args, ++index, arg);
        break;
      case "--request-delay-ms":
        options.requestDelayMs = readPositiveInteger(readValue(args, ++index, arg), arg);
        break;
      case "--batch-size":
        options.batchSize = readBatchSize(readValue(args, ++index, arg));
        break;
      case "--limit":
        options.limit = readPositiveInteger(readValue(args, ++index, arg), arg);
        break;
      case "--video-id":
        options.additionalVideoIds ??= [];
        options.additionalVideoIds.push(readValue(args, ++index, arg));
        break;
      case "--refresh-video-id":
        options.refreshVideoIds ??= [];
        options.refreshVideoIds.push(readValue(args, ++index, arg));
        break;
      case "--force":
        options.force = true;
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

function readBatchSize(value: string): number {
  const parsed = readPositiveInteger(value, "--batch-size");
  if (parsed < 1 || parsed > 50) {
    throw new Error("--batch-size must be between 1 and 50.");
  }
  return parsed;
}

function printHelp(): void {
  console.log(`Usage: npm run fetch:video-metadata -- [options]

Options:
  --input <path>          Episode master list. Defaults to ${defaultVideoMetadataInput}.
  --output <path>         Metadata store. Defaults to ${defaultVideoMetadataOutput}.
  --api-key <key>         YouTube Data API key. Defaults to YOUTUBE_API_KEY.
  --api-key-file <path>   Read YouTube Data API key from a text file.
  --request-delay-ms <ms> Delay between YouTube Data API requests. Defaults to 1000.
  --batch-size <count>    IDs per videos.list call, 1-50. Defaults to 50.
  --limit <count>         Fetch only this many missing IDs.
  --video-id <id>         Include a video absent from the episode inventory. Repeatable.
  --refresh-video-id <id> Refetch one stored ID without globally forcing every record. Repeatable.
  --force                 Refetch IDs already present in the output file.
  --quiet                 Suppress progress logs.
  --help                  Show this help.

Examples:
  npm run fetch:video-metadata
  npm run fetch:video-metadata -- --limit 50 --request-delay-ms 1000
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to fetch video metadata: ${message}`);
  process.exitCode = 1;
});
