import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

export const defaultTranscriptScheduleManifest = "src/transcripts/manifest.json";
export const defaultTranscriptScheduleProcessingLog = "src/derived/site-content-processing.log";
export const defaultTranscriptScheduleSegmentsInput = "src/derived/video-segments";
export const defaultTranscriptSchedulePaths = [
  "task-notes/2026-07-08_T19-45-36-0500_transcript-processing-schedule-01.md",
  "task-notes/2026-07-08_T19-45-36-0500_transcript-processing-schedule-02.md",
  "task-notes/2026-07-08_T19-45-36-0500_transcript-processing-schedule-03.md",
  "task-notes/2026-07-08_T19-45-36-0500_transcript-processing-schedule-04.md",
] as const;

export interface TranscriptScheduleAuditOptions {
  manifestPath: string;
  schedulePaths: string[];
  checkArtifacts: boolean;
  processingLogPath: string;
  segmentsInput: string;
}

export interface TranscriptScheduleAuditIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
  line?: number;
  videoId?: string;
}

export interface TranscriptScheduleAudit {
  stats: {
    scheduleCount: number;
    scheduledTranscriptCount: number;
    manifestTranscriptCount: number;
    uncheckedCount: number;
    inProgressCount: number;
    checkedCount: number;
    errorCount: number;
    warningCount: number;
  };
  issues: TranscriptScheduleAuditIssue[];
}

interface TranscriptManifest {
  transcripts: TranscriptManifestRecord[];
}

interface TranscriptManifestRecord {
  videoId: string;
  videoTitle?: string;
  videoPublishedAt?: string;
  segmentCount?: number;
  lastEndSeconds?: number;
  paths?: { txt?: string };
}

interface ScheduleSource {
  path: string;
  text: string;
}

interface ScheduleEntry {
  state: string;
  transcriptPath: string;
  videoId: string;
  publishedAt: string;
  rows: number;
  durationSeconds: number;
  title: string;
  schedulePath: string;
  scheduleTimestampMs?: number;
  line: number;
}

interface ParsedSchedule {
  path: string;
  scheduleNumber?: number;
  scheduleCount?: number;
  declaredFileCount?: number;
  declaredTotalCount?: number;
  timestampMs?: number;
  entries: ScheduleEntry[];
}

export async function auditTranscriptSchedules(options: TranscriptScheduleAuditOptions): Promise<TranscriptScheduleAudit> {
  const [manifestText, scheduleTexts, processingLogText] = await Promise.all([
    readFile(options.manifestPath, "utf8"),
    Promise.all(options.schedulePaths.map(async (path) => ({ path, text: await readFile(path, "utf8") }))),
    options.checkArtifacts ? readFile(options.processingLogPath, "utf8") : Promise.resolve(undefined),
  ]);

  return buildTranscriptScheduleAudit({
    manifest: JSON.parse(manifestText) as TranscriptManifest,
    manifestPath: options.manifestPath,
    schedules: scheduleTexts,
    rootDir: process.cwd(),
    fileExists: existsSync,
    checkArtifacts: options.checkArtifacts,
    ...(processingLogText === undefined ? {} : { processingLogText }),
    processingLogPath: options.processingLogPath,
    segmentsInput: options.segmentsInput,
  });
}

