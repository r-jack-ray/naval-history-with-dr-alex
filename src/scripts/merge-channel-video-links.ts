#!/usr/bin/env node
import { dirname } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import {
  mergeChannelVideoLinksResults,
  writeChannelEpisodeMasterOutput,
  writeSplitVideoLinksOutput,
  writeVideoLinksOutput,
  type ChannelInventoryCompleteness,
  type ChannelVideoLinksResult,
} from "../youtube/channel-video-links.js";

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
  const merged = mergeChannelVideoLinksResults(results);

  if (options.output !== undefined) {
    await writeVideoLinksOutput(options.output, merged);
  }
  if (options.masterOutput !== undefined) {
    await writeChannelEpisodeMasterOutput(options.masterOutput, merged, {
      completeness: options.inventoryCompleteness,
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
    console.error(`Merged ${merged.links.length} unique video links from ${options.inputs.length} input files.`);
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

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
