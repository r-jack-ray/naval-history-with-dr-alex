export interface VideoSegmentAuditInput {
  fileStem: string;
  filePath?: string;
  videoId: string;
  videoTitle: string;
  transcriptBytes: number | undefined;
  shardBytes: number;
  durationSeconds: number | undefined;
  segments: AuditSegment[];
  needsFurtherProcessing: "yes" | "no" | "unknown";
  shardVideoId?: string | undefined;
  parseError?: string | undefined;
}

export interface AuditSegment {
  kind?: unknown;
  start?: unknown;
  end?: unknown;
  evidence?: unknown;
  sourcePath?: unknown;
}

export interface VideoSegmentAuditRow {
  rank: number;
  auditProbabilityPct: number;
  priority: "critical" | "high" | "medium" | "low";
  videoId: string;
  fileStem: string;
  filePath: string | undefined;
  videoTitle: string;
  needsFurtherProcessing: "yes" | "no" | "unknown";
  transcriptBytes: number | undefined;
  shardBytes: number;
  shardToTranscriptRatio: number | undefined;
  durationMinutes: number | undefined;
  segmentCount: number;
  qaCount: number;
  segmentsPerHour: number | undefined;
  coveragePct: number | undefined;
  missingEvidenceSegments: number;
  reasons: string[];
}

const QA_TITLE_PATTERN = /(?:\bq\s*&\s*a\b|\bquestions?\s+answered\b|\bquestion\s+and\s+answer\b|\blive\s+questions?\b)/iu;

export function analyzeVideoSegment(input: VideoSegmentAuditInput): VideoSegmentAuditRow {
  let score = input.needsFurtherProcessing === "no" ? 5 : 15;
  const reasons: string[] = [];
  const segmentCount = input.segments.length;
  const qaCount = input.segments.filter((segment) => segment.kind === "qa").length;
  const missingEvidenceSegments = input.segments.filter(
    (segment) =>
      typeof segment.sourcePath !== "string" ||
      segment.sourcePath.length === 0 ||
      !Array.isArray(segment.evidence) ||
      segment.evidence.length === 0,
  ).length;
  const shardToTranscriptRatio =
    input.transcriptBytes && input.transcriptBytes > 0 ? input.shardBytes / input.transcriptBytes : undefined;
  const durationMinutes =
    input.durationSeconds && input.durationSeconds > 0 ? input.durationSeconds / 60 : undefined;
  const segmentsPerHour =
    input.durationSeconds && input.durationSeconds > 0 ? segmentCount / (input.durationSeconds / 3600) : undefined;
  const lastSegmentSecond = findLastSegmentSecond(input.segments);
  const coveragePct =
    input.durationSeconds && input.durationSeconds > 0 && lastSegmentSecond !== undefined
      ? Math.min(100, (lastSegmentSecond / input.durationSeconds) * 100)
      : undefined;

  if (input.parseError) {
    score = 99;
    reasons.push(`invalid shard JSON: ${input.parseError}`);
  } else {
    if (input.needsFurtherProcessing === "yes") {
      score += 50;
      reasons.push("latest processing log says further processing is needed");
    }

    if (input.transcriptBytes === undefined) {
      score += 55;
      reasons.push("matching transcript file is missing");
    } else if (input.transcriptBytes === 0) {
      score += 45;
      reasons.push("matching transcript file is empty");
    }

    if (input.shardVideoId && input.shardVideoId !== input.videoId) {
      score += 50;
      reasons.push("shard videoId does not match the manifest");
    }

    if (segmentCount === 0) {
      if (input.needsFurtherProcessing === "no") {
        score += 5;
        reasons.push("empty shard is marked complete; verify intentional closure if priorities change");
      } else {
        score += 45;
        reasons.push("shard has no segments");
      }
    } else {
      score += ratioRisk(shardToTranscriptRatio, reasons);
      score += densityRisk(segmentsPerHour, reasons);
      score += coverageRisk(coveragePct, reasons);
    }

    if (QA_TITLE_PATTERN.test(input.videoTitle) && qaCount === 0 && segmentCount > 0) {
      score += 20;
      reasons.push("title signals Q&A but shard has no qa segments");
    }

    if (missingEvidenceSegments > 0) {
      score += Math.min(25, 5 + Math.round((missingEvidenceSegments / Math.max(1, segmentCount)) * 20));
      reasons.push(`${missingEvidenceSegments} segment(s) lack sourcePath or evidence`);
    }

  }

  const auditProbabilityPct = clamp(Math.round(score), 1, 99);
  if (reasons.length === 0) {
    reasons.push("no basic heuristic warning signals");
  }

  return {
    rank: 0,
    auditProbabilityPct,
    priority: priorityFor(auditProbabilityPct),
    videoId: input.videoId,
    fileStem: input.fileStem,
    filePath: input.filePath,
    videoTitle: input.videoTitle,
    needsFurtherProcessing: input.needsFurtherProcessing,
    transcriptBytes: input.transcriptBytes,
    shardBytes: input.shardBytes,
    shardToTranscriptRatio,
    durationMinutes,
    segmentCount,
    qaCount,
    segmentsPerHour,
    coveragePct,
    missingEvidenceSegments,
    reasons,
  };
}

