import assert from "node:assert/strict";
import test from "node:test";

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

function assertUsefulMetadata(metadata: { title: string; description: string }): void {
  assert.ok(metadata.title.trim().length > 0);
  assert.ok(metadata.description.trim().length > 0);
  assert.ok(metadata.title.length <= MAX_METADATA_TITLE_LENGTH);
  assert.ok(metadata.description.length <= MAX_METADATA_DESCRIPTION_LENGTH);
  assert.doesNotMatch(metadata.title, /\s{2,}/u);
  assert.doesNotMatch(metadata.description, /\s{2,}/u);
}

test("builds unique, nonempty metadata for fixture detail pages", () => {
  const videos: Array<Parameters<typeof buildVideoPageMetadata>[0]> = [
    {
      title: "Fixture destroyer design",
      videoDateLabel: "1 January 2026",
      videoKind: "upload",
      topics: [{slug: "fixture-destroyers", title: "Fixture Destroyers"}],
      segmentSlugs: ["fixture-armour-trade-off"],
    },
    {
      title: "Fixture fleet logistics",
      videoDateLabel: "2 January 2026",
      videoKind: "stream",
      topics: [{slug: "fixture-logistics", title: "Fixture Logistics"}],
      segmentSlugs: ["fixture-fuel-endurance", "fixture-replenishment"],
    },
  ];
  const segments: Array<Parameters<typeof buildSegmentPageMetadata>[0]> = [
    {
      title: "Fixture armour trade-off",
      videoTitle: "Fixture destroyer design",
      start: "1:00",
      summary: "A fixture explanation of an armour trade-off.",
      body: "Fixture body text for armour.",
    },
    {
      title: "Fixture fuel endurance",
      videoTitle: "Fixture fleet logistics",
      start: "2:00",
      summary: "A fixture explanation of fuel endurance.",
      body: "Fixture body text for logistics.",
    },
  ];
  const topics: Array<Parameters<typeof buildTopicPageMetadata>[0]> = [
    {title: "Fixture Destroyers", videoCount: 1, segmentCount: 1},
    {title: "Fixture Logistics", videoCount: 1, segmentCount: 2},
  ];
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
