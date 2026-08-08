#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import {
  type ChannelInventoryCompleteness,
  type ChannelVideoLinksResult,
  mergeChannelVideoLinksResults,
  writeChannelEpisodeMasterOutput,
  writeSplitVideoLinksOutput,
  writeVideoLinksOutput,
} from "../youtube/channel-video-links.js";
import { readIgnoredVideos } from "../youtube/ignored-videos.js";
import { readInventoryCompleteness, readValue } from "./cli-arguments.js";

interface CliOptions {
  inputs: string[];
  output?: string;
  masterOutput?: string;
  inventoryCompleteness: ChannelInventoryCompleteness;
  linksOutput?: string;
  metadataOutput?: string;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const results = await Promise.all(options.inputs.map((input) => readChannelVideoLinksResult(input)));
  const ignoredVideos = await readIgnoredVideos();
  const ignoredVideoIds = new Set(ignoredVideos.keys());
  const merged = mergeChannelVideoLinksResults(results, ignoredVideoIds);

  if (options.output !== undefined) {
    await writeVideoLinksOutput(options.output, merged);
  }
  if (options.masterOutput !== undefined) {
    await writeChannelEpisodeMasterOutput(options.masterOutput, merged, {
      completeness: options.inventoryCompleteness,
      ignoredVideoIds,
    });
  }
  if (options.linksOutput !== undefined || options.metadataOutput !== undefined) {
    await writeSplitVideoLinksOutput(
        options.linksOutput ?? "reports/dr-alex-video-list-merged.json",
        options.metadataOutput ?? "reports/dr-alex-video-metadata-merged.json",
        merged,
    );
  }

  if (
      options.output === undefined &&
      options.masterOutput === undefined &&
      options.linksOutput === undefined &&
      options.metadataOutput === undefined
  ) {
    console.log(JSON.stringify(merged, null, 2));
  } else {
    console.log(`Merged ${merged.links.length} unique video links from ${options.inputs.length} input files.`);
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    inputs: [],
    inventoryCompleteness: "unknown",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
    case "--input":
      options.inputs.push(readValue(args, ++index, arg));
      break;
    case "--output":
      options.output = readValue(args, ++index, arg);
      break;
    case "--master-output":
      options.masterOutput = readValue(args, ++index, arg);
      break;
    case "--inventory-completeness":
      options.inventoryCompleteness = readInventoryCompleteness(readValue(args, ++index, arg));
      break;
    case "--links-output":
      options.linksOutput = readValue(args, ++index, arg);
      break;
    case "--metadata-output":
      options.metadataOutput = readValue(args, ++index, arg);
      break;
    case "--help":
    case "-h":
      printHelp();
      process.exit(0);
      break;
    default:
      throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }

  if (options.inputs.length === 0) {
    throw new Error("At least one --input is required.");
  }

  return options;
}

async function readChannelVideoLinksResult(path: string): Promise<ChannelVideoLinksResult> {
  return JSON.parse(await readFile(path, "utf8")) as ChannelVideoLinksResult;
}

function printHelp(): void {
  console.log(`Usage: npm run alternate:merge:video-links -- --input <path> [--input <path> ...] [options]

Options:
  --input <path>           ChannelVideoLinksResult JSON input. Repeat for multiple sources.
  --output <path>          Write merged channel links JSON.
  --master-output <path>   Write merged canonical source episode list.
  --inventory-completeness <complete|partial|unknown>
                           Completeness flag for --master-output. Defaults to unknown.
  --links-output <path>    Write merged base video-list JSON.
  --metadata-output <path> Write merged lightweight metadata JSON.
  --help                   Show this help.

Example:
  npm run alternate:merge:video-links -- --input reports/dr-alex-videos-html-links.json --input reports/dr-alex-streams-html-links.json --master-output src/channel/episodes.json --inventory-completeness partial
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to merge channel video links: ${message}`);
  process.exitCode = 1;
});
