#!/usr/bin/env node
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseSiteContentProcessingConfig, type SiteContentProcessingConfig, validateCuratedVideoFile, } from "../content/schemas/index.js";
import { DEFAULT_SITE_CONTENT_PROCESSING_LOG, parseSiteContentProcessingLog, } from "../content/site-content-processing-log.js";
import {
  analyzeVideoSegmentRisk,
  type AuditSegment,
  type QaExpectation,
  rankVideoSegmentAuditRisks,
  renderVideoSegmentAuditRiskTsv,
  type VideoSegmentAuditRiskRow,
} from "../content/video-segment-audit-risk.js";

interface ManifestTranscript {
  videoId: string;
  fileStem: string;
  videoTitle?: string;
  firstStartSeconds?: number;
  lastEndSeconds?: number;
  paths?: { txt?: string };
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
  const config = parseSiteContentProcessingConfig(
      JSON.parse(await readFile(options.processingConfig, "utf8")) as unknown,
      `Processing config ${options.processingConfig}`,
  );
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
  let excludedSascShards = 0;
  let excludedEmptyShards = 0;

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
    if (parsed !== undefined && root === undefined) {
      structuralIssues.push("shard root must be a non-null object");
    }
    if (root !== undefined) {
      const schemaValidation = validateCuratedVideoFile(root);
      if (!schemaValidation.success) {
        structuralIssues.push(...schemaValidation.issues.map((issue) => `shard schema ${issue}`));
      }
    }
    const shardVideoId = root !== undefined && typeof root.videoId === "string" && /^[A-Za-z0-9_-]+$/u.test(root.videoId)
        ? root.videoId
        : undefined;
    const segments = root !== undefined && Array.isArray(root.segments) ? root.segments as AuditSegment[] : [];

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
    const videoTitle = manifestEntry?.videoTitle ?? fileStem;
    if (isSascShard(fileStem, canonicalStem, videoTitle)) {
      excludedSascShards += 1;
      continue;
    }
    if (segments.length === 0) {
      excludedEmptyShards += 1;
      if (structuralIssues.length > 0) {
        console.warn(`Excluded shard with an empty or unreadable segment array ${shardName}: ${structuralIssues.join("; ")}`);
      }
      continue;
    }
    const transcriptPath = manifestEntry?.paths?.txt
        ? path.join(options.transcriptRoot, path.basename(manifestEntry.paths.txt))
        : path.join(options.transcriptRoot, `${canonicalStem}.txt`);
    const transcriptBytes = await fileSizeOrUndefined(transcriptPath);
    const latestProcessingRecord = processingLog.latestByFileStem.get(canonicalStem);
    rows.push(analyzeVideoSegmentRisk({
      fileStem,
      filePath: path.basename(shardPath),
      videoId: manifestEntry?.videoId ?? shardVideoId ?? "unknown",
      videoTitle,
      canonicalSourcePath: contentRootPath(transcriptPath),
      processLogEntries: processLogEntriesByFileStem.get(canonicalStem) ?? 0,
      transcriptBytes,
      shardBytes,
      ...(manifestEntry?.firstStartSeconds === undefined ? {} : {transcriptStartSeconds: manifestEntry.firstStartSeconds}),
      durationSeconds: manifestEntry?.lastEndSeconds,
      segments,
      structuralIssues,
      qaExpectation: qaExpectationFor(videoTitle, config),
      minimumEvidenceWindows: config.firstPass.minimumEvidenceWindows,
      ...(latestProcessingRecord === undefined ? {} : {latestProcessingRecord}),
    }));
  }

  const rankedRows = rankVideoSegmentAuditRisks(rows);
  await mkdir(path.dirname(options.output), {recursive: true});
  await writeFile(options.output, renderVideoSegmentAuditRiskTsv(rankedRows), "utf8");
  const routeCounts = new Map<string, number>();
  for (const row of rankedRows) {
    routeCounts.set(row.auditRoute, (routeCounts.get(row.auditRoute) ?? 0) + 1);
  }
  const errorCount = routeCounts.get("repair_required") ?? 0;
  const warningCount = routeCounts.get("review_candidate") ?? 0;
  const summary = [
    "Video segment audit risk ranking:",
    `shards=${rankedRows.length}`,
    `excluded_sasc_shards=${excludedSascShards}`,
    `excluded_empty_shards=${excludedEmptyShards}`,
    `repair_required=${errorCount}`,
    `review_candidate=${warningCount}`,
    `low_signal=${routeCounts.get("low_signal") ?? 0}`,
    `errors=${errorCount}`,
    `warnings=${warningCount}`,
    `malformed_log_rows=${processingLog.malformedRowCount}`,
    `unmapped_log_rows=${processingLog.unmappedRowCount}`,
    `ignored_log_rows=${processingLog.ignoredRowCount}`,
    `report=${path.basename(options.output)}`,
    `output=${options.output}`,
  ].join(" ");
  if (errorCount > 0) {
    console.error(summary);
  } else if (warningCount > 0) {
    console.warn(summary);
  } else {
    console.log(summary);
  }
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
    case "--manifest":
      options.manifest = readValue(args, ++index, arg);
      break;
    case "--segments-input":
      options.segmentsInput = readValue(args, ++index, arg);
      break;
    case "--transcript-root":
      options.transcriptRoot = readValue(args, ++index, arg);
      break;
    case "--processing-config":
      options.processingConfig = readValue(args, ++index, arg);
      break;
    case "--processing-log":
      if (processingLogSeen) {
        throw new Error("--processing-log may be specified only once; only the canonical schema is supported.");
      }
      processingLogSeen = true;
      options.processingLog = readValue(args, ++index, arg);
      break;
    case "--output":
      options.output = readValue(args, ++index, arg);
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
  return options;
}

