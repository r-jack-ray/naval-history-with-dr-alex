import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

import { segmentKinds } from "../index.js";
import { writeTextAtomically } from "../pipeline/atomic-write.js";
import {
  loadCuratedArchiveSeed,
  type CuratedArchiveSeed,
  type CuratedSegmentSeed,
} from "../site/curated-seed.js";

export const defaultSiteContentAuditManifest = "src/transcripts/manifest.json";
export const defaultSiteContentAuditSegmentsInput = "src/derived/video-segments";
export const defaultSiteContentProcessingLog = "src/derived/site-content-processing.log";
export const defaultSiteContentAuditOutput = "reports/site-content-backlog.md";

export interface AuditSiteContentOptions {
  manifestPath: string;
  segmentsInput: string;
  processingLog: string;
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
    completedProcessingLogVideoCount: number;
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
  publishedAt?: string;
  transcriptPath?: string;
  segmentCount?: number;
  durationSeconds?: number;
}

export interface TranscriptManifest {
  transcripts: TranscriptManifestRecord[];
}

export interface TranscriptManifestRecord {
  videoId: string;
  videoTitle?: string;
  videoPublishedAt?: string;
  segmentCount?: number;
  firstStartSeconds?: number;
  lastEndSeconds?: number;
  paths?: {
    json?: string;
    txt?: string;
    tsv?: string;
  };
}

