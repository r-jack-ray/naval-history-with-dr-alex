import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTimestamp,
  projectName,
  segmentKinds,
  youtubeTimestampUrl,
} from "./index.js";

test("exports the project identity", () => {
  assert.equal(projectName, "naval-history-with-dr-alex");
});

test("keeps the segment-first content model", () => {
  assert.deepEqual([...segmentKinds], [
    "chapter",
    "notable_point",
    "qa",
    "transcript_excerpt",
  ]);
});

test("formats timestamps for video labels", () => {
  assert.equal(formatTimestamp(83), "1:23");
  assert.equal(formatTimestamp(3723), "1:02:03");
});

test("builds direct YouTube timestamp links", () => {
  assert.equal(
    youtubeTimestampUrl("abc123", 83),
    "https://youtu.be/abc123?t=83",
  );
});
