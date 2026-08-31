#!/usr/bin/env node

import { resolve } from "node:path";

import {
  migrateVideoSegmentShardVideoIds,
  type VideoSegmentShardVideoIdMigrationMode,
} from "../pipeline/video-segment-shard-video-id-migration.js";

interface CliOptions {
  inputDirectory: string;
  mode: VideoSegmentShardVideoIdMigrationMode;
  showHelp: boolean;
}

const options = parseArgs(process.argv.slice(2));
if (options.showHelp) {
  printHelp();
} else {
  migrateVideoSegmentShardVideoIds({
    inputDirectory: options.inputDirectory,
    mode: options.mode,
  }).then((result) => {
    console.log(
      `Video-segment shard videoId migration ${result.mode}: ` +
      `${result.shardCount.toLocaleString("en-US")} shard(s), ` +
      `${result.segmentCount.toLocaleString("en-US")} segment(s), ` +
      `${result.changedShardCount.toLocaleString("en-US")} shard(s) requiring change, ` +
      `${result.removedFieldCount.toLocaleString("en-US")} removable field(s), ` +
      `${result.alreadyCurrentShardCount.toLocaleString("en-US")} already current.`,
    );
    if (result.backupDirectory !== undefined) {
      console.log(`Validated pre-write backup: ${result.backupDirectory}`);
    }
    if (result.mode === "dry-run" && result.changedShardCount > 0) {
      console.log("Dry run completed without changing shards. Pass --write to apply the migration.");
    }
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

function parseArgs(args: readonly string[]): CliOptions {
  let mode: VideoSegmentShardVideoIdMigrationMode = "dry-run";
  let modeSelected = false;
  let inputDirectory = resolve("src/derived/video-segments");
  let showHelp = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      showHelp = true;
      continue;
    }
    if (argument === "--write" || argument === "--check") {
      if (modeSelected) {
        throw new Error("Use only one of --write or --check.");
      }
      mode = argument === "--write" ? "write" : "check";
      modeSelected = true;
      continue;
    }
    if (argument === "--segments-input") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--segments-input requires a directory path.");
      }
      inputDirectory = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { inputDirectory, mode, showHelp };
}

function printHelp(): void {
  console.log(`Usage: npm run migrate:video-segment-shard-video-ids -- [options]

Options:
  --write                   Create a validated backup, then apply the migration.
  --check                   Require every shard to use the target shape.
  --segments-input <path>   Override src/derived/video-segments.
  --help                    Show this help.

The default mode is a read-only dry run that accepts resumable legacy and target shards.
`);
}
