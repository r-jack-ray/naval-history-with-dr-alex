import assert from "node:assert/strict";
import test from "node:test";

import { fetchVideoTranscript, VerticalStreamError } from "./transcripts.js";

const videoId = "aXmqy_3hu78";
const portrait = {mimeType: "video/mp4", width: 1080, height: 1920};
const landscape = {mimeType: "video/mp4", width: 1920, height: 1080};
const captions = {
  playerCaptionsTracklistRenderer: {
    captionTracks: [{baseUrl: "https://captions.example.test/track", languageCode: "en", name: {simpleText: "English"}}],
  },
};

test("portrait watch-page formats stop a live stream before player or caption requests", async () => {
  const watch = playerResponse(true, [portrait, {mimeType: "audio/mp4"}]);
  watch.videoDetails.thumbnail = {thumbnails: [{width: 1280, height: 720}]};
  const stub = stubFetch(watch, playerResponse(true, [portrait]));

  await assert.rejects(fetchVideoTranscript({videoId, requestDelayMs: 0, fetch: stub.fetch}), VerticalStreamError);
  assert.equal(stub.urls.length, 1);
});

test("portrait player formats cannot fall back to caption downloads", async () => {
  const stub = stubFetch(playerResponse(true, []), playerResponse(true, [portrait]));

  await assert.rejects(fetchVideoTranscript({videoId, requestDelayMs: 0, fetch: stub.fetch}), VerticalStreamError);
  assert.equal(stub.urls.length, 2);
});

for (const [name, format] of [["landscape", landscape], ["square", {...landscape, height: 1920}]] as const) {
  test(`${name} stream downloads captions and retains watch-page evidence when player fields are omitted`, async () => {
    const stub = stubFetch(playerResponse(true, [format]), {videoDetails: {videoId}, captions});
    const result = await fetchVideoTranscript({videoId, requestDelayMs: 0, fetch: stub.fetch});

    assert.equal(result.segments[0]?.text, "Hello");
    assert.equal(stub.urls.length, 3);
  });
}

test("player dimensions resolve unknown watch-page orientation without a live flag in the player", async () => {
  const stub = stubFetch(playerResponse(true, []), {
    videoDetails: {videoId}, streamingData: {formats: [landscape]}, captions,
  });
  const result = await fetchVideoTranscript({videoId, requestDelayMs: 0, fetch: stub.fetch});

  assert.equal(result.segments[0]?.text, "Hello");
  assert.equal(stub.urls.length, 3);
});

test("ordinary nonlive portrait uploads remain eligible", async () => {
  const stub = stubFetch(playerResponse(false, [portrait]), playerResponse(false, [portrait]));
  const result = await fetchVideoTranscript({videoId, requestDelayMs: 0, fetch: stub.fetch});

  assert.equal(result.segments[0]?.text, "Hello");
});

for (const [name, formats] of [
  ["missing", []],
  ["invalid or audio-only", [
    {mimeType: "audio/mp4", width: 1920, height: 1080},
    {width: "1920", height: "1080"},
    {width: 0, height: 1080},
    {width: -1, height: 1080},
    {width: 1920.5, height: 1080},
    {width: 1920, height: null},
  ]],
  ["conflicting", [portrait, landscape]],
] as const) {
  test(`${name} stream dimensions prevent captions in both acquisition paths without a permanent vertical classification`, async () => {
    const response = playerResponse(true, formats);
    const stub = stubFetch(response, response);

    await assert.rejects(fetchVideoTranscript({videoId, requestDelayMs: 0, fetch: stub.fetch}), (error: unknown) => {
      assert(error instanceof Error);
      assert(!(error instanceof VerticalStreamError));
      assert.match(error.message, /orientation unavailable or inconsistent/u);
      return true;
    });
    assert.equal(stub.urls.length, 3);
    assert(stub.urls.every((url) => !url.startsWith("https://captions.example.test/")));
  });
}

test("the watch-page fallback also excludes portrait streams before captions", async () => {
  let watchRequests = 0;
  const stub = stubFetch(
      () => ++watchRequests === 1 ? "<html>Unavailable initial response</html>" : watchHtml(playerResponse(true, [portrait])),
      {},
  );

  await assert.rejects(fetchVideoTranscript({videoId, requestDelayMs: 0, fetch: stub.fetch}), VerticalStreamError);
  assert.equal(stub.urls.length, 2);
});

