export type AuditRoute = "repair_required" | "review_candidate" | "low_signal";
export type QaExpectation = "none" | "explicit_title" | "configured_video_type";

export interface AuditEvidence {
  start?: unknown;
  end?: unknown;
  note?: unknown;
}

export interface AuditSegment {
  kind?: unknown;
  start?: unknown;
  end?: unknown;
  evidence?: unknown;
  sourcePath?: unknown;
  question?: unknown;
  answerShort?: unknown;
}

export interface AuditProcessingRecord {
  timestamp: string;
  lineNumber: number;
  result: string;
  notes: string;
}

export interface VideoSegmentAuditRiskInput {
  fileStem: string;
  filePath?: string;
  videoId: string;
  videoTitle: string;
  canonicalSourcePath?: string;
  processLogEntries: number;
  transcriptBytes: number | undefined;
  shardBytes: number;
  transcriptStartSeconds?: number;
  durationSeconds: number | undefined;
  segments: AuditSegment[];
  structuralIssues?: string[];
  qaExpectation?: QaExpectation;
  minimumEvidenceWindows?: number;
  latestProcessingRecord?: AuditProcessingRecord;
}

export interface VideoSegmentAuditRiskRow {
  rank: number;
  auditRoute: AuditRoute;
  videoId: string;
  fileStem: string;
  filePath: string | undefined;
  videoTitle: string;
  processLogEntries: number;
  transcriptBytes: number | undefined;
  shardBytes: number;
  shardToTranscriptRatio: number | undefined;
  durationMinutes: number | undefined;
  transcriptBytesPerMinute: number | undefined;
  segmentCount: number;
  qaCount: number;
  validQaCount: number;
  qaTemporalBinsCovered: number;
  segmentsPerHour: number | undefined;
  firstSegmentPositionPct: number | undefined;
  lastSegmentPositionPct: number | undefined;
  temporalBinsCovered: number;
  largestAnchorGapPct: number | undefined;
  largestAnchorGapMinutes: number | undefined;
  largestEvidenceGapPct: number | undefined;
  largestEvidenceGapMinutes: number | undefined;
  largestEvidenceGapStartSeconds: number | undefined;
  largestEvidenceGapEndSeconds: number | undefined;
  validAnchorCount: number;
  invalidAnchorCount: number;
  missingSourcePathSegments: number;
  wrongSourcePathSegments: number;
  missingEvidenceSegments: number;
  invalidEvidenceSegments: number;
  riskSignals: string[];
  latestProcessingRecord?: AuditProcessingRecord;
}

const ROUTE_ORDER: Record<AuditRoute, number> = {
  repair_required: 0,
  review_candidate: 1,
  low_signal: 2,
};
const TIMESTAMP_TOLERANCE_SECONDS = 2;

