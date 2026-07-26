import assert from "node:assert/strict";
import test from "node:test";

import type { CuratedArchiveSeed } from "./curated-archive-model.js";
import type { TopicNormalizationRule } from "../site/topic-normalization.js";
import {
  renderVideoTopicUsageReport,
  videoTopicUsageReportHeaders,
} from "./video-topic-usage-report.js";

test("topic usage TSV uses spaced headers and counts unique videos across both topic levels", () => {
  const seed: CuratedArchiveSeed = {
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
  assert.deepEqual(videoTopicUsageReportHeaders, [
    "topic slug",
    "display name",
    "usage count",
    "general subject",
    "entity type",
    "topic aliases",
    "normalization inputs",
    "similar topics",
    "frequent co topics",
    "potential duplicate review",
  ]);
  assert.ok(videoTopicUsageReportHeaders.every((header) => !header.includes("_")));
  assert.equal(report.rows.length, 3);
  assert.equal(report.rows[0]?.topic_slug, "destroyers");
  assert.equal(report.rows[0]?.usage_count, 2);
  assert.equal(report.rows[0]?.topic_aliases, "tin cans");
  assert.equal(report.rows[0]?.normalization_inputs, "exact:destroyer");
  assert.match(String(report.rows[0]?.frequent_co_topics), /surface-combatants\|Surface Combatants \[1\]/u);
  assert.equal(report.rows[2]?.topic_slug, "unused-topic");
  assert.equal(report.rows[2]?.usage_count, 0);
  assert.match(report.tsv, /^topic slug\tdisplay name\tusage count\t/u);
  assert.deepEqual(new Set(report.tsv.trimEnd().split("\n").map((line) => line.split("\t").length)), new Set([10]));
});

function segment(
  id: string,
  videoId: string,
  kind: "chapter" | "qa",
  topics: string[],
): CuratedArchiveSeed["segments"][number] {
  const base = {
    id,
    videoId,
    slug: id,
    title: id,
    start: "0:00",
    topics,
    summary: "Summary.",
    body: "Body.",
    sourcePath: `src/transcripts/txt/${videoId}.txt`,
    evidence: [{ start: "0:00", note: "Fixture evidence." }],
  };
  return kind === "qa"
    ? { ...base, kind, question: "Fixture question?", answerShort: "Fixture answer." }
    : { ...base, kind };
}
