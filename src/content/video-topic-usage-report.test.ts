import assert from "node:assert/strict";
import test from "node:test";

import type { CuratedArchiveSeed } from "../site/curated-seed.js";
import type { TopicNormalizationRule } from "../site/topic-normalization.js";
import {
  renderVideoTopicUsageReport,
  videoTopicUsageReportHeaders,
} from "./video-topic-usage-report.js";

test("topic usage TSV uses spaced headers and counts unique videos across both topic levels", () => {
  const seed: CuratedArchiveSeed = {
    schemaVersion: 1,
    topics: [
      { slug: "destroyers", title: "Destroyers", aliases: ["tin cans"] },
      { slug: "surface-combatants", title: "Surface Combatants" },
      { slug: "unused-topic", title: "Unused Topic" },
    ],
    videos: [
      { videoId: "video1", topics: ["destroyers"] },
      { videoId: "video2", topics: ["surface-combatants"] },
    ],
    segments: [
      segment("one", "video1", "qa", ["destroyers", "surface-combatants"]),
      segment("two", "video2", "chapter", ["destroyers"]),
    ],
  };
  const rules: TopicNormalizationRule[] = [{
    ruleId: "normalize-destroyer",
    status: "active",
    scopes: ["creation"],
    matchKind: "exact",
    match: "destroyer",
    replacement: "destroyers",
    canonicalTitle: "Destroyers",
    aliases: [],
    notes: "test fixture",
    lineNumber: 2,
  }];

  const report = renderVideoTopicUsageReport(seed, rules);
  assert.equal(videoTopicUsageReportHeaders.length, 31);
  assert.deepEqual(videoTopicUsageReportHeaders.slice(0, 3), ["topic slug", "piped name", "display name"]);
  assert.ok(videoTopicUsageReportHeaders.every((header) => !header.includes("_")));
  assert.equal(report.rows.length, 3);
  assert.equal(report.rows[0]?.topic_slug, "destroyers");
  assert.equal(report.rows[0]?.usage_count, 2);
  assert.equal(report.rows[0]?.top_level_video_count, 1);
  assert.equal(report.rows[0]?.segment_video_count, 2);
  assert.equal(report.rows[0]?.piped_name, "destroyers|Destroyers");
  assert.equal(report.rows[0]?.topic_aliases, "tin cans");
  assert.equal(report.rows[0]?.normalization_inputs, "exact:destroyer");
  assert.match(String(report.rows[0]?.frequent_co_topics), /surface-combatants\|Surface Combatants \[1\]/u);
  assert.equal(report.rows[2]?.topic_slug, "unused-topic");
  assert.equal(report.rows[2]?.usage_count, 0);
  assert.match(report.tsv, /^topic slug\tpiped name\tdisplay name\tusage count\t/u);
  assert.deepEqual(new Set(report.tsv.trimEnd().split("\n").map((line) => line.split("\t").length)), new Set([31]));
});

function segment(
  id: string,
  videoId: string,
  kind: "chapter" | "qa",
  topics: string[],
): CuratedArchiveSeed["segments"][number] {
  return {
    id,
    videoId,
    slug: id,
    title: id,
    kind,
    start: "0:00",
    topics,
    summary: "Summary.",
    body: "Body.",
  };
}
