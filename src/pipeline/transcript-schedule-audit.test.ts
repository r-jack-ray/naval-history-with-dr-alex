import assert from "node:assert/strict";
import test from "node:test";

import { buildTranscriptScheduleAudit } from "./transcript-schedule-audit.js";

const records = [
  record("a", "2026-03-01T00:00:00Z", 30),
  record("b", "2026-02-01T00:00:00Z", 20),
  record("c", "2026-01-01T00:00:00Z", 10),
];

test("accepts unchecked, in-progress, and checked rows across a complete balanced schedule", () => {
  const audit = buildTranscriptScheduleAudit({
    manifest: { transcripts: records },
    manifestPath: "src/transcripts/manifest.json",
    schedules: [
      schedule("one.md", 1, 2, 2, [row("x", records[0]!), row("~", records[1]!)]),
      schedule("two.md", 2, 2, 1, [row(" ", records[2]!)]),
    ],
    rootDir: "C:/repo",
    fileExists: () => true,
  });

  assert.deepEqual(audit.issues, []);
  assert.deepEqual(
    [audit.stats.scheduledTranscriptCount, audit.stats.uncheckedCount, audit.stats.inProgressCount, audit.stats.checkedCount],
    [3, 1, 1, 1],
  );
});

test("reports invalid states, duplicate rows, missing files, and incomplete manifest coverage", () => {
  const badRows = [row("X", records[0]!), row(" ", records[0]!)];
  const audit = buildTranscriptScheduleAudit({
    manifest: { transcripts: records },
    manifestPath: "src/transcripts/manifest.json",
    schedules: [schedule("one.md", 1, 1, 2, badRows)],
    rootDir: "C:/repo",
    fileExists: () => false,
  });
  const codes = new Set(audit.issues.map((issue) => issue.code));
  for (const code of [
    "invalid-schedule-state",
    "duplicate-schedule-path",
    "duplicate-schedule-video-id",
    "missing-scheduled-transcript",
    "manifest-transcript-not-scheduled",
  ]) assert.ok(codes.has(code), code);
});

test("optional artifact checks require post-schedule log and shard completion", () => {
  const schedules = [schedule("one.md", 1, 1, 3, [row("x", records[0]!), row("~", records[1]!), row(" ", records[2]!)])];
  const log = [
    `2026-07-09T01:00:00-05:00\tsrc/transcripts/txt/stored_a.txt\ta\tcurated\tno\tdone`,
    `2026-07-09T01:00:00-05:00\tsrc/transcripts/txt/stored_b.txt\tb\tcurated\tno\tdone`,
  ].join("\n");
  const audit = buildTranscriptScheduleAudit({
    manifest: { transcripts: records },
    manifestPath: "src/transcripts/manifest.json",
    schedules,
    rootDir: "C:/repo",
    fileExists: (path) => path.includes("src\\transcripts\\txt") || path.endsWith("stored_a.json") || path.endsWith("stored_b.json"),
    checkArtifacts: true,
    processingLogText: log,
    processingLogPath: "processing.log",
    segmentsInput: "segments",
  });
  assert.equal(audit.stats.errorCount, 0);
  assert.equal(audit.issues[0]?.code, "in-progress-ready-to-finalize");
});

test("rejects old-form shards when artifact checks require a manifest filename", () => {
  const audit = buildTranscriptScheduleAudit({
    manifest: { transcripts: records },
    manifestPath: "src/transcripts/manifest.json",
    schedules: [schedule("one.md", 1, 1, 3, [row("x", records[0]!), row(" ", records[1]!), row(" ", records[2]!)])],
    rootDir: "C:/repo",
    fileExists: (path) => path.includes("src\\transcripts\\txt") || path.endsWith("video-a.json"),
    checkArtifacts: true,
    processingLogText: "2026-07-09T01:00:00-05:00\tsrc/transcripts/txt/stored_a.txt\ta\tcurated\tno\tdone\n",
    processingLogPath: "processing.log",
    segmentsInput: "segments",
  });

  assert.ok(audit.issues.some((issue) => issue.code === "checked-row-missing-shard"));
});

function record(videoId: string, publishedAt: string, count: number) {
  return {
    videoId,
    fileStem: `stored_${videoId}`,
    videoTitle: `Title ${videoId}`,
    videoPublishedAt: publishedAt,
    segmentCount: count,
    lastEndSeconds: count * 10,
    paths: { txt: `txt/stored_${videoId}.txt` },
  };
}

function row(state: string, item: ReturnType<typeof record>): string {
  return `- [${state}] src/transcripts/txt/stored_${item.videoId}.txt | ${item.videoId} | ${item.videoPublishedAt} | rows=${item.segmentCount} | durationSeconds=${item.lastEndSeconds} | ${item.videoTitle}`;
}

function schedule(path: string, number: number, count: number, files: number, rows: string[]) {
  return {
    path,
    text: [
      `# Schedule ${number}`,
      "Timestamp: 2026-07-09T00:33:27-05:00",
      `Schedule: ${number} of ${count}`,
      `Files in this schedule: ${files}`,
      `Total files split across schedules: ${records.length}`,
      "",
      ...rows,
    ].join("\n"),
  };
}
