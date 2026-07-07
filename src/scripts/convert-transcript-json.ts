#!/usr/bin/env node
import { basename, dirname, extname, join } from "node:path";

import {
  readVideoTranscriptJson,
  transcriptToTsv,
  transcriptToTxt,
} from "../youtube/transcripts.js";
import { mkdir, writeFile } from "node:fs/promises";

type OutputFormat = "txt" | "tsv";

interface CliOptions {
  inputs: string[];
  format: OutputFormat;
  outputDir?: string;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  for (const input of options.inputs) {
    const transcript = await readVideoTranscriptJson(input);
    const outputPath = outputPathFor(input, options);
    const content = options.format === "txt" ? transcriptToTxt(transcript) : transcriptToTsv(transcript);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, "utf8");
    console.error(`Wrote ${outputPath}`);
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    inputs: [],
    format: "txt",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--format":
        options.format = readFormat(readValue(args, ++index, arg));
        break;
      case "--output-dir":
        options.outputDir = readValue(args, ++index, arg);
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
          options.inputs.push(arg);
        }
    }
  }

  if (options.inputs.length === 0) {
    throw new Error("At least one transcript JSON file is required.");
  }

  return options;
}

function outputPathFor(input: string, options: CliOptions): string {
  const extension = `.${options.format}`;
  const baseName = basename(input, extname(input)) + extension;

  if (options.outputDir) {
    return join(options.outputDir, baseName);
  }

  return join(dirname(input), baseName);
}

function readFormat(value: string): OutputFormat {
  const lower = value.toLowerCase();
  if (lower === "txt" || lower === "tsv") {
    return lower;
  }

  throw new Error("--format must be txt or tsv.");
}

function readValue(args: string[], index: number, name: string): string {
  const value = args[index];
  if (!value) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

function printHelp(): void {
  console.log(`Usage: npm run convert:transcript-json -- [options] <json-file> [...]

Options:
  --format <txt|tsv>   Output format. Defaults to txt.
  --output-dir <path>  Output directory. Defaults to the input file directory.
  --help               Show this help.

Examples:
  npm run convert:transcript-json -- src/transcripts/json/--l6rRIfksQ.json --output-dir src/transcripts/txt
  npm run convert:transcript-json -- --format tsv src/transcripts/json/--l6rRIfksQ.json --output-dir src/transcripts/tsv
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to convert transcript JSON: ${message}`);
  process.exitCode = 1;
});
