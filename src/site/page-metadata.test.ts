import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { SiteSegment, SiteTopic, SiteVideo } from "./archive-data.js";
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

const generatedArchiveRoot = join(process.cwd(), "site", "src", "data", "generated", "archive");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function assertUsefulMetadata(metadata: { title: string; description: string }): void {
  assert.ok(metadata.title.trim().length > 0);
  assert.ok(metadata.description.trim().length > 0);
  assert.ok(metadata.title.length <= MAX_METADATA_TITLE_LENGTH);
  assert.ok(metadata.description.length <= MAX_METADATA_DESCRIPTION_LENGTH);
  assert.doesNotMatch(metadata.title, /\s{2,}/u);
  assert.doesNotMatch(metadata.description, /\s{2,}/u);
}

test("builds unique, nonempty metadata for every current public detail page", () => {
  const videos = readJson<SiteVideo[]>(join(generatedArchiveRoot, "videos.json"));
  const topics = readJson<SiteTopic[]>(join(generatedArchiveRoot, "topics.json")).filter(isPublicTopic);
  const segments = readdirSync(join(generatedArchiveRoot, "segments"))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .flatMap((name) => readJson<SiteSegment[]>(join(generatedArchiveRoot, "segments", name)));
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

test("topic metadata refuses to invent copy for a pending summary", () => {
  assert.throws(
    () => buildTopicPageMetadata({ title: "Pending Topic", summary: " ", videoCount: 1, segmentCount: 1 }),
    /has no public summary/u,
  );
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
