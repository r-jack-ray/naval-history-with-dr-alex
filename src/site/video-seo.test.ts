import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVideoObjectJsonLd,
  buildVideoSeoMetadata,
  buildVideoSitemapXml,
  parseVideoDurationSeconds,
} from "./video-seo.js";

const sampleInput = {
  pageUrl: "https://r-jack-ray.github.io/naval-history-with-dr-alex/videos/example/",
  name: "Example & Video (Jul 20, 2026; 3 time notes)",
  description: "Study an example <video> with three time notes.",
  thumbnailUrl: "https://i.ytimg.com/vi/example/maxresdefault.jpg",
  publishedAt: "2026-07-20T12:34:56Z",
  durationIso: "PT1H2M3S",
  embedUrl: "https://www.youtube-nocookie.com/embed/example",
};

test("validates one shared video SEO record and builds VideoObject data", () => {
  const metadata = buildVideoSeoMetadata(sampleInput);

  assert.equal(metadata.durationSeconds, 3_723);
  assert.deepEqual(buildVideoObjectJsonLd(metadata), {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "@id": `${sampleInput.pageUrl}#video`,
    url: sampleInput.pageUrl,
    name: sampleInput.name,
    description: sampleInput.description,
    thumbnailUrl: sampleInput.thumbnailUrl,
    uploadDate: sampleInput.publishedAt,
    duration: sampleInput.durationIso,
    embedUrl: sampleInput.embedUrl,
  });
  assert.equal(parseVideoDurationSeconds("PT11H55M"), 42_900);
  assert.equal(parseVideoDurationSeconds("P0D"), undefined);
  assert.throws(
    () => buildVideoSeoMetadata({ ...sampleInput, publishedAt: "July 20, 2026" }),
    /canonical UTC timestamp/u,
  );
});

test("escapes video sitemap values and omits protocol-invalid durations over eight hours", () => {
  const ordinary = buildVideoSeoMetadata(sampleInput);
  const long = buildVideoSeoMetadata({
    ...sampleInput,
    pageUrl: "https://r-jack-ray.github.io/naval-history-with-dr-alex/videos/long/",
    name: "Long video",
    durationIso: "PT11H55M",
  });
  const xml = buildVideoSitemapXml([ordinary, long]);

  assert.match(xml, /xmlns:video="http:\/\/www\.google\.com\/schemas\/sitemap-video\/1\.1"/u);
  assert.match(xml, /Example &amp; Video/u);
  assert.match(xml, /example &lt;video&gt;/u);
  assert.equal((xml.match(/<video:duration>/gu) ?? []).length, 1);
  assert.match(xml, /<video:duration>3723<\/video:duration>/u);
  assert.doesNotMatch(xml, /42900/u);
});
