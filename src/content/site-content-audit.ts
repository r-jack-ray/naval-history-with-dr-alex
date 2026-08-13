import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

import { segmentKinds } from "../index.js";
import { writeTextAtomically } from "../pipeline/atomic-write.js";
import { loadCuratedArchiveSeed, } from "../site/curated-seed.js";
import type { CuratedArchiveSeed } from "./curated-archive-model.js";
import { type CuratedSegmentSeed, type SiteContentProcessingConfig, validateSiteContentProcessingConfig, } from "./schemas/index.js";
import { parseSiteContentProcessingLog, } from "./site-content-processing-log.js";

export const defaultSiteContentAuditManifest = "src/transcripts/manifest.json";
export const defaultSiteContentAuditSegmentsInput = "src/derived/video-segments";
export const defaultSiteContentProcessingLog = "src/derived/site-content-processing.log";
export const defaultSiteContentProcessingConfig = "src/derived/site-content-processing.config.json";
export const defaultSiteContentAuditOutput = "reports/site-content-backlog.md";

export interface AuditSiteContentOptions {
  manifestPath: string;
  segmentsInput: string;
  processingLog: string;
  processingConfig?: string;
  output?: string;
  limit: number;
}

export interface SiteContentAudit {
  stats: {
    storedTranscriptCount: number;
    seededVideoCount: number;
    curatedSegmentCount: number;
    videosWithSegmentsCount: number;
    uncuratedStoredTranscriptCount: number;
    processingLogEntryCount: number;
    errorCount: number;
    warningCount: number;
  };
  issues: SiteContentAuditIssue[];
  uncuratedTranscripts: SiteContentBacklogItem[];
}

export interface SiteContentAuditIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  videoId?: string;
  segmentId?: string;
  path?: string;
}

export interface SiteContentBacklogItem {
  videoId: string;
  title: string;
  videoDateAt?: string;
  transcriptPath?: string;
  segmentCount?: number;
  durationSeconds?: number;
}

export interface TranscriptManifest {
  transcripts: TranscriptManifestRecord[];
}

export interface TranscriptManifestRecord {
  videoId: string;
  fileStem?: string;
  videoTitle?: string;
  videoDateAt?: string;
  segmentCount?: number;
  firstStartSeconds?: number;
  lastEndSeconds?: number;
  paths?: {
    json?: string;
    txt?: string;
  };
}

export async function auditSiteContent(options: AuditSiteContentOptions): Promise<SiteContentAudit> {
  const processingConfigPath = options.processingConfig ?? defaultSiteContentProcessingConfig;
  const [manifest, seed, processingConfig] = await Promise.all([
    readJson<TranscriptManifest>(options.manifestPath),
    loadCuratedArchiveSeed(options.segmentsInput),
    readJson<unknown>(processingConfigPath),
  ]);
  const processingLogText = await readOptionalText(options.processingLog);
  const audit = buildSiteContentAudit({
    manifest,
    seed,
    processingConfig,
    processingConfigPath,
    processingLogText,
    processingLogPath: options.processingLog,
    rootDir: process.cwd(),
    transcriptRoot: dirname(options.manifestPath),
    limit: options.limit,
    fileExists: fileExistsSync,
  });

  if (options.output !== undefined) {
    await writeAuditReport(options.output, audit);
  }

  return audit;
}

