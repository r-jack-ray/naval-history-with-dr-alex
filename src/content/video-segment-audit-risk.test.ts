import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeVideoSegmentRisk, parseStrictTimestamp, rankVideoSegmentAuditRisks, renderVideoSegmentAuditRiskTsv,
  type AuditSegment, type VideoSegmentAuditRiskInput,
} from "./video-segment-audit-risk.js";

const sourcePath = "src/transcripts/txt/sample-video_abc123.txt";
function input(overrides: Partial<VideoSegmentAuditRiskInput> = {}): VideoSegmentAuditRiskInput {
  return {
    fileStem: "sample-video_abc123", filePath: "src/derived/video-segments/sample-video_abc123.json",
    videoId: "abc123", videoTitle: "Sample video", canonicalSourcePath: sourcePath, processLogEntries: 0,
    transcriptBytes: 10_000, shardBytes: 2_000, durationSeconds: 3_600, segments: [span(0, 600)], ...overrides,
  };
}

test("strict timestamps reject malformed clock components", () => {
  assert.equal(parseStrictTimestamp("1:59"), 119);
  assert.equal(parseStrictTimestamp("1:02:03"), 3_723);
  for (const value of ["1:60", "1:60:00", "1:00:60", "-1:00", "1:2", "1:02:3", null, 60]) {
    assert.equal(parseStrictTimestamp(value), undefined, String(value));
  }
});

test("late evidence reports an exact leading gap without a predictive score", () => {
  const row = analyzeVideoSegmentRisk(input({durationSeconds: 7_200, segments: [span(7_080, 7_200)]}));
  assert.equal(row.auditRoute, "low_signal");
  assert.equal(row.largestEvidenceGapPct, 7_080 / 7_200 * 100);
  assert.equal(row.largestEvidenceGapMinutes, 118);
  assert.equal(row.largestEvidenceGapStartSeconds, 0);
  assert.equal(row.largestEvidenceGapEndSeconds, 7_080);
  assert.equal(row.lastSegmentPositionPct, 100);
  assert.equal("auditRiskScore" in row, false);
});

test("continuous evidence covers the space between its endpoints", () => {
  const row = analyzeVideoSegmentRisk(input({segments: [span(0, 3_600)]}));
  assert.equal(row.largestAnchorGapPct, 100);
  assert.equal(row.largestAnchorGapMinutes, 60);
  assert.equal(row.largestEvidenceGapPct, 0);
  assert.equal(row.largestEvidenceGapMinutes, 0);
  assert.equal(row.largestEvidenceGapStartSeconds, 0);
  assert.equal(row.largestEvidenceGapEndSeconds, 0);
});

test("union handles unsorted, overlapping, nested, duplicate, and touching intervals", () => {
  const segments = [span(400, 800), span(100, 600), span(200, 300), span(800, 900), span(100, 600)];
  for (const ordered of [segments, [...segments].reverse()]) {
    const row = analyzeVideoSegmentRisk(input({durationSeconds: 1_000, segments: ordered}));
    assert.equal(row.largestEvidenceGapPct, 10);
    assert.equal(row.largestEvidenceGapMinutes, 100 / 60);
    assert.equal(row.largestEvidenceGapStartSeconds, 0);
    assert.equal(row.largestEvidenceGapEndSeconds, 100);
  }
});

test("largest gap can be internal or trailing", () => {
  const internal = analyzeVideoSegmentRisk(input({durationSeconds: 1_000, segments: [span(0, 200), span(700, 1_000)]}));
  const trailing = analyzeVideoSegmentRisk(input({durationSeconds: 1_000, segments: [span(0, 200)]}));
  assert.equal(internal.largestEvidenceGapPct, 50);
  assert.equal(internal.largestEvidenceGapStartSeconds, 200);
  assert.equal(internal.largestEvidenceGapEndSeconds, 700);
  assert.equal(trailing.largestEvidenceGapPct, 80);
  assert.equal(trailing.largestEvidenceGapStartSeconds, 200);
  assert.equal(trailing.largestEvidenceGapEndSeconds, 1_000);
});

