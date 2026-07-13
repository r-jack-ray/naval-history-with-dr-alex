import assert from "node:assert/strict";
import test from "node:test";

import {
  applyOfficialVideoMetadata,
  buildChannelEpisodeMaster,
  createRateLimitedFetch,
  extractVideoLink,
  fetchInitWithRequestLabel,
  mergeChannelVideoLinksResults,
  officialVideoStreamStartTime,
  splitChannelVideoLinksResult,
  type ChannelVideoLink,
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

test("builds a canonical source episode master list", () => {
  const master = buildChannelEpisodeMaster(
    {
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
          pagesFetched: 0,
          rawCount: 0,
        },
      },
      links: [
        {
          videoId: "uURe69Wnh-Q",
          url: "https://www.youtube.com/watch?v=uURe69Wnh-Q",
          title: "Stored transcript video",
          durationText: "4:35:38",
          tabs: ["videos"],
          tabPositions: { videos: 1 },
        },
      ],
    },
    {
      completeness: "partial",
      transcriptStates: new Map([
        [
          "uURe69Wnh-Q",
          {
            status: "stored",
            txtPath: "src/transcripts/txt/uURe69Wnh-Q.txt",
            segmentCount: 6438,
            selectedLanguage: "en",
          },
        ],
      ]),
    },
  );

  assert.equal(master.inventory.completeness, "partial");
  assert.equal(master.inventory.notes[0], "Streams tab has not been fetched in this inventory.");
  assert.deepEqual(master.episodes, [
    {
      videoId: "uURe69Wnh-Q",
      slug: "stored-transcript-video",
      fileStem: "stored-transcript-video_uURe69Wnh-Q",
      url: "https://www.youtube.com/watch?v=uURe69Wnh-Q",
      channelOrder: 1,
      title: "Stored transcript video",
      durationText: "4:35:38",
      tabs: ["videos"],
      tabPositions: { videos: 1 },
      transcript: {
        status: "stored",
        txtPath: "src/transcripts/txt/uURe69Wnh-Q.txt",
        segmentCount: 6438,
        selectedLanguage: "en",
      },
    },
  ]);
});

test("prefers actual then scheduled livestream time over the upload timestamp", () => {
  assert.equal(
    officialVideoStreamStartTime({
      snippet: { publishedAt: "2026-06-14T16:44:14Z" },
      liveStreamingDetails: { scheduledStartTime: "2026-07-12T18:30:00Z" },
    }),
    "2026-07-12T18:30:00Z",
  );
  assert.equal(
    officialVideoStreamStartTime({
      snippet: { publishedAt: "2026-06-14T16:44:14Z" },
      liveStreamingDetails: {
        scheduledStartTime: "2026-07-12T18:30:00Z",
        actualStartTime: "2026-07-12T18:33:54Z",
      },
    }),
    "2026-07-12T18:33:54Z",
  );
});

test("official enrichment exposes the stream date and retains the advance upload time", () => {
  const link: ChannelVideoLink = {
    videoId: "abc123",
    url: "https://www.youtube.com/watch?v=abc123",
    tabs: ["streams" as const],
    tabPositions: { streams: 1 },
  };

  applyOfficialVideoMetadata(link, {
    snippet: {
      title: "Upcoming Naval History Live",
      publishedAt: "2026-06-14T16:44:14Z",
    },
    liveStreamingDetails: {
      scheduledStartTime: "2026-07-12T18:30:00Z",
    },
  });

  assert.equal(link.uploadDate, "2026-06-14T16:44:14Z");
  assert.equal(link.streamStartAt, "2026-07-12T18:30:00Z");
  assert.equal(link.publishedAt, "2026-07-12T18:30:00Z");
  assert.equal(link.publishDate, "2026-07-12");
  assert.equal(link.publishedText, "2026-07-12");
});

test("merges channel video link results across tabs", () => {
  const merged = mergeChannelVideoLinksResults([
    {
      channelUrl: "https://www.youtube.com/@DrAlexClarke",
      channelId: "UCE2x09tU0GwAGiSbFPEhIwQ",
      fetchedAt: "2026-07-07T23:00:00.000Z",
      requestDelayMs: 0,
      tabs: {
        videos: { url: "https://www.youtube.com/@DrAlexClarke/videos", pagesFetched: 1, rawCount: 2 },
        streams: { url: "https://www.youtube.com/@DrAlexClarke/streams", pagesFetched: 0, rawCount: 0 },
      },
      links: [
        {
          videoId: "abc123",
          url: "https://www.youtube.com/watch?v=abc123",
          title: "Video",
          tabs: ["videos"],
          tabPositions: { videos: 1 },
        },
      ],
    },
    {
      channelUrl: "https://www.youtube.com/@DrAlexClarke",
      channelId: "UCE2x09tU0GwAGiSbFPEhIwQ",
      fetchedAt: "2026-07-08T00:00:00.000Z",
      requestDelayMs: 0,
      tabs: {
        videos: { url: "https://www.youtube.com/@DrAlexClarke/videos", pagesFetched: 0, rawCount: 0 },
        streams: { url: "https://www.youtube.com/@DrAlexClarke/streams", pagesFetched: 1, rawCount: 2 },
      },
      links: [
        {
          videoId: "abc123",
          url: "https://www.youtube.com/watch?v=abc123",
          tabs: ["streams"],
          tabPositions: { streams: 1 },
        },
        {
          videoId: "def456",
          url: "https://www.youtube.com/watch?v=def456",
          tabs: ["streams"],
          tabPositions: { streams: 2 },
        },
      ],
    },
  ]);

  assert.equal(merged.tabs.videos.pagesFetched, 1);
  assert.equal(merged.tabs.streams.pagesFetched, 1);
  assert.deepEqual(merged.links.map((link) => link.videoId), ["abc123", "def456"]);
  assert.deepEqual(merged.links[0]?.tabs, ["videos", "streams"]);
  assert.deepEqual(merged.links[0]?.tabPositions, { videos: 1, streams: 1 });
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

test("logs optional rate-limited request labels", async () => {
  const logs: string[] = [];
  const baseFetch = (async () => new Response("{}")) as typeof fetch;
  const limitedFetch = createRateLimitedFetch({
    delayMs: 0,
    baseFetch,
    logger: (message) => logs.push(message),
  });

  await limitedFetch("https://www.youtube.com/watch?v=abc123", fetchInitWithRequestLabel({}, "video page"));

  assert.deepEqual(logs, ["YouTube request 1: video page (www.youtube.com)"]);
});
