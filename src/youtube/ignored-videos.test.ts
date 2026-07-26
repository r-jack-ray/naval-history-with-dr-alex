import assert from "node:assert/strict";
import test from "node:test";

import {
  omitIgnoredVideoIds,
  parseIgnoredVideosConfig,
  readIgnoredVideos,
} from "./ignored-videos.js";

test("loads the canonical full-video ignore list", async () => {
  const ignored = await readIgnoredVideos();

  assert.equal(ignored.get("ts331iLYWlc")?.classification, "erroneous_stream");
  assert.equal(ignored.get("Ec-QeRtmPzw")?.classification, "erroneous_stream");
});

test("rejects duplicate ignored video IDs", () => {
  const duplicate = {
    schemaVersion: 1,
    ignoredVideos: [
      ignoredRecord("ts331iLYWlc"),
      ignoredRecord("ts331iLYWlc"),
    ],
  };

  assert.throws(
    () => parseIgnoredVideosConfig(duplicate),
    /duplicate ignored video ID ts331iLYWlc/u,
  );
});

test("omits ignored IDs while preserving source order", () => {
  assert.deepEqual(
    omitIgnoredVideoIds(
      ["keep-first1", "ts331iLYWlc", "keep-last22"],
      new Set(["ts331iLYWlc"]),
    ),
    ["keep-first1", "keep-last22"],
  );
});

function ignoredRecord(videoId: string) {
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    classification: "erroneous_stream",
    reason: "Erroneous stream.",
  };
}