export function analyzeVideoSegmentRisk(input: VideoSegmentAuditRiskInput): VideoSegmentAuditRiskRow {
  const hardIssues = [...(input.structuralIssues ?? [])];
  const reviewSignals: string[] = [];
  const diagnosticSignals: string[] = [];
  const minimumEvidenceWindows = input.minimumEvidenceWindows ?? 1;
  const anchors: number[] = [];
  const qaAnchors: number[] = [];
  const evidenceSpans: EvidenceSpan[] = [];
  let invalidAnchorCount = 0;
  let missingSourcePathSegments = 0;
  let wrongSourcePathSegments = 0;
  let missingEvidenceSegments = 0;
  let invalidEvidenceSegments = 0;
  let qaCount = 0;
  let validQaCount = 0;

  for (let index = 0; index < input.segments.length; index += 1) {
    const segment = input.segments[index]!;
    const label = `segment ${index + 1}`;
    if (!isRecord(segment)) {
      hardIssues.push(`${label} must be an object`);
      continue;
    }
    const start = boundedTimestamp(segment.start, input.durationSeconds, input.transcriptStartSeconds);
    const end = segment.end === undefined ? undefined : boundedTimestamp(segment.end, input.durationSeconds, input.transcriptStartSeconds);
    let segmentTimeValid = true;
    if (start === undefined) {
      invalidAnchorCount += 1;
      segmentTimeValid = false;
      hardIssues.push(`${label} has an invalid start timestamp`);
    } else {
      anchors.push(start);
    }
    if (segment.end !== undefined) {
      if (end === undefined) {
        invalidAnchorCount += 1;
        segmentTimeValid = false;
        hardIssues.push(`${label} has an invalid end timestamp`);
      } else if (start !== undefined && end < start) {
        invalidAnchorCount += 1;
        segmentTimeValid = false;
        hardIssues.push(`${label} ends before it starts`);
      }
    }

    let sourceValid = true;
    if (typeof segment.sourcePath !== "string" || segment.sourcePath.trim().length === 0) {
      missingSourcePathSegments += 1;
      sourceValid = false;
    } else if (input.canonicalSourcePath !== undefined && normalizePath(segment.sourcePath) !== normalizePath(input.canonicalSourcePath)) {
      wrongSourcePathSegments += 1;
      sourceValid = false;
    }

    let validEvidenceCount = 0;
    let evidenceInvalid = false;
    const segmentSpans: EvidenceSpan[] = [];
    if (!Array.isArray(segment.evidence) || segment.evidence.length < minimumEvidenceWindows) {
      missingEvidenceSegments += 1;
    } else {
      for (const evidenceValue of segment.evidence) {
        if (!isRecord(evidenceValue)) {
          evidenceInvalid = true;
          continue;
        }
        const evidence = evidenceValue as AuditEvidence;
        const evidenceStart = boundedTimestamp(evidence.start, input.durationSeconds, input.transcriptStartSeconds);
        const evidenceEnd = evidence.end === undefined ? undefined : boundedTimestamp(evidence.end, input.durationSeconds, input.transcriptStartSeconds);
        const validNote = typeof evidence.note === "string" && evidence.note.trim().length > 0;
        if (evidenceStart === undefined || !validNote || (evidence.end !== undefined && evidenceEnd === undefined)
            || (evidenceEnd !== undefined && evidenceEnd < evidenceStart)) {
          evidenceInvalid = true;
          if (evidenceStart === undefined) {
            invalidAnchorCount += 1;
          }
          if (evidence.end !== undefined && evidenceEnd === undefined) {
            invalidAnchorCount += 1;
          }
          continue;
        }
        validEvidenceCount += 1;
        // Earlier or later citations can support a cross-reference. They are not
        // schema defects, but only their overlap with this watch point spans it.
        const spanStart = Math.max(evidenceStart, start ?? evidenceStart);
        const spanEnd = Math.min(evidenceEnd ?? evidenceStart, end ?? Number.POSITIVE_INFINITY);
        if (spanEnd >= spanStart) {
          segmentSpans.push({startSeconds: spanStart, endSeconds: spanEnd});
        }
        anchors.push(evidenceStart);
        if (evidenceEnd !== undefined) {
          anchors.push(evidenceEnd);
        }
      }
      if (evidenceInvalid || validEvidenceCount < minimumEvidenceWindows) {
        invalidEvidenceSegments += 1;
      }
    }

    if (sourceValid && segmentTimeValid && !evidenceInvalid && validEvidenceCount >= minimumEvidenceWindows) {
      evidenceSpans.push(...segmentSpans);
    }

    if (segment.kind === "qa") {
      qaCount += 1;
      const validText = typeof segment.question === "string" && segment.question.trim().length > 0
          && typeof segment.answerShort === "string" && segment.answerShort.trim().length > 0;
      if (validText && sourceValid && segmentTimeValid && start !== undefined && validEvidenceCount >= minimumEvidenceWindows && !evidenceInvalid) {
        validQaCount += 1;
        qaAnchors.push(start);
      }
    }
  }

  if (missingSourcePathSegments > 0) {
    hardIssues.push(`${missingSourcePathSegments} segment(s) have a missing sourcePath`);
  }
  if (wrongSourcePathSegments > 0) {
    hardIssues.push(`${wrongSourcePathSegments} segment(s) use the wrong transcript sourcePath`);
  }
  if (missingEvidenceSegments > 0) {
    hardIssues.push(`${missingEvidenceSegments} segment(s) lack required evidence`);
  }
  if (invalidEvidenceSegments > 0) {
    hardIssues.push(`${invalidEvidenceSegments} segment(s) contain invalid evidence`);
  }
  if (qaCount > validQaCount) {
    hardIssues.push(`${qaCount - validQaCount} qa segment(s) are malformed`);
  }
  if (input.transcriptBytes === undefined) {
    hardIssues.push("matching canonical transcript is missing");
  } else if (input.transcriptBytes === 0) {
    hardIssues.push("matching canonical transcript is empty");
  }

  const interval = transcriptInterval(input.transcriptStartSeconds, input.durationSeconds);
  if (input.segments.length > 0 && interval === undefined) {
    hardIssues.push("matching canonical transcript duration is missing or unusable");
  }
  const distribution = temporalDistribution(anchors, interval);
  const qaTemporalBinsCovered = occupiedBins(qaAnchors, interval);
  const qaExpectation = input.qaExpectation ?? "none";
  if (qaExpectation === "explicit_title" && validQaCount === 0 && input.segments.length > 0) {
    reviewSignals.push("explicit Q&A title has no valid qa segments");
  } else if (qaExpectation === "explicit_title" && validQaCount > 0 && interval !== undefined && interval.durationSeconds >= 3_600
      && qaTemporalBinsCovered <= 1) {
    reviewSignals.push("Q&A records occupy only one temporal bin in a long explicit-title Q&A video");
  }
  if (qaExpectation === "configured_video_type" && validQaCount === 0 && input.segments.length > 0) {
    diagnosticSignals.push("configured video type expects Q&A, retained as diagnostic context only");
  }
  const auditRoute: AuditRoute = hardIssues.length > 0
      ? "repair_required"
      : reviewSignals.length > 0
          ? "review_candidate"
          : "low_signal";
  const segmentCount = input.segments.length;
  const durationMinutes = interval === undefined ? undefined : interval.durationSeconds / 60;
  const largestAnchorGapMinutes = distribution.largestGapPct === undefined || durationMinutes === undefined
      ? undefined
      : durationMinutes * distribution.largestGapPct / 100;
  const evidenceGap = positive(input.transcriptBytes) && segmentCount > 0
      ? largestEvidenceGap(evidenceSpans, interval)
      : undefined;
  const riskSignals = [...hardIssues];
  riskSignals.push(...reviewSignals);
  riskSignals.push(...diagnosticSignals);
  if (riskSignals.length === 0) {
    riskSignals.push("no repair or Q&A review cue; evidence gaps need a transcript spot check and the latest audit notes");
  }

  return {
    rank: 0,
    auditRoute,
    videoId: input.videoId,
    fileStem: input.fileStem,
    filePath: input.filePath,
    videoTitle: input.videoTitle,
    processLogEntries: input.processLogEntries,
    transcriptBytes: input.transcriptBytes,
    shardBytes: input.shardBytes,
    shardToTranscriptRatio: positive(input.transcriptBytes) ? input.shardBytes / input.transcriptBytes : undefined,
    durationMinutes,
    transcriptBytesPerMinute: input.transcriptBytes === undefined || durationMinutes === undefined
        ? undefined : input.transcriptBytes / durationMinutes,
    segmentCount,
    qaCount,
    validQaCount,
    qaTemporalBinsCovered,
    segmentsPerHour: durationMinutes === undefined ? undefined : segmentCount / (durationMinutes / 60),
    firstSegmentPositionPct: distribution.firstPct,
    lastSegmentPositionPct: distribution.lastPct,
    temporalBinsCovered: distribution.binsCovered,
    largestAnchorGapPct: distribution.largestGapPct,
    largestAnchorGapMinutes,
    largestEvidenceGapPct: evidenceGap === undefined || interval === undefined ? undefined
        : (evidenceGap.endSeconds - evidenceGap.startSeconds) / interval.durationSeconds * 100,
    largestEvidenceGapMinutes: evidenceGap === undefined ? undefined : (evidenceGap.endSeconds - evidenceGap.startSeconds) / 60,
    largestEvidenceGapStartSeconds: evidenceGap?.startSeconds,
    largestEvidenceGapEndSeconds: evidenceGap?.endSeconds,
    validAnchorCount: anchors.length,
    invalidAnchorCount,
    missingSourcePathSegments,
    wrongSourcePathSegments,
    missingEvidenceSegments,
    invalidEvidenceSegments,
    riskSignals,
    ...(input.latestProcessingRecord === undefined ? {} : {latestProcessingRecord: input.latestProcessingRecord}),
  };
}

