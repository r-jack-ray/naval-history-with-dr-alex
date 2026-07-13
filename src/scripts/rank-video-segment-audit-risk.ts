#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_SITE_CONTENT_PROCESSING_LOG,
  parseSiteContentProcessingLog,
} from "../content/site-content-processing-log.js";
import {
  analyzeVideoSegmentRisk,
  rankVideoSegmentAuditRisks,
  renderVideoSegmentAuditRiskTsv,
  type AuditSegment,
  type ProcessingState,
  type VideoSegmentAuditRiskRow,
} from "../content/video-segment-audit-risk.js";

interface ManifestTranscript {
  videoId: string;
  fileStem: string;
  videoTitle?: string;
  lastEndSeconds?: number;
  paths?: { txt?: string };
}

interface ProcessingConfig {
  firstPass?: { minimumEvidenceWindows?: number };
  liveStreamExtraction?: { explicitQaTitleMarkers?: string[] };
  videoTypeRules?: Array<{ matchTitle?: string; followUpStage?: string }>;
}

interface CliOptions {
  manifest: string;
  segmentsInput: string;
  transcriptRoot: string;
  processingLog: string;
  processingConfig: string;
  output: string;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const manifest = validateManifest(JSON.parse(await readFile(options.manifest, "utf8")) as unknown);
  const config = validateProcessingConfig(JSON.parse(await readFile(options.processingConfig, "utf8")) as unknown);
  const manifestByStem = uniqueMap(manifest, (item) => item.fileStem, "file stem");
  const manifestByVideoId = uniqueMap(manifest, (item) => item.videoId, "video ID");
  const processingLog = parseSiteContentProcessingLog(await readFile(options.processingLog, "utf8"), manifest);
  const processLogEntriesByFileStem = new Map<string, number>();
  for (const record of processingLog.records) {
    processLogEntriesByFileStem.set(record.fileStem, (processLogEntriesByFileStem.get(record.fileStem) ?? 0) + 1);
  }
  const shardNames = (await readdir(options.segmentsInput))
    .filter((name) => name.endsWith(".json") && name !== "topics.json")
    .sort();
  const rows: VideoSegmentAuditRiskRow[] = [];

  for (const shardName of shardNames) {
    const fileStem = shardName.slice(0, -".json".length);
    const shardPath = path.join(options.segmentsInput, shardName);
    const shardBytes = (await stat(shardPath)).size;
    let parsed: unknown;
    const structuralIssues: string[] = [];
    try {
      parsed = JSON.parse(await readFile(shardPath, "utf8")) as unknown;
    } catch (error: unknown) {
      structuralIssues.push(`invalid shard JSON: ${message(error)}`);
    }

    const root = isRecord(parsed) ? parsed : undefined;
    if (parsed !== undefined && root === undefined) structuralIssues.push("shard root must be a non-null object");
    if (root !== undefined && root.schemaVersion !== 1) structuralIssues.push("shard schemaVersion must be 1");
    const shardVideoId = root !== undefined && typeof root.videoId === "string" && /^[A-Za-z0-9_-]+$/u.test(root.videoId)
      ? root.videoId
      : undefined;
    if (root !== undefined && shardVideoId === undefined) structuralIssues.push("shard videoId must be a safe nonempty string");
    const segments = root !== undefined && Array.isArray(root.segments) ? root.segments as AuditSegment[] : [];
    if (root !== undefined && !Array.isArray(root.segments)) structuralIssues.push("shard segments must be an array");

    let manifestEntry = manifestByStem.get(fileStem);
    if (manifestEntry === undefined) {
      manifestEntry = shardVideoId === undefined ? undefined : manifestByVideoId.get(shardVideoId);
      structuralIssues.push(manifestEntry === undefined
        ? "orphan shard filename does not map to a manifest fileStem"
        : `noncanonical shard filename; expected ${manifestEntry.fileStem}.json`);
    }
    if (manifestEntry !== undefined && shardVideoId !== undefined && shardVideoId !== manifestEntry.videoId) {
      structuralIssues.push("shard videoId does not match the manifest record for its fileStem");
    }

    const canonicalStem = manifestEntry?.fileStem ?? fileStem;
    const transcriptPath = manifestEntry?.paths?.txt
      ? path.join(options.transcriptRoot, path.basename(manifestEntry.paths.txt))
      : path.join(options.transcriptRoot, `${canonicalStem}.txt`);
    const transcriptBytes = await fileSizeOrUndefined(transcriptPath);
    const videoTitle = manifestEntry?.videoTitle ?? fileStem;
    const state: ProcessingState = processingLog.latestByFileStem.get(canonicalStem)?.needsFurtherProcessing ?? "unknown";
    rows.push(analyzeVideoSegmentRisk({
      fileStem,
      filePath: contentRootPath(shardPath),
      videoId: manifestEntry?.videoId ?? shardVideoId ?? "unknown",
      videoTitle,
      canonicalSourcePath: contentRootPath(transcriptPath),
      processLogEntries: processLogEntriesByFileStem.get(canonicalStem) ?? 0,
      transcriptBytes,
      shardBytes,
      durationSeconds: manifestEntry?.lastEndSeconds,
      segments,
      needsFurtherProcessing: state,
      structuralIssues,
      qaExpected: isQaExpected(videoTitle, config),
      minimumEvidenceWindows: config.firstPass?.minimumEvidenceWindows ?? 1,
    }));
  }

