import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVideoMetadataStore,
  mergeVideoIds,
  readVideoIdsFromEpisodeMaster,
  resolveAdditionalVideoIds,
  videoNamingMetadata,
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

test("supplements episode IDs with unique explicit video IDs", () => {
  assert.deepEqual(
    mergeVideoIds(["abc123", "def456"], ["missing789", "abc123", "missing999"]),
    ["abc123", "def456", "missing789", "missing999"],
  );
});

test("retains supplemental IDs until they enter the episode inventory", () => {
  assert.deepEqual(
    resolveAdditionalVideoIds(
      ["abc123", "nowInEpisodes"],
      ["storedMissing", "nowInEpisodes"],
      ["requestedMissing", "storedMissing"],
    ),
    ["storedMissing", "requestedMissing"],
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

test("builds local naming metadata from YouTube video metadata", () => {
  const record: VideoMetadataRecord = {
    videoId: "abc123",
    fetchedAt: "2026-07-08T00:00:00.000Z",
    snippet: {
      title: "Modern Navy Questions",
      publishedAt: "2026-07-05T23:25:48Z",
    },
    liveStreamingDetails: {
      actualStartTime: "2026-07-05T18:33:54Z",
    },
  };

  assert.deepEqual(videoNamingMetadata(record), {
    title: "Modern Navy Questions",
    timestamp: "2026-07-05T18:33:54Z",
  });
});

test("uses a scheduled livestream start for naming before the stream begins", () => {
  const record: VideoMetadataRecord = {
    videoId: "abc123",
    fetchedAt: "2026-07-08T00:00:00.000Z",
    snippet: {
      title: "Upcoming Naval History Live",
      publishedAt: "2026-06-14T16:44:14Z",
    },
    liveStreamingDetails: {
      scheduledStartTime: "2026-07-12T18:30:00Z",
    },
  };

  assert.deepEqual(videoNamingMetadata(record), {
    title: "Upcoming Naval History Live",
    timestamp: "2026-07-12T18:30:00Z",
  });
});
