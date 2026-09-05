import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type CuratedSegmentSeed, parseCuratedVideoFile, } from "../content/schemas/index.js";
import { writeTextAtomically } from "../pipeline/atomic-write.js";
import { listVideoSegmentShardFileNames } from "../site/video-segment-files.js";

/**
 * Sorts curated video-segment shards by each segment's numeric start time.
 *
 * Run these commands from the repository root:
 *
 *   bun run ./src/scripts/sort-video-segments-by-start.ts
 *   bun run ./src/scripts/sort-video-segments-by-start.ts ./src/derived/video-segments
 *   bun run ./src/scripts/sort-video-segments-by-start.ts ./src/derived/video-segments/<shard>.json
 *
 * With no argument, the script checks every canonical shard in the default
 * video-segments directory. The optional argument may name another directory
 * or one shard JSON file. Directory mode excludes the shared topics.json file.
 */

const DEFAULT_INPUT = path.resolve("src/derived/video-segments");
const timestampPattern = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/u;

type FileSortResult = {
  changed: boolean;
  malformedTimestamps: MalformedTimestampFinding[];
};

type MalformedTimestampFinding = {
  field: string;
  problem: string;
  segmentSlug: string;
  segmentNumber: number;
  timestampValue: string;
};

type OrderedSegment = {
  originalIndex: number;
  segment: CuratedSegmentSeed;
  startSeconds: number;
};

export interface SortVideoSegmentsRuntime {
  stderr?: (text: string) => void;
  stdout?: (text: string) => void;
}

export interface SortVideoSegmentsResult {
  changedFileCount: number;
  checkedFileCount: number;
  exitCode: number;
  failedFileCount: number;
  malformedFileCount: number;
  malformedTimestampCount: number;
}

export function startTimeToSeconds(start: string): number {
  const match = timestampPattern.exec(start);
  if (match === null) {
    throw new Error(`Invalid timestamp: ${start}`);
  }

  const firstPartText = match[1];
  const secondPartText = match[2];
  if (firstPartText === undefined || secondPartText === undefined) {
    throw new Error(`Invalid timestamp: ${start}`);
  }

  const firstPart = Number.parseInt(firstPartText, 10);
  const secondPart = Number.parseInt(secondPartText, 10);
  const thirdPart = match[3] === undefined
      ? undefined
      : Number.parseInt(match[3], 10);
  const startSeconds = thirdPart === undefined
      ? (firstPart * 60) + secondPart
      : (firstPart * 3600) + (secondPart * 60) + thirdPart;

  if (!Number.isSafeInteger(startSeconds)) {
    throw new Error(`Timestamp is too large: ${start}`);
  }

  return startSeconds;
}

function collectMalformedTimestamps(
    parsed: unknown,
): MalformedTimestampFinding[] {
  const findings: MalformedTimestampFinding[] = [];
  let segments: unknown[] = [];

  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const candidateSegments = (parsed as Record<string, unknown>).segments;
    if (Array.isArray(candidateSegments)) {
      segments = candidateSegments;
    }
  }

  for (const [index, segment] of segments.entries()) {
    const segmentRecord = typeof segment === "object" && segment !== null && !Array.isArray(segment)
        ? segment as Record<string, unknown>
        : undefined;
    const segmentSlug = typeof segmentRecord?.slug === "string" ? segmentRecord.slug : "";
    appendTimestampFinding(
        findings,
        index,
        segmentSlug,
        `segments[${index}].start`,
        segmentRecord?.start,
        true,
    );
    appendTimestampFinding(
        findings,
        index,
        segmentSlug,
        `segments[${index}].end`,
        segmentRecord?.end,
        false,
    );

    const evidence = segmentRecord?.evidence;
    if (Array.isArray(evidence)) {
      for (const [evidenceIndex, item] of evidence.entries()) {
        const evidenceRecord = typeof item === "object" && item !== null && !Array.isArray(item)
            ? item as Record<string, unknown>
            : undefined;
        appendTimestampFinding(
            findings,
            index,
            segmentSlug,
            `segments[${index}].evidence[${evidenceIndex}].start`,
            evidenceRecord?.start,
            true,
        );
        appendTimestampFinding(
            findings,
            index,
            segmentSlug,
            `segments[${index}].evidence[${evidenceIndex}].end`,
            evidenceRecord?.end,
            false,
        );
      }
    }
  }

  return findings;
}

function appendTimestampFinding(
    findings: MalformedTimestampFinding[],
    segmentIndex: number,
    segmentSlug: string,
    field: string,
    value: unknown,
    required: boolean,
): void {
  const problem = timestampProblem(value, required);
  if (problem !== undefined) {
    findings.push({
      field,
      problem,
      segmentSlug,
      segmentNumber: segmentIndex + 1,
      timestampValue: formatUnknownValue(value),
    });
  }
}

