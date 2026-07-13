export type ProcessingState = "yes" | "no" | "unknown";
export type AuditRoute = "repair_required" | "follow_up_required" | "review_candidate" | "low_signal";
export type RiskTier = "critical" | "high" | "medium" | "low";

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

export interface VideoSegmentAuditRiskInput {
  fileStem: string;
  filePath?: string;
  videoId: string;
  videoTitle: string;
  canonicalSourcePath?: string;
  processLogEntries: number;
  transcriptBytes: number | undefined;
  shardBytes: number;
  durationSeconds: number | undefined;
  segments: AuditSegment[];
  needsFurtherProcessing: ProcessingState;
  structuralIssues?: string[];
  qaExpected?: boolean;
  minimumEvidenceWindows?: number;
}

export interface VideoSegmentAuditRiskRow {
  rank: number;
  auditRiskScore: number;
  riskTier: RiskTier;
  auditRoute: AuditRoute;
  videoId: string;
  fileStem: string;
  filePath: string | undefined;
  videoTitle: string;
  needsFurtherProcessing: ProcessingState;
  processLogEntries: number;
  transcriptBytes: number | undefined;
  shardBytes: number;
  shardToTranscriptRatio: number | undefined;
  durationMinutes: number | undefined;
  segmentCount: number;
  qaCount: number;
  validQaCount: number;
  qaTemporalBinsCovered: number;
  segmentsPerHour: number | undefined;
  firstSegmentPositionPct: number | undefined;
  lastSegmentPositionPct: number | undefined;
  temporalBinsCovered: number;
  largestAnchorGapPct: number | undefined;
  validAnchorCount: number;
  invalidAnchorCount: number;
  missingSourcePathSegments: number;
  wrongSourcePathSegments: number;
  missingEvidenceSegments: number;
  invalidEvidenceSegments: number;
  riskSignals: string[];
}

const ROUTE_ORDER: Record<AuditRoute, number> = {
  repair_required: 0,
  follow_up_required: 1,
  review_candidate: 2,
  low_signal: 3,
};
const TIMESTAMP_TOLERANCE_SECONDS = 2;

