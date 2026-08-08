import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveYoutubeApiKey } from "../scripts/youtube-api-key-file.js";
import { fetchChannelVideoLinks } from "./channel-video-links.js";
import { fetchAndStoreVideoMetadata, type VideoMetadataStore } from "./video-metadata.js";
import { createYoutubeDataApiClient } from "./youtube-data-api.js";

test("calls the narrow channels endpoint with the expected typed parameters", async () => {
  let capturedUrl: URL | undefined;
  const client = createYoutubeDataApiClient({
    apiKey: "fixture-key",
    requestDelayMs: 0,
    fetch: async (input) => {
      capturedUrl = requestUrl(input);
      return jsonResponse({
        items: [{
          id: "UCE2x09tU0GwAGiSbFPEhIwQ",
          contentDetails: { relatedPlaylists: { uploads: "UUE2x09tU0GwAGiSbFPEhIwQ" } },
        }],
      });
    },
  });

  const response = await client.listChannels({
    part: ["contentDetails"],
    forHandle: "@DrAlexClarke",
  });

  assert.equal(capturedUrl?.pathname, "/youtube/v3/channels");
  assert.equal(capturedUrl?.searchParams.get("part"), "contentDetails");
  assert.equal(capturedUrl?.searchParams.get("forHandle"), "@DrAlexClarke");
  assert.equal(capturedUrl?.searchParams.get("key"), "fixture-key");
  assert.equal(response.items[0]?.contentDetails?.relatedPlaylists?.uploads, "UUE2x09tU0GwAGiSbFPEhIwQ");
});

test("accepts empty and partial list responses but rejects malformed responses", async () => {
  const responses = [
    jsonResponse({}),
    jsonResponse({ items: [{ id: "partial0001" }] }),
    jsonResponse({ items: {} }),
  ];
  const client = createYoutubeDataApiClient({
    apiKey: "fixture-key",
    requestDelayMs: 0,
    maxAttempts: 1,
    fetch: async () => responses.shift() ?? jsonResponse({}),
  });

  assert.deepEqual(
    await client.listVideos({ part: ["snippet"], id: ["empty000001"], maxResults: 1 }),
    { items: [] },
  );
  assert.deepEqual(
    await client.listVideos({ part: ["snippet"], id: ["partial0001"], maxResults: 1 }),
    { items: [{ id: "partial0001" }] },
  );
  await assert.rejects(
    client.listVideos({ part: ["snippet"], id: ["invalid0001"], maxResults: 1 }),
    /malformed response: items must be an array/u,
  );
});

test("retries transient responses with bounded backoff and then succeeds", async () => {
  let currentTime = 1_000;
  let requests = 0;
  const sleeps: number[] = [];
  const client = createYoutubeDataApiClient({
    apiKey: "fixture-key",
    requestDelayMs: 1_000,
    retryBaseDelayMs: 250,
    maxAttempts: 3,
    now: () => currentTime,
    sleep: async (ms) => {
      sleeps.push(ms);
      currentTime += ms;
    },
    fetch: async () => {
      requests += 1;
      return requests === 1
        ? jsonResponse({ error: { message: "temporarily unavailable" } }, 503, { "retry-after": "2" })
        : jsonResponse({ items: [{ id: "retry000001" }] });
    },
  });

  const response = await client.listVideos({ part: ["snippet"], id: ["retry000001"], maxResults: 1 });

  assert.deepEqual(response.items.map((item) => item.id), ["retry000001"]);
  assert.equal(requests, 2);
  assert.deepEqual(sleeps, [2_000]);
});

test("caps server Retry-After delays at the configured retry maximum", async () => {
  let currentTime = 0;
  let requests = 0;
  const sleeps: number[] = [];
  const client = createYoutubeDataApiClient({
    apiKey: "fixture-key",
    requestDelayMs: 0,
    retryBaseDelayMs: 100,
    maxRetryDelayMs: 500,
    maxAttempts: 2,
    now: () => currentTime,
    sleep: async (ms) => {
      sleeps.push(ms);
      currentTime += ms;
    },
    fetch: async () => {
      requests += 1;
      return requests === 1
        ? jsonResponse({ error: { message: "rate limited" } }, 429, { "retry-after": "86400" })
        : jsonResponse({ items: [{ id: "retry000001" }] });
    },
  });

  const response = await client.listVideos({ part: ["snippet"], id: ["retry000001"], maxResults: 1 });

  assert.deepEqual(response.items.map((item) => item.id), ["retry000001"]);
  assert.equal(requests, 2);
  assert.deepEqual(sleeps, [500]);
});