test("missing evidence end is a point even when the segment has an end", () => {
  const row = analyzeVideoSegmentRisk(input({
    durationSeconds: 1_200,
    segments: [{kind: "chapter", start: "5:00", end: "20:00", sourcePath, evidence: [{start: "5:00", note: "Point."}]}],
  }));
  assert.equal(row.largestEvidenceGapPct, 75);
  assert.equal(row.largestEvidenceGapStartSeconds, 300);
  assert.equal(row.largestEvidenceGapEndSeconds, 1_200);
});

test("nonzero transcript starts constrain the interval and preserve absolute gap locations", () => {
  const covered = analyzeVideoSegmentRisk(input({
    transcriptStartSeconds: 600, durationSeconds: 1_200, segments: [span(600, 900), span(900, 1_200)],
  }));
  assert.equal(covered.durationMinutes, 10);
  assert.equal(covered.firstSegmentPositionPct, 0);
  assert.equal(covered.lastSegmentPositionPct, 100);
  assert.equal(covered.largestAnchorGapPct, 50);
  assert.equal(covered.largestEvidenceGapPct, 0);
  const gap = analyzeVideoSegmentRisk(input({transcriptStartSeconds: 600, durationSeconds: 1_200, segments: [span(720, 900)]}));
  assert.equal(gap.largestEvidenceGapPct, 50);
  assert.equal(gap.largestEvidenceGapMinutes, 5);
  assert.equal(gap.largestEvidenceGapStartSeconds, 900);
  assert.equal(gap.largestEvidenceGapEndSeconds, 1_200);
});

test("invalid evidence, source paths, and segment timing cannot create coverage", () => {
  const cases: AuditSegment[] = [
    {...span(0, 600), sourcePath: "wrong.txt"}, {...span(0, 600), sourcePath: undefined},
    {...span(0, 600), start: "0:70"}, {...span(0, 600), end: "0:70"}, {...span(300, 600), end: "0:00"},
    {...span(0, 600), evidence: [{start: "0:00", end: "10:00", note: " "}]},
    {...span(0, 600), evidence: [{start: "0:00", end: "0:70", note: "Malformed."}]},
    {...span(0, 600), evidence: [{start: "10:00", end: "0:00", note: "Reversed."}]},
    {...span(0, 600), evidence: [null]},
  ];
  for (const segment of cases) {
    const row = analyzeVideoSegmentRisk(input({durationSeconds: 600, segments: [segment]}));
    assert.equal(row.auditRoute, "repair_required", JSON.stringify(segment));
    assert.equal(row.largestEvidenceGapPct, 100, JSON.stringify(segment));
    assert.equal(row.largestEvidenceGapStartSeconds, 0);
    assert.equal(row.largestEvidenceGapEndSeconds, 600);
  }
});

test("earlier citations remain valid and only evidence overlapping the segment contributes coverage", () => {
  const row = analyzeVideoSegmentRisk(input({
    durationSeconds: 1_200,
    segments: [{kind: "chapter", start: "5:00", end: "10:00", sourcePath, evidence: [
      {start: "0:00", end: "2:00", note: "Earlier supporting citation."},
      {start: "6:00", end: "9:00", note: "Local evidence."},
    ]}],
  }));
  assert.equal(row.auditRoute, "low_signal");
  assert.equal(row.invalidEvidenceSegments, 0);
  assert.ok(Math.abs(row.largestEvidenceGapPct! - 55) < 1e-9);
  assert.equal(row.largestEvidenceGapStartSeconds, 540);
  const clipped = analyzeVideoSegmentRisk(input({
    durationSeconds: 1_200, segments: [{kind: "chapter", start: "5:00", end: "10:00", sourcePath,
      evidence: [{start: "0:00", end: "20:00", note: "Broad supporting evidence."}]}],
  }));
  assert.equal(clipped.auditRoute, "low_signal");
  assert.equal(clipped.largestEvidenceGapPct, 50);
  assert.equal(clipped.largestEvidenceGapStartSeconds, 600);
});