export function buildTranscriptScheduleAudit(input: {
  manifest: TranscriptManifest;
  manifestPath: string;
  schedules: ScheduleSource[];
  rootDir: string;
  fileExists: (path: string) => boolean;
  checkArtifacts?: boolean;
  processingLogText?: string;
  processingLogPath?: string;
  segmentsInput?: string;
}): TranscriptScheduleAudit {
  const issues: TranscriptScheduleAuditIssue[] = [];
  const schedules = input.schedules.map((source) => parseSchedule(source, issues));
  const entries = schedules.flatMap((schedule) => schedule.entries);
  const expectedScheduleCount = schedules.length;

  schedules.forEach((schedule, index) => {
    if (schedule.scheduleNumber !== index + 1 || schedule.scheduleCount !== expectedScheduleCount) {
      addIssue(issues, "error", "schedule-header-index", `${schedule.path} must identify itself as schedule ${index + 1} of ${expectedScheduleCount}.`, schedule.path);
    }
    if (schedule.declaredFileCount !== schedule.entries.length) {
      addIssue(issues, "error", "schedule-header-file-count", `${schedule.path} declares ${schedule.declaredFileCount ?? "no"} files but contains ${schedule.entries.length} rows.`, schedule.path);
    }
    if (schedule.declaredTotalCount !== entries.length) {
      addIssue(issues, "error", "schedule-header-total-count", `${schedule.path} declares ${schedule.declaredTotalCount ?? "no"} total files but the combined schedules contain ${entries.length}.`, schedule.path);
    }
  });

  const counts = schedules.map((schedule) => schedule.entries.length);
  if (counts.length > 0 && Math.max(...counts) - Math.min(...counts) > 1) {
    addIssue(issues, "error", "schedule-count-imbalance", `Schedule row counts are not balanced: ${counts.join(", ")}.`);
  }

  validateOrder(entries, issues);

  const scheduledByPath = new Map<string, ScheduleEntry>();
  const scheduledByVideoId = new Map<string, ScheduleEntry>();
  for (const entry of entries) {
    const previousPath = scheduledByPath.get(entry.transcriptPath);
    if (previousPath) {
      addIssue(issues, "error", "duplicate-schedule-path", `${entry.transcriptPath} appears more than once.`, entry.schedulePath, entry.line, entry.videoId);
    } else {
      scheduledByPath.set(entry.transcriptPath, entry);
    }
    const previousVideo = scheduledByVideoId.get(entry.videoId);
    if (previousVideo) {
      addIssue(issues, "error", "duplicate-schedule-video-id", `Video ${entry.videoId} appears more than once.`, entry.schedulePath, entry.line, entry.videoId);
    } else {
      scheduledByVideoId.set(entry.videoId, entry);
    }
    if (!input.fileExists(resolve(input.rootDir, entry.transcriptPath))) {
      addIssue(issues, "error", "missing-scheduled-transcript", `Scheduled TXT file does not exist: ${entry.transcriptPath}.`, entry.schedulePath, entry.line, entry.videoId);
    }
  }

  const manifestByPath = new Map<string, TranscriptManifestRecord>();
  const manifestByVideoId = new Map<string, TranscriptManifestRecord>();
  for (const record of input.manifest.transcripts) {
    const txtPath = record.paths?.txt;
    if (!txtPath) {
      addIssue(issues, "error", "manifest-missing-txt-path", `Manifest video ${record.videoId} has no TXT path.`, input.manifestPath, undefined, record.videoId);
      continue;
    }
    const transcriptPath = repositoryRelativePath(input.rootDir, resolve(dirname(resolve(input.rootDir, input.manifestPath)), txtPath));
    if (manifestByPath.has(transcriptPath)) {
      addIssue(issues, "error", "duplicate-manifest-path", `Manifest TXT path ${transcriptPath} appears more than once.`, input.manifestPath, undefined, record.videoId);
    } else {
      manifestByPath.set(transcriptPath, record);
    }
    if (manifestByVideoId.has(record.videoId)) {
      addIssue(issues, "error", "duplicate-manifest-video-id", `Manifest video ${record.videoId} appears more than once.`, input.manifestPath, undefined, record.videoId);
    } else {
      manifestByVideoId.set(record.videoId, record);
    }
  }

  for (const entry of entries) {
    const record = manifestByPath.get(entry.transcriptPath);
    if (!record) {
      addIssue(issues, "error", "schedule-path-not-in-manifest", `${entry.transcriptPath} is scheduled but absent from the manifest.`, entry.schedulePath, entry.line, entry.videoId);
      continue;
    }
    validateManifestMetadata(entry, record, issues);
  }
  for (const [transcriptPath, record] of manifestByPath) {
    if (!scheduledByPath.has(transcriptPath)) {
      addIssue(issues, "error", "manifest-transcript-not-scheduled", `Manifest TXT file is missing from all schedules: ${transcriptPath}.`, input.manifestPath, undefined, record.videoId);
    }
  }

  if (input.checkArtifacts) {
    validateArtifacts(input, entries, issues);
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;
  return {
    stats: {
      scheduleCount: schedules.length,
      scheduledTranscriptCount: entries.length,
      manifestTranscriptCount: input.manifest.transcripts.length,
      uncheckedCount: entries.filter((entry) => entry.state === " ").length,
      inProgressCount: entries.filter((entry) => entry.state === "~").length,
      checkedCount: entries.filter((entry) => entry.state === "x").length,
      errorCount,
      warningCount,
    },
    issues,
  };
}

function parseSchedule(source: ScheduleSource, issues: TranscriptScheduleAuditIssue[]): ParsedSchedule {
  const timestamp = readHeader(source.text, /^Timestamp:\s*(.+)$/mu);
  const timestampMs = timestamp === undefined ? undefined : Date.parse(timestamp);
  if (timestamp === undefined || Number.isNaN(timestampMs)) {
    addIssue(issues, "error", "schedule-header-timestamp", `${source.path} has no valid Timestamp header.`, source.path);
  }
  const scheduleHeader = /^Schedule:\s*(\d+)\s+of\s+(\d+)$/mu.exec(source.text);
  const declaredFileCount = readIntegerHeader(source.text, /^Files in this schedule:\s*(\d+)$/mu);
  const declaredTotalCount = readIntegerHeader(source.text, /^Total files split across schedules:\s*(\d+)$/mu);
  const entries: ScheduleEntry[] = [];
  const rowPattern = /^- \[([^\]]*)\] (src\/transcripts\/txt\/\S+\.txt) \| (\S+) \| (\S+) \| rows=(\d+) \| durationSeconds=(\d+) \| (.*)$/u;

  source.text.split(/\r?\n/u).forEach((line, index) => {
    if (!line.startsWith("- [")) return;
    const match = rowPattern.exec(line);
    if (!match) {
      addIssue(issues, "error", "invalid-schedule-row", `Malformed schedule row at ${source.path}:${index + 1}.`, source.path, index + 1);
      return;
    }
    const state = match[1] ?? "";
    if (state !== " " && state !== "~" && state !== "x") {
      addIssue(issues, "error", "invalid-schedule-state", `Unsupported schedule state [${state}] at ${source.path}:${index + 1}; expected [ ], [~], or [x].`, source.path, index + 1, match[3]);
    }
    entries.push({
      state,
      transcriptPath: match[2] ?? "",
      videoId: match[3] ?? "",
      publishedAt: match[4] ?? "",
      rows: Number(match[5]),
      durationSeconds: Number(match[6]),
      title: match[7] ?? "",
      schedulePath: source.path,
      ...(timestampMs === undefined || Number.isNaN(timestampMs) ? {} : { scheduleTimestampMs: timestampMs }),
      line: index + 1,
    });
  });

  return {
    path: source.path,
    ...(scheduleHeader ? { scheduleNumber: Number(scheduleHeader[1]), scheduleCount: Number(scheduleHeader[2]) } : {}),
    ...(declaredFileCount === undefined ? {} : { declaredFileCount }),
    ...(declaredTotalCount === undefined ? {} : { declaredTotalCount }),
    ...(timestampMs === undefined || Number.isNaN(timestampMs) ? {} : { timestampMs }),
    entries,
  };
}