  const rankedRows = rankVideoSegmentAuditRisks(rows);
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, renderVideoSegmentAuditRiskTsv(rankedRows), "utf8");
  const routeCounts = new Map<string, number>();
  for (const row of rankedRows) routeCounts.set(row.auditRoute, (routeCounts.get(row.auditRoute) ?? 0) + 1);
  const unknownStates = rankedRows.filter((row) => row.needsFurtherProcessing === "unknown").length;
  console.error([
    "Video segment audit risk ranking:",
    `shards=${rankedRows.length}`,
    `repair_required=${routeCounts.get("repair_required") ?? 0}`,
    `follow_up_required=${routeCounts.get("follow_up_required") ?? 0}`,
    `review_candidate=${routeCounts.get("review_candidate") ?? 0}`,
    `low_signal=${routeCounts.get("low_signal") ?? 0}`,
    `malformed_log_rows=${processingLog.malformedRowCount}`,
    `unmapped_log_rows=${processingLog.unmappedRowCount}`,
    `ignored_log_rows=${processingLog.ignoredRowCount}`,
    `unknown_processing_states=${unknownStates}`,
    `output=${options.output}`,
  ].join(" "));
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    manifest: "src/transcripts/manifest.json",
    segmentsInput: "src/derived/video-segments",
    transcriptRoot: "src/transcripts/txt",
    processingLog: DEFAULT_SITE_CONTENT_PROCESSING_LOG,
    processingConfig: "src/derived/site-content-processing.config.json",
    output: "reports/video-segment-audit-risk.tsv",
  };
  let processingLogSeen = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--manifest": options.manifest = readValue(args, ++index, arg); break;
      case "--segments-input": options.segmentsInput = readValue(args, ++index, arg); break;
      case "--transcript-root": options.transcriptRoot = readValue(args, ++index, arg); break;
      case "--processing-config": options.processingConfig = readValue(args, ++index, arg); break;
      case "--processing-log":
        if (processingLogSeen) throw new Error("--processing-log may be specified only once; only the canonical schema is supported.");
        processingLogSeen = true;
        options.processingLog = readValue(args, ++index, arg);
        break;
      case "--output": options.output = readValue(args, ++index, arg); break;
      case "--help":
      case "-h": printHelp(); process.exit(0); break;
      default: throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }
  return options;
}

