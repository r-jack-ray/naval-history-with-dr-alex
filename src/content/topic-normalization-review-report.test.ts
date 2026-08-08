import assert from "node:assert/strict";
import test from "node:test";

import type { TopicNormalizationReviewFinding, } from "../site/topic-normalization-audit.js";
import { renderTopicNormalizationReviewReport, topicNormalizationReviewReportHeaders, } from "./topic-normalization-review-report.js";

test("renders actionable rule and collision findings with human-readable TSV headers", () => {
  const findings: TopicNormalizationReviewFinding[] = [
    {
      kind: "rule",
      ruleId: "review-contextual-example",
      slug: "example-topic",
      replacement: "typed-example-topic",
      canonicalTitle: "Typed Example Topic",
      notes: "Current context must be checked before selecting the typed topic.",
      sources: [
        "Topic registry record example-topic",
        "fixture.json segment example-segment",
      ],
      action: "Inspect every source before activating the candidate mapping.",
    },
    {
      kind: "collision",
      collisionKey: "operation example",
      owners: [
        {
          slug: "operation-example",
          values: ["Operation Example"],
          sources: ["fixture-a.json segment one"],
        },
        {
          slug: "example-raid",
          values: ["Operation Example"],
          sources: ["fixture-b.json segment two"],
        },
      ],
      action: "Choose one canonical topic or remove the conflicting alias.",
    },
  ];

  const report = renderTopicNormalizationReviewReport(findings);

  assert.deepEqual(topicNormalizationReviewReportHeaders, [
    "finding type",
    "topic slug",
    "related topic slug",
    "rule id",
    "candidate replacement",
    "collision value",
    "source count",
    "sources",
    "details",
    "recommended action",
  ]);
  assert.ok(topicNormalizationReviewReportHeaders.every((header) => !header.includes("_")));
  assert.equal(report.stats.findingCount, 2);
  assert.equal(report.stats.ruleFindingCount, 1);
  assert.equal(report.stats.collisionFindingCount, 1);
  assert.equal(report.stats.topicCount, 3);
  assert.equal(report.rows[0]?.candidate_replacement, "typed-example-topic");
  assert.match(String(report.rows[0]?.sources), /fixture\.json segment example-segment/u);
  assert.equal(report.rows[1]?.topic_slug, "operation-example");
  assert.equal(report.rows[1]?.related_topic_slug, "example-raid");
  assert.match(String(report.rows[1]?.collision_value), /operation example/u);
  assert.deepEqual(
      new Set(report.tsv.trimEnd().split("\n").map((line) => line.split("\t").length)),
      new Set([10]),
  );
});
