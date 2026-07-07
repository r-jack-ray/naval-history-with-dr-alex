#!/usr/bin/env node
import {
  fetchVideoTranscript,
  writeTranscriptOutputs,
  type FetchVideoTranscriptOptions,
} from "../youtube/transcripts.js";

type CliOptions = FetchVideoTranscriptOptions & {
  jsonOutput?: string;
  txtOutput?: string;
  tsvOutput?: string;
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

  console.error(
    `Fetched ${transcript.segments.length} transcript segments for ${options.videoId} (${transcript.selectedLanguage ?? "unknown language"}).`,
  );
}

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    requestDelayMs: 60_000,
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

  if (!options.jsonOutput && !options.txtOutput && !options.tsvOutput) {
    options.jsonOutput = `src/transcripts/json/${options.videoId}.json`;
    options.txtOutput = `src/transcripts/txt/${options.videoId}.txt`;
  }

  return options as CliOptions;
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
  --language <name>        Optional transcript language label from youtubei.js.
  --json-output <path>     Write structured transcript JSON.
  --txt-output <path>      Write readable timestamped text.
  --tsv-output <path>      Write tab-separated transcript rows.
  --request-delay-ms <ms>  Delay between YouTube requests. Defaults to 60000.
  --quiet                  Suppress progress logs.
  --help                   Show this help.

Example:
  npm run fetch:transcript -- --video-id --l6rRIfksQ --json-output src/transcripts/json/--l6rRIfksQ.json --txt-output src/transcripts/txt/--l6rRIfksQ.txt
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to fetch transcript: ${message}`);
  process.exitCode = 1;
});
