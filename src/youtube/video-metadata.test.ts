import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVideoMetadataStore,
  canonicalVideoTimestamp,
  deferredMetadataRetryAt,
  mergeVideoIds,
  parseYoutubeDurationSeconds,
  readVideoIdsFromEpisodeMaster,
  resolveVideoState,
  resolveAdditionalVideoIds,
  resolveVideoFetchState,
  selectVideoMetadataTargetIds,
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
      actualEndTime: "2026-07-05T20:33:54Z",
    },
    status: { uploadStatus: "processed" },
    contentDetails: { duration: "PT2H" },
  };

  assert.deepEqual(videoNamingMetadata(record), {
    title: "Modern Navy Questions",
    timestamp: "2026-07-05T18:33:54Z",
    dateKind: "actual_start",
    videoKind: "stream",
  });
});

test("does not produce naming metadata before a scheduled livestream completes", () => {
  const record: VideoMetadataRecord = {
    videoId: "abc123",
    fetchedAt: "2026-07-08T00:00:00.000Z",
    snippet: {
      title: "Upcoming Naval History Live",
      publishedAt: "2026-06-14T16:44:14Z",
      liveBroadcastContent: "upcoming",
    },
    liveStreamingDetails: {
      scheduledStartTime: "2026-07-12T18:30:00Z",
    },
  };

  assert.deepEqual(videoNamingMetadata(record), {
    title: "Upcoming Naval History Live",
  });
  assert.deepEqual(resolveVideoState(record), {
    state: "deferred",
    videoKind: "stream",
    reason: "upcoming",
    diagnostic: "The video is scheduled but has not started.",
  });
});

test("automatically refreshes deferred livestream metadata one day after its latest scheduled start", () => {
  const upcoming: VideoMetadataRecord = {
    videoId: "upcoming123",
    fetchedAt: "2026-07-08T02:35:14.944Z",
    snippet: {
      title: "Upcoming Naval History Live",
      publishedAt: "2026-06-14T16:44:14Z",
      liveBroadcastContent: "upcoming",
    },
    liveStreamingDetails: {
      scheduledStartTime: "2026-07-19T18:30:00Z",
    },
  };

  assert.equal(deferredMetadataRetryAt(upcoming), "2026-07-20T18:30:00.000Z");
  assert.deepEqual(selectVideoMetadataTargetIds({
    videoIds: [upcoming.videoId],
    recordsById: new Map([[upcoming.videoId, upcoming]]),
    now: new Date("2026-07-20T18:29:59Z"),
  }), []);
  assert.deepEqual(selectVideoMetadataTargetIds({
    videoIds: [upcoming.videoId],
    recordsById: new Map([[upcoming.videoId, upcoming]]),
    now: new Date("2026-07-20T18:30:00Z"),
  }), [upcoming.videoId]);
});

test("a postponed livestream uses the newly stored air date for its next automatic refresh", () => {
  const postponed: VideoMetadataRecord = {
    videoId: "postponed123",
    fetchedAt: "2026-07-20T18:31:00.123Z",
    snippet: { liveBroadcastContent: "upcoming" },
    liveStreamingDetails: {
      scheduledStartTime: "2026-07-23T18:30:00Z",
    },
  };

  assert.equal(deferredMetadataRetryAt(postponed), "2026-07-24T18:30:00.000Z");
  assert.deepEqual(selectVideoMetadataTargetIds({
    videoIds: [postponed.videoId],
    recordsById: new Map([[postponed.videoId, postponed]]),
    now: new Date("2026-07-21T18:31:00Z"),
  }), []);
});

test("explicit refreshes still override the deferred retry date", () => {
  const upcoming: VideoMetadataRecord = {
    videoId: "upcoming123",
    fetchedAt: "2026-07-20T00:00:00Z",
    snippet: { liveBroadcastContent: "upcoming" },
    liveStreamingDetails: { scheduledStartTime: "2026-07-30T18:30:00Z" },
  };

  assert.deepEqual(selectVideoMetadataTargetIds({
    videoIds: [upcoming.videoId],
    recordsById: new Map([[upcoming.videoId, upcoming]]),
    refreshVideoIds: [upcoming.videoId],
    now: new Date("2026-07-20T01:00:00Z"),
  }), [upcoming.videoId]);
});

test("metadata lookup can be explicitly bypassed for direct transcript fetches", () => {
  assert.equal(resolveVideoFetchState(undefined, false), undefined);
  assert.deepEqual(resolveVideoFetchState(undefined, true), {
    state: "invalid",
    videoKind: "upload",
    reason: "metadata_missing",
    diagnostic: "Video metadata is missing.",
  });
});

test("requires processing, positive duration, and explicit stream completion", () => {
  const common: VideoMetadataRecord = {
    videoId: "abc123",
    fetchedAt: "2026-07-08T00:00:00.000Z",
    snippet: {
      publishedAt: "2026-07-05T23:25:48Z",
      liveBroadcastContent: "none",
    },
    contentDetails: { duration: "PT2H" },
    status: { uploadStatus: "processed" },
    liveStreamingDetails: {
      actualStartTime: "2026-07-05T18:33:54Z",
      scheduledStartTime: "2026-07-05T18:30:00Z",
    },
  };

  assert.deepEqual(resolveVideoState(common), {
    state: "deferred",
    videoKind: "stream",
    reason: "live_in_progress",
    diagnostic: "Livestream metadata does not yet prove completion with actualEndTime.",
  });
  assert.equal(resolveVideoState({
    ...common,
    status: { uploadStatus: "uploaded" },
    contentDetails: { duration: "P0D" },
  }).state, "deferred");
});

test("uses scheduled start only after independent stream completion proof", () => {
  const state = resolveVideoState({
    videoId: "abc123",
    fetchedAt: "2026-07-08T00:00:00.000Z",
    snippet: {
      publishedAt: "2026-07-01T00:00:00Z",
      liveBroadcastContent: "none",
    },
    contentDetails: { duration: "PT1H30M" },
    status: { uploadStatus: "processed" },
    liveStreamingDetails: {
      scheduledStartTime: "2026-07-05T18:30:00-05:00",
      actualEndTime: "2026-07-06T01:00:00Z",
    },
  });

  assert.deepEqual(state, {
    state: "ready",
    videoKind: "stream",
    videoDateAt: "2026-07-05T23:30:00Z",
    videoDateKind: "scheduled_start",
    durationSeconds: 5_400,
  });
});

test("ordinary processed uploads use publication time", () => {
  assert.deepEqual(resolveVideoState({
    videoId: "abc123",
    fetchedAt: "2026-07-08T00:00:00.000Z",
    snippet: { publishedAt: "2026-07-05T18:30:00-05:00", liveBroadcastContent: "none" },
    contentDetails: { duration: "PT12M34S" },
    status: { uploadStatus: "processed" },
  }), {
    state: "ready",
    videoKind: "upload",
    videoDateAt: "2026-07-05T23:30:00Z",
    videoDateKind: "published",
    durationSeconds: 754,
  });
});

test("normalizes exact UTC timestamps and parses positive YouTube durations", () => {
  assert.equal(canonicalVideoTimestamp("2026-07-05T18:30:00-05:00"), "2026-07-05T23:30:00Z");
  assert.equal(canonicalVideoTimestamp("2026-07-05 18:30:00"), null);
  assert.equal(parseYoutubeDurationSeconds("P1DT2H3M4S"), 93_784);
  assert.equal(parseYoutubeDurationSeconds("P0D"), 0);
  assert.equal(parseYoutubeDurationSeconds("n/a"), undefined);
});
