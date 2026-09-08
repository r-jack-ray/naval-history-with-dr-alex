#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { parseCuratedTopicStore, type CuratedTopicSeed, } from "../content/schemas/index.js";
import { writeTextAtomically } from "../pipeline/atomic-write.js";
import { readValue } from "./cli-arguments.js";
import { isDirectExecution } from "./console-run-timer.js";

export const defaultVideoTopicSummaryReportInput = "reports/video-topic-usage.tsv";
export const defaultVideoTopicSummaryStoreInput = "src/derived/video-segments/topics.json";

export interface ImportVideoTopicSummariesOptions {
  reportInput?: string;
  topicsInput?: string;
}

export interface ImportVideoTopicSummariesResult {
  changed: boolean;
  unableSlugs: string[];
  updatedCount: number;
}

interface CliOptions extends Required<ImportVideoTopicSummariesOptions> {
  help: boolean;
}

interface ParsedSummaryRows {
  conflictingSlugs: Set<string>;
  summariesBySlug: Map<string, string>;
}

export async function importVideoTopicSummaries(
    options: ImportVideoTopicSummariesOptions = {},
): Promise<ImportVideoTopicSummariesResult> {
  const reportInput = options.reportInput ?? defaultVideoTopicSummaryReportInput;
  const topicsInput = options.topicsInput ?? defaultVideoTopicSummaryStoreInput;
  const [reportText, topicsText] = await Promise.all([
    readFile(reportInput, "utf8"),
    readFile(topicsInput, "utf8"),
  ]);
  const topicStore = parseCuratedTopicStore(
      JSON.parse(topicsText) as unknown,
      `Curated topic store ${topicsInput}`,
  );
  const parsedRows = parseSummaryRows(reportText, reportInput);
  const topicsBySlug = new Map(topicStore.topics.map((topic) => [topic.slug, topic]));
  const updatesBySlug = new Map<string, string>();
  const unableSlugs = new Set(parsedRows.conflictingSlugs);

  for (const [slug, summary] of parsedRows.summariesBySlug) {
    if (parsedRows.conflictingSlugs.has(slug)) {
      continue;
    }
    const topic = topicsBySlug.get(slug);
    if (topic === undefined) {
      if (summary !== "") {
        unableSlugs.add(slug);
      }
      continue;
    }
    if ((topic.summary ?? "") !== summary) {
      updatesBySlug.set(slug, summary);
    }
  }

  if (updatesBySlug.size > 0) {
    const topics = topicStore.topics.map((topic) => {
      const summary = updatesBySlug.get(topic.slug);
      return summary === undefined ? topic : topicWithSummary(topic, summary);
    });
    await writeTextAtomically(topicsInput, `${JSON.stringify({topics}, null, 2)}\n`);
  }

  return {
    changed: updatesBySlug.size > 0,
    unableSlugs: [...unableSlugs].sort((left, right) => left.localeCompare(right, "en-GB")),
    updatedCount: updatesBySlug.size,
  };
}

export function formatVideoTopicSummaryImportResult(
    result: ImportVideoTopicSummariesResult,
): string {
  return [
    `Topic summaries updated: ${result.updatedCount}`,
    `Topic summary changes not updated: ${result.unableSlugs.length}`,
    ...result.unableSlugs,
  ].join("\n");
}

function parseSummaryRows(text: string, path: string): ParsedSummaryRows {
  const rows = parseDelimitedText(text.replace(/^\uFEFF/u, ""), delimiterFor(path, text));
  const headers = rows.shift()?.map((header) => header.trim().toLowerCase());
  if (headers === undefined) {
    throw new Error(`${path} is empty.`);
  }
  const slugIndex = uniqueHeaderIndex(headers, "topic slug", path);
  const summaryIndex = uniqueHeaderIndex(headers, "summary", path);
  const summariesBySlug = new Map<string, string>();
  const conflictingSlugs = new Set<string>();

  for (const [rowIndex, row] of rows.entries()) {
    if (row.every((value) => value.trim() === "")) {
      continue;
    }
    const slug = (row[slugIndex] ?? "").trim();
    const summary = normalizeSummary(row[summaryIndex] ?? "");
    if (slug === "") {
      throw new Error(`${path} row ${rowIndex + 2} has no topic slug.`);
    }
    const existing = summariesBySlug.get(slug);
    if (existing !== undefined && existing !== summary) {
      conflictingSlugs.add(slug);
      continue;
    }
    summariesBySlug.set(slug, summary);
  }

  return {conflictingSlugs, summariesBySlug};
}

function delimiterFor(path: string, text: string): "," | "\t" {
  const extension = extname(path).toLowerCase();
  if (extension === ".csv") {
    return ",";
  }
  if (extension === ".tsv") {
    return "\t";
  }
  const firstLine = text.split(/\r?\n/u, 1)[0] ?? "";
  return firstLine.includes("\t") ? "\t" : ",";
}

function parseDelimitedText(text: string, delimiter: "," | "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (inQuotes) {
      if (character !== "\"") {
        field += character;
      } else if (text[index + 1] === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = false;
      }
      continue;
    }
    if (character === "\"" && field === "" && hasDelimitedClosingQuote(text, index, delimiter)) {
      inQuotes = true;
    } else if (character === delimiter) {
      row.push(field);
      field = "";
    } else if (character === "\r" || character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new Error("Delimited report contains an unterminated quoted field.");
  }
  if (row.length > 0 || field !== "") {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function hasDelimitedClosingQuote(text: string, openingIndex: number, delimiter: "," | "\t"): boolean {
  for (let index = openingIndex + 1; index < text.length; index += 1) {
    if (text[index] !== "\"") {
      continue;
    }
    if (text[index + 1] === "\"") {
      index += 1;
      continue;
    }
    const next = text[index + 1];
    return next === undefined || next === delimiter || next === "\r" || next === "\n";
  }
  return false;
}

function uniqueHeaderIndex(headers: readonly string[], expected: string, path: string): number {
  const matches = headers.flatMap((header, index) => header === expected ? [index] : []);
  if (matches.length !== 1) {
    throw new Error(`${path} must contain exactly one ${JSON.stringify(expected)} column.`);
  }
  return matches[0]!;
}

function normalizeSummary(value: string): string {
  return value.replace(/[\t\r\n]+/gu, " ").trim();
}

function topicWithSummary(topic: CuratedTopicSeed, summary: string): CuratedTopicSeed {
  return {
    slug: topic.slug,
    title: topic.title,
    ...(summary === "" ? {} : {summary}),
    ...(topic.aliases === undefined ? {} : {aliases: [...topic.aliases]}),
  };
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    help: false,
    reportInput: defaultVideoTopicSummaryReportInput,
    topicsInput: defaultVideoTopicSummaryStoreInput,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") {
      options.reportInput = readValue(args, ++index, arg);
    } else if (arg === "--topics-input") {
      options.topicsInput = readValue(args, ++index, arg);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }
  return options;
}

function printHelp(): void {
  console.log(`Usage: npm run import:video-topic-summaries -- [options]

Updates only topic summary fields from the existing video-topic-usage report.
Blank summary cells remove the corresponding summary field.

Options:
  --input <path>         Google Sheets CSV or TSV export. Defaults to ${defaultVideoTopicSummaryReportInput}.
  --topics-input <path>  Topic registry JSON. Defaults to ${defaultVideoTopicSummaryStoreInput}.
  --help                 Show this help.
`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = await importVideoTopicSummaries(options);
  console.log(formatVideoTopicSummaryImportResult(result));
  if (result.unableSlugs.length > 0) {
    process.exitCode = 1;
  }
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(
        `Failed to import video topic summaries: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
