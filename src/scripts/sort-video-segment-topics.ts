import { readFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseCuratedVideoFile,
  type CuratedVideoFileSeed,
} from "../content/schemas/index.js";
import { writeTextAtomically } from "../pipeline/atomic-write.js";
import { listVideoSegmentShardFileNames } from "../site/video-segment-files.js";

const DEFAULT_INPUT = path.resolve("src/derived/video-segments");

interface FileSortResult {
  changed: boolean;
  sortedTopicArrayCount: number;
}

type FileSortOutcome =
    | { filePath: string; result: FileSortResult }
    | { error: unknown; filePath: string };

export interface SortVideoSegmentTopicsCliOptions {
  help: boolean;
  inputDirectory: string;
  workers: number;
}

export interface SortVideoSegmentTopicsRuntime {
  stderr?: (text: string) => void;
  stdout?: (text: string) => void;
  workers?: number;
}

export interface SortVideoSegmentTopicsResult {
  changedFileCount: number;
  checkedFileCount: number;
  exitCode: number;
  failedFileCount: number;
  sortedTopicArrayCount: number;
  workerCount: number;
}

export function defaultSortVideoSegmentTopicsWorkerCount(): number {
  return Math.max(1, Math.min(8, availableParallelism()));
}

export function parseSortVideoSegmentTopicsArgs(
    args: readonly string[],
): SortVideoSegmentTopicsCliOptions {
  let help = false;
  let inputDirectory = DEFAULT_INPUT;
  let inputDirectorySeen = false;
  let workers = defaultSortVideoSegmentTopicsWorkerCount();
  let workersSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--workers") {
      if (workersSeen) {
        throw new Error("--workers may be specified only once.");
      }
      workersSeen = true;
      workers = parseWorkerCount(args[++index]);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (inputDirectorySeen) {
      throw new Error(`Only one shard directory may be specified; received ${JSON.stringify(arg)}.`);
    }
    inputDirectory = arg;
    inputDirectorySeen = true;
  }

  return {help, inputDirectory, workers};
}

function parseWorkerCount(value: string | undefined): number {
  const workers = Number(value);
  const maximum = availableParallelism();
  if (
      value === undefined
      || !Number.isInteger(workers)
      || workers < 1
      || workers > maximum
  ) {
    throw new Error(
        `--workers must be an integer from 1 to ${maximum}; received ${JSON.stringify(value)}.`,
    );
  }
  return workers;
}

export function sortTopicSlugs(topics: readonly string[]): string[] {
  return [...topics].sort((left, right) => left.localeCompare(right));
}

function topicArraysMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((topic, index) => topic === right[index]);
}

function sortSegmentFields(
    segment: CuratedVideoFileSeed["segments"][number],
    topics: string[],
): CuratedVideoFileSeed["segments"][number] {
  const commonFields = {
    slug: segment.slug,
    title: segment.title,
    start: segment.start,
    ...(segment.end === undefined ? {} : {end: segment.end}),
    topics,
    body: segment.body,
    sourcePath: segment.sourcePath,
    evidence: segment.evidence.map((entry) => ({
      start: entry.start,
      ...(entry.end === undefined ? {} : {end: entry.end}),
      note: entry.note,
    })),
  };

  if (segment.kind === "qa") {
    return {
      ...commonFields,
      kind: segment.kind,
      ...(segment.summary === undefined ? {} : {summary: segment.summary}),
      question: segment.question,
      answerShort: segment.answerShort,
    };
  }

  return {
    ...commonFields,
    kind: segment.kind,
    summary: segment.summary,
  };
}

async function sortTopicsInFile(filePath: string): Promise<FileSortResult> {
  const originalText = await readFile(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(originalText) as unknown;
  } catch (error) {
    throw new Error(`Could not parse video-segment shard ${filePath}.`, {cause: error});
  }

  const data = parseCuratedVideoFile(parsed, `Video-segment shard ${filePath}`);
  let sortedTopicArrayCount = 0;
  const videoTopics = sortTopicSlugs(data.topics);
  if (!topicArraysMatch(videoTopics, data.topics)) {
    sortedTopicArrayCount += 1;
  }
  const segments = data.segments.map((segment) => {
    const topics = sortTopicSlugs(segment.topics);
    if (!topicArraysMatch(topics, segment.topics)) {
      sortedTopicArrayCount += 1;
    }
    return sortSegmentFields(segment, topics);
  });

  const sortedData: CuratedVideoFileSeed = {
    videoId: data.videoId,
    topics: videoTopics,
    segments,
  };
  const sortedText = `${JSON.stringify(sortedData, null, 2)}\n`;
  const changed = sortedText !== originalText;
  if (changed) {
    await writeTextAtomically(filePath, sortedText);
  }

  return {changed, sortedTopicArrayCount};
}