export function analyzeVideoSegmentRisk(input: VideoSegmentAuditRiskInput): VideoSegmentAuditRiskRow {
  const hardIssues = [...(input.structuralIssues ?? [])];
  const reviewSignals: string[] = [];
  const minimumEvidenceWindows = input.minimumEvidenceWindows ?? 1;
  const anchors: number[] = [];
  const qaAnchors: number[] = [];
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
    const start = boundedTimestamp(segment.start, input.durationSeconds);
    const end = segment.end === undefined ? undefined : boundedTimestamp(segment.end, input.durationSeconds);
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

    if (typeof segment.sourcePath !== "string" || segment.sourcePath.trim().length === 0) {
      missingSourcePathSegments += 1;
    } else if (input.canonicalSourcePath !== undefined && normalizePath(segment.sourcePath) !== normalizePath(input.canonicalSourcePath)) {
      wrongSourcePathSegments += 1;
    }

    let validEvidenceCount = 0;
    let evidenceInvalid = false;
    if (!Array.isArray(segment.evidence) || segment.evidence.length < minimumEvidenceWindows) {
      missingEvidenceSegments += 1;
    } else {
      for (const evidenceValue of segment.evidence) {
        if (!isRecord(evidenceValue)) {
          evidenceInvalid = true;
          continue;
        }
        const evidence = evidenceValue as AuditEvidence;
        const evidenceStart = boundedTimestamp(evidence.start, input.durationSeconds);
        const evidenceEnd = evidence.end === undefined ? undefined : boundedTimestamp(evidence.end, input.durationSeconds);
        const validNote = typeof evidence.note === "string" && evidence.note.trim().length > 0;
        if (evidenceStart === undefined || !validNote || (evidence.end !== undefined && evidenceEnd === undefined)
          || (evidenceStart !== undefined && evidenceEnd !== undefined && evidenceEnd < evidenceStart)) {
          evidenceInvalid = true;
          if (evidenceStart === undefined) invalidAnchorCount += 1;
          if (evidence.end !== undefined && evidenceEnd === undefined) invalidAnchorCount += 1;
          continue;
        }
        validEvidenceCount += 1;
        anchors.push(evidenceStart);
        if (evidenceEnd !== undefined) anchors.push(evidenceEnd);
      }
      if (evidenceInvalid || validEvidenceCount < minimumEvidenceWindows) invalidEvidenceSegments += 1;
    }

    if (segment.kind === "qa") {
      qaCount += 1;
      const validText = typeof segment.question === "string" && segment.question.trim().length > 0
        && typeof segment.answerShort === "string" && segment.answerShort.trim().length > 0;
      if (validText && segmentTimeValid && start !== undefined && validEvidenceCount >= minimumEvidenceWindows && !evidenceInvalid) {
        validQaCount += 1;
        qaAnchors.push(start);
      }
    }
  }

  if (missingSourcePathSegments > 0) hardIssues.push(`${missingSourcePathSegments} segment(s) have a missing sourcePath`);
  if (wrongSourcePathSegments > 0) hardIssues.push(`${wrongSourcePathSegments} segment(s) use the wrong transcript sourcePath`);
  if (missingEvidenceSegments > 0) hardIssues.push(`${missingEvidenceSegments} segment(s) lack required evidence`);
  if (invalidEvidenceSegments > 0) hardIssues.push(`${invalidEvidenceSegments} segment(s) contain invalid evidence`);
  if (qaCount > validQaCount) hardIssues.push(`${qaCount - validQaCount} qa segment(s) are malformed`);
  if (input.transcriptBytes === undefined) hardIssues.push("matching canonical transcript is missing");
  else if (input.transcriptBytes === 0) hardIssues.push("matching canonical transcript is empty");

  const distribution = temporalDistribution(anchors, input.durationSeconds);
  const qaTemporalBinsCovered = occupiedBins(qaAnchors, input.durationSeconds);
  if (input.qaExpected && validQaCount === 0 && input.segments.length > 0) {
    reviewSignals.push("configured title or video type expects Q&A but the shard has no valid qa segments");
  } else if (input.qaExpected && validQaCount > 0 && input.durationSeconds !== undefined && input.durationSeconds >= 3_600
    && qaTemporalBinsCovered <= 1) {
    reviewSignals.push("Q&A records occupy only one temporal bin in a long Q&A-expected video");
  }
  if (input.segments.length > 0 && input.durationSeconds !== undefined && input.durationSeconds >= 1_800) {
    if ((distribution.largestGapPct ?? 0) >= 50) reviewSignals.push("valid anchors leave a gap of at least half the transcript duration");
    if (distribution.binsCovered <= 2) reviewSignals.push("valid anchors occupy at most two of ten transcript bins");
  }
  if (input.segments.length === 0 && input.needsFurtherProcessing !== "no") {
    reviewSignals.push("shard has no segments and is not intentionally completed");
  }
  if (input.needsFurtherProcessing === "unknown") reviewSignals.push("latest processing state is unknown");

  const auditRoute: AuditRoute = hardIssues.length > 0
    ? "repair_required"
    : input.needsFurtherProcessing === "yes"
      ? "follow_up_required"
      : reviewSignals.length > 0
        ? "review_candidate"
        : "low_signal";
  const score = riskScore(auditRoute, hardIssues, reviewSignals);
  const riskSignals = [...hardIssues, ...reviewSignals];
  if (riskSignals.length === 0) riskSignals.push("no deterministic failure or material heuristic warning detected");
  const durationMinutes = positive(input.durationSeconds) ? input.durationSeconds / 60 : undefined;
  const segmentCount = input.segments.length;

  return {
    rank: 0,
    auditRiskScore: score,
    riskTier: tierFor(score),
    auditRoute,
    videoId: input.videoId,
    fileStem: input.fileStem,
    filePath: input.filePath,
    videoTitle: input.videoTitle,
    needsFurtherProcessing: input.needsFurtherProcessing,
    processLogEntries: input.processLogEntries,
    transcriptBytes: input.transcriptBytes,
    shardBytes: input.shardBytes,
    shardToTranscriptRatio: positive(input.transcriptBytes) ? input.shardBytes / input.transcriptBytes : undefined,
    durationMinutes,
    segmentCount,
    qaCount,
    validQaCount,
    qaTemporalBinsCovered,
    segmentsPerHour: positive(input.durationSeconds) ? segmentCount / (input.durationSeconds / 3_600) : undefined,
    firstSegmentPositionPct: distribution.firstPct,
    lastSegmentPositionPct: distribution.lastPct,
    temporalBinsCovered: distribution.binsCovered,
    largestAnchorGapPct: distribution.largestGapPct,
    validAnchorCount: anchors.length,
    invalidAnchorCount,
    missingSourcePathSegments,
    wrongSourcePathSegments,
    missingEvidenceSegments,
    invalidEvidenceSegments,
    riskSignals,
  };
}