export function rankVideoSegmentAudits(rows: VideoSegmentAuditRow[]): VideoSegmentAuditRow[] {
  return [...rows]
    .sort(
      (left, right) =>
        right.auditProbabilityPct - left.auditProbabilityPct ||
        left.videoTitle.localeCompare(right.videoTitle) ||
        left.videoId.localeCompare(right.videoId),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function renderVideoSegmentAuditTsv(rows: VideoSegmentAuditRow[]): string {
  const headers = [
    "file_stem",
    "rank",
    "audit_probability_pct",
    "priority",
    "video_id",
    "video_title",
    "needs_further_processing",
    "transcript_bytes",
    "shard_bytes",
    "shard_to_transcript_ratio",
    "duration_minutes",
    "segment_count",
    "qa_count",
    "segments_per_hour",
    "coverage_pct",
    "missing_evidence_segments",
    "reasons",
  ];
  const body = rows.map((row) =>
    [
      row.filePath ?? row.fileStem,
      row.rank,
      row.auditProbabilityPct,
      row.priority,
      row.videoId,
      row.videoTitle,
      row.needsFurtherProcessing,
      row.transcriptBytes ?? "",
      row.shardBytes,
      formatNumber(row.shardToTranscriptRatio, 4),
      formatNumber(row.durationMinutes, 1),
      row.segmentCount,
      row.qaCount,
      formatNumber(row.segmentsPerHour, 2),
      formatNumber(row.coveragePct, 1),
      row.missingEvidenceSegments,
      row.reasons.join("; "),
    ]
      .map(escapeTsv)
      .join("\t"),
  );

  return `${headers.join("\t")}\n${body.join("\n")}\n`;
}

function ratioRisk(ratio: number | undefined, reasons: string[]): number {
  if (ratio === undefined) return 0;
  if (ratio < 0.01) {
    reasons.push("shard is under 1% of transcript size");
    return 35;
  }
  if (ratio < 0.02) {
    reasons.push("shard is under 2% of transcript size");
    return 28;
  }
  if (ratio < 0.04) {
    reasons.push("shard is under 4% of transcript size");
    return 20;
  }
  if (ratio < 0.07) {
    reasons.push("shard is under 7% of transcript size");
    return 10;
  }
  if (ratio < 0.1) {
    reasons.push("shard is under 10% of transcript size");
    return 4;
  }
  return 0;
}

function densityRisk(segmentsPerHour: number | undefined, reasons: string[]): number {
  if (segmentsPerHour === undefined) return 0;
  if (segmentsPerHour < 0.75) {
    reasons.push("fewer than 0.75 segments per transcript hour");
    return 30;
  }
  if (segmentsPerHour < 1.5) {
    reasons.push("fewer than 1.5 segments per transcript hour");
    return 22;
  }
  if (segmentsPerHour < 2.5) {
    reasons.push("fewer than 2.5 segments per transcript hour");
    return 12;
  }
  if (segmentsPerHour < 4) {
    reasons.push("fewer than 4 segments per transcript hour");
    return 5;
  }
  return 0;
}

function coverageRisk(coveragePct: number | undefined, reasons: string[]): number {
  if (coveragePct === undefined) return 0;
  if (coveragePct < 50) {
    reasons.push("last segment ends before 50% of transcript duration");
    return 25;
  }
  if (coveragePct < 75) {
    reasons.push("last segment ends before 75% of transcript duration");
    return 15;
  }
  if (coveragePct < 90) {
    reasons.push("last segment ends before 90% of transcript duration");
    return 8;
  }
  return 0;
}

function findLastSegmentSecond(segments: AuditSegment[]): number | undefined {
  let latest: number | undefined;
  for (const segment of segments) {
    const value = parseTimestamp(typeof segment.end === "string" ? segment.end : segment.start);
    if (value !== undefined && (latest === undefined || value > latest)) latest = value;
  }
  return latest;
}

export function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d+(?::\d{1,2}){1,2}$/u.test(value)) return undefined;
  const parts = value.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return undefined;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
}

function priorityFor(probability: number): VideoSegmentAuditRow["priority"] {
  if (probability >= 85) return "critical";
  if (probability >= 65) return "high";
  if (probability >= 40) return "medium";
  return "low";
}

function formatNumber(value: number | undefined, digits: number): string {
  return value === undefined ? "" : value.toFixed(digits);
}

function escapeTsv(value: string | number): string {
  return String(value).replace(/[\t\r\n]+/gu, " ").trim();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
