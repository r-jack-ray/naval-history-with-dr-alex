import assert from "node:assert/strict";
import test from "node:test";

import { buildSiteContentAudit, renderSiteContentAuditReport } from "./site-content-audit.js";

test("audits curated transcript-backed segments and reports uncurated transcripts", () => {
  const audit = buildSiteContentAudit({
    manifest: sampleManifest(),
    seed: sampleSeed(),
    rootDir: "C:/repo",
    transcriptRoot: "src/transcripts",
    limit: 10,
    fileExists: (path) => path.endsWith("sample-video_abc123.txt"),
  });

  assert.equal(audit.stats.storedTranscriptCount, 2);
  assert.equal(audit.stats.curatedSegmentCount, 1);
  assert.equal(audit.stats.uncuratedStoredTranscriptCount, 1);
  assert.equal(audit.stats.errorCount, 0);
  assert.equal(audit.stats.warningCount, 0);
  assert.equal(audit.uncuratedTranscripts[0]?.videoId, "def456");
  assert.equal(audit.uncuratedTranscripts[0]?.transcriptPath, "src/transcripts/txt/uncurated-video_def456.txt");
});

test("flags missing transcript evidence and source paths", () => {
  const seed = sampleSeed();
  delete seed.segments[0]!.sourcePath;
  seed.segments[0]!.evidence = [];

  const audit = buildSiteContentAudit({
    manifest: sampleManifest(),
    seed,
    rootDir: "C:/repo",
    transcriptRoot: "src/transcripts",
    limit: 10,
    fileExists: () => true,
  });

  assert.deepEqual(
    audit.issues.map((issue) => issue.code),
    ["missing-source-path", "missing-evidence-window"],
  );
  assert.equal(audit.stats.errorCount, 2);
});

test("flags segment timestamps outside the stored transcript range", () => {
  const seed = sampleSeed();
  seed.segments[0]!.start = "20:00";

  const audit = buildSiteContentAudit({
    manifest: sampleManifest(),
    seed,
    rootDir: "C:/repo",
    transcriptRoot: "src/transcripts",
    limit: 10,
    fileExists: () => true,
  });

  assert.equal(audit.issues.find((issue) => issue.code === "segment-start-outside-transcript")?.severity, "error");
});

test("counts valid processing log entries", () => {
  const audit = buildSiteContentAudit({
    manifest: sampleManifest(),
    seed: sampleSeed(),
    processingLogText: "2026-07-08T02:45:00-05:00\tsrc/transcripts/txt/sample-video_abc123.txt\tabc123\tcurated 1 notable point\tno\tready for site\n",
    processingLogPath: "src/derived/site-content-processing.log",
    rootDir: "C:/repo",
    transcriptRoot: "src/transcripts",
    limit: 10,
    fileExists: (path) => path.endsWith("sample-video_abc123.txt"),
  });

  assert.equal(audit.stats.processingLogEntryCount, 1);
  assert.equal(audit.stats.completedProcessingLogVideoCount, 1);
  assert.equal(audit.stats.errorCount, 0);
});

test("omits transcripts with a latest completed processing log line from backlog", () => {
  const audit = buildSiteContentAudit({
    manifest: sampleManifest(),
    seed: sampleSeed(),
    processingLogText: [
      "2026-07-08T02:45:00-05:00\tsrc/transcripts/txt/uncurated-video_def456.txt\tdef456\treviewed no usable segments\tyes\tfirst pass needs a revisit",
      "2026-07-08T03:45:00-05:00\tsrc/transcripts/txt/uncurated-video_def456.txt\tdef456\treviewed no usable segments\tno\tcomplete without site segment",
    ].join("\n"),
    rootDir: "C:/repo",
    transcriptRoot: "src/transcripts",
    limit: 10,
    fileExists: (path) => path.endsWith("sample-video_abc123.txt") || path.endsWith("uncurated-video_def456.txt"),
  });

  assert.equal(audit.stats.uncuratedStoredTranscriptCount, 0);
  assert.equal(audit.stats.completedProcessingLogVideoCount, 1);
  assert.equal(audit.uncuratedTranscripts.length, 0);
});

