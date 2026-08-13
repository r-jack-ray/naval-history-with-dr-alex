import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeVideoSegmentRisk,
  parseStrictTimestamp,
  rankVideoSegmentAuditRisks,
  renderVideoSegmentAuditRiskTsv,
  type AuditSegment,
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
      evidence: [{start: "0:00", end: "10:00", note: "Opening evidence."}],
    }],
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

test("one late segment exposes sparse temporal distribution without forcing a route", () => {
  const row = analyzeVideoSegmentRisk(input({
    durationSeconds: 7_200,
    segments: [{
      kind: "chapter", start: "1:58:00", sourcePath,
      evidence: [{start: "1:58:00", end: "2:00:00", note: "Late evidence."}],
    }],
  }));
  assert.equal(row.auditRoute, "low_signal");
  assert.equal(row.lastSegmentPositionPct, 100);
  assert.ok((row.largestAnchorGapPct ?? 0) > 95);
  assert.equal(row.temporalBinsCovered, 1);
});

test("distributed anchors cover more bins and preserve a smaller internal gap", () => {
  const clustered = analyzeVideoSegmentRisk(input({
    durationSeconds: 1_800,
    segments: segmentsAt(0, 600, 1_200, 1_800),
  }));
  const distributed = analyzeVideoSegmentRisk(input({
    durationSeconds: 1_800,
    segments: segmentsAt(0, 300, 600, 900, 1_200, 1_500, 1_800),
  }));
  assert.ok(distributed.temporalBinsCovered > clustered.temporalBinsCovered);
  assert.ok((distributed.largestAnchorGapPct ?? 100) < (clustered.largestAnchorGapPct ?? 0));
  assert.ok(distributed.auditRiskScore! < clustered.auditRiskScore!);
});

