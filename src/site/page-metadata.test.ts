import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildSiteArchiveData,
  type SiteArchiveData,
} from "./archive-data.js";
import { loadCuratedArchiveSeed } from "./curated-seed.js";
import {
  MAX_METADATA_DESCRIPTION_LENGTH,
  MAX_METADATA_TITLE_LENGTH,
  buildSegmentPageMetadata,
  buildTimeNoteBrowseMetadata,
  buildTopicBrowseMetadata,
  buildTopicPageMetadata,
  buildVideoBrowseMetadata,
  buildVideoPageMetadata,
  buildVideoStructuredName,
  segmentDescriptionSource,
} from "./page-metadata.js";
import { isPublicTopic } from "./public-topic.js";
import { loadTopicNormalizationCatalog } from "./topic-normalization.js";

const episodesInput = "src/channel/episodes.json";
const metadataInput = "src/channel/video-metadata.json";
const transcriptsInput = "src/transcripts/manifest.json";
const segmentsInput = "src/derived/video-segments";
const patternsInput = "src/derived/topic-normalization-patterns.tsv";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function buildCurrentArchive(): Promise<SiteArchiveData> {
  const [episodesStore, metadataStore, transcriptsStore, seed, catalog] = await Promise.all([
    readJson<Parameters<typeof buildSiteArchiveData>[0]["episodesStore"]>(episodesInput),
    readJson<Parameters<typeof buildSiteArchiveData>[0]["metadataStore"]>(metadataInput),
    readJson<Parameters<typeof buildSiteArchiveData>[0]["transcriptsStore"]>(transcriptsInput),
    loadCuratedArchiveSeed(segmentsInput),
    loadTopicNormalizationCatalog(patternsInput),
  ]);
  return buildSiteArchiveData({
    episodesStore,
    metadataStore,
    transcriptsStore,
    seed,
    source: {
      episodesInput,
      metadataInput,
      transcriptsInput,
      segmentsInput,
      patternsInput,
      patternsSha256: catalog.sha256,
      patternsSourceSha256: catalog.sourceSha256,
    },
  });
}

function assertUsefulMetadata(metadata: { title: string; description: string }): void {
  assert.ok(metadata.title.trim().length > 0);
  assert.ok(metadata.description.trim().length > 0);
  assert.ok(metadata.title.length <= MAX_METADATA_TITLE_LENGTH);
  assert.ok(metadata.description.length <= MAX_METADATA_DESCRIPTION_LENGTH);
  assert.doesNotMatch(metadata.title, /\s{2,}/u);
  assert.doesNotMatch(metadata.description, /\s{2,}/u);
}

test("builds unique, nonempty metadata for every current public detail page", async () => {
  const archive = await buildCurrentArchive();
  const videos = archive.videos;
  const topics = archive.topics.filter(isPublicTopic);
  const segments = archive.segments;
  const metadata = [
    ...videos.map(buildVideoPageMetadata),
    ...segments.map(buildSegmentPageMetadata),
    ...topics.map(buildTopicPageMetadata),
  ];

  metadata.forEach(assertUsefulMetadata);
  assert.equal(new Set(metadata.map((item) => item.title)).size, metadata.length);
  assert.equal(new Set(metadata.map((item) => item.description)).size, metadata.length);
  const structuredVideoNames = videos.map(buildVideoStructuredName);
  assert.equal(new Set(structuredVideoNames).size, structuredVideoNames.length);
});

test("time-note descriptions fall back from summary to short answer to body", () => {
  const common = { title: "A useful point", videoTitle: "A useful video", start: "12:34" };
  assert.equal(segmentDescriptionSource({ summary: " Summary text. ", answerShort: "Answer text.", body: "Body text." }), "Summary text.");
  assert.equal(segmentDescriptionSource({ summary: " ", answerShort: " Answer text. ", body: "Body text." }), "Answer text.");
  assert.equal(segmentDescriptionSource({ summary: "", answerShort: "", body: " Body text. " }), "Body text.");
  assert.match(buildSegmentPageMetadata({ ...common, summary: "", answerShort: "", body: "Body text." }).description, /Body text\./u);
});

test("topic metadata uses manual descriptions only when supplied", () => {
  const counts = { videoCount: 2, segmentCount: 3 };
  const withoutDescription = buildTopicPageMetadata({ title: "Destroyers", ...counts });
  const withDescription = buildTopicPageMetadata({
    title: "Destroyers",
    summary: "A manually curated topic description.",
    ...counts,
  });

  assert.match(withoutDescription.description, /^Explore Destroyers across/u);
  assert.match(withDescription.description, /^A manually curated topic description\./u);
});

test("builds distinct metadata for every paginated archive family and page", () => {
  const metadata = [
    buildTimeNoteBrowseMetadata(1, 4),
    buildTimeNoteBrowseMetadata(2, 4),
    buildVideoBrowseMetadata(1, 3),
    buildVideoBrowseMetadata(2, 3),
    buildTopicBrowseMetadata(1, 12),
    buildTopicBrowseMetadata(2, 12),
  ];

  metadata.forEach(assertUsefulMetadata);
  assert.equal(new Set(metadata.map((item) => item.title)).size, metadata.length);
  assert.equal(new Set(metadata.map((item) => item.description)).size, metadata.length);
});