export function buildSiteContentAudit(input: {
  manifest: TranscriptManifest;
  seed: CuratedArchiveSeed;
  processingConfig?: unknown;
  processingConfigPath?: string;
  processingLogText?: string;
  processingLogPath?: string;
  rootDir: string;
  transcriptRoot: string;
  limit: number;
  fileExists: (path: string) => boolean;
}): SiteContentAudit {
  const issues: SiteContentAuditIssue[] = [];
  const manifestByVideoId = new Map<string, TranscriptManifestRecord>();
  const seedVideoIds = new Set(input.seed.videos.map((video) => video.videoId));
  const segmentVideoIds = new Set<string>();
  const allowedKinds = new Set<string>(segmentKinds);
  const processingConfig = input.processingConfig === undefined
      ? undefined
      : processingConfigForAudit(
          input.processingConfig,
          input.processingConfigPath ?? defaultSiteContentProcessingConfig,
          issues,
      );
  const minimumEvidenceWindows = processingConfig?.firstPass.minimumEvidenceWindows ?? 1;
  const processingLog = validateProcessingLog(input, issues);

  for (const record of input.manifest.transcripts) {
    if (manifestByVideoId.has(record.videoId)) {
      issues.push({
        severity: "error",
        code: "duplicate-transcript-record",
        message: `Transcript manifest has duplicate video ID ${record.videoId}.`,
        videoId: record.videoId,
      });
      continue;
    }
    manifestByVideoId.set(record.videoId, record);
  }

  for (const segment of input.seed.segments) {
    segmentVideoIds.add(segment.videoId);
    validateSegment(segment, manifestByVideoId.get(segment.videoId), input, issues, allowedKinds, minimumEvidenceWindows);
  }

  const uncuratedTranscriptRecords = input.manifest.transcripts
      .filter((record) => !seedVideoIds.has(record.videoId))
      .sort(compareTranscriptRecords);
  const uncuratedTranscripts = uncuratedTranscriptRecords
      .slice(0, input.limit)
      .map((record) => backlogItem(record, input.transcriptRoot));

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;

  return {
    stats: {
      storedTranscriptCount: input.manifest.transcripts.length,
      seededVideoCount: input.seed.videos.length,
      curatedSegmentCount: input.seed.segments.length,
      videosWithSegmentsCount: segmentVideoIds.size,
      uncuratedStoredTranscriptCount: uncuratedTranscriptRecords.length,
      processingLogEntryCount: processingLog.entryCount,
      errorCount,
      warningCount,
    },
    issues,
    uncuratedTranscripts,
  };
}

