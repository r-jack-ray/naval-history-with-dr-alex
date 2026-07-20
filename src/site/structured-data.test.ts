import assert from "node:assert/strict";
import test from "node:test";

import { canonicalUrlForPath, siteUrlForRoute } from "./site-urls.js";
import { buildBreadcrumbListJsonLd, serializeJsonLd } from "./structured-data.js";

test("builds production base-aware trailing-slash URLs", () => {
  const site = "https://r-jack-ray.github.io";
  const base = "/naval-history-with-dr-alex";
  assert.equal(
    siteUrlForRoute(site, base, "videos/example").href,
    "https://r-jack-ray.github.io/naval-history-with-dr-alex/videos/example/",
  );
  assert.equal(
    canonicalUrlForPath(site, "/naval-history-with-dr-alex/topics/example?ignored=yes#ignored").href,
    "https://r-jack-ray.github.io/naval-history-with-dr-alex/topics/example/",
  );
});

test("builds contiguous breadcrumb data and safely serializes script text", () => {
  const breadcrumb = buildBreadcrumbListJsonLd([
    { name: "Video Guides", url: "https://example.com/videos/" },
    { name: "Cruisers </script>", url: "https://example.com/videos/cruisers/" },
  ]);
  assert.deepEqual(breadcrumb.itemListElement.map((item) => item.position), [1, 2]);
  assert.equal(breadcrumb.itemListElement[1]?.item, "https://example.com/videos/cruisers/");

  const serialized = serializeJsonLd(breadcrumb);
  assert.doesNotMatch(serialized, /<\/script>/u);
  assert.deepEqual(JSON.parse(serialized), breadcrumb);
});