test("landscape fallback reuses orientation evidence and downloads VTT captions", async () => {
  let watchRequests = 0;
  const stub = stubFetch(
      () => watchHtml(++watchRequests === 1 ? playerResponse(true, [landscape]) : {videoDetails: {videoId}, captions}),
      () => new Response("Unavailable", {status: 503}),
  );
  const result = await fetchVideoTranscript({videoId, requestDelayMs: 0, fetch: stub.fetch});

  assert.equal(result.source, "watch-page-captions");
  assert.equal(result.segments[0]?.text, "Hello");
  assert.equal(stub.urls.length, 4);
});

test("official live-stream evidence applies even when player flags are absent", async () => {
  const response = {videoDetails: {videoId}, streamingData: {formats: [portrait]}, captions};
  const stub = stubFetch(response, response);

  await assert.rejects(fetchVideoTranscript({videoId, requestDelayMs: 0, fetch: stub.fetch, isLiveContent: true}), VerticalStreamError);
  assert.equal(stub.urls.length, 1);
});

test("a different video ID cannot classify or download the requested video", async () => {
  const response = {...playerResponse(true, [portrait]), videoDetails: {videoId: "i6I6YwSHbBk", isLiveContent: true}};
  const stub = stubFetch(response, response);

  await assert.rejects(fetchVideoTranscript({videoId, requestDelayMs: 0, fetch: stub.fetch}), /video ID does not match/u);
  assert.equal(stub.urls.length, 2);
});

for (const fallback of [false, true]) {
  test(`English is enforced with Arabic first in ${fallback ? "fallback" : "primary"} caption tracks`, async () => {
    const response = multilingualResponse();
    const stub = stubFetch(response, fallback ? () => new Response("Unavailable", {status: 503}) : response);
    const result = await fetchVideoTranscript({videoId, requestDelayMs: 0, fetch: stub.fetch});

    assert.equal(result.selectedLanguage, "en");
    assert(stub.urls.some((url) => url.startsWith("https://captions.example.test/track-en")));
    assert(stub.urls.every((url) => !url.startsWith("https://captions.example.test/track-ar")));
    assert.equal(result.source, fallback ? "watch-page-captions" : "youtube-transcript-plus");
  });
}

test("English acquisition fails instead of downloading the only Arabic track", async () => {
  const response = multilingualResponse();
  response.captions.playerCaptionsTracklistRenderer.captionTracks.pop();
  const stub = stubFetch(response, response);

  await assert.rejects(fetchVideoTranscript({videoId, requestDelayMs: 0, fetch: stub.fetch}), /No caption track matched language: en/u);
  assert(stub.urls.every((url) => !url.startsWith("https://captions.example.test/")));
});

test("an explicit non-English language is rejected before network access", async () => {
  const response = multilingualResponse();
  const stub = stubFetch(response, response);

  await assert.rejects(fetchVideoTranscript({videoId, language: "ar", requestDelayMs: 0, fetch: stub.fetch}), /requires English/u);
  assert.deepEqual(stub.urls, []);
});

function multilingualResponse() {
  return {
    ...playerResponse(false, [landscape]),
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          {baseUrl: "https://captions.example.test/track-ar", languageCode: "ar", name: {simpleText: "Arabic"}},
          {baseUrl: "https://captions.example.test/track-en", languageCode: "en", name: {simpleText: "English"}},
        ],
      },
    },
  };
}

function playerResponse(isLiveContent: boolean, formats: readonly unknown[]) {
  return {
    videoDetails: {videoId, title: "Bruships 260", isLiveContent, thumbnail: {thumbnails: [] as unknown[]}},
    streamingData: {adaptiveFormats: formats},
    captions,
  };
}

function watchHtml(response: unknown): string {
  return `<script>var ytInitialPlayerResponse = ${JSON.stringify(response)};</script>` +
      '<script>{"INNERTUBE_API_KEY":"fixture-key"}</script>';
}

function stubFetch(watch: unknown | (() => string), player: unknown | (() => Response)) {
  const urls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.startsWith("https://www.youtube.com/watch?")) {
      return new Response(typeof watch === "function" ? watch() : watchHtml(watch));
    }
    if (url.startsWith("https://www.youtube.com/youtubei/v1/player?")) {
      return typeof player === "function" ? player() : Response.json(player);
    }
    if (url.startsWith("https://captions.example.test/track")) {
      return new Response(url.includes("fmt=vtt")
          ? "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n"
          : '<transcript><text start="0" dur="1">Hello</text></transcript>');
    }
    throw new Error(`Unexpected network request: ${url}`);
  };
  return {urls, fetch: fetcher};
}
