import { readFile } from "node:fs/promises";

import { writeTextAtomically } from "../pipeline/atomic-write.js";
import type {
  TranscriptBatchFailure,
  TranscriptBatchStatus,
  TranscriptFailureClassification,
} from "../youtube/batch-transcripts.js";

export const defaultTranscriptProblemStatusInput = "src/transcripts/fetch-status.json";
export const defaultTranscriptProblemReportOutput = "reports/transcript-problems.md";

export type TranscriptProblemConfidence = "high" | "medium" | "low";

export type TranscriptProblemReasonCode =
  | "source-audio-absent"
  | "source-audio-quality"
  | "caption-track-unavailable"
  | "requested-language-unavailable"
  | "empty-caption-track"
  | "request-limited-or-blocked"
  | "undetermined-fetch-failure";

export interface TranscriptProblemDiagnosis {
  reasonCode: TranscriptProblemReasonCode;
  probableReason: string;
  confidence: TranscriptProblemConfidence;
  evidence: string;
}

export interface TranscriptProblemItem extends TranscriptBatchFailure {
  diagnosis: TranscriptProblemDiagnosis;
}

export interface TranscriptProblemReport {
  sourcePath: string;
  sourceUpdatedAt: string;
  problems: TranscriptProblemItem[];
  classificationCounts: Record<TranscriptFailureClassification, number>;
  reasonCounts: Partial<Record<TranscriptProblemReasonCode, number>>;
}

export async function generateTranscriptProblemReport(options: {
  statusInput: string;
  output?: string;
}): Promise<TranscriptProblemReport> {
  const status = await readStatus(options.statusInput);
  const report = buildTranscriptProblemReport(status, options.statusInput);
  if (options.output !== undefined) {
    await writeTextAtomically(options.output, renderTranscriptProblemReport(report));
  }
  return report;
}

export function buildTranscriptProblemReport(
  status: Pick<TranscriptBatchStatus, "updatedAt" | "failures">,
  sourcePath: string,
): TranscriptProblemReport {
  const problems = status.failures
    .map((failure) => ({ ...failure, diagnosis: diagnoseTranscriptFailure(failure) }))
    .sort(compareProblems);
  const classificationCounts = emptyClassificationCounts();
  const reasonCounts: Partial<Record<TranscriptProblemReasonCode, number>> = {};

  for (const problem of problems) {
    classificationCounts[problem.classification] += 1;
    reasonCounts[problem.diagnosis.reasonCode] = (reasonCounts[problem.diagnosis.reasonCode] ?? 0) + 1;
  }

  return { sourcePath, sourceUpdatedAt: status.updatedAt, problems, classificationCounts, reasonCounts };
}

export function diagnoseTranscriptFailure(failure: TranscriptBatchFailure): TranscriptProblemDiagnosis {
  switch (failure.classification) {
    case "language_unavailable":
      return {
        reasonCode: "requested-language-unavailable",
        probableReason: "Caption tracks existed, but none matched the requested language.",
        confidence: "high",
        evidence: failure.error,
      };
    case "empty_transcript":
      return {
        reasonCode: "empty-caption-track",
        probableReason: "The selected caption track contained no usable transcript segments.",
        confidence: "high",
        evidence: failure.error,
      };
    case "rate_limited_or_blocked":
      return {
        reasonCode: "request-limited-or-blocked",
        probableReason: "The prior request was rate-limited, temporarily blocked, or challenged by YouTube.",
        confidence: "high",
        evidence: failure.error,
      };
    case "fetch_failed":
      return {
        reasonCode: "undetermined-fetch-failure",
        probableReason: "The prior fetch failed for a reason that the fetcher could not classify more specifically.",
        confidence: "low",
        evidence: failure.error,
      };
    case "no_caption_tracks":
      return diagnoseMissingCaptionTrack(failure);
  }
}