test("malformed segment entries produce repair rows without throwing", () => {
  for (const malformed of [null, 7, "segment", []]) {
    const row = analyzeVideoSegmentRisk(input({segments: [malformed as unknown as AuditSegment]}));
    assert.equal(row.auditRoute, "repair_required");
    assert.equal(row.segmentCount, 1);
    assert.equal(row.largestEvidenceGapPct, 100);
  }
});

test("explicit-title Q&A requires valid records while configured types remain diagnostic", () => {
  const explicit = analyzeVideoSegmentRisk(input({qaExpectation: "explicit_title"}));
  const generic = analyzeVideoSegmentRisk(input({qaExpectation: "configured_video_type"}));
  assert.equal(explicit.auditRoute, "review_candidate");
  assert.match(explicit.riskSignals.join(" "), /explicit Q&A title/u);
  assert.equal(generic.auditRoute, "low_signal");
  assert.match(generic.riskSignals.join(" "), /diagnostic context only/u);
  const qa = {...span(0, 600), kind: "qa", question: "Fixture question?", answerShort: "Answer."};
  assert.equal(analyzeVideoSegmentRisk(input({durationSeconds: 600, qaExpectation: "explicit_title", segments: [qa]})).validQaCount, 1);
  const invalid = analyzeVideoSegmentRisk(input({segments: [{...qa, answerShort: " "}]}));
  assert.equal(invalid.validQaCount, 0);
  assert.equal(invalid.auditRoute, "repair_required");
});

test("zero-segment rows never enter ranking regardless of counts or structural issues", () => {
  const rows = [0, 1, 2, 20].map((processLogEntries) => analyzeVideoSegmentRisk(input({segments: [], processLogEntries})));
  rows.push(analyzeVideoSegmentRisk(input({segments: [], structuralIssues: ["malformed JSON"]})));
  assert.deepEqual(rankVideoSegmentAuditRisks(rows), []);
  const populated = analyzeVideoSegmentRisk(input({fileStem: "populated"}));
  assert.deepEqual(rankVideoSegmentAuditRisks([...rows, populated]).map(({fileStem, rank}) => ({fileStem, rank})), [{fileStem: "populated", rank: 1}]);
});

test("processing-log count and saturation context never suppress or promote a row", () => {
  const first = analyzeVideoSegmentRisk(input({processLogEntries: 1}));
  for (const processLogEntries of [0, 2, 3, 6, 100]) {
    const later = analyzeVideoSegmentRisk(input({
      processLogEntries,
      latestProcessingRecord: {timestamp: "2026-09-05T12:00:00", lineNumber: 12, result: "saturated", notes: "GPT-6 Astra Ultra audit added no further content."},
    }));
    const {processLogEntries: _firstCount, latestProcessingRecord: _firstLog, ...firstMeasures} = first;
    const {processLogEntries: _laterCount, latestProcessingRecord: _laterLog, ...laterMeasures} = later;
    assert.deepEqual(laterMeasures, firstMeasures);
  }
});

test("audio-related processing notes remain verbatim context without affecting measurements", () => {
  const record = {timestamp: "2026-09-05T12:00:00", lineNumber: 12, result: "audited", notes: "manual audio review completed"};
  const first = analyzeVideoSegmentRisk(input({latestProcessingRecord: record}));
  const later = analyzeVideoSegmentRisk(input({latestProcessingRecord: {...record, notes: "manual audio review remains"}}));
  const {latestProcessingRecord: firstRecord, ...firstMeasures} = first;
  const {latestProcessingRecord: laterRecord, ...laterMeasures} = later;
  assert.deepEqual(firstMeasures, laterMeasures);
  assert.equal(firstRecord?.notes, "manual audio review completed");
  assert.equal(laterRecord?.notes, "manual audio review remains");
  assert.equal("manualAudioReviewRemaining" in first, false);
});

