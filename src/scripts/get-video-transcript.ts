#!/usr/bin/env node

import {
  defaultTranscriptStorageRoot,
  findStoredTranscriptRecord,
  fetchVideoTranscript,
  writeTranscriptStorage,
  writeTranscriptOutputs,
  type FetchVideoTranscriptOptions,
  type VideoTranscript,
} from "../youtube/transcripts.js";
import {
  defaultVideoMetadataOutput,
  findVideoMetadataRecord,
  isPublishedButUnstarted,
  videoNamingMetadata,
  type VideoMetadataRecord,
  type VideoNamingMetadata,
} from "../youtube/video-metadata.js";

type CliOptions = FetchVideoTranscriptOptions & {
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
  const metadataRecord = await readMetadataRecord(options);
  if (isPublishedButUnstarted(metadataRecord)) {
    console.error(`Skipping published but unstarted video: ${options.videoId}`);
    return;
  }
  const namingMetadata = videoNamingMetadata(metadataRecord);
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
      console.error(`Transcript already stored: ${stored.paths.txtOutput}`);
      console.error("No YouTube requests made. Use --force to refetch.");
      return;
    }
  }

  const transcript = await fetchVideoTranscript(fetchOptions);
  applyNamingMetadata(transcript, options, namingMetadata);

  if (hasExplicitOutputs(options)) {
    const outputs: {
      txtOutput?: string;
      tsvOutput?: string;
    } = {};

    if (options.txtOutput !== undefined) {
      outputs.txtOutput = options.txtOutput;
    }
    if (options.tsvOutput !== undefined) {
      outputs.tsvOutput = options.tsvOutput;
    }

    await writeTranscriptOutputs(transcript, outputs);
  } else {
    const paths = await writeTranscriptStorage(transcript, options.outputRoot);
    console.error(`Stored transcript TXT: ${paths.txtOutput}`);
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

async function readMetadataRecord(options: CliOptions): Promise<VideoMetadataRecord | undefined> {
  if (options.metadataInput === undefined) {
    return undefined;
  }

  return findVideoMetadataRecord(options.videoId, options.metadataInput);
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

function hasExplicitOutputs(options: CliOptions): boolean {
  return options.txtOutput !== undefined || options.tsvOutput !== undefined;
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
  console.log(`Usage: npm run alternate:fetch:transcript -- --video-id <id> [options]

Options:
  --video-id <id>          Required YouTube video ID.
  --language <name>        Optional transcript language code or label.
  --output-root <path>     Local transcript store. Defaults to src/transcripts.
  --metadata-input <path>  Local video metadata JSON. Defaults to src/channel/video-metadata.json.
  --no-metadata-lookup     Do not read local metadata for title/timestamp naming.
  --video-title <title>    Override stored title used for readable file naming.
  --video-timestamp <ts>   Override stored timestamp prefix, e.g. 2026-06-14T05:29:19-05:00.
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
