import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TranscriptBatchFailure } from "../youtube/batch-transcripts.js";

import { buildTranscriptProblemReport, diagnoseTranscriptFailure, generateTranscriptProblemReport, renderTranscriptProblemReport, } from "./transcript-problem-report.js";

test("infers absent source audio only when prior-run title evidence supports it", () => {
  const diagnosis = diagnoseTranscriptFailure(failure({title: "Town Class (inadvertent silent movie style)"}));
  assert.equal(diagnosis.reasonCode, "source-audio-absent");
  assert.equal(diagnosis.confidence, "high");
  assert.match(diagnosis.evidence, /silent movie/iu);
});

test("reports a generic unavailable caption track without overstating the cause", () => {
  const diagnosis = diagnoseTranscriptFailure(failure({title: "Arethusa Class Cruisers"}));
  assert.equal(diagnosis.reasonCode, "caption-track-unavailable");
  assert.equal(diagnosis.confidence, "low");
  assert.match(diagnosis.probableReason, /cannot distinguish/iu);
});

test("builds and renders a report from saved failures", () => {
  const report = buildTranscriptProblemReport({
    updatedAt: "2026-07-09T06:07:45.400Z",
    failures: [
      failure({videoId: "silent123", title: "No Sound: Test"}),
      failure({videoId: "limited456", title: "Normal title", classification: "rate_limited_or_blocked", error: "429 Too Many Requests"}),
    ],
  }, "saved-status.json");

  assert.equal(report.problems.length, 2);
  assert.equal(report.classificationCounts.no_caption_tracks, 1);
  assert.equal(report.classificationCounts.rate_limited_or_blocked, 1);
  assert.equal(report.reasonCounts["source-audio-absent"], 1);
  const markdown = renderTranscriptProblemReport(report);
  assert.match(markdown, /does not request or retry transcripts/iu);
  assert.match(markdown, /saved-status\.json/iu);
  assert.match(markdown, /youtube\.com\/watch\?v=silent123/iu);
});

test("omits intentional exclusions while retaining genuine saved failures", () => {
  const report = buildTranscriptProblemReport({
    updatedAt: "2026-09-22T06:00:00.000Z",
    blockedVerticalStreamIds: ["vertical456"],
    failures: [
      failure({videoId: "xGvbY5KMz0Q", title: "Bruships 260: Naval History Questions Answered Live"}),
      failure({videoId: "vertical456"}),
      failure({videoId: "missing789"}),
    ],
  }, "saved-status.json", new Set(["xGvbY5KMz0Q"]));

  assert.deepEqual(report.problems.map((problem) => problem.videoId), ["missing789"]);
  assert.equal(report.classificationCounts.no_caption_tracks, 1);
  assert.equal(report.reasonCounts["caption-track-unavailable"], 1);
  const markdown = renderTranscriptProblemReport(report);
  assert.doesNotMatch(markdown, /xGvbY5KMz0Q|vertical456/iu);
});

test("generator reads curated exclusions and emits no error row when all failures are blocked", async () => {
  const directory = await mkdtemp(join(tmpdir(), "transcript-problem-report-"));
  try {
    const statusInput = join(directory, "status.json");
    const ignoredVideosInput = join(directory, "ignored-videos.json");
    const output = join(directory, "report.md");
    await writeFile(statusInput, JSON.stringify({
      updatedAt: "2026-09-22T06:00:00.000Z",
      failures: [failure({videoId: "xGvbY5KMz0Q"})],
    }), "utf8");
    await writeFile(ignoredVideosInput, JSON.stringify({
      schemaVersion: 1,
      ignoredVideos: [{
        videoId: "xGvbY5KMz0Q",
        url: "https://www.youtube.com/watch?v=xGvbY5KMz0Q",
        classification: "erroneous_stream",
        reason: "Vertical duplicate of the stored horizontal stream.",
      }],
    }), "utf8");

    const report = await generateTranscriptProblemReport({statusInput, ignoredVideosInput, output});
    assert.equal(report.problems.length, 0);
    const markdown = await readFile(output, "utf8");
    assert.match(markdown, /No reportable transcript-fetch failures were present/iu);
    assert.doesNotMatch(markdown, /xGvbY5KMz0Q/iu);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

function failure(overrides: Partial<TranscriptBatchFailure> = {}): TranscriptBatchFailure {
  return {
    videoId: "video123",
    attemptedAt: "2026-07-09T06:00:00.000Z",
    classification: "no_caption_tracks",
    error: "No caption tracks found for video: video123.",
    ...overrides,
  };
}