test("gap percentage has no clip-length thresholds or size weighting", () => {
  const short = analyzeVideoSegmentRisk(input({durationSeconds: 120, segments: [span(0, 60)]}));
  const long = analyzeVideoSegmentRisk(input({durationSeconds: 7_200, segments: [span(0, 3_600)]}));
  assert.equal(short.largestEvidenceGapPct, 50);
  assert.equal(long.largestEvidenceGapPct, 50);
  assert.equal(short.largestEvidenceGapMinutes, 1);
  assert.equal(long.largestEvidenceGapMinutes, 60);
  assert.equal(analyzeVideoSegmentRisk(input({transcriptBytes: 1, shardBytes: 1_000_000})).largestEvidenceGapPct,
      analyzeVideoSegmentRisk(input()).largestEvidenceGapPct);
});

test("rank uses route, absolute gap, percentage, then filename without count tie-breaking", () => {
  const repair = analyzeVideoSegmentRisk(input({fileStem: "z-repair", structuralIssues: ["bad root"], segments: [span(0, 3_600)]}));
  const review = analyzeVideoSegmentRisk(input({fileStem: "z-review", qaExpectation: "explicit_title", segments: [span(0, 3_600)]}));
  const long = analyzeVideoSegmentRisk(input({fileStem: "z-long", durationSeconds: 7_200, segments: [span(0, 6_000)]}));
  const clip = analyzeVideoSegmentRisk(input({fileStem: "a-clip", durationSeconds: 180, segments: [span(0, 60)]}));
  assert.ok(long.largestEvidenceGapPct! < clip.largestEvidenceGapPct!);
  assert.deepEqual(rankVideoSegmentAuditRisks([clip, long, review, repair]).map(({fileStem}) => fileStem), ["z-repair", "z-review", "z-long", "a-clip"]);
  const tieA = analyzeVideoSegmentRisk(input({fileStem: "a-tie", processLogEntries: 99}));
  const tieB = analyzeVideoSegmentRisk(input({fileStem: "b-tie", processLogEntries: 0}));
  assert.deepEqual(rankVideoSegmentAuditRisks([tieB, tieA]).map(({fileStem}) => fileStem), ["a-tie", "b-tie"]);
  const lowPct = analyzeVideoSegmentRisk(input({fileStem: "a-low-pct", durationSeconds: 2_400, segments: [span(0, 1_800)]}));
  const highPct = analyzeVideoSegmentRisk(input({fileStem: "z-high-pct", durationSeconds: 1_200, segments: [span(0, 600)]}));
  assert.deepEqual(rankVideoSegmentAuditRisks([lowPct, highPct]).map(({fileStem}) => fileStem), ["z-high-pct", "a-low-pct"]);
});

test("invalid transcript intervals have undefined measurements and sort after measured repair rows", () => {
  for (const override of [{durationSeconds: undefined}, {durationSeconds: 600, transcriptStartSeconds: 600},
    {durationSeconds: 600, transcriptStartSeconds: 700}]) {
    const missing = analyzeVideoSegmentRisk(input({fileStem: "a-missing", ...override}));
    const measured = analyzeVideoSegmentRisk(input({fileStem: "z-measured", structuralIssues: ["bad root"]}));
    assert.equal(missing.largestEvidenceGapPct, undefined);
    assert.equal(missing.largestEvidenceGapMinutes, undefined);
    assert.equal(missing.largestEvidenceGapStartSeconds, undefined);
    assert.equal(missing.largestEvidenceGapEndSeconds, undefined);
    assert.equal(missing.transcriptBytesPerMinute, undefined);
    assert.deepEqual(rankVideoSegmentAuditRisks([missing, measured]).map(({fileStem}) => fileStem), ["z-measured", "a-missing"]);
  }
});