function validateManifest(value: unknown): ManifestTranscript[] {
  if (!isRecord(value) || !Array.isArray(value.transcripts)) throw new Error("Transcript manifest must be an object with a transcripts array.");
  const records: ManifestTranscript[] = [];
  for (const [index, item] of value.transcripts.entries()) {
    if (!isRecord(item) || typeof item.videoId !== "string" || !/^[A-Za-z0-9_-]+$/u.test(item.videoId)
      || typeof item.fileStem !== "string" || item.fileStem.length === 0) {
      throw new Error(`Transcript manifest record ${index + 1} must have a safe videoId and nonempty fileStem.`);
    }
    const record: ManifestTranscript = { videoId: item.videoId, fileStem: item.fileStem };
    if (typeof item.videoTitle === "string") record.videoTitle = item.videoTitle;
    if (typeof item.lastEndSeconds === "number" && Number.isFinite(item.lastEndSeconds) && item.lastEndSeconds >= 0) {
      record.lastEndSeconds = item.lastEndSeconds;
    }
    if (isRecord(item.paths) && typeof item.paths.txt === "string") record.paths = { txt: item.paths.txt };
    records.push(record);
  }
  return records;
}

function validateProcessingConfig(value: unknown): ProcessingConfig {
  if (!isRecord(value)) throw new Error("Processing config must be a non-null object.");
  return value as ProcessingConfig;
}

function uniqueMap(records: ManifestTranscript[], key: (record: ManifestTranscript) => string, label: string): Map<string, ManifestTranscript> {
  const result = new Map<string, ManifestTranscript>();
  for (const record of records) {
    const value = key(record);
    if (result.has(value)) throw new Error(`Transcript manifest contains duplicate ${label}: ${value}`);
    result.set(value, record);
  }
  return result;
}

function isQaExpected(title: string, config: ProcessingConfig): boolean {
  const equivalents = ["Q&A", "Q & A", "Q/A", "Q and A", "Questions Answered", "Question and Answer"];
  const markers = [...equivalents, ...(config.liveStreamExtraction?.explicitQaTitleMarkers ?? [])];
  if (markers.some((marker) => normalizedTitle(title).includes(normalizedTitle(marker)))) return true;
  return (config.videoTypeRules ?? []).some((rule) =>
    typeof rule.matchTitle === "string"
    && normalizedTitle(title).includes(normalizedTitle(rule.matchTitle))
    && rule.followUpStage === "exhaustive-live-qa-review");
}

function normalizedTitle(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/gu, " ").trim();
}

async function fileSizeOrUndefined(filePath: string): Promise<number | undefined> {
  try { return (await stat(filePath)).size; } catch { return undefined; }
}

function contentRootPath(filePath: string): string {
  return path.relative(process.cwd(), path.resolve(filePath)).replaceAll(path.sep, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readValue(args: string[], index: number, name: string | undefined): string {
  const value = args[index];
  if (!value) throw new Error(`Missing value for ${name ?? "option"}.`);
  return value;
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function printHelp(): void {
  console.log(`Usage: npm run rank:video-segment-audit-risk -- [options]

Ranks existing per-video shards for repair or follow-up audit using processing state,
shard structure, timestamps, evidence metadata, and inexpensive warning heuristics.
It does not read transcript text, measure semantic completeness, or return calibrated probabilities.
Manifest transcripts with no shard remain in the existing unprocessed-file/backlog workflow.

Options:
  --manifest <path>          Transcript manifest (default: src/transcripts/manifest.json).
  --segments-input <path>    Per-video shard directory (default: src/derived/video-segments).
  --transcript-root <path>   Transcript TXT directory (default: src/transcripts/txt).
  --processing-log <path>    Canonical five-field processing log; may be specified once.
  --processing-config <path> Processing configuration for evidence and Q&A rules.
  --output <path>            TSV output (default: reports/video-segment-audit-risk.tsv).
  --help                     Show this help.
`);
}

main().catch((error: unknown) => {
  console.error(`Failed to rank video segment audit risk: ${message(error)}`);
  process.exitCode = 1;
});
