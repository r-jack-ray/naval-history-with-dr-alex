import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeVideoSegmentRisk,
  parseStrictTimestamp,
  rankVideoSegmentAuditRisks,
  renderVideoSegmentAuditRiskTsv,
  type VideoSegmentAuditRiskInput,
} from "./video-segment-audit-risk.js";

const sourcePath = "src/transcripts/txt/sample-video_abc123.txt";

function input(overrides: Partial<VideoSegmentAuditRiskInput> = {}): VideoSegmentAuditRiskInput {
  return {
    fileStem: "sample-video_abc123",
    filePath: "src/derived/video-segments/sample-video_abc123.json",
    videoId: "abc123",
    videoTitle: "Sample video",
    canonicalSourcePath: sourcePath,
    processLogEntries: 0,
    transcriptBytes: 10_000,
    shardBytes: 2_000,
    durationSeconds: 3_600,
    segments: [{
      kind: "chapter", start: "0:00", end: "10:00", sourcePath,
      evidence: [{ start: "0:00", end: "10:00", note: "Opening evidence." }],
    }],
    needsFurtherProcessing: "no",
    ...overrides,
  };
}

test("strict timestamp parsing rejects malformed clock components", () => {
  assert.equal(parseStrictTimestamp("1:59"), 119);
  assert.equal(parseStrictTimestamp("1:02:03"), 3_723);
  for (const value of ["1:60", "1:60:00", "1:00:60", "-1:00", "1:2", "1:02:3"]) {
    assert.equal(parseStrictTimestamp(value), undefined, value);
  }
});

test("one late segment exposes sparse temporal distribution rather than complete coverage", () => {
  const row = analyzeVideoSegmentRisk(input({
    durationSeconds: 7_200,
    needsFurtherProcessing: "unknown",
    segments: [{
      kind: "chapter", start: "1:58:00", sourcePath,
      evidence: [{ start: "1:58:00", end: "2:00:00", note: "Late evidence." }],
    }],
  }));
  assert.equal(row.auditRoute, "review_candidate");
  assert.equal(row.lastSegmentPositionPct, 100);
  assert.ok((row.largestAnchorGapPct ?? 0) > 95);
  assert.equal(row.temporalBinsCovered, 1);
});

test("distributed anchors cover more bins and preserve a smaller internal gap", () => {
  const clustered = analyzeVideoSegmentRisk(input({ segments: [
    { kind: "chapter", start: "1:00", sourcePath, evidence: [{ start: "1:00", note: "a" }] },
    { kind: "chapter", start: "2:00", sourcePath, evidence: [{ start: "2:00", note: "b" }] },
  ] }));
  const distributed = analyzeVideoSegmentRisk(input({ segments: [
    { kind: "chapter", start: "1:00", sourcePath, evidence: [{ start: "1:00", note: "a" }] },
    { kind: "chapter", start: "30:00", sourcePath, evidence: [{ start: "30:00", note: "b" }] },
  ] }));
  assert.ok(distributed.temporalBinsCovered > clustered.temporalBinsCovered);
  assert.ok((distributed.largestAnchorGapPct ?? 100) < (clustered.largestAnchorGapPct ?? 0));
  assert.ok(distributed.auditRiskScore < clustered.auditRiskScore);
});

test("transcript temporal metrics use the manifest transcript interval rather than video zero", () => {
  const row = analyzeVideoSegmentRisk(input({
    transcriptStartSeconds: 600,
    durationSeconds: 1_200,
    segments: [
      { kind: "chapter", start: "10:00", sourcePath, evidence: [{ start: "10:00", end: "15:00", note: "a" }] },
      { kind: "chapter", start: "15:00", sourcePath, evidence: [{ start: "15:00", end: "20:00", note: "b" }] },
    ],
  }));

  assert.equal(row.durationMinutes, 10);
  assert.equal(row.firstSegmentPositionPct, 0);
  assert.equal(row.lastSegmentPositionPct, 100);
  assert.equal(row.largestAnchorGapPct, 50);
  assert.equal(row.largestAnchorGapMinutes, 5);
});

test("structural and evidence defects route to repair", () => {
  const row = analyzeVideoSegmentRisk(input({
    structuralIssues: ["unsupported shard schemaVersion"],
    segments: [{ kind: "qa", start: "0:70", sourcePath: "wrong.txt", evidence: [{}] }],
  }));
  assert.equal(row.auditRoute, "repair_required");
  assert.equal(row.wrongSourcePathSegments, 1);
  assert.equal(row.invalidEvidenceSegments, 1);
  assert.equal(row.validQaCount, 0);
  assert.ok(row.invalidAnchorCount > 0);
});

