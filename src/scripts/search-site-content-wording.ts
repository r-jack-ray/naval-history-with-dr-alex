#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";

import {
  type CuratedSegmentSeed,
  type CuratedVideoFileSeed,
  parseCuratedVideoFile,
} from "../content/schemas/index.js";
import { listVideoSegmentShardFileNames } from "../site/video-segment-files.js";
import { isDirectExecution } from "./console-run-timer.js";

export type ShardWordingSearchField =
  | "title"
  | "summary"
  | "body"
  | "question"
  | "answerShort"
  | "evidence.note";

export interface ShardWordingSearchOptions {
  repoRoot: string;
  segmentsInput: string;
  paths: string[];
  phrases: string[];
  caseSensitive: boolean;
  substring: boolean;
  summaryOnly: boolean;
}

export interface ShardWordingSearchHit {
  file: string;
  videoId: string;
  segmentId: string;
  segmentStart: string;
  segmentIndex: number;
  segmentKind: CuratedSegmentSeed["kind"];
  field: ShardWordingSearchField;
  evidenceIndex?: number;
  phrase: string;
  occurrenceCount: number;
  excerpt: string;
}

const defaultSegmentsInput = "src/derived/video-segments";

export async function main(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(args);
  if (options === null) {
    return 0;
  }

  const repoRoot = resolve(options.repoRoot);
  const files = await selectedShardPaths(options, repoRoot);
  const hits: ShardWordingSearchHit[] = [];
  const parseErrors: string[] = [];
  let videosScanned = 0;
  let segmentsScanned = 0;
  let fieldsScanned = 0;

  for (const path of files) {
    const file = repoDisplayPath(repoRoot, path);
    let video: CuratedVideoFileSeed;
    try {
      video = parseCuratedVideoFile(
          JSON.parse(await readFile(path, "utf8")) as unknown,
          `Curated video shard ${file}`,
      );
    } catch (error: unknown) {
      parseErrors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    videosScanned += 1;
    segmentsScanned += video.segments.length;
    fieldsScanned += searchableFieldCount(video);
    hits.push(...searchCuratedVideoFileWording(file, video, options));
  }

  hits.sort(compareHits);
  const matchedOccurrences = hits.reduce((count, hit) => count + hit.occurrenceCount, 0);
  const matchingFiles = new Set(hits.map((hit) => hit.file)).size;
  const matchingSegments = new Set(hits.map((hit) => `${hit.file}\u0000${hit.segmentId}`)).size;
  const summary =
      `Shard wording search: phrases=${options.phrases.length} files=${files.length} ` +
      `videos=${videosScanned} segments=${segmentsScanned} fields=${fieldsScanned} ` +
      `matching-files=${matchingFiles} matching-segments=${matchingSegments} ` +
      `matching-fields=${hits.length} matched-occurrences=${matchedOccurrences} ` +
      `parse-errors=${parseErrors.length}.`;

  if (parseErrors.length > 0) {
    console.error(summary);
    console.error("Curated-shard parse errors:");
    for (const error of parseErrors) {
      console.error(`  ${error}`);
    }
  } else {
    console.log(summary);
  }

  if (!options.summaryOnly) {
    for (const hit of hits) {
      console.log(
          `  ${hit.file}#${hit.segmentId}@${hit.segmentStart} ` +
          `[${hit.segmentKind}/${fieldPath(hit)}] occurrences=${hit.occurrenceCount} ` +
          `phrase=${JSON.stringify(hit.phrase)}`,
      );
      console.log(`    ${hit.excerpt}`);
    }
  }

  return parseErrors.length > 0 ? 1 : 0;
}

export function parseArgs(args: readonly string[]): ShardWordingSearchOptions | null {
  const options: ShardWordingSearchOptions = {
    repoRoot: ".",
    segmentsInput: defaultSegmentsInput,
    paths: [],
    phrases: [],
    caseSensitive: false,
    substring: false,
    summaryOnly: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--repo-root") {
      options.repoRoot = required(args[++index], argument);
    } else if (argument === "--segments-input") {
      options.segmentsInput = required(args[++index], argument);
    } else if (argument === "--path") {
      options.paths.push(required(args[++index], argument));
    } else if (argument === "--phrase") {
      options.phrases.push(required(args[++index], argument));
    } else if (argument === "--case-sensitive") {
      options.caseSensitive = true;
    } else if (argument === "--substring") {
      options.substring = true;
    } else if (argument === "--summary-only") {
      options.summaryOnly = true;
    } else if (argument === "--help" || argument === "-h") {
      printHelp();
      return null;
    } else {
      throw new Error(`Unknown argument: ${argument ?? "(missing)"}`);
    }
  }

  if (options.phrases.length === 0) {
    throw new Error("Provide at least one --phrase value.");
  }
  const uniquePhrases = new Map<string, string>();
  for (const phrase of options.phrases) {
    const key = options.caseSensitive ? phrase : phrase.toLocaleLowerCase();
    if (!uniquePhrases.has(key)) {
      uniquePhrases.set(key, phrase);
    }
  }
  options.phrases = [...uniquePhrases.values()];
  return options;
}

export function searchCuratedVideoFileWording(
    file: string,
    video: CuratedVideoFileSeed,
    options: Pick<ShardWordingSearchOptions, "phrases" | "caseSensitive" | "substring">,
): ShardWordingSearchHit[] {
  const hits: ShardWordingSearchHit[] = [];
  for (const [segmentIndex, segment] of video.segments.entries()) {
    for (const [field, text, evidenceIndex] of searchableFields(segment)) {
      for (const phrase of options.phrases) {
        const positions = literalMatchPositions(
            text,
            phrase,
            options.caseSensitive,
            options.substring,
        );
        if (positions.length === 0) {
          continue;
        }
        hits.push({
          file,
          videoId: video.videoId,
          segmentId: segment.slug,
          segmentStart: segment.start,
          segmentIndex,
          segmentKind: segment.kind,
          field,
          ...(evidenceIndex === undefined ? {} : { evidenceIndex }),
          phrase,
          occurrenceCount: positions.length,
          excerpt: excerptAround(text, positions[0]!, phrase.length),
        });
      }
    }
  }
  return hits;
}

