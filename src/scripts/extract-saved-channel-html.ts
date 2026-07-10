#!/usr/bin/env node
import { dirname } from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

import {
  defaultSavedStreamsHtmlInput,
  defaultSavedVideosHtmlInput,
  extractSavedChannelHtml,
  type ExtractSavedChannelHtmlOptions,
} from "../youtube/saved-channel-html.js";
import {
  splitChannelVideoLinksResult,
  writeChannelEpisodeMasterOutput,
  type ChannelInventoryCompleteness,
  type ChannelVideoTab,
} from "../youtube/channel-video-links.js";

interface CliOptions {
  input?: string;
  tab: ChannelVideoTab;
  output?: string;
  linksOutput?: string;
  masterOutput?: string;
  inventoryCompleteness: ChannelInventoryCompleteness;
  baseOutput?: string;
  metadataOutput?: string;
  channelUrl?: string;
  channelId?: string;
  fetchedAt?: string;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const input = options.input ?? (options.tab === "videos" ? defaultSavedVideosHtmlInput : defaultSavedStreamsHtmlInput);
  const html = await readFile(input, "utf8");
  const savedAt = options.fetchedAt ?? await fileModifiedAt(input);
  const extractionOptions: ExtractSavedChannelHtmlOptions = {
    tab: options.tab,
    sourcePath: input,
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

  const extraction = extractSavedChannelHtml(html, extractionOptions);

  if (options.output !== undefined) {
    await writeJsonFile(options.output, extraction);
  }
  if (options.linksOutput !== undefined) {
    await writeJsonFile(options.linksOutput, extraction.result);
  }
  if (options.masterOutput !== undefined) {
    await writeChannelEpisodeMasterOutput(options.masterOutput, extraction.result, {
      completeness: options.inventoryCompleteness,
    });
  }
  if (options.baseOutput !== undefined || options.metadataOutput !== undefined) {
    const split = splitChannelVideoLinksResult(extraction.result);
    await Promise.all([
      writeJsonFile(options.baseOutput ?? "reports/dr-alex-video-list-from-html.json", split.list),
      writeJsonFile(options.metadataOutput ?? "reports/dr-alex-video-metadata-from-html.json", split.metadata),
    ]);
  }

  const summary = {
    input,
    tab: options.tab,
    extracted: extraction.stats.extractedVideoCount,
    renderedLockups: extraction.stats.renderedLockupCount,
    initialDataLockups: extraction.stats.initialDataLockupCount,
    extractionMethod: extraction.source.extractionMethod,
    continuationTokenCount: extraction.source.continuationTokenCount,
    fieldCounts: extraction.stats.fieldCounts,
  };

  if (
    options.output === undefined &&
    options.linksOutput === undefined &&
    options.masterOutput === undefined &&
    options.baseOutput === undefined &&
    options.metadataOutput === undefined
  ) {
    console.log(JSON.stringify(extraction, null, 2));
  } else {
    console.error(JSON.stringify(summary, null, 2));
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    tab: "videos",
    inventoryCompleteness: "unknown",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--input":
        options.input = readValue(args, ++index, arg);
        break;
      case "--tab":
        options.tab = readTab(readValue(args, ++index, arg));
        break;
      case "--output":
        options.output = readValue(args, ++index, arg);
        break;
      case "--links-output":
        options.linksOutput = readValue(args, ++index, arg);
        break;
      case "--master-output":
        options.masterOutput = readValue(args, ++index, arg);
        break;
      case "--inventory-completeness":
        options.inventoryCompleteness = readInventoryCompleteness(readValue(args, ++index, arg));
        break;
      case "--base-output":
        options.baseOutput = readValue(args, ++index, arg);
        break;
      case "--metadata-output":
        options.metadataOutput = readValue(args, ++index, arg);
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

function readTab(value: string): ChannelVideoTab {
  if (value === "videos" || value === "streams") {
    return value;
  }

  throw new Error("--tab must be videos or streams.");
}

function readInventoryCompleteness(value: string): ChannelInventoryCompleteness {
  if (value === "complete" || value === "partial" || value === "unknown") {
    return value;
  }

  throw new Error("--inventory-completeness must be complete, partial, or unknown.");
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
  console.log(`Usage: npm run alternate:extract:saved-channel-html -- [options]

Options:
  --input <path>           Saved YouTube channel tab HTML.
  --tab <videos|streams>   Channel tab represented by the saved page. Defaults to videos.
  --output <path>          Write extraction report JSON, including parse stats and links.
  --links-output <path>    Write standard channel video links JSON only.
  --master-output <path>   Write canonical source episode list.
  --inventory-completeness <complete|partial|unknown>
                           Completeness flag for --master-output. Defaults to unknown.
  --base-output <path>     Write base video-list JSON.
  --metadata-output <path> Write video metadata JSON.
  --channel-url <url>      Override the parsed channel URL.
  --channel-id <id>        Override the parsed channel ID.
  --fetched-at <iso>       Override snapshot timestamp. Defaults to the input file modified time.
  --help                   Show this help.

Examples:
  npm run alternate:extract:saved-channel-html -- --output reports/dr-alex-videos-html-extraction.json
  npm run alternate:extract:saved-channel-html -- --tab streams --input "${defaultSavedStreamsHtmlInput}"
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to extract saved channel HTML: ${message}`);
  process.exitCode = 1;
});
