#!/usr/bin/env node
import { dirname } from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

import {
  defaultLiveStreamsHtmlInput,
  extractLiveStreamsHtml,
  type ExtractLiveStreamsHtmlOptions,
} from "../youtube/live-streams-html.js";

interface CliOptions {
  input: string;
  output?: string;
  linksOutput?: string;
  channelUrl?: string;
  channelId?: string;
  fetchedAt?: string;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const html = await readFile(options.input, "utf8");
  const savedAt = options.fetchedAt ?? await fileModifiedAt(options.input);
  const extractionOptions: ExtractLiveStreamsHtmlOptions = {
    sourcePath: options.input,
  };

  if (options.channelUrl !== undefined) {
    extractionOptions.channelUrl = options.channelUrl;
  }
  if (options.channelId !== undefined) {
    extractionOptions.channelId = options.channelId;
  }
  if (savedAt !== undefined) {
    extractionOptions.fetchedAt = savedAt;
  }

  const extraction = extractLiveStreamsHtml(html, extractionOptions);

  if (options.output !== undefined) {
    await writeJsonFile(options.output, extraction);
  }
  if (options.linksOutput !== undefined) {
    await writeJsonFile(options.linksOutput, extraction.result);
  }

  const summary = {
    input: options.input,
    extracted: extraction.stats.extractedStreamCount,
    renderedLockups: extraction.stats.renderedLockupCount,
    continuationTokenCount: extraction.source.continuationTokenCount,
    fieldCounts: extraction.stats.fieldCounts,
  };

  if (options.output === undefined && options.linksOutput === undefined) {
    console.log(JSON.stringify(extraction, null, 2));
  } else {
    console.error(JSON.stringify(summary, null, 2));
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    input: defaultLiveStreamsHtmlInput,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--input":
        options.input = readValue(args, ++index, arg);
        break;
      case "--output":
        options.output = readValue(args, ++index, arg);
        break;
      case "--links-output":
        options.linksOutput = readValue(args, ++index, arg);
        break;
      case "--channel-url":
        options.channelUrl = readValue(args, ++index, arg);
        break;
      case "--channel-id":
        options.channelId = readValue(args, ++index, arg);
        break;
      case "--fetched-at":
        options.fetchedAt = readValue(args, ++index, arg);
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

async function fileModifiedAt(path: string): Promise<string | undefined> {
  try {
    return (await stat(path)).mtime.toISOString();
  } catch {
    return undefined;
  }
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function printHelp(): void {
  console.log(`Usage: npm run extract:live-streams-html -- [options]

Options:
  --input <path>        Saved YouTube live streams HTML. Defaults to ${defaultLiveStreamsHtmlInput}.
  --output <path>       Write extraction report JSON, including parse stats and links.
  --links-output <path> Write standard channel video links JSON only.
  --channel-url <url>   Override the parsed channel URL.
  --channel-id <id>     Override the parsed channel ID.
  --fetched-at <iso>    Override the snapshot timestamp. Defaults to the input file modified time.
  --help                Show this help.

Examples:
  npm run extract:live-streams-html -- --output reports/dr-alex-live-streams-html-extraction.json
  npm run extract:live-streams-html -- --links-output reports/dr-alex-live-streams-html-links.json
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to extract live streams from HTML: ${message}`);
  process.exitCode = 1;
});