export async function runSortVideoSegmentTopics(
    inputDirectory = DEFAULT_INPUT,
    runtime: SortVideoSegmentTopicsRuntime = {},
): Promise<SortVideoSegmentTopicsResult> {
  const resolvedInputDirectory = path.resolve(inputDirectory);
  const stdout = runtime.stdout ?? ((text: string) => console.log(text));
  const stderr = runtime.stderr ?? ((text: string) => console.error(text));
  const fileNames = await listVideoSegmentShardFileNames(resolvedInputDirectory);
  const requestedWorkers = runtime.workers === undefined
      ? defaultSortVideoSegmentTopicsWorkerCount()
      : parseWorkerCount(String(runtime.workers));
  const workerCount = Math.min(requestedWorkers, Math.max(1, fileNames.length));
  const outcomes = new Array<FileSortOutcome>(fileNames.length);
  let cursor = 0;
  let changedFileCount = 0;
  let failedFileCount = 0;
  let sortedTopicArrayCount = 0;

  const workers = Array.from({length: workerCount}, async () => {
    while (cursor < fileNames.length) {
      const index = cursor;
      cursor += 1;
      const fileName = fileNames[index];
      if (fileName === undefined) {
        continue;
      }
      const filePath = path.join(resolvedInputDirectory, fileName);
      try {
        outcomes[index] = {filePath, result: await sortTopicsInFile(filePath)};
      } catch (error) {
        outcomes[index] = {error, filePath};
      }
    }
  });
  await Promise.all(workers);

  for (const outcome of outcomes) {
    if (outcome === undefined) {
      throw new Error("Worker pool completed without producing every shard result.");
    }
    if ("error" in outcome) {
      failedFileCount += 1;
      stderr(`Failed: ${outcome.filePath}`);
      stderr(outcome.error instanceof Error
          ? outcome.error.stack ?? outcome.error.message
          : String(outcome.error));
      continue;
    }
    if (outcome.result.changed) {
      changedFileCount += 1;
      sortedTopicArrayCount += outcome.result.sortedTopicArrayCount;
      stdout(
          `Normalized shard (${outcome.result.sortedTopicArrayCount} topic array(s) sorted): ${outcome.filePath}`,
      );
    } else {
      stdout(`Already canonical: ${outcome.filePath}`);
    }
  }

  stdout(
      [
        `Finished. ${fileNames.length} JSON file(s) checked, ${changedFileCount} changed,`,
        `${sortedTopicArrayCount} topic array(s) sorted, ${failedFileCount} failure(s),`,
        `${workerCount} worker(s).`,
      ].join(" "),
  );
  return {
    changedFileCount,
    checkedFileCount: fileNames.length,
    exitCode: failedFileCount > 0 ? 1 : 0,
    failedFileCount,
    sortedTopicArrayCount,
    workerCount,
  };
}

function usage(): string {
  return `Usage: npm run fix:video-segment-topic-order -- [directory] [options]

Sorts schema fields plus video-level and segment-level topic arrays in every shard JSON file.
The shared topics.json registry is excluded.

Options:
  --workers <count>  Worker count. Defaults to min(8, available CPUs).
  --help             Show this help.
`;
}

function isCliEntryPoint(moduleUrl: string, argumentPath: string | undefined): boolean {
  let isEntryPoint = false;
  if (argumentPath !== undefined) {
    const modulePath = path.resolve(fileURLToPath(moduleUrl));
    const resolvedArgumentPath = path.resolve(argumentPath);
    isEntryPoint = process.platform === "win32"
        ? modulePath.toLocaleLowerCase("en-US") === resolvedArgumentPath.toLocaleLowerCase("en-US")
        : modulePath === resolvedArgumentPath;
  }
  return isEntryPoint;
}

async function main(): Promise<void> {
  const options = parseSortVideoSegmentTopicsArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const result = await runSortVideoSegmentTopics(options.inputDirectory, {
    workers: options.workers,
  });
  process.exitCode = result.exitCode;
}

if (isCliEntryPoint(import.meta.url, process.argv[1])) {
  await main();
}