export async function auditSiteContent(options: AuditSiteContentOptions): Promise<SiteContentAudit> {
  const [manifest, seed] = await Promise.all([
    readJson<TranscriptManifest>(options.manifestPath),
    loadCuratedArchiveSeed(options.segmentsInput),
  ]);
  const processingLogText = await readOptionalText(options.processingLog);
  const audit = buildSiteContentAudit({
    manifest,
    seed,
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
  processingLogText?: string;
  processingLogPath?: string;
  rootDir: string;
  transcriptRoot: string;
  limit: number;
  fileExists: (path: string) => boolean;
}): SiteContentAudit {
  const issues: SiteContentAuditIssue[] = [];
  const manifestByVideoId = new Map<string, TranscriptManifestRecord>();
  const segmentVideoIds = new Set<string>();
  const allowedKinds = new Set<string>(segmentKinds);
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
    validateSegment(segment, manifestByVideoId.get(segment.videoId), input, issues, allowedKinds);
  }

  const uncuratedTranscriptRecords = input.manifest.transcripts
    .filter((record) => !segmentVideoIds.has(record.videoId) && !processingLog.completedVideoIds.has(record.videoId))
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
      completedProcessingLogVideoCount: processingLog.completedVideoIds.size,
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
    `- Stored transcripts without curated segments: ${audit.stats.uncuratedStoredTranscriptCount}`,
    `- Processing log entries: ${audit.stats.processingLogEntryCount}`,
    `- Completed processing-log videos: ${audit.stats.completedProcessingLogVideoCount}`,
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
      if (item.publishedAt !== undefined) {
        lines.push(`  - Published: ${item.publishedAt}`);
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
  validateEvidence(segment, transcript, issues);
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
): void {
  if (segment.evidence === undefined || segment.evidence.length === 0) {
    issues.push({
      severity: "error",
      code: "missing-evidence-window",
      message: "Curated segment must include at least one transcript evidence window.",
      videoId: segment.videoId,
      segmentId: segment.id,
    });
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
  if (segment.kind === "qa" && (segment.question === undefined || segment.answerShort === undefined)) {
    issues.push({
      severity: "error",
      code: "qa-missing-question-fields",
      message: "Q&A segments must include question and answerShort.",
      videoId: segment.videoId,
      segmentId: segment.id,
    });
  }

  if (segment.kind !== "qa" && (segment.question !== undefined || segment.answerShort !== undefined)) {
    issues.push({
      severity: "warning",
      code: "non-qa-question-fields",
      message: "Non-Q&A segment includes question-specific fields.",
      videoId: segment.videoId,
      segmentId: segment.id,
    });
  }
}

interface ProcessingLogAudit {
  entryCount: number;
  completedVideoIds: Set<string>;
}

function validateProcessingLog(
  input: {
    processingLogText?: string;
    processingLogPath?: string;
    rootDir: string;
    fileExists: (path: string) => boolean;
  },
  issues: SiteContentAuditIssue[],
): ProcessingLogAudit {
  const lines = input.processingLogText
    ?.split(/\r?\n/u)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter((entry) => entry.line.trim().length > 0) ?? [];
  const processingLogPath = input.processingLogPath ?? "processing log";
  const latestNeedsFurtherProcessingByVideoId = new Map<string, "yes" | "no">();

  for (const entry of lines) {
    const fields = entry.line.split("\t");
    if (fields.length !== 6) {
      issues.push({
        severity: "error",
        code: "processing-log-field-count",
        message: `Processing log line ${entry.lineNumber} must have 6 tab-separated fields.`,
        path: processingLogPath,
      });
      continue;
    }

    const [processedAt, sourcePath, videoId, action, needsFurtherProcessing, determination] = fields;
    if (processedAt === undefined || Number.isNaN(Date.parse(processedAt))) {
      issues.push({
        severity: "error",
        code: "processing-log-invalid-timestamp",
        message: `Processing log line ${entry.lineNumber} has an invalid timestamp.`,
        path: processingLogPath,
      });
    }
    if (sourcePath === undefined || !sourcePath.trim()) {
      issues.push({
        severity: "error",
        code: "processing-log-missing-source",
        message: `Processing log line ${entry.lineNumber} is missing a source transcript path.`,
        path: processingLogPath,
      });
    } else if (!input.fileExists(resolveRepoPath(input.rootDir, sourcePath))) {
      issues.push({
        severity: "error",
        code: "processing-log-source-not-found",
        message: `Processing log line ${entry.lineNumber} references a missing source transcript path.`,
        path: sourcePath,
      });
    }
    if (videoId === undefined || !/^[A-Za-z0-9_-]+$/u.test(videoId)) {
      issues.push({
        severity: "error",
        code: "processing-log-invalid-video-id",
        message: `Processing log line ${entry.lineNumber} has an invalid video ID.`,
        path: processingLogPath,
      });
    }
    if (action === undefined || !action.trim()) {
      issues.push({
        severity: "error",
        code: "processing-log-missing-action",
        message: `Processing log line ${entry.lineNumber} must describe what was done.`,
        path: processingLogPath,
      });
    }
    if (needsFurtherProcessing !== "yes" && needsFurtherProcessing !== "no") {
      issues.push({
        severity: "error",
        code: "processing-log-invalid-further-processing",
        message: `Processing log line ${entry.lineNumber} must use yes or no for needsFurtherProcessing.`,
        path: processingLogPath,
      });
    }
    if (determination === undefined || !determination.trim()) {
      issues.push({
        severity: "error",
        code: "processing-log-missing-determination",
        message: `Processing log line ${entry.lineNumber} must include a short determination.`,
        path: processingLogPath,
      });
    }

    if (videoId !== undefined && /^[A-Za-z0-9_-]+$/u.test(videoId) && (needsFurtherProcessing === "yes" || needsFurtherProcessing === "no")) {
      latestNeedsFurtherProcessingByVideoId.set(videoId, needsFurtherProcessing);
    }
  }

  const completedVideoIds = new Set<string>();
  for (const [videoId, needsFurtherProcessing] of latestNeedsFurtherProcessingByVideoId) {
    if (needsFurtherProcessing === "no") {
      completedVideoIds.add(videoId);
    }
  }

  return {
    entryCount: lines.length,
    completedVideoIds,
  };
}

function backlogItem(record: TranscriptManifestRecord, transcriptRoot: string): SiteContentBacklogItem {
  const item: SiteContentBacklogItem = {
    videoId: record.videoId,
    title: record.videoTitle ?? record.videoId,
  };
  if (record.videoPublishedAt !== undefined) {
    item.publishedAt = record.videoPublishedAt;
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
  const rightDate = right.videoPublishedAt ?? "";
  const leftDate = left.videoPublishedAt ?? "";
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
