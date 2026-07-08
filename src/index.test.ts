import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTimestamp,
  projectName,
  segmentKinds,
  youtubeTimestampUrl,
} from "./index.js";
import { archiveTimestampPrefix, slugifyVideoTitle, videoFileStem } from "./naming.js";

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

test("builds readable video file stems", () => {
  assert.equal(slugifyVideoTitle("Ships & Strategy: A Test!"), "ships-and-strategy-a-test");
  assert.equal(archiveTimestampPrefix("2026-06-14T05:29:19-05:00"), "2026-06-14_T05-29-19-0500");
  assert.equal(
    videoFileStem("abc123", "Ships & Strategy: A Test!", "2026-06-14T05:29:19-05:00"),
    "2026-06-14_T05-29-19-0500_ships-and-strategy-a-test_abc123",
  );
});