test("exhausts transient retries but does not retry permanent responses", async () => {
  let transientRequests = 0;
  let currentTime = 0;
  const transientSleeps: number[] = [];
  const transientClient = createYoutubeDataApiClient({
    apiKey: "fixture-key",
    requestDelayMs: 0,
    retryBaseDelayMs: 10,
    maxRetryDelayMs: 15,
    maxAttempts: 3,
    now: () => currentTime,
    sleep: async (ms) => {
      transientSleeps.push(ms);
      currentTime += ms;
    },
    fetch: async () => {
      transientRequests += 1;
      return jsonResponse({ error: { message: "still unavailable" } }, 503);
    },
  });

  await assert.rejects(
    transientClient.listVideos({ part: ["snippet"], id: ["retry000001"], maxResults: 1 }),
    /failed after 3 attempts with HTTP 503/u,
  );
  assert.equal(transientRequests, 3);
  assert.deepEqual(transientSleeps, [10, 15]);

  const secret = "fixture-secret-key";
  const logs: string[] = [];
  let permanentRequests = 0;
  const permanentClient = createYoutubeDataApiClient({
    apiKey: secret,
    requestDelayMs: 0,
    maxAttempts: 3,
    logger: (message) => logs.push(message),
    fetch: async () => {
      permanentRequests += 1;
      return jsonResponse({ error: { message: `invalid API key ${secret}` } }, 403);
    },
  });

  const permanentError = await captureError(
    permanentClient.listVideos({ part: ["snippet"], id: ["denied00001"], maxResults: 1 }),
  );
  assert.equal(permanentRequests, 1);
  assert.doesNotMatch(permanentError.message, new RegExp(secret, "u"));
  assert.match(permanentError.message, /invalid API key \[REDACTED\]/u);
  assert.ok(logs.every((message) => !message.includes(secret)));
});

test("paces every Data API request through injected sleep and clock dependencies", async () => {
  let currentTime = 5_000;
  const starts: number[] = [];
  const sleeps: number[] = [];
  const client = createYoutubeDataApiClient({
    apiKey: "fixture-key",
    requestDelayMs: 1_000,
    now: () => currentTime,
    sleep: async (ms) => {
      sleeps.push(ms);
      currentTime += ms;
    },
    fetch: async () => {
      starts.push(currentTime);
      return jsonResponse({ items: [] });
    },
  });

  await client.listChannels({ part: ["contentDetails"], forHandle: "@DrAlexClarke" });
  await client.listPlaylistItems({ part: ["contentDetails"], playlistId: "uploads", maxResults: 50 });

  assert.deepEqual(starts, [5_000, 6_000]);
  assert.deepEqual(sleeps, [1_000]);
});

test("paginates uploads, filters ignored videos, enriches in 50-ID batches, and writes the final checkpoint", async (t) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "naval-youtube-channel-"));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const checkpointPath = join(fixtureRoot, "checkpoint.json");
  const playlistTokens: (string | null)[] = [];
  const videoBatchSizes: number[] = [];
  const client = createYoutubeDataApiClient({
    apiKey: "fixture-key",
    requestDelayMs: 0,
    fetch: async (input) => {
      const url = requestUrl(input);
      switch (url.pathname) {
        case "/youtube/v3/channels":
          return jsonResponse({
            items: [{
              id: "UCE2x09tU0GwAGiSbFPEhIwQ",
              contentDetails: { relatedPlaylists: { uploads: "uploads-playlist" } },
            }],
          });
        case "/youtube/v3/playlistItems": {
          const pageToken = url.searchParams.get("pageToken");
          playlistTokens.push(pageToken);
          return pageToken === null
            ? jsonResponse({
                items: [playlistItem("keep-video1"), playlistItem("ignore00001")],
                nextPageToken: "page-2",
              })
            : jsonResponse({ items: [playlistItem("keep-video2")] });
        }
        case "/youtube/v3/videos": {
          const ids = (url.searchParams.get("id") ?? "").split(",").filter(Boolean);
          videoBatchSizes.push(ids.length);
          return jsonResponse({
            items: ids.map((id) => ({
              id,
              contentDetails: { duration: "PT2M" },
              status: { uploadStatus: "processed" },
            })),
          });
        }
        default:
          return jsonResponse({ error: { message: "unexpected endpoint" } }, 404);
      }
    },
  });

  const result = await fetchChannelVideoLinks({
    channelUrl: "https://www.youtube.com/@DrAlexClarke",
    apiKey: "fixture-key",
    requestDelayMs: 0,
    checkpointOutput: checkpointPath,
    ignoredVideoIds: new Set(["ignore00001"]),
    apiClient: client,
    clock: () => new Date("2026-08-02T20:00:00Z"),
  });
  const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8")) as typeof result;

  assert.deepEqual(playlistTokens, [null, "page-2"]);
  assert.deepEqual(videoBatchSizes, [2]);
  assert.equal(result.tabs.videos.pagesFetched, 2);
  assert.equal(result.tabs.videos.rawCount, 3);
  assert.deepEqual(result.links.map((link) => link.videoId), ["keep-video1", "keep-video2"]);
  assert.deepEqual(checkpoint, result);
});

