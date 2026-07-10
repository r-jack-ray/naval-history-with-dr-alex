#!/usr/bin/env node
import { access } from "node:fs/promises";

import {
  defaultTranscriptStorageRoot,
  findStoredTranscriptRecord,
  fetchVideoTranscript,
  readVideoTranscriptJson,
  transcriptStoragePaths,
  writeTranscriptStorage,
  writeTranscriptOutputs,
  type FetchVideoTranscriptOptions,
  type TranscriptStoragePaths,
  type VideoTranscript,
} from "../youtube/transcripts.js";
import {
  defaultVideoMetadataOutput,
  findVideoMetadataRecord,
  videoNamingMetadata,
  type VideoNamingMetadata,
} from "../youtube/video-metadata.js";

type CliOptions = FetchVideoTranscriptOptions & {
  jsonOutput?: string;
  txtOutput?: string;
  tsvOutput?: string;
  outputRoot: string;
  metadataInput: string | undefined;
  videoTitle?: string;
  videoTimestamp?: string;
  force: boolean;
  quiet: boolean;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const namingMetadata = await readNamingMetadata(options);
  const fetchOptions: FetchVideoTranscriptOptions = {
    videoId: options.videoId,
    requestDelayMs: options.requestDelayMs,
  };

  if (options.language !== undefined) {
    fetchOptions.language = options.language;
  }
  if (!options.quiet) {
    fetchOptions.logger = (message) => console.error(message);
  }

  if (!hasExplicitOutputs(options) && !options.force) {
    const stored = await findStoredTranscriptRecord({
      videoId: options.videoId,
      root: options.outputRoot,
      ...(options.language !== undefined ? { language: options.language } : {}),
    });
    if (stored !== undefined) {
      const transcript = await readVideoTranscriptJson(stored.paths.jsonOutput);
      applyNamingMetadata(transcript, options, namingMetadata);
      const targetPaths = transcriptStoragePaths(
        transcript.videoId,
        options.outputRoot,
        transcript.videoTitle,
        transcript.videoPublishedAt,
      );
      const missingOutputs = await missingTranscriptOutputs(stored.paths);

      if (!sameTranscriptPaths(stored.paths, targetPaths) || missingOutputs.length > 0) {
        const paths = await writeTranscriptStorage(transcript, options.outputRoot);
        console.error(`Re-stored existing transcript from local JSON: ${paths.jsonOutput}`);
        console.error(`Stored TXT transcript: ${paths.txtOutput}`);
        console.error(`Stored TSV transcript: ${paths.tsvOutput}`);
        console.error(`Updated transcript manifest: ${paths.manifestOutput}`);
      } else {
        console.error(`Transcript already stored: ${stored.paths.jsonOutput}`);
        console.error(`Stored TXT transcript: ${stored.paths.txtOutput}`);
        console.error(`Stored TSV transcript: ${stored.paths.tsvOutput}`);
        console.error("No YouTube requests made. Use --force to refetch.");
      }
      return;
    }
  }

  const transcript = await fetchVideoTranscript(fetchOptions);
  applyNamingMetadata(transcript, options, namingMetadata);

  if (hasExplicitOutputs(options)) {
    const outputs: {
      jsonOutput?: string;
      txtOutput?: string;
      tsvOutput?: string;
    } = {};

    if (options.jsonOutput !== undefined) {
      outputs.jsonOutput = options.jsonOutput;
    }
    if (options.txtOutput !== undefined) {
      outputs.txtOutput = options.txtOutput;
    }
    if (options.tsvOutput !== undefined) {
      outputs.tsvOutput = options.tsvOutput;
    }

    await writeTranscriptOutputs(transcript, outputs);
  } else {
    const paths = await writeTranscriptStorage(transcript, options.outputRoot);
    console.error(`Stored JSON transcript: ${paths.jsonOutput}`);
    console.error(`Stored TXT transcript: ${paths.txtOutput}`);
    console.error(`Stored TSV transcript: ${paths.tsvOutput}`);
    console.error(`Updated transcript manifest: ${paths.manifestOutput}`);
  }

  console.error(
    `Fetched ${transcript.segments.length} transcript segments for ${options.videoId} (${transcript.selectedLanguage ?? "unknown language"}).`,
  );
}

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    requestDelayMs: 5_000,
    outputRoot: defaultTranscriptStorageRoot,
    metadataInput: defaultVideoMetadataOutput,
    force: false,
    quiet: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--video-id":
        options.videoId = readValue(args, ++index, arg);
        break;
      case "--language":
        options.language = readValue(args, ++index, arg);
        break;
      case "--json-output":
        options.jsonOutput = readValue(args, ++index, arg);
        break;
      case "--txt-output":
        options.txtOutput = readValue(args, ++index, arg);
        break;
      case "--tsv-output":
        options.tsvOutput = readValue(args, ++index, arg);
        break;
      case "--output-root":
        options.outputRoot = readValue(args, ++index, arg);
        break;
      case "--metadata-input":
        options.metadataInput = readValue(args, ++index, arg);
        break;
      case "--no-metadata-lookup":
        options.metadataInput = undefined;
        break;
      case "--video-title":
        options.videoTitle = readValue(args, ++index, arg);
        break;
      case "--video-timestamp":
        options.videoTimestamp = readValue(args, ++index, arg);
        break;
      case "--request-delay-ms":
        options.requestDelayMs = readPositiveInteger(readValue(args, ++index, arg), arg);
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

  if (!options.videoId) {
    throw new Error("Missing required --video-id.");
  }

  return options as CliOptions;
}