function timestampProblem(value: unknown, required: boolean): string | undefined {
  let problem: string | undefined;
  if (value === undefined) {
    problem = required ? "Missing timestamp value." : undefined;
  } else if (typeof value !== "string") {
    problem = "Timestamp value must be a string.";
  } else {
    try {
      startTimeToSeconds(value);
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
  }
  return problem;
}

function formatUnknownValue(value: unknown): string {
  let formatted: string;
  if (value === undefined) {
    formatted = "<missing>";
  } else if (typeof value === "string") {
    formatted = value;
  } else {
    formatted = JSON.stringify(value) ?? String(value);
  }
  return formatted;
}

async function resolveInputFiles(inputPath: string): Promise<string[]> {
  const inputStats = await stat(inputPath);
  let filePaths: string[];

  if (inputStats.isDirectory()) {
    const fileNames = await listVideoSegmentShardFileNames(inputPath);
    filePaths = fileNames.map((fileName) => path.join(inputPath, fileName));
  } else {
    if (!inputStats.isFile() || path.extname(inputPath).toLowerCase() !== ".json") {
      throw new Error(`Input must be a directory or JSON shard file: ${inputPath}`);
    }
    if (path.basename(inputPath).toLowerCase() === "topics.json") {
      throw new Error(`The shared topic store is not a video-segment shard: ${inputPath}`);
    }
    filePaths = [inputPath];
  }

  return filePaths;
}

async function sortSegmentsInFile(filePath: string): Promise<FileSortResult> {
  const originalText = await readFile(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(originalText) as unknown;
  } catch (error) {
    throw new Error(`Could not parse video-segment shard ${filePath}.`, {cause: error});
  }

  const malformedTimestamps = collectMalformedTimestamps(parsed);
  let changed = false;

  if (malformedTimestamps.length === 0) {
    const data = parseCuratedVideoFile(parsed, `Video-segment shard ${filePath}`);
    const orderedSegments: OrderedSegment[] = data.segments
        .map((segment, originalIndex) => ({
          originalIndex,
          segment,
          startSeconds: startTimeToSeconds(segment.start),
        }))
        .sort((left, right) => (
            left.startSeconds - right.startSeconds
            || left.originalIndex - right.originalIndex
        ));
    changed = orderedSegments.some((entry, index) => entry.originalIndex !== index);

    if (changed) {
      const sortedData = {
        ...data,
        segments: orderedSegments.map((entry) => entry.segment),
      };
      await writeTextAtomically(filePath, `${JSON.stringify(sortedData, null, 2)}\n`);
    }

  }

  return {changed, malformedTimestamps};
}

export async function runSortVideoSegmentsByStart(
    inputPath = DEFAULT_INPUT,
    runtime: SortVideoSegmentsRuntime = {},
): Promise<SortVideoSegmentsResult> {
  const resolvedInputPath = path.resolve(inputPath);
  const stdout = runtime.stdout ?? ((text: string) => console.log(text));
  const stderr = runtime.stderr ?? ((text: string) => console.error(text));
  const jsonFiles = await resolveInputFiles(resolvedInputPath);
  let changedCount = 0;
  let failedCount = 0;
  let malformedFileCount = 0;
  let malformedTimestampCount = 0;

  for (const filePath of jsonFiles) {
    try {
      const result = await sortSegmentsInFile(filePath);
      if (result.malformedTimestamps.length > 0) {
        malformedFileCount += 1;
        malformedTimestampCount += result.malformedTimestamps.length;
        stderr(
            `Skipped, ${result.malformedTimestamps.length} malformed timestamp(s): ${filePath}`,
        );
        for (const finding of result.malformedTimestamps) {
          const segmentLabel = finding.segmentSlug.length > 0
              ? `segment ${finding.segmentNumber} (${finding.segmentSlug})`
              : `segment ${finding.segmentNumber}`;
          stderr(
              `  ${segmentLabel}, ${finding.field}=${finding.timestampValue}: ${finding.problem}`,
          );
        }
      } else if (result.changed) {
        changedCount += 1;
        stdout(`Sorted: ${filePath}`);
      } else {
        stdout(`Already sorted: ${filePath}`);
      }
    } catch (error) {
      failedCount += 1;
      stderr(`Failed: ${filePath}`);
      stderr(error instanceof Error ? error.stack ?? error.message : String(error));
    }
  }

  stdout(
      [
        `Finished. ${jsonFiles.length} JSON file(s) checked, ${changedCount} changed,`,
        `${malformedTimestampCount} malformed timestamp(s) in ${malformedFileCount} file(s),`,
        `${failedCount} other failure(s).`,
      ].join(" "),
  );
  const exitCode = malformedTimestampCount > 0 || failedCount > 0 ? 1 : 0;
  return {
    changedFileCount: changedCount,
    checkedFileCount: jsonFiles.length,
    exitCode,
    failedFileCount: failedCount,
    malformedFileCount,
    malformedTimestampCount,
  };
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
  const result = await runSortVideoSegmentsByStart(process.argv[2] ?? DEFAULT_INPUT);
  process.exitCode = result.exitCode;
}

if (isCliEntryPoint(import.meta.url, process.argv[1])) {
  await main();
}
