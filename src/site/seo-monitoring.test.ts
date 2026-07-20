import assert from "node:assert/strict";
import test from "node:test";

import { buildRepresentativeLighthouseTargets } from "./seo-monitoring.js";

test("derives representative Lighthouse routes from generated episode data", () => {
  const targets = buildRepresentativeLighthouseTargets([
    { slug: "empty", segmentSlugs: [], topics: [] },
    { slug: "example-video", segmentSlugs: ["example-note"], topics: [{ slug: "destroyers" }] },
  ]);
  assert.deepEqual(targets, [
    { name: "home", route: "" },
    { name: "video", route: "videos/example-video/" },
    { name: "time-note", route: "segments/example-note/" },
    { name: "topic", route: "topics/destroyers/" },
    { name: "largest-directory", route: "topics/" },
  ]);
});