function searchableFields(
    segment: CuratedSegmentSeed,
): Array<[ShardWordingSearchField, string, number?]> {
  const fields: Array<[ShardWordingSearchField, string, number?]> = [
    ["title", segment.title],
  ];
  if ("summary" in segment && segment.summary !== undefined) {
    fields.push(["summary", segment.summary]);
  }
  fields.push(["body", segment.body]);
  if (segment.kind === "qa") {
    fields.push(["question", segment.question], ["answerShort", segment.answerShort]);
  }
  for (const [evidenceIndex, evidence] of segment.evidence.entries()) {
    fields.push(["evidence.note", evidence.note, evidenceIndex]);
  }
  return fields;
}

function literalMatchPositions(
    text: string,
    phrase: string,
    caseSensitive: boolean,
    substring: boolean,
): number[] {
  const positions: number[] = [];
  const matcher = new RegExp(escapeRegExp(phrase), caseSensitive ? "gu" : "giu");
  for (const match of text.matchAll(matcher)) {
    const position = match.index;
    if (substring || hasWordBoundaries(text, position, match[0].length)) {
      positions.push(position);
    }
  }
  return positions;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function hasWordBoundaries(text: string, start: number, length: number): boolean {
  const first = text[start];
  const last = text[start + length - 1];
  const before = text[start - 1];
  const after = text[start + length];
  return (!isWordCharacter(first) || !isWordCharacter(before))
      && (!isWordCharacter(last) || !isWordCharacter(after));
}

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && /[\p{L}\p{N}_]/u.test(value);
}

function excerptAround(text: string, start: number, length: number): string {
  const excerptStart = Math.max(0, start - 80);
  const excerptEnd = Math.min(text.length, start + length + 120);
  const excerpt = text.slice(excerptStart, excerptEnd).replace(/\s+/gu, " ").trim();
  return `${excerptStart > 0 ? "..." : ""}${excerpt}` +
      `${excerptEnd < text.length ? "..." : ""}`;
}

async function selectedShardPaths(
    options: ShardWordingSearchOptions,
    repoRoot: string,
): Promise<string[]> {
  const paths = options.paths.length > 0
    ? options.paths.map((path) => resolve(repoRoot, path))
    : (await listVideoSegmentShardFileNames(resolve(repoRoot, options.segmentsInput)))
        .map((fileName) => resolve(repoRoot, options.segmentsInput, fileName));
  const unique = new Map<string, string>();
  for (const path of paths) {
    validateShardPath(path);
    unique.set(process.platform === "win32" ? path.toLocaleLowerCase() : path, path);
  }
  return [...unique.values()].sort((left, right) => left.localeCompare(right));
}

function searchableFieldCount(video: CuratedVideoFileSeed): number {
  return video.segments.reduce((count, segment) => count + searchableFields(segment).length, 0);
}

function validateShardPath(path: string): void {
  if (extname(path).toLocaleLowerCase() !== ".json") {
    throw new Error(`Shard wording search paths must be JSON shards: ${path}`);
  }
  if (basename(path).toLocaleLowerCase() === "topics.json") {
    throw new Error("The shared topics.json registry is not a per-video site-content shard.");
  }
}

function fieldPath(hit: ShardWordingSearchHit): string {
  return hit.evidenceIndex === undefined ? hit.field : `evidence[${hit.evidenceIndex}].note`;
}

function compareHits(left: ShardWordingSearchHit, right: ShardWordingSearchHit): number {
  return left.file.localeCompare(right.file)
      || left.segmentIndex - right.segmentIndex
      || left.field.localeCompare(right.field)
      || (left.evidenceIndex ?? -1) - (right.evidenceIndex ?? -1)
      || left.phrase.localeCompare(right.phrase);
}

function repoDisplayPath(repoRoot: string, path: string): string {
  const relativePath = relative(repoRoot, path);
  const display = relativePath.startsWith("..") || isAbsolute(relativePath) ? path : relativePath;
  return display.replaceAll("\\", "/");
}

function required(value: string | undefined, option: string): string {
  if (value === undefined || !value.trim()) {
    throw new Error(`Missing value for ${option}.`);
  }
  return value;
}

function printHelp(): void {
  console.log(`Usage: npm run search:site-content-wording -- --phrase <text> [options]

Searches authored segment prose and evidence notes in per-video JSON shards. It
does not search sourcePath, topics, topics.json, transcripts, or generated site data.
Matching is case-insensitive and uses word boundaries by default. Use --substring
to include matches embedded inside longer words. Matches are discovery output and
do not make the command fail; malformed shards and invalid arguments exit 1.

Options:
  --phrase <text>                  Literal phrase; repeat to search several phrases
  --path <json-shard>              Search one shard; repeat for multiple shards
  --segments-input <path>          Defaults to ${defaultSegmentsInput}
  --repo-root <path>
  --case-sensitive
  --substring                      Permit matches inside longer words
  --summary-only                   Suppress individual matches
  --help

Examples:
  npm run search:site-content-wording -- --phrase "the transcript"
  npm run search:site-content-wording -- --phrase "the passage" --phrase "the source"
  npm run search:site-content-wording -- --phrase "the transcript" --path src/derived/video-segments/FILE.json
`);
}

if (isDirectExecution(import.meta.url)) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