function validateManifest(value: unknown): ManifestTranscript[] {
  if (!isRecord(value) || !Array.isArray(value.transcripts)) {
    throw new Error("Transcript manifest must be an object with a transcripts array.");
  }
  const records: ManifestTranscript[] = [];
  for (const [index, item] of value.transcripts.entries()) {
    if (!isRecord(item) || typeof item.videoId !== "string" || !/^[A-Za-z0-9_-]+$/u.test(item.videoId)
        || typeof item.fileStem !== "string" || item.fileStem.length === 0) {
      throw new Error(`Transcript manifest record ${index + 1} must have a safe videoId and nonempty fileStem.`);
    }
    const record: ManifestTranscript = {videoId: item.videoId, fileStem: item.fileStem};
    if (typeof item.videoTitle === "string") {
      record.videoTitle = item.videoTitle;
    }
    if (typeof item.firstStartSeconds === "number" && Number.isFinite(item.firstStartSeconds) && item.firstStartSeconds >= 0) {
      record.firstStartSeconds = item.firstStartSeconds;
    }
    if (typeof item.lastEndSeconds === "number" && Number.isFinite(item.lastEndSeconds) && item.lastEndSeconds >= 0) {
      record.lastEndSeconds = item.lastEndSeconds;
    }
    if (isRecord(item.paths) && typeof item.paths.txt === "string") {
      record.paths = {txt: item.paths.txt};
    }
    records.push(record);
  }
  return records;
}

function uniqueMap(records: ManifestTranscript[], key: (record: ManifestTranscript) => string, label: string): Map<string, ManifestTranscript> {
  const result = new Map<string, ManifestTranscript>();
  for (const record of records) {
    const value = key(record);
    if (result.has(value)) {
      throw new Error(`Transcript manifest contains duplicate ${label}: ${value}`);
    }
    result.set(value, record);
  }
  return result;
}

function qaExpectationFor(title: string, config: SiteContentProcessingConfig): QaExpectation {
  const equivalents = ["Q&A", "Q & A", "Q/A", "Q and A", "Questions Answered", "Question and Answer"];
  const markers = [...equivalents, ...config.liveStreamExtraction.explicitQaTitleMarkers];
  if (markers.some((marker) => normalizedTitle(title).includes(normalizedTitle(marker)))) {
    return "explicit_title";
  }
  const configured = config.videoTypeRules.some((rule) =>
      normalizedTitle(title).includes(normalizedTitle(rule.matchTitle))
      && rule.followUpStage === "exhaustive-live-qa-review");
  return configured ? "configured_video_type" : "none";
}

function isSascShard(...identifiers: string[]): boolean {
  return identifiers.some((identifier) => /(^|[^a-z0-9])sasc([^a-z0-9]|$)/iu.test(identifier));
}

function normalizedTitle(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/gu, " ").trim();
}

async function fileSizeOrUndefined(filePath: string): Promise<number | undefined> {
  try {
    return (await stat(filePath)).size;
  } catch {
    return undefined;
  }
}

function contentRootPath(filePath: string): string {
  return path.relative(process.cwd(), path.resolve(filePath)).replaceAll(path.sep, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readValue(args: string[], index: number, name: string | undefined): string {
  const value = args[index];
  if (!value) {
    throw new Error(`Missing value for ${name ?? "option"}.`);
  }
  return value;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function printHelp(): void {
  console.log(`Usage: npm run report:video-segment-audit-risk -- [options]

Ranks existing per-video shards by deterministic repair needs and current metadata
that can indicate value from another substantive transcript-backed audit.
SASC school-function shards and shards with empty or unreadable segment arrays are excluded.
Malformed excluded shards are identified on stderr; this report is not a replacement for source validation.
It does not read transcript text, measure semantic completeness, or return calibrated probabilities.
The former Audit Risk Score and processing-log-count tie-break have been removed.
Largest evidence gaps are measured between the union of valid, source-matching evidence
ranges, including leading and trailing gaps. Citations without an end are points.
Gap metrics are blank when the transcript file or usable interval is unavailable.
Routes sort repair_required, review_candidate, then low_signal. Within a route,
defined evidence-gap minutes sort descending, then gap percentage, then file stem.
The console summary reports error and warning counts with the TSV filename. It uses
stderr for repair-required rows and the warning stream for review candidates.
Transcript Bytes Per Minute divides transcript file bytes by the unrounded duration
in minutes, with two decimal places; unavailable bytes or duration leave it blank.
Anchor gaps, transcript byte density, log counts, and latest outcomes are display context only.
The latest record follows physical append order, including blocked or unchanged audits.
Read its result and notes, then spot-check the reported range before selecting work:
gaps may contain personal material, silence, or other deliberately excluded content.
Old saturation does not exclude a shard from stronger-model or improved-method review.
Manifest transcripts without a canonical shard remain visible through npm run audit:site-content.

Options:
  --manifest <path>          Transcript manifest (default: src/transcripts/manifest.json).
  --segments-input <path>    Per-video shard directory (default: src/derived/video-segments).
  --transcript-root <path>   Transcript TXT directory (default: src/transcripts/txt).
  --processing-log <path>    Canonical four-field processing log; may be specified once.
  --processing-config <path> Processing configuration for evidence and Q&A rules.
  --output <path>            TSV output (default: reports/video-segment-audit-risk.tsv).
  --help                     Show this help.
`);
}

main().catch((error: unknown) => {
  console.error(`Failed to rank video segment audit risk: ${message(error)}`);
  process.exitCode = 1;
});