async function readNamingMetadata(options: CliOptions): Promise<VideoNamingMetadata> {
  if (options.metadataInput === undefined) {
    return {};
  }

  const record = await findVideoMetadataRecord(options.videoId, options.metadataInput);
  return videoNamingMetadata(record);
}

function applyNamingMetadata(
  transcript: VideoTranscript,
  options: CliOptions,
  metadata: VideoNamingMetadata,
): void {
  const videoTitle = options.videoTitle ?? metadata.title;
  const videoTimestamp = options.videoTimestamp ?? metadata.timestamp;

  if (videoTitle !== undefined) {
    transcript.videoTitle = videoTitle;
  }
  if (videoTimestamp !== undefined) {
    transcript.videoPublishedAt = videoTimestamp;
  }
}

async function missingTranscriptOutputs(paths: TranscriptStoragePaths): Promise<string[]> {
  const outputs = [paths.jsonOutput, paths.txtOutput, paths.tsvOutput];
  const missing: string[] = [];

  for (const output of outputs) {
    try {
      await access(output);
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        missing.push(output);
      } else {
        throw error;
      }
    }
  }

  return missing;
}

function sameTranscriptPaths(left: TranscriptStoragePaths, right: TranscriptStoragePaths): boolean {
  return left.jsonOutput === right.jsonOutput && left.txtOutput === right.txtOutput && left.tsvOutput === right.tsvOutput;
}

function hasExplicitOutputs(options: CliOptions): boolean {
  return options.jsonOutput !== undefined || options.txtOutput !== undefined || options.tsvOutput !== undefined;
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

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function printHelp(): void {
  console.log(`Usage: npm run alternate:fetch:transcript -- --video-id <id> [options]

Options:
  --video-id <id>          Required YouTube video ID.
  --language <name>        Optional transcript language code or label.
  --output-root <path>     Local transcript store. Defaults to src/transcripts.
  --metadata-input <path>  Local video metadata JSON. Defaults to src/channel/video-metadata.json.
  --no-metadata-lookup     Do not read local metadata for title/timestamp naming.
  --video-title <title>    Override stored title used for readable file naming.
  --video-timestamp <ts>   Override stored timestamp prefix, e.g. 2026-06-14T05:29:19-05:00.
  --json-output <path>     Write structured transcript JSON instead of using the store.
  --txt-output <path>      Write readable timestamped text instead of using the store.
  --tsv-output <path>      Write tab-separated rows instead of using the store.
  --request-delay-ms <ms>  Delay between YouTube requests. Defaults to 5000.
  --force                  Refetch from YouTube even when the transcript is already stored.
  --quiet                  Suppress progress logs.
  --help                   Show this help.

Example:
  npm run alternate:fetch:transcript -- --video-id uURe69Wnh-Q
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to fetch transcript: ${message}`);
  process.exitCode = 1;
});