export function rankVideoSegmentAuditRisks(rows: VideoSegmentAuditRiskRow[]): VideoSegmentAuditRiskRow[] {
  return rows.filter((row) => row.segmentCount > 0).sort((left, right) =>
      ROUTE_ORDER[left.auditRoute] - ROUTE_ORDER[right.auditRoute]
      || compareDefinedGapsDescending(left.largestEvidenceGapMinutes, right.largestEvidenceGapMinutes)
      || compareDefinedGapsDescending(left.largestEvidenceGapPct, right.largestEvidenceGapPct)
      || left.fileStem.localeCompare(right.fileStem))
      .map((row, index) => ({...row, rank: index + 1}));
}

export function renderVideoSegmentAuditRiskTsv(rows: VideoSegmentAuditRiskRow[]): string {
  const headers = [
    "file stem", "rank", "process log entries", "transcript bytes", "shard bytes",
    "shard to transcript ratio", "duration minutes", "Transcript Bytes Per Minute",
    "segment count", "qa count", "valid qa count", "qa temporal bins covered", "segments per hour",
    "first segment position pct", "last segment position pct", "temporal bins covered", "largest anchor gap pct",
    "largest anchor gap minutes",
    "largest evidence gap pct", "largest evidence gap minutes", "largest evidence gap start", "largest evidence gap end",
    "valid anchor count", "latest processing timestamp", "latest processing log line",
    "latest processing result", "latest processing notes", "audit route",
  ];
  const body = rows.filter((row) => row.segmentCount > 0).map((row) => [
    row.filePath ?? row.fileStem, row.rank,
    row.processLogEntries, row.transcriptBytes ?? "", row.shardBytes,
    format(row.shardToTranscriptRatio, 4),
    format(row.durationMinutes, 1), format(row.transcriptBytesPerMinute, 2),
    row.segmentCount, row.qaCount, row.validQaCount, row.qaTemporalBinsCovered,
    format(row.segmentsPerHour, 2), format(row.firstSegmentPositionPct, 1), format(row.lastSegmentPositionPct, 1),
    row.temporalBinsCovered, format(row.largestAnchorGapPct, 1), format(row.largestAnchorGapMinutes, 1),
    format(row.largestEvidenceGapPct, 1), format(row.largestEvidenceGapMinutes, 1),
    formatTimestamp(row.largestEvidenceGapStartSeconds), formatTimestamp(row.largestEvidenceGapEndSeconds),
    row.validAnchorCount, row.latestProcessingRecord?.timestamp ?? "",
    row.latestProcessingRecord?.lineNumber ?? "", row.latestProcessingRecord?.result ?? "", row.latestProcessingRecord?.notes ?? "",
    row.auditRoute,
  ].map(escapeTsv).join("\t"));
  return `${headers.join("\t")}\n${body.join("\n")}\n`;
}

