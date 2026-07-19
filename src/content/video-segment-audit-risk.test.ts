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
  const intentionalEmpty = analyzeVideoSegmentRisk(input({ processLogEntries: 1, segments: [], needsFurtherProcessing: "no" }));
  const unfinishedEmpty = analyzeVideoSegmentRisk(input({ processLogEntries: 1, segments: [], needsFurtherProcessing: "yes" }));
  assert.equal(followUp.auditRoute, "follow_up_required");
  assert.equal(followUp.riskTier, "high");
  assert.match(followUp.riskSignals.join(" "), /explicitly requests further processing/u);
  assert.equal(intentionalEmpty.auditRoute, "low_signal");
  assert.equal(intentionalEmpty.auditRiskScore, 5);
  assert.match(intentionalEmpty.riskSignals.join(" "), /no history segments after 1 recorded pass/u);
  assert.equal(unfinishedEmpty.auditRoute, "follow_up_required");
  assert.equal(analyzeVideoSegmentRisk(input({ needsFurtherProcessing: "unknown" })).auditRoute, "review_candidate");
});

test("three recorded passes strongly downweight residual metadata risk", () => {
  const firstPass = analyzeVideoSegmentRisk(input({ processLogEntries: 1, durationSeconds: 1_200 }));
  const secondPass = analyzeVideoSegmentRisk(input({ processLogEntries: 2, durationSeconds: 1_200 }));
  const thirdPass = analyzeVideoSegmentRisk(input({ processLogEntries: 3, durationSeconds: 1_200 }));
  const laterPass = analyzeVideoSegmentRisk(input({ processLogEntries: 6, durationSeconds: 1_200 }));

  assert.equal(secondPass.auditRiskScore, firstPass.auditRiskScore);
  assert.ok(thirdPass.auditRiskScore < secondPass.auditRiskScore);
  assert.ok(thirdPass.auditRiskScore - 5 <= (secondPass.auditRiskScore - 5) * 0.25);
  assert.equal(laterPass.auditRiskScore, thirdPass.auditRiskScore);
  assert.match(thirdPass.riskSignals.join(" "), /consume-plus-two-audits threshold/u);
});

test("three-pass weighting suppresses automatic follow-up promotion but not structural repair", () => {
  const secondPass = analyzeVideoSegmentRisk(input({ processLogEntries: 2, needsFurtherProcessing: "yes" }));
  const thirdPass = analyzeVideoSegmentRisk(input({ processLogEntries: 3, needsFurtherProcessing: "yes", durationSeconds: 1_200 }));
  const warnedThirdPass = analyzeVideoSegmentRisk(input({
    processLogEntries: 3,
    needsFurtherProcessing: "yes",
    durationSeconds: 1_200,
    qaExpectation: "explicit_title",
  }));
  const repair = analyzeVideoSegmentRisk(input({ processLogEntries: 3, structuralIssues: ["bad root"] }));

  assert.equal(secondPass.auditRoute, "follow_up_required");
  assert.equal(thirdPass.auditRoute, "low_signal");
  assert.equal(warnedThirdPass.auditRoute, "review_candidate");
  assert.match(thirdPass.riskSignals.join(" "), /prevents automatic follow-up promotion/u);
  assert.equal(repair.auditRoute, "repair_required");
});

test("manual-audio-only follow-up is deprioritized without hiding independent warnings", () => {
  const actionable = analyzeVideoSegmentRisk(input({
    videoId: "actionable",
    processLogEntries: 2,
    needsFurtherProcessing: "yes",
    durationSeconds: 1_200,
  }));
  const manualAudio = analyzeVideoSegmentRisk(input({
    videoId: "manual",
    processLogEntries: 2,
    needsFurtherProcessing: "yes",
    manualAudioReviewRemaining: true,
    durationSeconds: 1_200,
  }));
  const warnedManualAudio = analyzeVideoSegmentRisk(input({
    processLogEntries: 2,
    needsFurtherProcessing: "yes",
    manualAudioReviewRemaining: true,
    durationSeconds: 1_200,
    qaExpectation: "explicit_title",
  }));
  const repair = analyzeVideoSegmentRisk(input({
    processLogEntries: 2,
    needsFurtherProcessing: "yes",
    manualAudioReviewRemaining: true,
    structuralIssues: ["bad root"],
  }));

  assert.equal(actionable.auditRoute, "follow_up_required");
  assert.equal(manualAudio.auditRoute, "low_signal");
  assert.equal(warnedManualAudio.auditRoute, "review_candidate");
  assert.equal(repair.auditRoute, "repair_required");
  assert.match(manualAudio.riskSignals.join(" "), /only manual audio review/u);
});

test("shard and transcript sizes remain diagnostic only", () => {
  const compact = analyzeVideoSegmentRisk(input({ shardBytes: 1, transcriptBytes: 100 }));
  const verbose = analyzeVideoSegmentRisk(input({ shardBytes: 1_000_000, transcriptBytes: 1_000_000 }));
  assert.equal(verbose.auditRiskScore, compact.auditRiskScore);
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
  assert.match(tsv.split("\n")[0] ?? "", /needs_further_processing\tmanual_audio_review_remaining\tprocess_log_entries/u);
  assert.match(tsv.split("\n")[1] ?? "", /\t\d+\.\d\t(?:critical|high|medium|low)\t/u);
});

test("within low signal, completed empty shards sort after heavily reviewed nonempty shards", () => {
  const fresh = analyzeVideoSegmentRisk(input({
    videoId: "fresh",
    videoTitle: "Fresh",
    processLogEntries: 2,
    durationSeconds: 300,
    segments: [{
      kind: "chapter", start: "0:00", end: "5:00", sourcePath,
      evidence: [{ start: "0:00", end: "5:00", note: "Complete short clip." }],
    }],
  }));
  const squeezed = analyzeVideoSegmentRisk(input({
    videoId: "squeezed",
    videoTitle: "Squeezed",
    processLogEntries: 3,
    durationSeconds: 1_740,
  }));
  const completedEmpty = analyzeVideoSegmentRisk(input({
    videoId: "empty",
    videoTitle: "Empty",
    processLogEntries: 1,
    segments: [],
  }));

  assert.equal(fresh.auditRoute, "low_signal");
  assert.equal(squeezed.auditRoute, "low_signal");
  assert.equal(completedEmpty.auditRoute, "low_signal");
  assert.ok(squeezed.auditRiskScore > fresh.auditRiskScore);
  assert.deepEqual(
    rankVideoSegmentAuditRisks([completedEmpty, squeezed, fresh]).map((row) => row.videoId),
    ["fresh", "squeezed", "empty"],
  );
});