export function rankVideoSegmentAuditRisks(rows: VideoSegmentAuditRiskRow[]): VideoSegmentAuditRiskRow[] {
  return [...rows].sort((left, right) =>
    ROUTE_ORDER[left.auditRoute] - ROUTE_ORDER[right.auditRoute]
    || right.auditRiskScore - left.auditRiskScore
    || left.videoTitle.localeCompare(right.videoTitle)
    || left.videoId.localeCompare(right.videoId))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function renderVideoSegmentAuditRiskTsv(rows: VideoSegmentAuditRiskRow[]): string {
  const headers = [
    "file_stem", "rank", "audit_route", "audit_risk_score", "risk_tier", "video_id", "video_title",
    "needs_further_processing", "process_log_entries", "transcript_bytes", "shard_bytes", "shard_to_transcript_ratio", "duration_minutes",
    "segment_count", "qa_count", "valid_qa_count", "qa_temporal_bins_covered", "segments_per_hour",
    "first_segment_position_pct", "last_segment_position_pct", "temporal_bins_covered", "largest_anchor_gap_pct",
    "valid_anchor_count", "invalid_anchor_count", "missing_source_path_segments", "wrong_source_path_segments",
    "missing_evidence_segments", "invalid_evidence_segments", "risk_signals",
  ];
  const body = rows.map((row) => [
    row.filePath ?? row.fileStem, row.rank, row.auditRoute, row.auditRiskScore, row.riskTier, row.videoId, row.videoTitle,
    row.needsFurtherProcessing, row.processLogEntries, row.transcriptBytes ?? "", row.shardBytes, format(row.shardToTranscriptRatio, 4),
    format(row.durationMinutes, 1), row.segmentCount, row.qaCount, row.validQaCount, row.qaTemporalBinsCovered,
    format(row.segmentsPerHour, 2), format(row.firstSegmentPositionPct, 1), format(row.lastSegmentPositionPct, 1),
    row.temporalBinsCovered, format(row.largestAnchorGapPct, 1), row.validAnchorCount, row.invalidAnchorCount,
    row.missingSourcePathSegments, row.wrongSourcePathSegments, row.missingEvidenceSegments,
    row.invalidEvidenceSegments, row.riskSignals.join("; "),
  ].map(escapeTsv).join("\t"));
  return `${headers.join("\t")}\n${body.join("\n")}\n`;
}

export function parseStrictTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  let parts: string[];
  if (/^\d+:\d{2}$/u.test(value)) parts = value.split(":");
  else if (/^\d+:\d{2}:\d{2}$/u.test(value)) parts = value.split(":");
  else return undefined;
  const numbers = parts.map(Number);
  if (numbers.some((part) => !Number.isSafeInteger(part) || part < 0)) return undefined;
  if (numbers.length === 2) {
    if (numbers[1]! > 59) return undefined;
    return numbers[0]! * 60 + numbers[1]!;
  }
  if (numbers[1]! > 59 || numbers[2]! > 59) return undefined;
  return numbers[0]! * 3_600 + numbers[1]! * 60 + numbers[2]!;
}

function boundedTimestamp(value: unknown, durationSeconds: number | undefined): number | undefined {
  const seconds = parseStrictTimestamp(value);
  if (seconds === undefined) return undefined;
  if (durationSeconds !== undefined && seconds > durationSeconds + TIMESTAMP_TOLERANCE_SECONDS) return undefined;
  return seconds;
}

function temporalDistribution(anchors: number[], durationSeconds: number | undefined): {
  firstPct: number | undefined; lastPct: number | undefined; binsCovered: number; largestGapPct: number | undefined;
} {
  if (!positive(durationSeconds) || anchors.length === 0) {
    return { firstPct: undefined, lastPct: undefined, binsCovered: 0, largestGapPct: undefined };
  }
  const sorted = [...new Set(anchors.map((anchor) => Math.min(durationSeconds, anchor)))].sort((a, b) => a - b);
  const points = [0, ...sorted, durationSeconds];
  let largestGap = 0;
  for (let index = 1; index < points.length; index += 1) largestGap = Math.max(largestGap, points[index]! - points[index - 1]!);
  return {
    firstPct: (sorted[0]! / durationSeconds) * 100,
    lastPct: (sorted[sorted.length - 1]! / durationSeconds) * 100,
    binsCovered: occupiedBins(sorted, durationSeconds),
    largestGapPct: (largestGap / durationSeconds) * 100,
  };
}

function occupiedBins(anchors: number[], durationSeconds: number | undefined): number {
  if (!positive(durationSeconds)) return 0;
  return new Set(anchors.map((anchor) => Math.min(9, Math.floor((Math.min(durationSeconds, anchor) / durationSeconds) * 10)))).size;
}

function riskScore(route: AuditRoute, hardIssues: string[], reviewSignals: string[]): number {
  if (route === "repair_required") return clamp(82 + hardIssues.length * 3 + reviewSignals.length, 1, 99);
  if (route === "follow_up_required") return clamp(68 + reviewSignals.length * 3, 1, 99);
  if (route === "review_candidate") return clamp(25 + reviewSignals.length * 8, 1, 64);
  return 5;
}

function tierFor(score: number): RiskTier {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 35) return "medium";
  return "low";
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

function escapeTsv(value: string | number): string {
  return String(value).replace(/[\t\r\n]+/gu, " ").trim();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
