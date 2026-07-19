import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  fetchAndStoreTranscriptBatch,
  readTranscriptBatchEpisodes,
  type TranscriptBatchStatus,
} from "./batch-transcripts.js";
import { writeTranscriptStorage, type VideoTranscript } from "./transcripts.js";
import { resolveVideoState } from "./video-metadata.js";

test("reads unique transcript batch episodes from the channel master list", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-batch-"));
  const input = join(dir, "episodes.json");

  try {
    await writeFile(
      input,
      JSON.stringify({
        episodes: [
          { videoId: "abc123", title: "First", tabs: ["videos"], channelOrder: 1 },
          { videoId: "abc123", title: "Duplicate", tabs: ["streams"], channelOrder: 2 },
          { videoId: "def456", title: "Second", publishedAt: "2026-07-01T00:00:00Z" },
        ],
      }),
      "utf8",
    );

    const episodes = await readTranscriptBatchEpisodes(input);

    assert.deepEqual(episodes.map((episode) => episode.videoId), ["abc123", "def456"]);
    assert.equal(episodes[0]?.title, "First");
    assert.deepEqual(episodes[0]?.tabs, ["videos"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("batch fetch skips stored transcripts and writes checkpoint status", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-batch-"));
  const input = join(dir, "episodes.json");
  const metadataInput = join(dir, "metadata.json");
  const outputRoot = join(dir, "transcripts");
  const statusOutput = join(outputRoot, "fetch-status.json");
  const calls: string[] = [];

  try {
    await writeTranscriptStorage(sampleTranscript("abc123"), outputRoot);
    await writeFile(
      input,
      JSON.stringify({
        episodes: [
          { videoId: "abc123", title: "Stored", tabs: ["videos"], channelOrder: 1 },
          { videoId: "def456", title: "Pending", tabs: ["streams"], channelOrder: 2 },
        ],
      }),
      "utf8",
    );
    await writeFile(
      metadataInput,
      JSON.stringify({
        videos: [
          {
            videoId: "def456",
            fetchedAt: "2026-07-08T00:00:00.000Z",
            snippet: { title: "Metadata Title", publishedAt: "2026-07-03T18:30:17Z" },
            status: { uploadStatus: "processed" },
            contentDetails: { duration: "PT1M2S" },
          },
        ],
      }),
      "utf8",
    );

    const status = await fetchAndStoreTranscriptBatch({
      inputPath: input,
      metadataInput,
      outputRoot,
      statusOutput,
      requestDelayMs: 5,
      fetchTranscript: async (options) => {
        calls.push(options.videoId);
        return sampleTranscript(options.videoId);
      },
    });

    assert.deepEqual(calls, ["def456"]);
    assert.equal(status.stats.skippedStoredCount, 1);
    assert.equal(status.stats.fetchedCount, 1);
    assert.equal(status.stats.pendingCount, 0);

    const checkpoint = JSON.parse(await readFile(statusOutput, "utf8")) as TranscriptBatchStatus;
    assert.equal(checkpoint.stats.fetchedCount, 1);
    assert.equal(
      await readFile(join(outputRoot, "txt", "2026-07-03_T18-30-17_metadata-title_def456.txt"), "utf8"),
      "[0:00] Hello\n",
    );
    const manifest = JSON.parse(await readFile(join(outputRoot, "manifest.json"), "utf8"));
    assert.equal(
      manifest.transcripts.find((record: { videoId: string }) => record.videoId === "def456")?.fileStem,
      "2026-07-03_T18-30-17_metadata-title_def456",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("batch refetches a manifest record whose TXT file is missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-batch-"));
  const input = join(dir, "episodes.json");
  const metadataInput = join(dir, "metadata.json");
  const outputRoot = join(dir, "transcripts");
  const statusOutput = join(outputRoot, "fetch-status.json");
  const calls: string[] = [];

  try {
    const stored = await writeTranscriptStorage(sampleTranscript("abc123"), outputRoot);
    await rm(stored.txtOutput);
    await writeFile(
      input,
      JSON.stringify({ episodes: [{ videoId: "abc123", title: "Stored", tabs: ["videos"] }] }),
      "utf8",
    );
    await writeReadyMetadata(metadataInput, ["abc123"]);

    const status = await fetchAndStoreTranscriptBatch({
      inputPath: input,
      metadataInput,
      outputRoot,
      statusOutput,
      requestDelayMs: 5,
      fetchTranscript: async (options) => {
        calls.push(options.videoId);
        return sampleTranscript(options.videoId);
      },
    });

    assert.deepEqual(calls, ["abc123"]);
    assert.equal(status.stats.fetchedCount, 1);
    assert.equal(await readFile(stored.txtOutput, "utf8"), "[0:00] Hello\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("batch force-refetch preserves an existing manifest fileStem", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-batch-"));
  const input = join(dir, "episodes.json");
  const metadataInput = join(dir, "metadata.json");
  const outputRoot = join(dir, "transcripts");
  const statusOutput = join(outputRoot, "fetch-status.json");

  try {
    await writeTranscriptStorage({
      ...sampleTranscript("abc123"),
      videoTitle: "Original Title",
      videoDateAt: "2026-01-02T03:04:05Z",
      videoDateKind: "published",
    }, outputRoot);
    await writeFile(
      input,
      JSON.stringify({ episodes: [{ videoId: "abc123", title: "Renamed Title", tabs: ["videos"] }] }),
      "utf8",
    );
    await writeReadyMetadata(metadataInput, ["abc123"]);

    const status = await fetchAndStoreTranscriptBatch({
      inputPath: input,
      metadataInput,
      outputRoot,
      statusOutput,
      requestDelayMs: 5,
      force: true,
      fetchTranscript: async (options) => sampleTranscript(options.videoId),
    });

    const manifest = JSON.parse(await readFile(join(outputRoot, "manifest.json"), "utf8"));
    assert.equal(status.stats.fetchedCount, 1);
    assert.equal(manifest.transcripts[0].fileStem, "2026-01-02_T03-04-05_original-title_abc123");
    assert.equal(
      await readFile(join(outputRoot, "txt", "2026-01-02_T03-04-05_original-title_abc123.txt"), "utf8"),
      "[0:00] Hello\n",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("batch skips previous failures until retry is requested", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-batch-"));
  const input = join(dir, "episodes.json");
  const metadataInput = join(dir, "metadata.json");
  const outputRoot = join(dir, "transcripts");
  const statusOutput = join(outputRoot, "fetch-status.json");
  const calls: string[] = [];

  try {
    await writeFile(
      input,
      JSON.stringify({
        episodes: [{ videoId: "abc123", title: "Previously failed", tabs: ["videos"], channelOrder: 1 }],
      }),
      "utf8",
    );
    await writeReadyMetadata(metadataInput, ["abc123"]);
    await mkdir(outputRoot, { recursive: true });
    await writeFile(
      statusOutput,
      JSON.stringify({
        failures: [
          {
            videoId: "abc123",
            attemptedAt: "2026-07-08T00:00:00.000Z",
            classification: "no_caption_tracks",
            error: "No caption tracks found for video: abc123.",
            tabs: ["videos"],
          },
        ],
      }),
      "utf8",
    );

    const skipped = await fetchAndStoreTranscriptBatch({
      inputPath: input,
      metadataInput,
      outputRoot,
      statusOutput,
      requestDelayMs: 5,
      fetchTranscript: async (options) => {
        calls.push(options.videoId);
        return sampleTranscript(options.videoId);
      },
    });

    assert.equal(calls.length, 0);
    assert.equal(skipped.stats.skippedPreviousFailureCount, 1);
    assert.equal(skipped.stats.totalFailureCount, 1);

    const retried = await fetchAndStoreTranscriptBatch({
      inputPath: input,
      metadataInput,
      outputRoot,
      statusOutput,
      requestDelayMs: 5,
      retryFailed: true,
      fetchTranscript: async (options) => {
        calls.push(options.videoId);
        return sampleTranscript(options.videoId);
      },
    });

    assert.deepEqual(calls, ["abc123"]);
    assert.equal(retried.stats.fetchedCount, 1);
    assert.equal(retried.stats.totalFailureCount, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("batch blocks nominal 60-second videos including one second of metadata padding", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-batch-"));
  const input = join(dir, "episodes.json");
  const metadataInput = join(dir, "metadata.json");
  const outputRoot = join(dir, "transcripts");
  const statusOutput = join(outputRoot, "fetch-status.json");
  const calls: string[] = [];

  try {
    await writeFile(input, JSON.stringify({
      episodes: [
        { videoId: "exact60", title: "Exact 60", tabs: ["videos"] },
        { videoId: "padded60", title: "Padded 60", tabs: ["videos"] },
        { videoId: "longer123", title: "Longer", tabs: ["videos"] },
      ],
    }), "utf8");
    await writeFile(metadataInput, JSON.stringify({ videos: [
      readyMetadata("exact60", "PT1M"),
      readyMetadata("padded60", "PT1M1S"),
      readyMetadata("longer123", "PT1M2S"),
    ] }), "utf8");

    const status = await fetchAndStoreTranscriptBatch({
      inputPath: input,
      metadataInput,
      outputRoot,
      statusOutput,
      requestDelayMs: 5,
      fetchTranscript: async (options) => {
        calls.push(options.videoId);
        return sampleTranscript(options.videoId);
      },
    });

    assert.deepEqual(calls, ["longer123"]);
    assert.equal(status.stats.skippedShortDurationCount, 2);
    assert.equal(status.stats.fetchedCount, 1);
    assert.equal(status.stats.pendingCount, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("batch skips published but unstarted videos and clears stale failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-batch-"));
  const input = join(dir, "episodes.json");
  const metadataInput = join(dir, "metadata.json");
  const outputRoot = join(dir, "transcripts");
  const statusOutput = join(outputRoot, "fetch-status.json");
  const calls: string[] = [];

  try {
    await writeFile(
      input,
      JSON.stringify({ episodes: [{ videoId: "upcoming123", title: "Upcoming", tabs: ["streams"] }] }),
      "utf8",
    );
    await writeFile(
      metadataInput,
      JSON.stringify({
        videos: [{
          videoId: "upcoming123",
          fetchedAt: "2026-07-13T00:00:00.000Z",
          snippet: { publishedAt: "2026-06-14T16:44:14Z", liveBroadcastContent: "upcoming" },
          liveStreamingDetails: { scheduledStartTime: "2026-07-19T18:30:00Z" },
        }],
      }),
      "utf8",
    );
    await mkdir(outputRoot, { recursive: true });
    await writeFile(
      statusOutput,
      JSON.stringify({
        failures: [{
          videoId: "upcoming123",
          attemptedAt: "2026-07-09T00:00:00.000Z",
          classification: "no_caption_tracks",
          error: "No caption tracks found for video: upcoming123.",
          tabs: ["streams"],
        }],
      }),
      "utf8",
    );

    const status = await fetchAndStoreTranscriptBatch({
      inputPath: input,
      metadataInput,
      outputRoot,
      statusOutput,
      requestDelayMs: 5,
      fetchTranscript: async (options) => {
        calls.push(options.videoId);
        return sampleTranscript(options.videoId);
      },
    });

    assert.deepEqual(calls, []);
    assert.equal(status.stats.skippedDeferredCount, 1);
    assert.equal(status.stats.deferredCounts.upcoming, 1);
    assert.equal(status.stats.attemptedCount, 0);
    assert.equal(status.stats.failedCount, 0);
    assert.equal(status.stats.pendingCount, 0);
    assert.equal(status.stats.totalFailureCount, 0);
    assert.deepEqual(status.failures, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("started livestream remains deferred until completion is proven", () => {
  assert.equal(resolveVideoState({
    videoId: "started123",
    fetchedAt: "2026-07-13T00:00:00.000Z",
    snippet: { publishedAt: "2026-06-14T16:44:14Z", liveBroadcastContent: "none" },
    status: { uploadStatus: "processed" },
    contentDetails: { duration: "PT1H" },
    liveStreamingDetails: {
      scheduledStartTime: "2026-07-12T18:30:00Z",
      actualStartTime: "2026-07-12T18:30:06Z",
    },
  }).state, "deferred");
});

function sampleTranscript(videoId: string): VideoTranscript {
  return {
    videoId,
    source: "youtube-transcript-plus",
    fetchedAt: "2026-07-08T00:00:00.000Z",
    selectedLanguage: "en",
    availableLanguages: ["en"],
    segments: [
      {
        startMs: 0,
        endMs: 1000,
        startSeconds: 0,
        endSeconds: 1,
        startTimeText: "0:00",
        text: "Hello",
      },
    ],
  };
}

async function writeReadyMetadata(path: string, videoIds: string[]): Promise<void> {
  await writeFile(path, JSON.stringify({
    videos: videoIds.map((videoId) => readyMetadata(videoId, "PT1M2S")),
  }), "utf8");
}

function readyMetadata(videoId: string, duration: string) {
  return {
    videoId,
    fetchedAt: "2026-07-08T00:00:00.000Z",
    snippet: { title: `Metadata ${videoId}`, publishedAt: "2026-07-03T18:30:17Z", liveBroadcastContent: "none" },
    status: { uploadStatus: "processed" },
    contentDetails: { duration },
  };
}
