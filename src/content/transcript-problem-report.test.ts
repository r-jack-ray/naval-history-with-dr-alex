import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTranscriptProblemReport,
  diagnoseTranscriptFailure,
  renderTranscriptProblemReport,
} from "./transcript-problem-report.js";
import type { TranscriptBatchFailure } from "../youtube/batch-transcripts.js";

test("infers absent source audio only when prior-run title evidence supports it", () => {
  const diagnosis = diagnoseTranscriptFailure(failure({ title: "Town Class (inadvertent silent movie style)" }));
  assert.equal(diagnosis.reasonCode, "source-audio-absent");
  assert.equal(diagnosis.confidence, "high");
  assert.match(diagnosis.evidence, /silent movie/iu);
});

test("reports a generic unavailable caption track without overstating the cause", () => {
  const diagnosis = diagnoseTranscriptFailure(failure({ title: "Arethusa Class Cruisers" }));
  assert.equal(diagnosis.reasonCode, "caption-track-unavailable");
  assert.equal(diagnosis.confidence, "low");
  assert.match(diagnosis.probableReason, /cannot distinguish/iu);
});

test("builds and renders a report from saved failures", () => {
  const report = buildTranscriptProblemReport({
    updatedAt: "2026-07-09T06:07:45.400Z",
    failures: [
      failure({ videoId: "silent123", title: "No Sound: Test" }),
      failure({ videoId: "limited456", title: "Normal title", classification: "rate_limited_or_blocked", error: "429 Too Many Requests" }),
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

function failure(overrides: Partial<TranscriptBatchFailure> = {}): TranscriptBatchFailure {
  return {
    videoId: "video123",
    attemptedAt: "2026-07-09T06:00:00.000Z",
    classification: "no_caption_tracks",
    error: "No caption tracks found for video: video123.",
    tabs: ["videos"],
    ...overrides,
  };
}