test("honors the optional page limit and preserves the last successful playlist checkpoint on failure", async (t) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "naval-youtube-checkpoint-"));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const limitedCalls: (string | null)[] = [];
  const limitedClient = createYoutubeDataApiClient({
    apiKey: "fixture-key",
    requestDelayMs: 0,
    fetch: async (input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith("/channels")) {
        return channelResponse();
      }
      if (url.pathname.endsWith("/playlistItems")) {
        limitedCalls.push(url.searchParams.get("pageToken"));
        return jsonResponse({ items: [playlistItem("keep-video1")], nextPageToken: "page-2" });
      }
      return videoResponse(url);
    },
  });
  const limited = await fetchChannelVideoLinks({
    channelUrl: "https://www.youtube.com/@DrAlexClarke",
    apiKey: "fixture-key",
    requestDelayMs: 0,
    maxPages: 1,
    apiClient: limitedClient,
  });
  assert.deepEqual(limitedCalls, [null]);
  assert.equal(limited.tabs.videos.pagesFetched, 1);

  const checkpointPath = join(fixtureRoot, "partial.json");
  let playlistPage = 0;
  const failingClient = createYoutubeDataApiClient({
    apiKey: "fixture-key",
    requestDelayMs: 0,
    maxAttempts: 1,
    fetch: async (input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith("/channels")) {
        return channelResponse();
      }
      if (url.pathname.endsWith("/playlistItems")) {
        playlistPage += 1;
        return playlistPage === 1
          ? jsonResponse({ items: [playlistItem("keep-video1")], nextPageToken: "page-2" })
          : jsonResponse({ error: { message: "fixture failure" } }, 503);
      }
      return videoResponse(url);
    },
  });

  await assert.rejects(fetchChannelVideoLinks({
    channelUrl: "https://www.youtube.com/@DrAlexClarke",
    apiKey: "fixture-key",
    requestDelayMs: 0,
    checkpointOutput: checkpointPath,
    apiClient: failingClient,
    clock: () => new Date("2026-08-02T20:00:00Z"),
  }), /fixture failure/u);
  const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8")) as {
    tabs: { videos: { pagesFetched: number } };
    links: { videoId: string }[];
  };
  assert.equal(checkpoint.tabs.videos.pagesFetched, 1);
  assert.deepEqual(checkpoint.links.map((link) => link.videoId), ["keep-video1"]);
});

