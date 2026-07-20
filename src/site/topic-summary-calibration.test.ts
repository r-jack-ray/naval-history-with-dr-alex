import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { topicSummaryQualityFindings } from "./topic-summary-quality.js";

test("keeps independently reviewed topic-summary calibration examples public-ready and distinct", async () => {
  const fixture = JSON.parse(await readFile(
    new URL("../../src/site/topic-summary-calibration.json", import.meta.url),
    "utf8",
  )) as {
    schemaVersion: number;
    examples: Array<{ slug: string; family: string; summary: string }>;
  };
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.examples.length, 4);
  assert.equal(new Set(fixture.examples.map((example) => example.slug)).size, fixture.examples.length);
  assert.equal(new Set(fixture.examples.map((example) => example.summary)).size, fixture.examples.length);
  for (const example of fixture.examples) {
    assert.deepEqual(topicSummaryQualityFindings(example.summary), [], example.slug);
  }
});