test("Q/A expectation requires a valid qa record", () => {
  const row = analyzeVideoSegmentRisk(input({
    videoTitle: "Questions Q/A",
    qaExpectation: "explicit_title",
    segments: [{ kind: "chapter", start: "0:00", sourcePath, evidence: [{ start: "0:00", note: "Opening." }] }],
  }));
  assert.equal(row.auditRoute, "review_candidate");
  assert.match(row.riskSignals.join(" "), /expects Q&A/u);
});

test("a completed audit overrides only a generic configured Q/A expectation", () => {
  const overrides: Partial<VideoSegmentAuditRiskInput> = {
    durationSeconds: 600,
    segments: [{ kind: "chapter", start: "0:00", sourcePath, evidence: [{ start: "0:00", end: "10:00", note: "Opening." }] }],
    needsFurtherProcessing: "no",
  };
  const generic = analyzeVideoSegmentRisk(input({ ...overrides, qaExpectation: "configured_video_type" }));
  const explicit = analyzeVideoSegmentRisk(input({ ...overrides, qaExpectation: "explicit_title" }));

  assert.equal(generic.auditRoute, "low_signal");
  assert.equal(explicit.auditRoute, "review_candidate");
});

test("processing state controls route and intentional empty completion stays low signal", () => {
  const followUp = analyzeVideoSegmentRisk(input({ needsFurtherProcessing: "yes" }));
  const intentionalEmpty = analyzeVideoSegmentRisk(input({ segments: [], needsFurtherProcessing: "no" }));
  assert.equal(followUp.auditRoute, "follow_up_required");
  assert.equal(followUp.riskTier, "high");
  assert.match(followUp.riskSignals.join(" "), /explicitly requests further processing/u);
  assert.equal(intentionalEmpty.auditRoute, "low_signal");
  assert.equal(intentionalEmpty.auditRiskScore, 5);
  assert.equal(analyzeVideoSegmentRisk(input({ needsFurtherProcessing: "unknown" })).auditRoute, "review_candidate");
});

test("processing-log entry count and size diagnostics do not affect the risk grade", () => {
  const baseline = analyzeVideoSegmentRisk(input({ processLogEntries: 0, shardBytes: 1, transcriptBytes: 100 }));
  const verbose = analyzeVideoSegmentRisk(input({ processLogEntries: 5, shardBytes: 1_000_000, transcriptBytes: 1_000_000 }));
  assert.equal(verbose.auditRiskScore, baseline.auditRiskScore);
});

test("published grades use non-overlapping route bands", () => {
  const low = analyzeVideoSegmentRisk(input({ durationSeconds: 1_200 }));
  const review = analyzeVideoSegmentRisk(input({ durationSeconds: 1_200, needsFurtherProcessing: "unknown" }));
  const followUp = analyzeVideoSegmentRisk(input({ durationSeconds: 1_200, needsFurtherProcessing: "yes" }));
  const repair = analyzeVideoSegmentRisk(input({ durationSeconds: 1_200, structuralIssues: ["bad root"] }));

  assert.ok(low.auditRiskScore < 35);
  assert.ok(review.auditRiskScore >= 35 && review.auditRiskScore < 65);
  assert.ok(followUp.auditRiskScore >= 65 && followUp.auditRiskScore < 85);
  assert.ok(repair.auditRiskScore >= 85 && repair.auditRiskScore <= 99);
});

test("route precedence beats score and TSV uses risk terminology", () => {
  const repair = analyzeVideoSegmentRisk(input({ videoTitle: "Z repair", structuralIssues: ["bad root"] }));
  const followUp = analyzeVideoSegmentRisk(input({ videoTitle: "A follow up", needsFurtherProcessing: "yes" }));
  const ranked = rankVideoSegmentAuditRisks([followUp, repair]);
  const tsv = renderVideoSegmentAuditRiskTsv(ranked);
  assert.equal(ranked[0]?.auditRoute, "repair_required");
  assert.match(tsv.split("\n")[0] ?? "", /audit_route\taudit_risk_score\trisk_tier/u);
  assert.match(tsv.split("\n")[0] ?? "", /last_segment_position_pct/u);
  assert.match(tsv.split("\n")[0] ?? "", /largest_anchor_gap_minutes/u);
  assert.match(tsv.split("\n")[0] ?? "", /needs_further_processing\tprocess_log_entries\ttranscript_bytes/u);
  assert.match(tsv.split("\n")[1] ?? "", /\t\d+\.\d\t(?:critical|high|medium|low)\t/u);
});