test("batches 50 video IDs, checkpoints a partial response, and resumes only missing IDs", async (t) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "naval-youtube-metadata-"));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const inputPath = join(fixtureRoot, "episodes.json");
  const outputPath = join(fixtureRoot, "video-metadata.json");
  const videoIds = Array.from({ length: 51 }, (_, index) => `id-${String(index).padStart(8, "0")}`);
  await writeFile(inputPath, `${JSON.stringify({ episodes: videoIds.map((videoId) => ({ videoId })) })}\n`);

  const requestedBatches: string[][] = [];
  let batchNumber = 0;
  const failingClient = createYoutubeDataApiClient({
    apiKey: "fixture-key",
    requestDelayMs: 0,
    maxAttempts: 1,
    fetch: async (input) => {
      const url = requestUrl(input);
      const ids = (url.searchParams.get("id") ?? "").split(",").filter(Boolean);
      requestedBatches.push(ids);
      batchNumber += 1;
      return batchNumber === 1
        ? jsonResponse({ items: ids.slice(0, 49).map(metadataVideo) })
        : jsonResponse({ error: { message: "second batch failed" } }, 503);
    },
  });

  await assert.rejects(fetchAndStoreVideoMetadata({
    apiKey: "fixture-key",
    inputPath,
    outputPath,
    requestDelayMs: 0,
    batchSize: 50,
    apiClient: failingClient,
    clock: () => new Date("2026-08-02T20:00:00Z"),
  }), /second batch failed/u);
  const partial = JSON.parse(await readFile(outputPath, "utf8")) as VideoMetadataStore;
  assert.deepEqual(requestedBatches.map((batch) => batch.length), [50, 1]);
  assert.equal(partial.stats.batchesFetched, 1);
  assert.equal(partial.stats.storedVideoCount, 49);
  assert.deepEqual(partial.pendingVideoIds, [videoIds[49], videoIds[50]]);

  const resumedBatches: string[][] = [];
  const resumedClient = createYoutubeDataApiClient({
    apiKey: "fixture-key",
    requestDelayMs: 0,
    fetch: async (input) => {
      const ids = (requestUrl(input).searchParams.get("id") ?? "").split(",").filter(Boolean);
      resumedBatches.push(ids);
      return jsonResponse({ items: ids.map(metadataVideo) });
    },
  });
  const resumed = await fetchAndStoreVideoMetadata({
    apiKey: "fixture-key",
    inputPath,
    outputPath,
    requestDelayMs: 0,
    batchSize: 50,
    apiClient: resumedClient,
    clock: () => new Date("2026-08-02T20:05:00Z"),
  });

  assert.deepEqual(resumedBatches, [[videoIds[49], videoIds[50]]]);
  assert.equal(resumed.stats.storedVideoCount, 51);
  assert.deepEqual(resumed.pendingVideoIds, []);
});

test("resolves API keys in explicit, file, then environment order", async (t) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "naval-youtube-key-"));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const keyPath = join(fixtureRoot, "youtube-key.txt");
  await writeFile(keyPath, "file-key\n", "utf8");
  const previous = process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY = "environment-key";
  t.after(() => {
    if (previous === undefined) {
      delete process.env.YOUTUBE_API_KEY;
    } else {
      process.env.YOUTUBE_API_KEY = previous;
    }
  });

  assert.equal(await resolveYoutubeApiKey({ apiKey: "explicit-key", apiKeyFile: keyPath }), "explicit-key");
  assert.equal(await resolveYoutubeApiKey({ apiKeyFile: keyPath }), "file-key");
  assert.equal(await resolveYoutubeApiKey({}), "environment-key");
});

function requestUrl(input: Parameters<typeof fetch>[0]): URL {
  if (input instanceof URL) {
    return input;
  }
  return new URL(typeof input === "string" ? input : input.url);
}

function jsonResponse(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function channelResponse(): Response {
  return jsonResponse({
    items: [{
      id: "UCE2x09tU0GwAGiSbFPEhIwQ",
      contentDetails: { relatedPlaylists: { uploads: "uploads-playlist" } },
    }],
  });
}

function playlistItem(videoId: string): Record<string, unknown> {
  return {
    contentDetails: {
      videoId,
      videoPublishedAt: "2026-08-02T18:00:00Z",
    },
    snippet: { title: `Video ${videoId}` },
  };
}

function videoResponse(url: URL): Response {
  const ids = (url.searchParams.get("id") ?? "").split(",").filter(Boolean);
  return jsonResponse({ items: ids.map(metadataVideo) });
}

function metadataVideo(id: string): Record<string, unknown> {
  return {
    id,
    snippet: {
      title: `Video ${id}`,
      publishedAt: "2026-08-02T18:00:00Z",
      liveBroadcastContent: "none",
    },
    contentDetails: { duration: "PT2M" },
    status: { uploadStatus: "processed" },
  };
}

async function captureError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error("Expected promise to reject.");
}