export function parseStrictTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  let parts: string[];
  if (/^\d+:\d{2}$/u.test(value)) {
    parts = value.split(":");
  } else if (/^\d+:\d{2}:\d{2}$/u.test(value)) {
    parts = value.split(":");
  } else {
    return undefined;
  }
  const numbers = parts.map(Number);
  if (numbers.some((part) => !Number.isSafeInteger(part) || part < 0)) {
    return undefined;
  }
  if (numbers.length === 2) {
    if (numbers[1]! > 59) {
      return undefined;
    }
    return numbers[0]! * 60 + numbers[1]!;
  }
  if (numbers[1]! > 59 || numbers[2]! > 59) {
    return undefined;
  }
  return numbers[0]! * 3_600 + numbers[1]! * 60 + numbers[2]!;
}

function boundedTimestamp(value: unknown, durationSeconds: number | undefined, startSeconds?: number): number | undefined {
  const seconds = parseStrictTimestamp(value);
  if (seconds === undefined) {
    return undefined;
  }
  if (durationSeconds !== undefined && seconds > durationSeconds + TIMESTAMP_TOLERANCE_SECONDS) {
    return undefined;
  }
  if (startSeconds !== undefined && seconds < startSeconds - TIMESTAMP_TOLERANCE_SECONDS) {
    return undefined;
  }
  return seconds;
}

