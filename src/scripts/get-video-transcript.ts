#!/usr/bin/env node
import {
  defaultTranscriptStorageRoot,
  fetchVideoTranscript,
  writeTranscriptStorage,
  writeTranscriptOutputs,
  type FetchVideoTranscriptOptions,
} from "../youtube/transcripts.js";

type CliOptions = FetchVideoTranscriptOptions & {
  jsonOutput?: string;
  txtOutput?: string;
  tsvOutput?: string;
  outputRoot: string;
  videoTitle?: string;
  videoTimestamp?: string;
  quiet: boolean;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
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

  const transcript = await fetchVideoTranscript(fetchOptions);
  if (options.videoTitle !== undefined) {
    transcript.videoTitle = options.videoTitle;
  }
  if (options.videoTimestamp !== undefined) {
    transcript.videoPublishedAt = options.videoTimestamp;
  }

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
    requestDelayMs: 60_000,
    outputRoot: defaultTranscriptStorageRoot,
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
      case "--video-title":
        options.videoTitle = readValue(args, ++index, arg);
        break;
      case "--video-timestamp":
        options.videoTimestamp = readValue(args, ++index, arg);
        break;
      case "--request-delay-ms":
        options.requestDelayMs = readPositiveInteger(readValue(args, ++index, arg), arg);
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

function printHelp(): void {
  console.log(`Usage: npm run fetch:transcript -- --video-id <id> [options]

Options:
  --video-id <id>          Required YouTube video ID.
  --language <name>        Optional transcript language code or label.
  --output-root <path>     Local transcript store. Defaults to src/transcripts.
  --video-title <title>    Override stored title used for readable file naming.
  --video-timestamp <ts>   Override stored timestamp prefix, e.g. 2026-06-14T05:29:19-05:00.
  --json-output <path>     Write structured transcript JSON instead of using the store.
  --txt-output <path>      Write readable timestamped text instead of using the store.
  --tsv-output <path>      Write tab-separated rows instead of using the store.
  --request-delay-ms <ms>  Delay between YouTube requests. Defaults to 60000.
  --quiet                  Suppress progress logs.
  --help                   Show this help.

Example:
  npm run fetch:transcript -- --video-id uURe69Wnh-Q
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to fetch transcript: ${message}`);
  process.exitCode = 1;
});
