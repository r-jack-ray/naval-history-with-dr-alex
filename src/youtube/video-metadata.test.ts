import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVideoMetadataStore,
  readVideoIdsFromEpisodeMaster,
  type VideoMetadataRecord,
} from "./video-metadata.js";

test("reads unique video IDs from the episode master list", () => {
  assert.deepEqual(
    readVideoIdsFromEpisodeMaster({
      episodes: [
        { videoId: "abc123" },
        { videoId: "def456" },
        { videoId: "abc123" },
        { title: "missing id" },
      ],
    }),
    ["abc123", "def456"],
  );
});

test("builds an ordered resumable video metadata store", () => {
  const record: VideoMetadataRecord = {
    videoId: "def456",
    fetchedAt: "2026-07-08T00:00:00.000Z",
    snippet: {
      title: "Second video",
      publishedAt: "2026-07-03T18:30:17Z",
    },
  };
  const store = buildVideoMetadataStore({
    inputPath: "src/channel/episodes.json",
    requestDelayMs: 60_000,
    batchSize: 50,
    videoIds: ["abc123", "def456"],
    recordsById: new Map([["def456", record]]),
    batchesFetched: 1,
  });

  assert.equal(store.source.api, "youtube-data-api-v3");
  assert.equal(store.stats.inputVideoCount, 2);
  assert.equal(store.stats.storedVideoCount, 1);
  assert.equal(store.stats.pendingVideoCount, 1);
  assert.deepEqual(store.pendingVideoIds, ["abc123"]);
  assert.deepEqual(store.missingVideoIds, ["abc123"]);
  assert.deepEqual(store.videos, [record]);
});