export function renderTranscriptProblemReport(report: TranscriptProblemReport): string {
  const lines = [
    "# Transcript Fetch Problems",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Prior-run source: ${report.sourcePath}`,
    `Source last updated: ${report.sourceUpdatedAt}`,
    "",
    "> This report is diagnostic only. It reads saved prior-run failures and does not request or retry transcripts. Probable reasons are inferences, not fresh checks of YouTube.",
    "",
    "## Summary",
    "",
    `- Videos with saved transcript-fetch failures: ${report.problems.length}`,
  ];

  for (const [classification, count] of Object.entries(report.classificationCounts)) {
    if (count > 0) lines.push(`- Fetch classification \`${classification}\`: ${count}`);
  }

  lines.push("", "### Probable reasons", "");
  if (report.problems.length === 0) {
    lines.push("No saved transcript-fetch failures were present.", "");
  } else {
    for (const [reason, count] of Object.entries(report.reasonCounts).sort(([left], [right]) => left.localeCompare(right))) {
      lines.push(`- \`${reason}\`: ${count}`);
    }
    lines.push("", "## Videos", "");
    lines.push("| Last attempt | Video | Source | Saved failure | Probable reason | Confidence | Evidence |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const problem of report.problems) {
      const title = problem.title ?? "Untitled video";
      const video = `[${escapeTable(title)}](https://www.youtube.com/watch?v=${encodeURIComponent(problem.videoId)})<br>\`${escapeTable(problem.videoId)}\``;
      lines.push(`| ${[
        escapeTable(problem.attemptedAt),
        video,
        escapeTable(problem.tabs.length > 0 ? problem.tabs.join(", ") : "unknown"),
        `\`${problem.classification}\``,
        escapeTable(problem.diagnosis.probableReason),
        problem.diagnosis.confidence,
        escapeTable(problem.diagnosis.evidence),
      ].join(" | ")} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function diagnoseMissingCaptionTrack(failure: TranscriptBatchFailure): TranscriptProblemDiagnosis {
  const title = failure.title ?? "";
  if (/\b(?:no|without)\s+(?:sound|audio)\b|\bsilent(?:\s+movie)?\b/iu.test(title)) {
    return {
      reasonCode: "source-audio-absent",
      probableReason: "The title indicates that the source video is silent or has no sound, so automatic captions could not be produced.",
      confidence: "high",
      evidence: `Title: ${title}; saved error: ${failure.error}`,
    };
  }
  if (/\bbad\s+(?:sound|audio)\b|\bpoor\s+(?:sound|audio)\b/iu.test(title)) {
    return {
      reasonCode: "source-audio-quality",
      probableReason: "The title reports poor audio, which may have prevented YouTube from producing a usable automatic caption track.",
      confidence: "medium",
      evidence: `Title: ${title}; saved error: ${failure.error}`,
    };
  }
  return {
    reasonCode: "caption-track-unavailable",
    probableReason: "No caption track was exposed to the prior fetch. The saved run cannot distinguish disabled captions, captions that were never generated, or a track unavailable to the fetcher.",
    confidence: "low",
    evidence: failure.error,
  };
}

function compareProblems(left: TranscriptProblemItem, right: TranscriptProblemItem): number {
  const time = right.attemptedAt.localeCompare(left.attemptedAt);
  return time === 0 ? left.videoId.localeCompare(right.videoId) : time;
}

function emptyClassificationCounts(): Record<TranscriptFailureClassification, number> {
  return {
    no_caption_tracks: 0,
    language_unavailable: 0,
    empty_transcript: 0,
    rate_limited_or_blocked: 0,
    fetch_failed: 0,
  };
}

function escapeTable(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/[\r\n]+/gu, " ").trim();
}

async function readStatus(path: string): Promise<Pick<TranscriptBatchStatus, "updatedAt" | "failures">> {
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!isRecord(value) || typeof value.updatedAt !== "string" || !Array.isArray(value.failures)) {
    throw new Error(`Transcript fetch status is invalid: ${path}`);
  }
  return value as unknown as Pick<TranscriptBatchStatus, "updatedAt" | "failures">;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
