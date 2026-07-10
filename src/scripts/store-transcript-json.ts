#!/usr/bin/env node
import {
  defaultTranscriptStorageRoot,
  readVideoTranscriptJson,
  writeTranscriptStorage,
} from "../youtube/transcripts.js";

interface CliOptions {
  input?: string;
  outputRoot: string;
  videoTitle?: string;
  videoTimestamp?: string;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const input = options.input;
  if (!input) {
    throw new Error("Missing required transcript JSON input.");
  }

  const transcript = await readVideoTranscriptJson(input);

  if (options.videoTitle !== undefined) {
    transcript.videoTitle = options.videoTitle;
  }
  if (options.videoTimestamp !== undefined) {
    transcript.videoPublishedAt = options.videoTimestamp;
  }

  const paths = await writeTranscriptStorage(transcript, options.outputRoot);
  console.error(`Stored JSON transcript: ${paths.jsonOutput}`);
  console.error(`Stored TXT transcript: ${paths.txtOutput}`);
  console.error(`Updated transcript manifest: ${paths.manifestOutput}`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    outputRoot: defaultTranscriptStorageRoot,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--input":
        options.input = readValue(args, ++index, arg);
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
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        if (arg?.startsWith("--")) {
          throw new Error(`Unknown argument: ${arg}`);
        }
        if (arg) {
          options.input = arg;
        }
    }
  }

  if (!options.input) {
    throw new Error("Missing required transcript JSON input.");
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

function printHelp(): void {
  console.log(`Usage: npm run store:transcript-json -- [options] <json-file>

Options:
  --input <path>         Transcript JSON input. May also be positional.
  --output-root <path>   Local transcript store. Defaults to src/transcripts.
  --video-title <title>  Override stored title used for readable file naming.
  --video-timestamp <ts> Override stored timestamp prefix, e.g. 2026-06-14T05:29:19-05:00.
  --help                Show this help.

Example:
  npm run store:transcript-json -- src/transcripts/json/uURe69Wnh-Q.json --video-title "Video Title" --video-timestamp 2026-06-14T05:29:19-05:00
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to store transcript JSON: ${message}`);
  process.exitCode = 1;
});
