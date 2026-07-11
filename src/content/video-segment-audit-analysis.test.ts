import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeVideoSegment,
  rankVideoSegmentAudits,
  renderVideoSegmentAuditTsv,
} from "./video-segment-audit-analysis.js";

test("raises the audit probability for sparse, incomplete shard coverage", () => {
  const row = analyzeVideoSegment({
    fileStem: "sparse-video_abc",
    videoId: "abc",
    videoTitle: "Sparse video",
    transcriptBytes: 100_000,
    shardBytes: 1_500,
    durationSeconds: 7_200,
    segments: [{ kind: "chapter", start: "1:00", end: "20:00", sourcePath: "transcript.txt", evidence: [{}] }],
    needsFurtherProcessing: "unknown",
  });

  assert.equal(row.priority, "critical");
  assert.ok(row.auditProbabilityPct >= 85);
  assert.equal(row.shardToTranscriptRatio, 0.015);
  assert.equal(row.segmentsPerHour, 0.5);
  assert.ok(Math.abs((row.coveragePct ?? 0) - 100 / 6) < 0.000_001);
});

test("keeps a dense, full-coverage shard at low probability", () => {
  const segments = Array.from({ length: 10 }, (_, index) => ({
    kind: index === 9 ? "qa" : "chapter",
    start: `${index * 6}:00`,
    end: `${(index + 1) * 6}:00`,
    sourcePath: "transcript.txt",
    evidence: [{}],
  }));
  const row = analyzeVideoSegment({
    fileStem: "healthy-video_def",
    videoId: "def",
    videoTitle: "Questions Answered",
    transcriptBytes: 100_000,
    shardBytes: 15_000,
    durationSeconds: 3_600,
    segments,
    needsFurtherProcessing: "no",
  });

  assert.equal(row.auditProbabilityPct, 5);
  assert.equal(row.priority, "low");
  assert.deepEqual(row.reasons, ["no basic heuristic warning signals"]);
});

test("treats an explicit further-processing state as high priority and renders valid TSV", () => {
  const row = analyzeVideoSegment({
    fileStem: "video_ghi",
    filePath: "src/derived/video-segments/video_ghi.json",
    videoId: "ghi",
    videoTitle: "Title\twith newline\n",
    transcriptBytes: 10_000,
    shardBytes: 2_000,
    durationSeconds: 600,
    segments: [{ kind: "chapter", start: "0:00", end: "10:00", sourcePath: "transcript.txt", evidence: [{}] }],
    needsFurtherProcessing: "yes",
  });
  const ranked = rankVideoSegmentAudits([row]);
  const tsv = renderVideoSegmentAuditTsv(ranked);

  assert.equal(ranked[0]?.rank, 1);
  assert.ok((ranked[0]?.auditProbabilityPct ?? 0) >= 65);
  assert.ok(["high", "critical"].includes(ranked[0]?.priority ?? ""));
  assert.equal(tsv.trimEnd().split("\n").length, 2);
  assert.ok(tsv.startsWith("file_stem\t"));
  assert.equal(tsv.split("\n")[1]?.split("\t")[0], "src/derived/video-segments/video_ghi.json");
  assert.match(tsv, /Title with newline/u);
});