test("TSV exposes measured gaps and safe latest-processing context", () => {
  const row = analyzeVideoSegmentRisk(input({
    durationSeconds: 7_200, segments: [span(0, 3_900)], structuralIssues: ["issue\twith\nwhitespace"],
    latestProcessingRecord: {timestamp: "2026-09-05T12:00:00", lineNumber: 37, result: "strengthened\tsegments", notes: "Astra Ultra; added examples\nFull coverage\rchecked."},
  }));
  const lines = renderVideoSegmentAuditRiskTsv([row]).trimEnd().split("\n");
  const header = lines[0]!.split("\t");
  const cells = lines[1]!.split("\t");
  assert.deepEqual(header, [
    "file stem", "rank", "process log entries", "transcript bytes", "shard bytes",
    "shard to transcript ratio", "duration minutes", "Transcript Bytes Per Minute", "segment count", "qa count", "valid qa count",
    "qa temporal bins covered", "segments per hour", "first segment position pct", "last segment position pct",
    "temporal bins covered", "largest anchor gap pct", "largest anchor gap minutes", "largest evidence gap pct",
    "largest evidence gap minutes", "largest evidence gap start", "largest evidence gap end", "valid anchor count",
    "latest processing timestamp", "latest processing log line", "latest processing result",
    "latest processing notes", "audit route",
  ]);
  assert.equal(lines.length, 2);
  assert.equal(cells.length, header.length);
  for (const [column, expected] of [
    ["Transcript Bytes Per Minute", "83.33"],
    ["largest evidence gap pct", "45.8"], ["largest evidence gap start", "1:05:00"], ["largest evidence gap end", "2:00:00"],
    ["latest processing timestamp", "2026-09-05T12:00:00"],
    ["latest processing log line", "37"], ["latest processing result", "strengthened segments"],
    ["latest processing notes", "Astra Ultra; added examples Full coverage checked."],
  ]) assert.equal(cells[header.indexOf(column!)], expected);
  assert.equal(cells.at(-1), "repair_required");
  assert.doesNotMatch(header.join("\t"), /_|score|probability/u);
  const unavailable = renderVideoSegmentAuditRiskTsv([analyzeVideoSegmentRisk(input({durationSeconds: undefined}))]).trimEnd().split("\n")[1]!.split("\t");
  for (const name of ["Transcript Bytes Per Minute", "largest evidence gap pct", "largest evidence gap minutes", "largest evidence gap start", "largest evidence gap end",
    "latest processing timestamp", "latest processing log line", "latest processing result", "latest processing notes"]) {
    assert.equal(unavailable[header.indexOf(name)], "", name);
  }
  const short = renderVideoSegmentAuditRiskTsv([analyzeVideoSegmentRisk(input({durationSeconds: 601, segments: [span(0, 300)]}))]).trimEnd().split("\n")[1]!.split("\t");
  assert.equal(short[header.indexOf("duration minutes")], "10.0");
  assert.equal(short[header.indexOf("Transcript Bytes Per Minute")], "998.34");
  assert.equal(short[header.indexOf("largest evidence gap start")], "5:00");
  assert.equal(short[header.indexOf("largest evidence gap end")], "10:01");
  for (const [transcriptBytes, expected] of [[undefined, ""], [0, "0.00"]] as const) {
    const values = renderVideoSegmentAuditRiskTsv([analyzeVideoSegmentRisk(input({transcriptBytes}))]).trimEnd().split("\n")[1]!.split("\t");
    assert.equal(values[header.indexOf("Transcript Bytes Per Minute")], expected);
  }
});

function span(start: number, end: number): AuditSegment {
  return {kind: "chapter", start: timestamp(start), end: timestamp(end), sourcePath,
    evidence: [{start: timestamp(start), end: timestamp(end), note: "Transcript evidence."}]};
}
function timestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0 ? hours + ":" + String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0")
      : minutes + ":" + String(remainder).padStart(2, "0");
}
