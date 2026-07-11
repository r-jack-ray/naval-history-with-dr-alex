#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  analyzeVideoSegment,
  rankVideoSegmentAudits,
  renderVideoSegmentAuditTsv,
  type AuditSegment,
  type VideoSegmentAuditInput,
} from "../content/video-segment-audit-analysis.js";

interface ManifestTranscript {
  videoId: string;
  fileStem: string;
  videoTitle?: string;
  lastEndSeconds?: number;
  paths?: { txt?: string };
}

interface TranscriptManifest {
  transcripts: ManifestTranscript[];
}

interface ProcessingState {
  timestamp: number;
  needsFurtherProcessing: "yes" | "no";
}

interface CliOptions {
  manifest: string;
  segmentsInput: string;
  transcriptRoot: string;
  processingLogs: string[];
  output: string;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(options.manifest, "utf8")) as TranscriptManifest;
  const manifestByStem = new Map(manifest.transcripts.map((item) => [item.fileStem, item]));
  const manifestByVideoId = new Map(manifest.transcripts.map((item) => [item.videoId, item]));
  const processingStates = await readProcessingStates(options.processingLogs);
  const shardNames = (await readdir(options.segmentsInput))
    .filter((name) => name.endsWith(".json") && name !== "topics.json")
    .sort();
  const rows = [];

  for (const shardName of shardNames) {
    const fileStem = shardName.slice(0, -".json".length);
    const shardPath = path.join(options.segmentsInput, shardName);
    const shardBytes = (await stat(shardPath)).size;
    let parsed: { videoId?: unknown; segments?: unknown } = {};
    let parseError: string | undefined;

    try {
      parsed = JSON.parse(await readFile(shardPath, "utf8")) as typeof parsed;
    } catch (error: unknown) {
      parseError = error instanceof Error ? error.message : String(error);
    }

    const shardVideoId = typeof parsed.videoId === "string" ? parsed.videoId : undefined;
    const manifestEntry = manifestByStem.get(fileStem) ?? (shardVideoId ? manifestByVideoId.get(shardVideoId) : undefined);
    const videoId = manifestEntry?.videoId ?? shardVideoId ?? "unknown";
    const transcriptPath = manifestEntry?.paths?.txt
      ? path.join(options.transcriptRoot, path.basename(manifestEntry.paths.txt))
      : path.join(options.transcriptRoot, `${fileStem}.txt`);
    const transcriptBytes = await fileSizeOrUndefined(transcriptPath);
    const input: VideoSegmentAuditInput = {
      fileStem,
      videoId,
      videoTitle: manifestEntry?.videoTitle ?? fileStem,
      transcriptBytes,
      shardBytes,
      durationSeconds: manifestEntry?.lastEndSeconds,
      segments: Array.isArray(parsed.segments) ? (parsed.segments as AuditSegment[]) : [],
      needsFurtherProcessing: processingStates.get(videoId)?.needsFurtherProcessing ?? "unknown",
      shardVideoId,
      parseError,
    };
    rows.push(analyzeVideoSegment(input));
  }

  const rankedRows = rankVideoSegmentAudits(rows);
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, renderVideoSegmentAuditTsv(rankedRows), "utf8");

  const critical = rankedRows.filter((row) => row.priority === "critical").length;
  const high = rankedRows.filter((row) => row.priority === "high").length;
  console.error(
    `Video segment audit analysis: shards=${rankedRows.length} critical=${critical} high=${high} output=${options.output}`,
  );
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    manifest: "src/transcripts/manifest.json",
    segmentsInput: "src/derived/video-segments",
    transcriptRoot: "src/transcripts/txt",
    processingLogs: [],
    output: "reports/video-segment-audit-probabilities.tsv",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--manifest":
        options.manifest = readValue(args, ++index, arg);
        break;
      case "--segments-input":
        options.segmentsInput = readValue(args, ++index, arg);
        break;
      case "--transcript-root":
        options.transcriptRoot = readValue(args, ++index, arg);
        break;
      case "--processing-log":
        options.processingLogs.push(readValue(args, ++index, arg));
        break;
      case "--output":
        options.output = readValue(args, ++index, arg);
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

async function readProcessingStates(explicitPaths: string[]): Promise<Map<string, ProcessingState>> {
  const logPaths = explicitPaths.length > 0 ? explicitPaths : await findDefaultProcessingLogs();
  const states = new Map<string, ProcessingState>();

  for (const logPath of logPaths) {
    let text: string;
    try {
      text = await readFile(logPath, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/u)) {
      const fields = line.split("\t");
      const timestampText = fields[0];
      const videoId = fields[2];
      const needsFurtherProcessing = fields[4];
      if (!timestampText || !videoId || (needsFurtherProcessing !== "yes" && needsFurtherProcessing !== "no")) continue;
      const timestamp = Date.parse(timestampText);
      if (!Number.isFinite(timestamp)) continue;
      const previous = states.get(videoId);
      if (!previous || timestamp >= previous.timestamp) {
        states.set(videoId, { timestamp, needsFurtherProcessing });
      }
    }
  }

  return states;
}

async function findDefaultProcessingLogs(): Promise<string[]> {
  const derivedDir = "src/derived";
  try {
    return (await readdir(derivedDir))
      .filter((name) => /^site-content-processing.*\.log$/u.test(name))
      .map((name) => path.join(derivedDir, name));
  } catch {
    return [];
  }
}

async function fileSizeOrUndefined(filePath: string): Promise<number | undefined> {
  try {
    return (await stat(filePath)).size;
  } catch {
    return undefined;
  }
}

function readValue(args: string[], index: number, name: string): string {
  const value = args[index];
  if (!value) throw new Error(`Missing value for ${name}.`);
  return value;
}

function printHelp(): void {
  console.log(`Usage: npm run analyze:video-segment-audit -- [options]

Ranks generated per-video shards by a heuristic probability that they need content auditing.
The score is not statistically calibrated; use it to prioritize human review.

Options:
  --manifest <path>        Transcript manifest (default: src/transcripts/manifest.json).
  --segments-input <path>  Generated shard directory (default: src/derived/video-segments).
  --transcript-root <path> Transcript TXT directory (default: src/transcripts/txt).
  --processing-log <path>  Processing log to consult; repeat to use multiple logs.
  --output <path>          TSV output (default: reports/video-segment-audit-probabilities.tsv).
  --help                   Show this help.
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to analyze video segment audit probability: ${message}`);
  process.exitCode = 1;
});