interface TranscriptInterval {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

function transcriptInterval(startSeconds: number | undefined, endSeconds: number | undefined): TranscriptInterval | undefined {
  if (!positive(endSeconds)) {
    return undefined;
  }
  const start = startSeconds ?? 0;
  if (!Number.isFinite(start) || start < 0 || start >= endSeconds) {
    return undefined;
  }
  return {startSeconds: start, endSeconds, durationSeconds: endSeconds - start};
}

function temporalDistribution(anchors: number[], interval: TranscriptInterval | undefined): {
  firstPct: number | undefined; lastPct: number | undefined; binsCovered: number; largestGapPct: number | undefined;
} {
  if (interval === undefined || anchors.length === 0) {
    return {firstPct: undefined, lastPct: undefined, binsCovered: 0, largestGapPct: undefined};
  }
  const sorted = [...new Set(anchors.map((anchor) => clamp(anchor, interval.startSeconds, interval.endSeconds)))].sort((a, b) => a - b);
  const points = [interval.startSeconds, ...sorted, interval.endSeconds];
  let largestGap = 0;
  for (let index = 1; index < points.length; index += 1) {
    largestGap = Math.max(largestGap, points[index]! - points[index - 1]!);
  }
  return {
    firstPct: ((sorted[0]! - interval.startSeconds) / interval.durationSeconds) * 100,
    lastPct: ((sorted[sorted.length - 1]! - interval.startSeconds) / interval.durationSeconds) * 100,
    binsCovered: occupiedBins(sorted, interval),
    largestGapPct: (largestGap / interval.durationSeconds) * 100,
  };
}

function occupiedBins(anchors: number[], interval: TranscriptInterval | undefined): number {
  if (interval === undefined) {
    return 0;
  }
  return new Set(anchors.map((anchor) => {
    const bounded = clamp(anchor, interval.startSeconds, interval.endSeconds);
    return Math.min(9, Math.floor(((bounded - interval.startSeconds) / interval.durationSeconds) * 10));
  })).size;
}

interface EvidenceSpan {
  startSeconds: number;
  endSeconds: number;
}

function largestEvidenceGap(spans: EvidenceSpan[], interval: TranscriptInterval | undefined): EvidenceSpan | undefined {
  if (interval === undefined) {
    return undefined;
  }
  // Union authored evidence spans, including point citations. Segment endpoints
  // alone do not establish evidence. This is geometry, not semantic completeness.
  const sorted = spans.map((span) => ({
    startSeconds: clamp(span.startSeconds, interval.startSeconds, interval.endSeconds),
    endSeconds: clamp(span.endSeconds, interval.startSeconds, interval.endSeconds),
  })).sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds);
  let cursor = interval.startSeconds;
  let largest = {startSeconds: cursor, endSeconds: cursor};
  for (const span of [...sorted, {startSeconds: interval.endSeconds, endSeconds: interval.endSeconds}]) {
    if (span.startSeconds - cursor > largest.endSeconds - largest.startSeconds) {
      largest = {startSeconds: cursor, endSeconds: span.startSeconds};
    }
    cursor = Math.max(cursor, span.endSeconds);
  }
  return largest;
}

function compareDefinedGapsDescending(left: number | undefined, right: number | undefined): number {
  if (left === undefined) {
    return right === undefined ? 0 : 1;
  }
  if (right === undefined) {
    return -1;
  }
  return right - left;
}

function normalizePath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\.\//u, "");
}

function positive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function format(value: number | undefined, digits: number): string {
  return value === undefined ? "" : value.toFixed(digits);
}

function escapeTsv(value: string | number | boolean): string {
  return String(value).replace(/[\t\r\n]+/gu, " ").trim();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatTimestamp(value: number | undefined): string {
  if (value === undefined) {
    return "";
  }
  const seconds = Math.floor(value);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor(seconds % 3_600 / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}