function validateOrder(entries: ScheduleEntry[], issues: TranscriptScheduleAuditIssue[]): void {
  let previous: ScheduleEntry | undefined;
  let previousTime: number | undefined;
  for (const entry of entries) {
    const time = Date.parse(entry.publishedAt);
    if (Number.isNaN(time)) {
      addIssue(issues, "error", "invalid-schedule-published-at", `Invalid publication timestamp ${entry.publishedAt}.`, entry.schedulePath, entry.line, entry.videoId);
      continue;
    }
    if (previous && previousTime !== undefined && time > previousTime) {
      addIssue(issues, "error", "schedule-order", `${entry.videoId} is newer than preceding row ${previous.videoId}; combined schedules must remain newest-first.`, entry.schedulePath, entry.line, entry.videoId);
    }
    previous = entry;
    previousTime = time;
  }
}

function validateManifestMetadata(entry: ScheduleEntry, record: TranscriptManifestRecord, issues: TranscriptScheduleAuditIssue[]): void {
  if (entry.videoId !== record.videoId) {
    addIssue(issues, "error", "schedule-video-id-mismatch", `${entry.transcriptPath} lists video ${entry.videoId}, but the manifest lists ${record.videoId}.`, entry.schedulePath, entry.line, entry.videoId);
  }
  const metadataMatches = record.videoPublishedAt === entry.publishedAt
    && record.segmentCount === entry.rows
    && record.lastEndSeconds === entry.durationSeconds
    && record.videoTitle === entry.title;
  if (!metadataMatches) {
    addIssue(issues, "error", "schedule-metadata-mismatch", `${entry.transcriptPath} metadata does not match the manifest.`, entry.schedulePath, entry.line, entry.videoId);
  }
}