test("transcript temporal metrics use the manifest transcript interval rather than video zero", () => {
  const row = analyzeVideoSegmentRisk(input({
    transcriptStartSeconds: 600,
    durationSeconds: 1_200,
    segments: [
      {kind: "chapter", start: "10:00", sourcePath, evidence: [{start: "10:00", end: "15:00", note: "a"}]},
      {kind: "chapter", start: "15:00", sourcePath, evidence: [{start: "15:00", end: "20:00", note: "b"}]},
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
    structuralIssues: ["unknown shard root property"],
    segments: [{kind: "qa", start: "0:70", sourcePath: "wrong.txt", evidence: [{}]}],
  }));
  assert.equal(row.auditRoute, "repair_required");
  assert.equal(row.wrongSourcePathSegments, 1);
  assert.equal(row.invalidEvidenceSegments, 1);
  assert.equal(row.validQaCount, 0);
  assert.ok(row.invalidAnchorCount > 0);
});

test("explicit-title Q/A expectation requires a valid qa record", () => {
  const row = analyzeVideoSegmentRisk(input({
    videoTitle: "Questions Q/A",
    qaExpectation: "explicit_title",
    segments: [{kind: "chapter", start: "0:00", sourcePath, evidence: [{start: "0:00", note: "Opening."}]}],
  }));
  assert.equal(row.auditRoute, "review_candidate");
  assert.match(row.riskSignals.join(" "), /explicit Q&A title/u);
});

test("configured-video-type Q/A expectation is diagnostic only", () => {
  const generic = analyzeVideoSegmentRisk(input({qaExpectation: "configured_video_type"}));
  const explicit = analyzeVideoSegmentRisk(input({qaExpectation: "explicit_title"}));

  assert.equal(generic.auditRoute, "low_signal");
  assert.match(generic.riskSignals.join(" "), /diagnostic context only/u);
  assert.equal(explicit.auditRoute, "review_candidate");
});

test("empty shards use audit opportunity for route and remain unscored", () => {
  const unreviewed = analyzeVideoSegmentRisk(input({processLogEntries: 0, segments: []}));
  const onceReviewed = analyzeVideoSegmentRisk(input({processLogEntries: 1, segments: []}));
  const repeatedlyReviewed = analyzeVideoSegmentRisk(input({processLogEntries: 2, segments: []}));

  assert.equal(unreviewed.auditRoute, "review_candidate");
  assert.equal(onceReviewed.auditRoute, "review_candidate");
  assert.equal(repeatedlyReviewed.auditRoute, "low_signal");
  assert.equal(unreviewed.auditRiskScore, undefined);
  assert.equal(onceReviewed.auditRiskScore, undefined);
  assert.equal(repeatedlyReviewed.auditRiskScore, undefined);
});

test("processing-log count does not change route or score", () => {
  const firstPass = analyzeVideoSegmentRisk(input({processLogEntries: 1, durationSeconds: 1_200}));
  const secondPass = analyzeVideoSegmentRisk(input({processLogEntries: 2, durationSeconds: 1_200}));
  const thirdPass = analyzeVideoSegmentRisk(input({processLogEntries: 3, durationSeconds: 1_200}));
  const laterPass = analyzeVideoSegmentRisk(input({processLogEntries: 6, durationSeconds: 1_200}));

  assert.equal(firstPass.auditRoute, "low_signal");
  assert.equal(secondPass.auditRoute, firstPass.auditRoute);
  assert.equal(thirdPass.auditRoute, firstPass.auditRoute);
  assert.equal(laterPass.auditRoute, firstPass.auditRoute);
  assert.equal(secondPass.auditRiskScore, firstPass.auditRiskScore);
  assert.equal(thirdPass.auditRiskScore, secondPass.auditRiskScore);
  assert.equal(laterPass.auditRiskScore, thirdPass.auditRiskScore);
});

test("manual audio is display-only and cannot change route, score, order, or rank", () => {
  const withoutManual = analyzeVideoSegmentRisk(input({videoId: "a", fileStem: "a", manualAudioReviewRemaining: false}));
  const withManual = analyzeVideoSegmentRisk(input({videoId: "a", fileStem: "a", manualAudioReviewRemaining: true}));
  const {manualAudioReviewRemaining: _withoutDisplay, ...withoutRiskFields} = withoutManual;
  const {manualAudioReviewRemaining: _withDisplay, ...withRiskFields} = withManual;
  assert.deepEqual(withRiskFields, withoutRiskFields);

  const other = analyzeVideoSegmentRisk(input({videoId: "b", fileStem: "b", processLogEntries: 1}));
  const original = rankVideoSegmentAuditRisks([withoutManual, other]);
  const toggled = rankVideoSegmentAuditRisks([
    {...withoutManual, manualAudioReviewRemaining: true},
    {...other, manualAudioReviewRemaining: !other.manualAudioReviewRemaining},
  ]);
  assert.deepEqual(original.map(({videoId, rank}) => ({videoId, rank})), toggled.map(({videoId, rank}) => ({videoId, rank})));
});

test("relative gap score is exact and ignores absolute gap, bins, sizes, and segment count", () => {
  const zero = analyzeVideoSegmentRisk(input({
    durationSeconds: 1_800,
    segments: segmentsAt(...Array.from({length: 21}, (_, index) => index * 90)),
  }));
  const partial = analyzeVideoSegmentRisk(input({
    durationSeconds: 1_800,
    segments: segmentsAt(0, 495, 990, 1_485, 1_800),
  }));
  const capped = analyzeVideoSegmentRisk(input({durationSeconds: 1_800, segments: segmentsAt(0)}));
  const compact = analyzeVideoSegmentRisk(input({shardBytes: 1, transcriptBytes: 100}));
  const verbose = analyzeVideoSegmentRisk(input({shardBytes: 1_000_000, transcriptBytes: 1_000_000}));

  assert.equal(zero.auditRiskScore, 0);
  assert.equal(partial.auditRiskScore, 50);
  assert.equal(capped.auditRiskScore, 100);
  assert.equal(verbose.auditRiskScore, compact.auditRiskScore);
  const longer = analyzeVideoSegmentRisk(input({durationSeconds: 7_200, segments: segmentsAt(0, 1_800, 3_600, 5_400, 7_200)}));
  const shorter = analyzeVideoSegmentRisk(input({durationSeconds: 3_600, segments: segmentsAt(0, 900, 1_800, 2_700, 3_600)}));
  assert.equal(longer.largestAnchorGapPct, shorter.largestAnchorGapPct);
  assert.ok((longer.largestAnchorGapMinutes ?? 0) > (shorter.largestAnchorGapMinutes ?? 0));
  assert.equal(longer.auditRiskScore, shorter.auditRiskScore);
});

test("Q&A dispersion and extra temporal bins are diagnostic only", () => {
  const clustered = analyzeVideoSegmentRisk(input({
    qaExpectation: "configured_video_type",
    segments: [qaAt(0), ...segmentsAt(900, 1_800, 2_700, 3_600)],
  }));
  const distributed = analyzeVideoSegmentRisk(input({
    qaExpectation: "configured_video_type",
    segments: [qaAt(0), qaAt(300), qaAt(1_200), qaAt(2_400), ...segmentsAt(900, 1_800, 2_700, 3_600)],
  }));

  assert.equal(clustered.largestAnchorGapPct, distributed.largestAnchorGapPct);
  assert.ok(distributed.temporalBinsCovered > clustered.temporalBinsCovered);
  assert.ok(distributed.qaTemporalBinsCovered > clustered.qaTemporalBinsCovered);
  assert.equal(distributed.auditRiskScore, clustered.auditRiskScore);
});

test("route precedence and TSV expose the controlling model", () => {
  const repair = analyzeVideoSegmentRisk(input({fileStem: "repair", structuralIssues: ["bad root"]}));
  const review = analyzeVideoSegmentRisk(input({fileStem: "review", processLogEntries: 1, segments: []}));
  const ranked = rankVideoSegmentAuditRisks([review, repair]);
  const tsv = renderVideoSegmentAuditRiskTsv(ranked);
  const lines = tsv.trimEnd().split("\n");
  const header = (lines[0] ?? "").split("\t");
  assert.equal(ranked[0]?.auditRoute, "repair_required");
  assert.deepEqual(header, [
    "file stem",
    "rank",
    "audit risk score",
    "audit route",
    "process log entries",
    "transcript bytes",
    "shard bytes",
    "shard to transcript ratio",
    "duration minutes",
    "segment count",
    "qa count",
    "valid qa count",
    "qa temporal bins covered",
    "segments per hour",
    "first segment position pct",
    "last segment position pct",
    "temporal bins covered",
    "largest anchor gap pct",
    "largest anchor gap minutes",
    "valid anchor count",
    "manual audio review remaining",
  ]);
  const firstRow = (lines[1] ?? "").split("\t");
  assert.equal(firstRow.length, header.length);
  assert.match(firstRow[header.indexOf("audit risk score")] ?? "", /^\d+\.\d$/u);
  assert.equal(header.at(-1), "manual audio review remaining");
  assert.doesNotMatch(lines[0] ?? "", /_/u);
});

test("rank uses score before opportunity and file stem as the final tie-break", () => {
  const highAfterMorePasses = analyzeVideoSegmentRisk(input({
    fileStem: "z-high",
    videoId: "high",
    processLogEntries: 4,
    durationSeconds: 1_800,
    segments: segmentsAt(0),
  }));
  const lowerAfterOnePass = analyzeVideoSegmentRisk(input({
    fileStem: "a-low",
    videoId: "low",
    processLogEntries: 1,
    durationSeconds: 1_800,
    segments: segmentsAt(0, 450, 900, 1_350, 1_800),
  }));
  const equalFewerPasses = analyzeVideoSegmentRisk(input({fileStem: "z-fewer", videoId: "fewer", processLogEntries: 1}));
  const equalMorePasses = analyzeVideoSegmentRisk(input({fileStem: "a-more", videoId: "more", processLogEntries: 2}));
  const fileStemA = analyzeVideoSegmentRisk(input({fileStem: "a-final", videoId: "file-a", processLogEntries: 3}));
  const fileStemB = analyzeVideoSegmentRisk(input({fileStem: "b-final", videoId: "file-b", processLogEntries: 3}));
  const blank = analyzeVideoSegmentRisk(input({fileStem: "blank", videoId: "blank", processLogEntries: 2, segments: []}));

  assert.ok((highAfterMorePasses.auditRiskScore ?? 0) > (lowerAfterOnePass.auditRiskScore ?? 0));
  assert.deepEqual(
      rankVideoSegmentAuditRisks([lowerAfterOnePass, highAfterMorePasses]).map((row) => row.videoId),
      ["high", "low"],
  );
  assert.deepEqual(rankVideoSegmentAuditRisks([equalMorePasses, equalFewerPasses]).map((row) => row.videoId), ["fewer", "more"]);
  assert.deepEqual(rankVideoSegmentAuditRisks([fileStemB, fileStemA]).map((row) => row.videoId), ["file-a", "file-b"]);
  assert.deepEqual(rankVideoSegmentAuditRisks([blank, lowerAfterOnePass]).map((row) => row.videoId), ["low", "blank"]);
});

test("blank score renders as blank and manual audio is the final value", () => {
  const row = analyzeVideoSegmentRisk(input({
    fileStem: "blank",
    videoId: "blank",
    processLogEntries: 2,
    segments: [],
    manualAudioReviewRemaining: true,
  }));
  const lines = renderVideoSegmentAuditRiskTsv(rankVideoSegmentAuditRisks([row])).trimEnd().split("\n");
  const header = (lines[0] ?? "").split("\t");
  const cells = (lines[1] ?? "").split("\t");
  assert.equal(cells[header.indexOf("audit risk score")], "");
  assert.equal(cells.at(-1), "true");
});

function segmentsAt(...seconds: number[]): AuditSegment[] {
  return seconds.map((start) => ({
    kind: "chapter",
    start: timestamp(start),
    sourcePath,
    evidence: [{start: timestamp(start), note: `Evidence at ${start}.`}],
  }));
}

function qaAt(start: number): AuditSegment {
  return {
    kind: "qa",
    start: timestamp(start),
    sourcePath,
    question: `Question at ${start}?`,
    answerShort: "Answer.",
    evidence: [{start: timestamp(start), note: `Q&A evidence at ${start}.`}],
  };
}

function timestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
      : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
