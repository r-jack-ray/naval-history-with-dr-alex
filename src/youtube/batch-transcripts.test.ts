import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  acknowledgeTranscriptBatchHandoff,
  fetchAndStoreTranscriptBatch,
  formatTranscriptBatchHandoff,
  readTranscriptBatchEpisodes,
  type TranscriptBatchStatus,
} from "./batch-transcripts.js";
import { type VideoTranscript, writeTranscriptStorage } from "./transcripts.js";
import { resolveVideoState } from "./video-metadata.js";

test("reads unique transcript batch episodes from the channel master list", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-batch-"));
  const input = join(dir, "episodes.json");

  try {
    await writeFile(
        input,
        JSON.stringify({
          episodes: [
            {videoId: "abc123", title: "First"},
            {videoId: "abc123", title: "Duplicate"},
            {videoId: "def456", title: "Second", publishedAt: "2026-07-01T00:00:00Z"},
          ],
        }),
        "utf8",
    );

    const episodes = await readTranscriptBatchEpisodes(input);

    assert.deepEqual(episodes.map((episode) => episode.videoId), ["abc123", "def456"]);
    assert.equal(episodes[0]?.title, "First");
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test("safe transcript command keeps cautious pacing, preserves failed-record skips, and leaves retry explicit", async () => {
  const [packageJsonText, cliHelpSource] = await Promise.all([
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../src/scripts/fetch-transcript-batch.ts", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageJsonText) as { scripts: Record<string, string> };

  assert.equal(
      packageJson.scripts["alternate:fetch:transcripts:safe"],
      "tsx src/scripts/fetch-transcript-batch.ts --request-delay-ms 60000",
  );
  assert.doesNotMatch(packageJson.scripts["alternate:fetch:transcripts:safe"] ?? "", /--retry-failed/u);
  assert.match(cliHelpSource, /--retry-failed\s+Explicitly retry[^\n]+never implied by the safe command/u);
  assert.doesNotMatch(cliHelpSource, /included by the safe command/u);
  assert.equal(packageJson.scripts["alternate:fetch:transcripts:retry"], undefined);
  assert.equal(packageJson.scripts["alternate:fetch:transcripts:retry:safe"], undefined);
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
            {videoId: "abc123", title: "Stored"},
            {videoId: "def456", title: "Pending"},
          ],
        }),
        "utf8",
    );
    await writeFile(statusOutput, JSON.stringify({
      failures: [{
        videoId: "abc123",
        attemptedAt: "2026-07-08T00:00:00.000Z",
        classification: "fetch_failed",
        error: "Stale failure for an already stored TXT.",
      }],
    }), "utf8");
    await writeFile(
        metadataInput,
        JSON.stringify({
          videos: [
            {
              videoId: "def456",
              fetchedAt: "2026-07-08T00:00:00.000Z",
              snippet: {title: "Metadata Title", publishedAt: "2026-07-03T18:30:17Z"},
              status: {uploadStatus: "processed"},
              contentDetails: {duration: "PT1M2S"},
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
    assert.equal(status.stats.totalFailureCount, 0);
    assert.deepEqual(status.handoff.newlyStoredTxtPaths, [
      join(outputRoot, "txt", "2026-07-03_T18-30-17_metadata-title_def456.txt").replaceAll("\\", "/"),
    ]);
    assert.deepEqual(status.handoff.deferredRecords, []);
    assert.deepEqual(status.handoff.failedRecords, []);
    assert.deepEqual(status.handoff.pendingRecords, []);

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
    await rm(dir, {recursive: true, force: true});
  }
});

test("batch can fetch without a metadata lookup when explicitly requested", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-batch-"));
  const input = join(dir, "episodes.json");
  const outputRoot = join(dir, "transcripts");
  const statusOutput = join(outputRoot, "fetch-status.json");
  const calls: string[] = [];

  try {
    await writeFile(input, JSON.stringify({
      episodes: [{
        videoId: "abc123",
        title: "Metadata-free transcript",
        publishedAt: "2026-07-03T18:30:17Z",
      }],
    }), "utf8");

    const status = await fetchAndStoreTranscriptBatch({
      inputPath: input,
      outputRoot,
      statusOutput,
      requestDelayMs: 5,
      fetchTranscript: async (options) => {
        calls.push(options.videoId);
        return sampleTranscript(options.videoId);
      },
    });

    assert.deepEqual(calls, ["abc123"]);
    assert.equal(status.stats.skippedDeferredCount, 0);
    assert.equal(status.stats.fetchedCount, 1);
    assert.equal(
        await readFile(join(outputRoot, "txt", "2026-07-03_T18-30-17_metadata-free-transcript_abc123.txt"), "utf8"),
        "[0:00] Hello\n",
    );
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test("batch fully excludes ignored videos and clears their stale failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-batch-"));
  const input = join(dir, "episodes.json");
  const outputRoot = join(dir, "transcripts");
  const statusOutput = join(outputRoot, "fetch-status.json");
  const calls: string[] = [];

  try {
    await writeFile(input, JSON.stringify({
      episodes: [
        {videoId: "ts331iLYWlc", title: "Ignored error"},
        {videoId: "keep-video1", title: "Keep"},
      ],
    }), "utf8");
    await mkdir(outputRoot, {recursive: true});
    await writeFile(statusOutput, JSON.stringify({
      failures: [{
        videoId: "ts331iLYWlc",
        attemptedAt: "2026-07-26T00:00:00.000Z",
        classification: "fetch_failed",
        error: "Old failure.",
      }],
    }), "utf8");

    const status = await fetchAndStoreTranscriptBatch({
      inputPath: input,
      outputRoot,
      statusOutput,
      requestDelayMs: 5,
      ignoredVideoIds: new Set(["ts331iLYWlc"]),
      fetchTranscript: async (options) => {
        calls.push(options.videoId);
        return sampleTranscript(options.videoId);
      },
    });

    assert.deepEqual(calls, ["keep-video1"]);
    assert.equal(status.stats.inputVideoCount, 1);
    assert.equal(status.stats.totalFailureCount, 0);
    assert.deepEqual(status.failures, []);
  } finally {
    await rm(dir, {recursive: true, force: true});
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
        JSON.stringify({episodes: [{videoId: "abc123", title: "Stored"}]}),
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
    await rm(dir, {recursive: true, force: true});
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
        JSON.stringify({episodes: [{videoId: "abc123", title: "Renamed Title"}]}),
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
    await rm(dir, {recursive: true, force: true});
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
          episodes: [{videoId: "abc123", title: "Previously failed"}],
        }),
        "utf8",
    );
    await writeReadyMetadata(metadataInput, ["abc123"]);
    await mkdir(outputRoot, {recursive: true});
    await writeFile(
        statusOutput,
        JSON.stringify({
          failures: [
            {
              videoId: "abc123",
              attemptedAt: "2026-07-08T00:00:00.000Z",
              classification: "no_caption_tracks",
              error: "No caption tracks found for video: abc123.",
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
    assert.equal(skipped.stats.pendingCount, 1);
    assert.equal(skipped.stats.totalFailureCount, 1);
    assert.deepEqual(
        skipped.handoff.pendingRecords.map((record) => ({videoId: record.videoId, reason: record.reason})),
        [{videoId: "abc123", reason: "previous_failure"}],
    );

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
    assert.deepEqual(retried.handoff.pendingRecords, []);
  } finally {
    await rm(dir, {recursive: true, force: true});
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
        {videoId: "exact60", title: "Exact 60"},
        {videoId: "padded60", title: "Padded 60"},
        {videoId: "longer123", title: "Longer"},
      ],
    }), "utf8");
    await writeFile(metadataInput, JSON.stringify({
      videos: [
        readyMetadata("exact60", "PT1M"),
        readyMetadata("padded60", "PT1M1S"),
        readyMetadata("longer123", "PT1M2S"),
      ]
    }), "utf8");

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
    await rm(dir, {recursive: true, force: true});
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
        JSON.stringify({episodes: [{videoId: "upcoming123", title: "Upcoming"}]}),
        "utf8",
    );
    await writeFile(
        metadataInput,
        JSON.stringify({
          videos: [{
            videoId: "upcoming123",
            fetchedAt: "2026-07-13T00:00:00.000Z",
            snippet: {publishedAt: "2026-06-14T16:44:14Z", liveBroadcastContent: "upcoming"},
            liveStreamingDetails: {scheduledStartTime: "2026-07-19T18:30:00Z"},
          }],
        }),
        "utf8",
    );
    await mkdir(outputRoot, {recursive: true});
    await writeFile(
        statusOutput,
        JSON.stringify({
          failures: [{
            videoId: "upcoming123",
            attemptedAt: "2026-07-09T00:00:00.000Z",
            classification: "no_caption_tracks",
            error: "No caption tracks found for video: upcoming123.",
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
    assert.deepEqual(
        status.handoff.deferredRecords.map((record) => ({videoId: record.videoId, reason: record.reason})),
        [{videoId: "upcoming123", reason: "upcoming"}],
    );
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test("batch checkpoints partial failures and a later retry fetches only the missing TXT", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-batch-"));
  const input = join(dir, "episodes.json");
  const metadataInput = join(dir, "metadata.json");
  const outputRoot = join(dir, "transcripts");
  const statusOutput = join(outputRoot, "fetch-status.json");
  const calls: string[] = [];
  let observedFailureCheckpoint = false;

  try {
    await writeFile(input, JSON.stringify({
      episodes: [
        {videoId: "aaa111", title: "First"},
        {videoId: "bbb222", title: "Second"},
        {videoId: "ccc333", title: "Third"},
      ]
    }), "utf8");
    await writeReadyMetadata(metadataInput, ["aaa111", "bbb222", "ccc333"]);

    const firstRun = await fetchAndStoreTranscriptBatch({
      inputPath: input,
      metadataInput,
      outputRoot,
      statusOutput,
      requestDelayMs: 5,
      retryFailed: true,
      fetchTranscript: async (options) => {
        calls.push(options.videoId);
        if (options.videoId === "bbb222") {
          throw new Error("Socket closed unexpectedly.");
        }
        if (options.videoId === "ccc333") {
          const checkpoint = JSON.parse(await readFile(statusOutput, "utf8")) as TranscriptBatchStatus;
          assert.equal(checkpoint.stats.fetchedCount, 1);
          assert.equal(checkpoint.stats.failedCount, 1);
          assert.deepEqual(checkpoint.failures.map((failure) => failure.videoId), ["bbb222"]);
          observedFailureCheckpoint = true;
        }
        return sampleTranscript(options.videoId);
      },
    });

    assert.equal(observedFailureCheckpoint, true);
    assert.deepEqual(calls, ["aaa111", "bbb222", "ccc333"]);
    assert.equal(firstRun.stats.fetchedCount, 2);
    assert.equal(firstRun.stats.failedCount, 1);
    assert.equal(firstRun.stats.pendingCount, 0);
    assert.deepEqual(firstRun.handoff.failedRecords.map((failure) => failure.videoId), ["bbb222"]);
    assert.deepEqual(firstRun.handoff.newlyStoredTxtPaths.map((path) => path.endsWith(".txt")), [true, true]);
    await acknowledgeTranscriptBatchHandoff(statusOutput, firstRun.handoff.newlyStoredTxtPaths);

    const recoveryCalls: string[] = [];
    const recovered = await fetchAndStoreTranscriptBatch({
      inputPath: input,
      metadataInput,
      outputRoot,
      statusOutput,
      requestDelayMs: 5,
      retryFailed: true,
      fetchTranscript: async (options) => {
        recoveryCalls.push(options.videoId);
        return sampleTranscript(options.videoId);
      },
    });

    assert.deepEqual(recoveryCalls, ["bbb222"]);
    assert.equal(recovered.stats.skippedStoredCount, 2);
    assert.equal(recovered.stats.fetchedCount, 1);
    assert.equal(recovered.stats.totalFailureCount, 0);
    assert.equal(recovered.handoff.newlyStoredTxtPaths[0]?.endsWith("_bbb222.txt"), true);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test("batch re-emits checkpointed TXT handoff paths after interruption until acknowledged", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-batch-"));
  const input = join(dir, "episodes.json");
  const metadataInput = join(dir, "metadata.json");
  const outputRoot = join(dir, "transcripts");
  const statusOutput = join(outputRoot, "fetch-status.json");

  try {
    await writeFile(input, JSON.stringify({
      episodes: [
        {videoId: "abc123", title: "Recovered handoff"},
      ]
    }), "utf8");
    await writeReadyMetadata(metadataInput, ["abc123"]);

    const firstRun = await fetchAndStoreTranscriptBatch({
      inputPath: input,
      metadataInput,
      outputRoot,
      statusOutput,
      requestDelayMs: 5,
      fetchTranscript: async (options) => sampleTranscript(options.videoId),
    });
    const expectedPaths = firstRun.handoff.newlyStoredTxtPaths;
    assert.equal(expectedPaths.length, 1);

    const interruptedCheckpoint = JSON.parse(await readFile(statusOutput, "utf8")) as TranscriptBatchStatus;
    assert.deepEqual(interruptedCheckpoint.pendingHandoffTxtPaths, expectedPaths);

    const resumeCalls: string[] = [];
    const resumed = await fetchAndStoreTranscriptBatch({
      inputPath: input,
      metadataInput,
      outputRoot,
      statusOutput,
      requestDelayMs: 5,
      fetchTranscript: async (options) => {
        resumeCalls.push(options.videoId);
        return sampleTranscript(options.videoId);
      },
    });

    assert.deepEqual(resumeCalls, []);
    assert.equal(resumed.stats.skippedStoredCount, 1);
    assert.deepEqual(resumed.handoff.newlyStoredTxtPaths, expectedPaths);

    await acknowledgeTranscriptBatchHandoff(statusOutput, resumed.handoff.newlyStoredTxtPaths);
    const acknowledgedCheckpoint = JSON.parse(await readFile(statusOutput, "utf8")) as TranscriptBatchStatus;
    assert.deepEqual(acknowledgedCheckpoint.pendingHandoffTxtPaths, []);

    const afterAcknowledgement = await fetchAndStoreTranscriptBatch({
      inputPath: input,
      metadataInput,
      outputRoot,
      statusOutput,
      requestDelayMs: 5,
      fetchTranscript: async (options) => sampleTranscript(options.videoId),
    });
    assert.deepEqual(afterAcknowledgement.handoff.newlyStoredTxtPaths, []);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test("batch circuit breaker stops later eligible fetches and leaves them pending", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-batch-"));
  const input = join(dir, "episodes.json");
  const metadataInput = join(dir, "metadata.json");
  const outputRoot = join(dir, "transcripts");
  const statusOutput = join(outputRoot, "fetch-status.json");
  const calls: string[] = [];

  try {
    await writeFile(input, JSON.stringify({
      episodes: [
        {videoId: "aaa111", title: "Blocked"},
        {videoId: "bbb222", title: "Pending B"},
        {videoId: "ccc333", title: "Pending C"},
      ]
    }), "utf8");
    await writeReadyMetadata(metadataInput, ["aaa111", "bbb222", "ccc333"]);

    const status = await fetchAndStoreTranscriptBatch({
      inputPath: input,
      metadataInput,
      outputRoot,
      statusOutput,
      requestDelayMs: 60_000,
      retryFailed: true,
      fetchTranscript: async (options) => {
        calls.push(options.videoId);
        throw new Error("Watch page request failed with status 429: Too Many Requests");
      },
    });

    assert.deepEqual(calls, ["aaa111"]);
    assert.equal(status.stats.attemptedCount, 1);
    assert.equal(status.stats.failedCount, 1);
    assert.equal(status.stats.pendingCount, 2);
    assert.equal(status.handoff.circuitBreakerTripped, true);
    assert.deepEqual(
        status.handoff.failedRecords.map((failure) => ({videoId: failure.videoId, classification: failure.classification})),
        [{videoId: "aaa111", classification: "rate_limited_or_blocked"}],
    );
    assert.deepEqual(
        status.handoff.pendingRecords.map((record) => ({videoId: record.videoId, reason: record.reason})),
        [
          {videoId: "bbb222", reason: "circuit_breaker"},
          {videoId: "ccc333", reason: "circuit_breaker"},
        ],
    );

    const checkpoint = JSON.parse(await readFile(statusOutput, "utf8")) as TranscriptBatchStatus;
    assert.equal(checkpoint.stats.pendingCount, 2);
    assert.deepEqual(checkpoint.failures.map((failure) => failure.videoId), ["aaa111"]);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test("formats a deterministic acquisition-to-curation handoff", () => {
  const output = formatTranscriptBatchHandoff({
    newlyStoredTxtPaths: ["src\\transcripts\\txt\\z-video.txt", "src/transcripts/txt/a-video.txt"],
    deferredRecords: [{
      videoId: "deferred222",
      reason: "processing",
      diagnostic: "Still\nprocessing",
      title: "Deferred video",
    }],
    failedRecords: [{
      videoId: "failed111",
      attemptedAt: "2026-08-02T00:00:00.000Z",
      classification: "fetch_failed",
      error: "Socket\nclosed",
      title: "Failed video",
    }],
    pendingRecords: [
      {videoId: "pending999", reason: "limit_reached", title: "Later"},
      {videoId: "pending111", reason: "circuit_breaker", title: "Sooner"},
    ],
    circuitBreakerTripped: true,
  });

  assert.equal(output, [
    "Transcript acquisition handoff",
    "Circuit breaker: tripped",
    "New transcript TXT paths (2):",
    "- src/transcripts/txt/a-video.txt",
    "- src/transcripts/txt/z-video.txt",
    "Deferred records (1):",
    "- deferred222 [processing] Deferred video: Still processing",
    "Failed records (1):",
    "- failed111 [fetch_failed] Failed video: Socket closed",
    "Still-pending records (2):",
    "- pending111 [circuit_breaker] Sooner",
    "- pending999 [limit_reached] Later",
    "Curation next steps:",
    "- Run one single-agent $naval-transcript-to-site-content task for each new TXT path.",
    "- Run at least two independent sequential single-agent $naval-site-content-auditor tasks for each resulting shard.",
  ].join("\n"));
});

test("started livestream remains deferred until completion is proven", () => {
  assert.equal(resolveVideoState({
    videoId: "started123",
    fetchedAt: "2026-07-13T00:00:00.000Z",
    snippet: {publishedAt: "2026-06-14T16:44:14Z", liveBroadcastContent: "none"},
    status: {uploadStatus: "processed"},
    contentDetails: {duration: "PT1H"},
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
    snippet: {title: `Metadata ${videoId}`, publishedAt: "2026-07-03T18:30:17Z", liveBroadcastContent: "none"},
    status: {uploadStatus: "processed"},
    contentDetails: {duration},
  };
}