test("keeps transcripts in backlog when a later processing log line needs more work", () => {
  const audit = buildSiteContentAudit({
    manifest: sampleManifest(),
    seed: sampleSeed(),
    processingLogText: [
      "2026-07-08T02:45:00-05:00\tsrc/transcripts/txt/uncurated-video_def456.txt\tdef456\treviewed no usable segments\tno\tcomplete without site segment",
      "2026-07-08T03:45:00-05:00\tsrc/transcripts/txt/uncurated-video_def456.txt\tdef456\treopened for topic review\tyes\tneeds topic pass",
    ].join("\n"),
    rootDir: "C:/repo",
    transcriptRoot: "src/transcripts",
    limit: 10,
    fileExists: (path) => path.endsWith("sample-video_abc123.txt") || path.endsWith("uncurated-video_def456.txt"),
  });

  assert.equal(audit.stats.uncuratedStoredTranscriptCount, 1);
  assert.equal(audit.stats.completedProcessingLogVideoCount, 0);
  assert.equal(audit.uncuratedTranscripts[0]?.videoId, "def456");
});

test("flags malformed processing log entries", () => {
  const audit = buildSiteContentAudit({
    manifest: sampleManifest(),
    seed: sampleSeed(),
    processingLogText: "not enough fields\n",
    processingLogPath: "src/derived/site-content-processing.log",
    rootDir: "C:/repo",
    transcriptRoot: "src/transcripts",
    limit: 10,
    fileExists: () => true,
  });

  assert.equal(audit.issues.find((issue) => issue.code === "processing-log-field-count")?.severity, "error");
});

test("renders a markdown report", () => {
  const audit = buildSiteContentAudit({
    manifest: sampleManifest(),
    seed: sampleSeed(),
    rootDir: "C:/repo",
    transcriptRoot: "src/transcripts",
    limit: 1,
    fileExists: () => true,
  });

  const report = renderSiteContentAuditReport(audit);

  assert.match(report, /# Site Content Backlog/u);
  assert.match(report, /Uncurated Video \(def456\)/u);
});

function sampleManifest(): Parameters<typeof buildSiteContentAudit>[0]["manifest"] {
  return {
    transcripts: [
      {
        videoId: "abc123",
        videoTitle: "Sample Video",
        videoPublishedAt: "2026-07-01T00:00:00Z",
        segmentCount: 20,
        firstStartSeconds: 0,
        lastEndSeconds: 600,
        paths: {
          txt: "txt/sample-video_abc123.txt",
        },
      },
      {
        videoId: "def456",
        videoTitle: "Uncurated Video",
        videoPublishedAt: "2026-07-02T00:00:00Z",
        segmentCount: 10,
        firstStartSeconds: 0,
        lastEndSeconds: 300,
        paths: {
          txt: "txt/uncurated-video_def456.txt",
        },
      },
    ],
  };
}

function sampleSeed(): Parameters<typeof buildSiteContentAudit>[0]["seed"] {
  return {
    schemaVersion: 1,
    videos: [
      {
        videoId: "abc123",
        topics: ["destroyers"],
      },
    ],
    topics: [
      {
        slug: "destroyers",
        title: "Destroyers",
        summary: "Destroyer discussions.",
      },
    ],
    segments: [
      {
        id: "sample-segment",
        videoId: "abc123",
        slug: "sample-segment",
        title: "Sample segment",
        kind: "notable_point",
        start: "1:00",
        end: "2:00",
        topics: ["destroyers"],
        summary: "A sample segment.",
        body: "Transcript-grounded sample body.",
        sourcePath: "src/transcripts/txt/sample-video_abc123.txt",
        evidence: [
          {
            start: "1:00",
            end: "2:00",
            note: "Transcript evidence.",
          },
        ],
      },
    ],
  };
}