export function renderSiteContentAuditReport(audit: SiteContentAudit): string {
  const lines = [
    "# Site Content Backlog",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Stored transcripts: ${audit.stats.storedTranscriptCount}`,
    `- Seeded site videos: ${audit.stats.seededVideoCount}`,
    `- Curated segments: ${audit.stats.curatedSegmentCount}`,
    `- Videos with curated segments: ${audit.stats.videosWithSegmentsCount}`,
    `- Stored transcripts without a canonical shard: ${audit.stats.uncuratedStoredTranscriptCount}`,
    `- Processing log entries: ${audit.stats.processingLogEntryCount}`,
    `- Errors: ${audit.stats.errorCount}`,
    `- Warnings: ${audit.stats.warningCount}`,
    "",
    "## Issues",
    "",
  ];

  if (audit.issues.length === 0) {
    lines.push("No curation issues found.", "");
  } else {
    for (const issue of audit.issues) {
      const context = [
        issue.videoId ? `video=${issue.videoId}` : undefined,
        issue.segmentId ? `segment=${issue.segmentId}` : undefined,
        issue.path ? `path=${issue.path}` : undefined,
      ].filter((value): value is string => value !== undefined);
      lines.push(`- ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}${context.length ? ` (${context.join(", ")})` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Next Uncurated Stored Transcripts", "");
  if (audit.uncuratedTranscripts.length === 0) {
    lines.push("No uncurated stored transcripts found.", "");
  } else {
    for (const item of audit.uncuratedTranscripts) {
      lines.push(`- ${item.title} (${item.videoId})`);
      if (item.videoDateAt !== undefined) {
        lines.push(`  - Date: ${item.videoDateAt}`);
      }
      if (item.transcriptPath !== undefined) {
        lines.push(`  - TXT: ${item.transcriptPath}`);
      }
      if (item.durationSeconds !== undefined || item.segmentCount !== undefined) {
        lines.push(`  - Transcript rows: ${item.segmentCount ?? "unknown"}; duration seconds: ${item.durationSeconds ?? "unknown"}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function writeAuditReport(output: string, audit: SiteContentAudit): Promise<void> {
  await writeTextAtomically(output, renderSiteContentAuditReport(audit));
}

function validateSegment(
    segment: CuratedSegmentSeed,
    transcript: TranscriptManifestRecord | undefined,
    input: {
      rootDir: string;
      transcriptRoot: string;
      fileExists: (path: string) => boolean;
    },
    issues: SiteContentAuditIssue[],
    allowedKinds: ReadonlySet<string>,
    minimumEvidenceWindows: number,
): void {
  if (!allowedKinds.has(segment.kind)) {
    issues.push({
      severity: "error",
      code: "unsupported-segment-kind",
      message: `Segment kind ${segment.kind} is not supported.`,
      videoId: segment.videoId,
      segmentId: segment.id,
    });
  }

  const startSeconds = timestampSeconds(segment.start);
  const endSeconds = segment.end === undefined ? undefined : timestampSeconds(segment.end);
  if (startSeconds === undefined) {
    issues.push({
      severity: "error",
      code: "invalid-segment-start",
      message: `Segment start timestamp is invalid: ${segment.start}.`,
      videoId: segment.videoId,
      segmentId: segment.id,
    });
  }
  if (segment.end !== undefined && endSeconds === undefined) {
    issues.push({
      severity: "error",
      code: "invalid-segment-end",
      message: `Segment end timestamp is invalid: ${segment.end}.`,
      videoId: segment.videoId,
      segmentId: segment.id,
    });
  }
  if (startSeconds !== undefined && endSeconds !== undefined && endSeconds <= startSeconds) {
    issues.push({
      severity: "error",
      code: "segment-end-before-start",
      message: "Segment end must be after start.",
      videoId: segment.videoId,
      segmentId: segment.id,
    });
  }

  if (transcript === undefined) {
    issues.push({
      severity: "error",
      code: "missing-transcript-record",
      message: "Curated segment references a video without a stored transcript manifest record.",
      videoId: segment.videoId,
      segmentId: segment.id,
    });
  } else {
    validateTranscriptRange(segment, transcript, startSeconds, endSeconds, issues);
  }

  validateSourcePath(segment, transcript, input, issues);
  validateEvidence(segment, transcript, issues, minimumEvidenceWindows);
  validateQuestionFields(segment, issues);
}

function validateTranscriptRange(
    segment: CuratedSegmentSeed,
    transcript: TranscriptManifestRecord,
    startSeconds: number | undefined,
    endSeconds: number | undefined,
    issues: SiteContentAuditIssue[],
): void {
  const lastEndSeconds = transcript.lastEndSeconds;
  if (lastEndSeconds === undefined) {
    return;
  }

  if (startSeconds !== undefined && startSeconds > lastEndSeconds + 2) {
    issues.push({
      severity: "error",
      code: "segment-start-outside-transcript",
      message: `Segment starts after transcript end (${lastEndSeconds}s).`,
      videoId: segment.videoId,
      segmentId: segment.id,
    });
  }
  if (endSeconds !== undefined && endSeconds > lastEndSeconds + 2) {
    issues.push({
      severity: "error",
      code: "segment-end-outside-transcript",
      message: `Segment ends after transcript end (${lastEndSeconds}s).`,
      videoId: segment.videoId,
      segmentId: segment.id,
    });
  }
}

function validateSourcePath(
    segment: CuratedSegmentSeed,
    transcript: TranscriptManifestRecord | undefined,
    input: {
      rootDir: string;
      transcriptRoot: string;
      fileExists: (path: string) => boolean;
    },
    issues: SiteContentAuditIssue[],
): void {
  if (segment.sourcePath === undefined) {
    issues.push({
      severity: "error",
      code: "missing-source-path",
      message: "Curated segment must include sourcePath for transcript-backed review.",
      videoId: segment.videoId,
      segmentId: segment.id,
    });
    return;
  }

  const resolvedSourcePath = resolveRepoPath(input.rootDir, segment.sourcePath);
  if (!input.fileExists(resolvedSourcePath)) {
    issues.push({
      severity: "error",
      code: "source-path-not-found",
      message: "Curated segment sourcePath does not exist.",
      videoId: segment.videoId,
      segmentId: segment.id,
      path: segment.sourcePath,
    });
  }

  const manifestTxtPath = manifestTxtRepoPath(transcript, input.transcriptRoot);
  if (manifestTxtPath !== undefined && normalizePath(segment.sourcePath) !== manifestTxtPath) {
    issues.push({
      severity: "warning",
      code: "source-path-differs-from-manifest",
      message: "Curated segment sourcePath differs from the manifest TXT path for this video.",
      videoId: segment.videoId,
      segmentId: segment.id,
      path: segment.sourcePath,
    });
  }
}

function validateEvidence(
    segment: CuratedSegmentSeed,
    transcript: TranscriptManifestRecord | undefined,
    issues: SiteContentAuditIssue[],
    minimumEvidenceWindows: number,
): void {
  const evidenceWindowCount = segment.evidence?.length ?? 0;
  if (evidenceWindowCount < minimumEvidenceWindows) {
    issues.push({
      severity: "error",
      code: evidenceWindowCount === 0 ? "missing-evidence-window" : "insufficient-evidence-windows",
      message: `Curated segment must include at least ${minimumEvidenceWindows} transcript evidence ${minimumEvidenceWindows === 1 ? "window" : "windows"}.`,
      videoId: segment.videoId,
      segmentId: segment.id,
    });
  }

  if (segment.evidence === undefined || segment.evidence.length === 0) {
    return;
  }

  for (const evidence of segment.evidence) {
    const evidenceStart = timestampSeconds(evidence.start);
    const evidenceEnd = evidence.end === undefined ? undefined : timestampSeconds(evidence.end);
    if (evidenceStart === undefined) {
      issues.push({
        severity: "error",
        code: "invalid-evidence-start",
        message: `Evidence start timestamp is invalid: ${evidence.start}.`,
        videoId: segment.videoId,
        segmentId: segment.id,
      });
    }
    if (evidence.end !== undefined && evidenceEnd === undefined) {
      issues.push({
        severity: "error",
        code: "invalid-evidence-end",
        message: `Evidence end timestamp is invalid: ${evidence.end}.`,
        videoId: segment.videoId,
        segmentId: segment.id,
      });
    }
    if (evidenceStart !== undefined && evidenceEnd !== undefined && evidenceEnd <= evidenceStart) {
      issues.push({
        severity: "error",
        code: "evidence-end-before-start",
        message: "Evidence end must be after start.",
        videoId: segment.videoId,
        segmentId: segment.id,
      });
    }
    if (transcript?.lastEndSeconds !== undefined && evidenceStart !== undefined && evidenceStart > transcript.lastEndSeconds + 2) {
      issues.push({
        severity: "error",
        code: "evidence-start-outside-transcript",
        message: `Evidence starts after transcript end (${transcript.lastEndSeconds}s).`,
        videoId: segment.videoId,
        segmentId: segment.id,
      });
    }
  }
}

function validateQuestionFields(segment: CuratedSegmentSeed, issues: SiteContentAuditIssue[]): void {
  const hasQuestion = "question" in segment && segment.question !== undefined;
  const hasAnswerShort = "answerShort" in segment && segment.answerShort !== undefined;

  if (segment.kind === "qa" && (!hasQuestion || !hasAnswerShort)) {
    issues.push({
      severity: "error",
      code: "qa-missing-question-fields",
      message: "Q&A segments must include question and answerShort.",
      videoId: segment.videoId,
      segmentId: segment.id,
    });
  }

  if (segment.kind !== "qa" && (hasQuestion || hasAnswerShort)) {
    issues.push({
      severity: "warning",
      code: "non-qa-question-fields",
      message: "Non-Q&A segment includes question-specific fields.",
      videoId: segment.videoId,
      segmentId: segment.id,
    });
  }
}

function processingConfigForAudit(
    value: unknown,
    path: string,
    issues: SiteContentAuditIssue[],
): SiteContentProcessingConfig | undefined {
  const result = validateSiteContentProcessingConfig(value);
  if (result.success) {
    return result.data;
  }
  for (const schemaIssue of result.issues) {
    issues.push({
      severity: "error",
      code: "processing-config-invalid",
      message: `Site content processing config ${schemaIssue}.`,
      path,
    });
  }
  return undefined;
}

interface ProcessingLogAudit {
  entryCount: number;
}

function validateProcessingLog(
    input: {
      manifest: TranscriptManifest;
      processingLogText?: string;
      processingLogPath?: string;
      rootDir: string;
      fileExists: (path: string) => boolean;
    },
    issues: SiteContentAuditIssue[],
): ProcessingLogAudit {
  const processingLogPath = input.processingLogPath ?? "processing log";
  if (input.processingLogText === undefined || input.processingLogText.trim().length === 0) {
    return {entryCount: 0};
  }
  let parsed;
  try {
    parsed = parseSiteContentProcessingLog(input.processingLogText, input.manifest.transcripts);
  } catch (error: unknown) {
    issues.push({
      severity: "error",
      code: "processing-log-invalid-header",
      message: error instanceof Error ? error.message : String(error),
      path: processingLogPath,
    });
    return {entryCount: 0};
  }
  for (const problem of parsed.problems) {
    issues.push({severity: "error", code: problem.code, message: problem.message, path: processingLogPath});
  }
  for (const record of parsed.records) {
    if (!input.fileExists(resolveRepoPath(input.rootDir, record.shardPath))) {
      issues.push({
        severity: "error",
        code: "processing-log-shard-not-found",
        message: `Processing log line ${record.lineNumber} references a missing shard path.`,
        path: record.shardPath,
      });
    }
  }

  return {
    entryCount: parsed.records.length,
  };
}

function backlogItem(record: TranscriptManifestRecord, transcriptRoot: string): SiteContentBacklogItem {
  const item: SiteContentBacklogItem = {
    videoId: record.videoId,
    title: record.videoTitle ?? record.videoId,
  };
  if (record.videoDateAt !== undefined) {
    item.videoDateAt = record.videoDateAt;
  }
  const txtPath = manifestTxtRepoPath(record, transcriptRoot);
  if (txtPath !== undefined) {
    item.transcriptPath = txtPath;
  }
  if (record.segmentCount !== undefined) {
    item.segmentCount = record.segmentCount;
  }
  if (record.lastEndSeconds !== undefined) {
    item.durationSeconds = record.lastEndSeconds;
  }
  return item;
}

function compareTranscriptRecords(left: TranscriptManifestRecord, right: TranscriptManifestRecord): number {
  const rightDate = right.videoDateAt ?? "";
  const leftDate = left.videoDateAt ?? "";
  const dateCompare = rightDate.localeCompare(leftDate);
  return dateCompare === 0 ? left.videoId.localeCompare(right.videoId) : dateCompare;
}

function manifestTxtRepoPath(record: TranscriptManifestRecord | undefined, transcriptRoot: string): string | undefined {
  const txtPath = record?.paths?.txt;
  return txtPath === undefined ? undefined : normalizePath(join(transcriptRoot, txtPath));
}

function resolveRepoPath(rootDir: string, value: string): string {
  return isAbsolute(value) ? value : join(rootDir, value);
}

function normalizePath(value: string): string {
  return value.replace(/\\/gu, "/");
}

function timestampSeconds(value: string): number | undefined {
  const parts = value.split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    return undefined;
  }

  const [first, second, third] = parts;
  if (first === undefined || second === undefined) {
    return undefined;
  }

  if (third === undefined) {
    return second > 59 ? undefined : first * 60 + second;
  }

  return second > 59 || third > 59 ? undefined : first * 3600 + second * 60 + third;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readOptionalText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function fileExistsSync(path: string): boolean {
  return existsSync(path);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
}
