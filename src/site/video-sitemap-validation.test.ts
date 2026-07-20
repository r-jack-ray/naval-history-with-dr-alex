import assert from "node:assert/strict";
import test from "node:test";

import { buildVideoSeoMetadata, buildVideoSitemapXml } from "./video-seo.js";
import { parseVideoSitemapXmlString } from "./video-sitemap-validation.js";

test("parses generated video sitemap records with their extension namespace", () => {
  const metadata = buildVideoSeoMetadata({
    pageUrl: "https://example.test/videos/example/",
    name: "Example video",
    description: "Example description.",
    thumbnailUrl: "https://example.test/thumb.jpg",
    publishedAt: "2026-07-20T12:34:56Z",
    durationIso: "PT2M3S",
    embedUrl: "https://www.youtube-nocookie.com/embed/example",
  });
  const snapshot = parseVideoSitemapXmlString(buildVideoSitemapXml([metadata]));

  assert.deepEqual(snapshot.entries, [{
    pageUrl: metadata.pageUrl,
    thumbnailUrl: metadata.thumbnailUrl,
    title: metadata.name,
    description: metadata.description,
    playerUrl: metadata.embedUrl,
    durationSeconds: 123,
    publicationDate: metadata.publishedAt,
  }]);
  assert.throws(() => parseVideoSitemapXmlString("<urlset><url /></urlset>"));
});
