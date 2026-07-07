import assert from "node:assert/strict";
import test from "node:test";

import {
  createRateLimitedFetch,
  extractVideoLink,
  splitChannelVideoLinksResult,
} from "./channel-video-links.js";

test("extracts video links from YouTube LockupView nodes", () => {
  const record = extractVideoLink(
    {
      content_id: "--l6rRIfksQ",
      content_type: "VIDEO",
      metadata: {
        title: { text: "Ideal Destroyers" },
        metadata: {
          metadata_rows: [
            {
              metadata_parts: [
                { text: { text: "1.7K views" } },
                { text: { text: "3 days ago" } },
              ],
            },
          ],
        },
      },
      content_image: {
        overlays: [{ badges: [{ text: "1:30:46" }] }],
      },
    },
    "videos",
    7,
  );

  assert.deepEqual(record, {
    videoId: "--l6rRIfksQ",
    url: "https://www.youtube.com/watch?v=--l6rRIfksQ",
    title: "Ideal Destroyers",
    durationText: "1:30:46",
    publishedText: "3 days ago",
    viewCountText: "1.7K views",
    tabs: ["videos"],
    tabPositions: { videos: 7 },
  });
});

test("splits base video links from metadata records", () => {
  const split = splitChannelVideoLinksResult({
    channelUrl: "https://www.youtube.com/@DrAlexClarke",
    channelId: "UCE2x09tU0GwAGiSbFPEhIwQ",
    fetchedAt: "2026-07-07T23:00:00.000Z",
    requestDelayMs: 60_000,
    tabs: {
      videos: {
        url: "https://www.youtube.com/@DrAlexClarke/videos",
        pagesFetched: 1,
        rawCount: 1,
      },
      streams: {
        url: "https://www.youtube.com/@DrAlexClarke/streams",
        pagesFetched: 1,
        rawCount: 0,
      },
    },
    links: [
      {
        videoId: "--l6rRIfksQ",
        url: "https://www.youtube.com/watch?v=--l6rRIfksQ",
        title: "Ideal Destroyers",
        publishDate: "2026-07-04",
        tabs: ["videos"],
        tabPositions: { videos: 1 },
      },
    ],
  });

  assert.deepEqual(split.list.videos, [
    {
      videoId: "--l6rRIfksQ",
      url: "https://www.youtube.com/watch?v=--l6rRIfksQ",
      tabs: ["videos"],
      tabPositions: { videos: 1 },
    },
  ]);
  assert.equal(split.metadata.exactDetailsIncluded, true);
  assert.deepEqual(split.metadata.videos, [
    {
      videoId: "--l6rRIfksQ",
      title: "Ideal Destroyers",
      publishDate: "2026-07-04",
    },
  ]);
});

test("spaces fetch calls through a serial rate limiter", async () => {
  let currentTime = 1_000;
  const waits: number[] = [];
  const starts: number[] = [];
  const baseFetch = (async () => new Response("{}")) as typeof fetch;
  const limitedFetch = createRateLimitedFetch({
    delayMs: 60_000,
    baseFetch,
    now: () => currentTime,
    sleep: async (ms) => {
      waits.push(ms);
      currentTime += ms;
    },
  });

  await limitedFetch("https://www.youtube.com/first");
  starts.push(currentTime);
  await limitedFetch("https://www.youtube.com/second");
  starts.push(currentTime);

  assert.deepEqual(waits, [60_000]);
  assert.deepEqual(starts, [1_000, 61_000]);
});
