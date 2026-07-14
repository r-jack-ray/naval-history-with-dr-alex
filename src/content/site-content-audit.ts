import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

import { segmentKinds, type SegmentKind } from "../index.js";
import { writeTextAtomically } from "../pipeline/atomic-write.js";
import {
  parseSiteContentProcessingLog,
} from "./site-content-processing-log.js";
import {
  loadCuratedArchiveSeed,
  type CuratedArchiveSeed,
  type CuratedSegmentSeed,
} from "../site/curated-seed.js";

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

export interface SiteContentProcessingConfig {
  schemaVersion: 1;
  firstPass: {
    defaultAction: string;
    defaultNeedsFurtherProcessing: boolean;
    processingMode: "full-file-best-effort";
    minimumEvidenceWindows: number;
    preferredSegmentKinds: SegmentKind[];
    requiredContentScans: Array<"subject-segments" | "qa-exchanges">;
    guidance: string;
  };
  videoLevelTopics: {
    mode: "curated-summary-subset";
    requireAllSegmentTopics: false;
  };
  liveStreamExtraction: {
    mode: "full-duration-mixed-content";
    explicitQaTitleMarkers: string[];
    requiredQaFields: Array<"start" | "question" | "answerShort">;
    guidance: string;
  };
  topicLifecycle: {
    mode: "shard-derived-automatic";
    contentPass: string;
    synchronization: string;
    exceptionRule: string;
  };
  contentExhaustion: {
    mode: "model-effort-saturation";
    comparisonScope: string;
    stopRule: string;
    reopenRule: string;
  };
  followUpStages: Array<{
    slug: string;
    title: string;
    description: string;
  }>;
  videoTypeRules: Array<{
    matchTitle: string;
    defaultKind: SegmentKind;
    defaultTopics: string[];
    followUpStage: string;
  }>;
  topicGroups: Array<{
    slug: string;
    title: string;
    topics: string[];
  }>;
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
  const segmentVideoIds = new Set<string>();
  const allowedKinds = new Set<string>(segmentKinds);
  const processingConfig = input.processingConfig === undefined
    ? undefined
    : validateProcessingConfig(
      input.processingConfig,
      input.processingConfigPath ?? defaultSiteContentProcessingConfig,
      issues,
      allowedKinds,
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

function validateProcessingConfig(
  value: unknown,
  path: string,
  issues: SiteContentAuditIssue[],
  allowedKinds: ReadonlySet<string>,
): SiteContentProcessingConfig | undefined {
  const issueCountBeforeValidation = issues.length;
  const report = (message: string): void => {
    issues.push({
      severity: "error",
      code: "processing-config-invalid",
      message,
      path,
    });
  };

  if (!isRecord(value)) {
    report("Site content processing config must be a JSON object.");
    return undefined;
  }

  if (value.schemaVersion !== 1) {
    report("Site content processing config schemaVersion must be 1.");
  }

  const firstPass = value.firstPass;
  if (!isRecord(firstPass)) {
    report("Site content processing config must include a firstPass object.");
  } else {
    validateNonEmptyString(firstPass.defaultAction, "firstPass.defaultAction", report);
    if (typeof firstPass.defaultNeedsFurtherProcessing !== "boolean") {
      report("firstPass.defaultNeedsFurtherProcessing must be a boolean.");
    }
    if (firstPass.processingMode !== "full-file-best-effort") {
      report('firstPass.processingMode must be "full-file-best-effort".');
    }
    if (!Number.isInteger(firstPass.minimumEvidenceWindows) || Number(firstPass.minimumEvidenceWindows) < 1) {
      report("firstPass.minimumEvidenceWindows must be a positive integer.");
    }
    validateSegmentKindArray(firstPass.preferredSegmentKinds, "firstPass.preferredSegmentKinds", report, allowedKinds, true);
    validateRequiredFirstPassContentScans(firstPass.requiredContentScans, report);
    validateNonEmptyString(firstPass.guidance, "firstPass.guidance", report);
  }

  const videoLevelTopics = value.videoLevelTopics;
  if (!isRecord(videoLevelTopics)) {
    report("Site content processing config must include a videoLevelTopics object.");
  } else {
    if (videoLevelTopics.mode !== "curated-summary-subset") {
      report('videoLevelTopics.mode must be "curated-summary-subset".');
    }
    if (videoLevelTopics.requireAllSegmentTopics !== false) {
      report("videoLevelTopics.requireAllSegmentTopics must be false for curated summary topics.");
    }
  }

  validateLiveStreamExtraction(value.liveStreamExtraction, report);
  validateTopicLifecycle(value.topicLifecycle, report);
  validateContentExhaustion(value.contentExhaustion, report);

  const followUpStageSlugs = validateFollowUpStages(value.followUpStages, report);
  validateVideoTypeRules(value.videoTypeRules, report, allowedKinds, followUpStageSlugs);
  validateTopicGroups(value.topicGroups, report);

  if (issues.length !== issueCountBeforeValidation) {
    return undefined;
  }
  return value as unknown as SiteContentProcessingConfig;
}

function validateRequiredFirstPassContentScans(
  value: unknown,
  report: (message: string) => void,
): void {
  const expectedScans = new Set(["subject-segments", "qa-exchanges"]);
  if (
    !Array.isArray(value)
    || value.length !== expectedScans.size
    || value.some((scan) => typeof scan !== "string" || !expectedScans.has(scan))
    || new Set(value).size !== expectedScans.size
  ) {
    report("firstPass.requiredContentScans must contain subject-segments and qa-exchanges exactly once.");
  }
}

function validateContentExhaustion(
  value: unknown,
  report: (message: string) => void,
): void {
  if (!isRecord(value)) {
    report("Site content processing config must include a contentExhaustion object.");
    return;
  }

  if (value.mode !== "model-effort-saturation") {
    report('contentExhaustion.mode must be "model-effort-saturation".');
  }
  validateNonEmptyString(value.comparisonScope, "contentExhaustion.comparisonScope", report);
  validateNonEmptyString(value.stopRule, "contentExhaustion.stopRule", report);
  validateNonEmptyString(value.reopenRule, "contentExhaustion.reopenRule", report);
}

function validateTopicLifecycle(
  value: unknown,
  report: (message: string) => void,
): void {
  if (!isRecord(value)) {
    report("Site content processing config must include a topicLifecycle object.");
    return;
  }

  if (value.mode !== "shard-derived-automatic") {
    report('topicLifecycle.mode must be "shard-derived-automatic".');
  }
  validateNonEmptyString(value.contentPass, "topicLifecycle.contentPass", report);
  validateNonEmptyString(value.synchronization, "topicLifecycle.synchronization", report);
  validateNonEmptyString(value.exceptionRule, "topicLifecycle.exceptionRule", report);
}

function validateLiveStreamExtraction(
  value: unknown,
  report: (message: string) => void,
): void {
  if (!isRecord(value)) {
    report("Site content processing config must include a liveStreamExtraction object.");
    return;
  }

  if (value.mode !== "full-duration-mixed-content") {
    report('liveStreamExtraction.mode must be "full-duration-mixed-content".');
  }

  validateUniqueNonEmptyStringArray(
    value.explicitQaTitleMarkers,
    "liveStreamExtraction.explicitQaTitleMarkers",
    report,
  );

  const requiredQaFields = value.requiredQaFields;
  const expectedFields = new Set(["start", "question", "answerShort"]);
  if (
    !Array.isArray(requiredQaFields)
    || requiredQaFields.length !== expectedFields.size
    || requiredQaFields.some((field) => typeof field !== "string" || !expectedFields.has(field))
    || new Set(requiredQaFields).size !== expectedFields.size
  ) {
    report("liveStreamExtraction.requiredQaFields must contain start, question, and answerShort exactly once.");
  }

  validateNonEmptyString(value.guidance, "liveStreamExtraction.guidance", report);
}

function validateUniqueNonEmptyStringArray(
  value: unknown,
  field: string,
  report: (message: string) => void,
): void {
  if (!Array.isArray(value) || value.length === 0) {
    report(`${field} must be a non-empty array.`);
    return;
  }

  const seen = new Set<string>();
  for (const [index, item] of value.entries()) {
    const marker = validateNonEmptyString(item, `${field}[${index}]`, report);
    if (marker === undefined) {
      continue;
    }
    const normalizedMarker = marker.toLocaleLowerCase("en-US");
    if (seen.has(normalizedMarker)) {
      report(`${field}[${index}] duplicates another marker when matched case-insensitively.`);
    }
    seen.add(normalizedMarker);
  }
}

function validateFollowUpStages(value: unknown, report: (message: string) => void): Set<string> {
  const slugs = new Set<string>();
  if (!Array.isArray(value)) {
    report("followUpStages must be an array.");
    return slugs;
  }

  for (const [index, stage] of value.entries()) {
    const prefix = `followUpStages[${index}]`;
    if (!isRecord(stage)) {
      report(`${prefix} must be an object.`);
      continue;
    }
    const slug = validateSlug(stage.slug, `${prefix}.slug`, report);
    if (slug !== undefined) {
      if (slugs.has(slug)) {
        report(`${prefix}.slug duplicates follow-up stage ${slug}.`);
      }
      slugs.add(slug);
    }
    validateNonEmptyString(stage.title, `${prefix}.title`, report);
    validateNonEmptyString(stage.description, `${prefix}.description`, report);
  }
  return slugs;
}

function validateVideoTypeRules(
  value: unknown,
  report: (message: string) => void,
  allowedKinds: ReadonlySet<string>,
  followUpStageSlugs: ReadonlySet<string>,
): void {
  if (!Array.isArray(value)) {
    report("videoTypeRules must be an array.");
    return;
  }

  const normalizedTitleMatches = new Set<string>();
  for (const [index, rule] of value.entries()) {
    const prefix = `videoTypeRules[${index}]`;
    if (!isRecord(rule)) {
      report(`${prefix} must be an object.`);
      continue;
    }

    const matchTitle = validateNonEmptyString(rule.matchTitle, `${prefix}.matchTitle`, report);
    if (matchTitle !== undefined) {
      const normalizedMatch = matchTitle.toLocaleLowerCase("en-US");
      if (normalizedTitleMatches.has(normalizedMatch)) {
        report(`${prefix}.matchTitle duplicates another rule when matched case-insensitively.`);
      }
      normalizedTitleMatches.add(normalizedMatch);
    }

    if (typeof rule.defaultKind !== "string" || !allowedKinds.has(rule.defaultKind)) {
      report(`${prefix}.defaultKind must be a supported segment kind.`);
    }
    validateSlugArray(rule.defaultTopics, `${prefix}.defaultTopics`, report);
    const followUpStage = validateSlug(rule.followUpStage, `${prefix}.followUpStage`, report);
    if (followUpStage !== undefined && !followUpStageSlugs.has(followUpStage)) {
      report(`${prefix}.followUpStage must reference a configured follow-up stage.`);
    }
  }
}

function validateTopicGroups(value: unknown, report: (message: string) => void): void {
  if (!Array.isArray(value)) {
    report("topicGroups must be an array.");
    return;
  }

  const slugs = new Set<string>();
  for (const [index, group] of value.entries()) {
    const prefix = `topicGroups[${index}]`;
    if (!isRecord(group)) {
      report(`${prefix} must be an object.`);
      continue;
    }
    const slug = validateSlug(group.slug, `${prefix}.slug`, report);
    if (slug !== undefined) {
      if (slugs.has(slug)) {
        report(`${prefix}.slug duplicates topic group ${slug}.`);
      }
      slugs.add(slug);
    }
    validateNonEmptyString(group.title, `${prefix}.title`, report);
    validateSlugArray(group.topics, `${prefix}.topics`, report);
  }
}

function validateSegmentKindArray(
  value: unknown,
  field: string,
  report: (message: string) => void,
  allowedKinds: ReadonlySet<string>,
  requireNonEmpty: boolean,
): void {
  if (!Array.isArray(value) || (requireNonEmpty && value.length === 0)) {
    report(`${field} must be ${requireNonEmpty ? "a non-empty" : "an"} array.`);
    return;
  }
  if (value.some((item) => typeof item !== "string" || !allowedKinds.has(item))) {
    report(`${field} must contain only supported segment kinds.`);
  }
}

function validateSlugArray(value: unknown, field: string, report: (message: string) => void): void {
  if (!Array.isArray(value)) {
    report(`${field} must be an array.`);
    return;
  }
  const seen = new Set<string>();
  for (const [index, item] of value.entries()) {
    const slug = validateSlug(item, `${field}[${index}]`, report);
    if (slug !== undefined) {
      if (seen.has(slug)) {
        report(`${field} must not contain duplicate slug ${slug}.`);
      }
      seen.add(slug);
    }
  }
}

function validateSlug(value: unknown, field: string, report: (message: string) => void): string | undefined {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) {
    report(`${field} must be a lowercase hyphenated slug.`);
    return undefined;
  }
  return value;
}

function validateNonEmptyString(
  value: unknown,
  field: string,
  report: (message: string) => void,
): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    report(`${field} must be a non-empty string.`);
    return undefined;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ProcessingLogAudit {
  entryCount: number;
  completedVideoIds: Set<string>;
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
    return { entryCount: 0, completedVideoIds: new Set<string>() };
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
    return { entryCount: 0, completedVideoIds: new Set<string>() };
  }
  for (const problem of parsed.problems) {
    issues.push({ severity: "error", code: problem.code, message: problem.message, path: processingLogPath });
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

  const completedVideoIds = new Set<string>();
  for (const [videoId, record] of parsed.latestByVideoId) {
    if (record.needsFurtherProcessing === "no") completedVideoIds.add(videoId);
  }

  return {
    entryCount: parsed.records.length,
    completedVideoIds,
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