function validateArtifacts(
  input: Parameters<typeof buildTranscriptScheduleAudit>[0],
  entries: ScheduleEntry[],
  issues: TranscriptScheduleAuditIssue[],
): void {
  const processingLogTimes = new Map<string, number[]>();
  for (const line of (input.processingLogText ?? "").split(/\r?\n/u)) {
    if (!line) continue;
    const fields = line.split("\t");
    if (fields.length !== 6) continue;
    const timestamp = Date.parse(fields[0] ?? "");
    const transcriptPath = fields[1] ?? "";
    const videoId = fields[2] ?? "";
    if (Number.isNaN(timestamp)) continue;
    const key = `${transcriptPath}\0${videoId}`;
    const times = processingLogTimes.get(key) ?? [];
    times.push(timestamp);
    processingLogTimes.set(key, times);
  }
  const segmentsInput = input.segmentsInput ?? defaultTranscriptScheduleSegmentsInput;
  const processingLogPath = input.processingLogPath ?? defaultTranscriptScheduleProcessingLog;
  for (const entry of entries) {
    if (entry.state !== "x" && entry.state !== "~") continue;
    const shardPath = resolve(input.rootDir, segmentsInput, `video-${entry.videoId}.json`);
    const shardExists = input.fileExists(shardPath);
    const freshLog = entry.scheduleTimestampMs !== undefined
      && (processingLogTimes.get(`${entry.transcriptPath}\0${entry.videoId}`) ?? []).some((time) => time >= entry.scheduleTimestampMs!);
    if (entry.state === "x") {
      if (!shardExists) {
        addIssue(issues, "error", "checked-row-missing-shard", `Checked row ${entry.videoId} has no current-schema shard.`, entry.schedulePath, entry.line, entry.videoId);
      }
      if (!freshLog) {
        addIssue(issues, "error", "checked-row-missing-fresh-log", `Checked row ${entry.videoId} has no ${processingLogPath} entry at or after its schedule timestamp.`, entry.schedulePath, entry.line, entry.videoId);
      }
    } else if (freshLog && !shardExists) {
      addIssue(issues, "error", "in-progress-log-without-shard", `In-progress row ${entry.videoId} has a fresh processing-log entry but no shard.`, entry.schedulePath, entry.line, entry.videoId);
    } else if (freshLog && shardExists) {
      addIssue(issues, "warning", "in-progress-ready-to-finalize", `In-progress row ${entry.videoId} has both completion artifacts and can be finalized.`, entry.schedulePath, entry.line, entry.videoId);
    }
  }
}

function readHeader(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1]?.trim();
}

function readIntegerHeader(text: string, pattern: RegExp): number | undefined {
  const value = readHeader(text, pattern);
  return value === undefined ? undefined : Number(value);
}

function repositoryRelativePath(rootDir: string, path: string): string {
  return relative(resolve(rootDir), path).replaceAll("\\", "/");
}

function addIssue(
  issues: TranscriptScheduleAuditIssue[],
  severity: "error" | "warning",
  code: string,
  message: string,
  path?: string,
  line?: number,
  videoId?: string,
): void {
  issues.push({
    severity,
    code,
    message,
    ...(path === undefined ? {} : { path }),
    ...(line === undefined ? {} : { line }),
    ...(videoId === undefined ? {} : { videoId }),
  });
}
