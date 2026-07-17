import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildTopicNormalizationPlan,
  canonicalTopicNormalizationPlanJson,
  validateReviewedTopicNormalizationPlan,
} from "./topic-normalization-plan.js";
import { topicNormalizationPatternHeader } from "./topic-normalization.js";

test("plans exact migrations without changing source files", async () => {
  const fixture = await createFixture({
    topics: [
      {
        slug: "old-guns",
        title: "Old Guns",
        summary: "A curated summary that must survive the merge.",
      },
      {
        slug: "canonical-guns",
        title: "Canonical Guns",
        summary: "Watch points covering Canonical Guns across Dr. Alex Clarke's videos.",
        aliases: ["existing alias"],
      },
      {
        slug: "review-only",
        title: "Review Only",
        summary: "A distinct subject retained pending semantic review.",
      },
    ],
    shardText: `${JSON.stringify({
      videoId: "fixture-video",
      topics: ["old-guns", "canonical-guns", "review-only"],
      segments: [{ id: "example", topics: ["old-guns"] }],
    }, null, 2)}\n`,
    rows: [
      [
        "migrate-old-guns",
        "active",
        "migration",
        "exact",
        "old-guns",
        "canonical-guns",
        "Canonical Guns",
        "[\"Old Guns\"]",
        "redirect",
        "Reviewed fixture identity",
      ].join("\t"),
      [
        "review-untouched",
        "review",
        "migration",
        "exact",
        "review-only",
        "canonical-guns",
        "Canonical Guns",
        "[]",
        "none",
        "Semantic identity is unresolved",
      ].join("\t"),
    ],
  });

  try {
    const beforeRegistry = await readFile(fixture.registryPath, "utf8");
    const beforeShard = await readFile(fixture.shardPath, "utf8");
    const built = await buildTopicNormalizationPlan({
      patternsInput: fixture.patternsPath,
      segmentsInput: fixture.segmentsPath,
    });
    const { reviewedPlan } = built;

    assert.deepEqual(reviewedPlan.blockers, []);
    assert.equal(reviewedPlan.operations.filter(({ kind }) => kind === "shard").length, 1);
    assert.equal(reviewedPlan.operations.filter(({ kind }) => kind === "registry").length, 1);
    assert.equal(reviewedPlan.redirects[0]?.legacySlug, "old-guns");
    assert.deepEqual(reviewedPlan.ruleStats.find(({ ruleId }) => ruleId === "migrate-old-guns"), {
      ruleId: "migrate-old-guns",
      sourceSlug: "old-guns",
      canonicalSlug: "canonical-guns",
      topLevelReferences: 1,
      segmentReferences: 1,
      shardCount: 1,
      sourceRegistryRecord: true,
    });
    assert.match(reviewedPlan.reviews.join("\n"), /review-untouched/u);

    const finalRegistryText = built.postimages.get(fixture.registryPath.replaceAll("\\", "/"));
    assert.ok(finalRegistryText);
    const finalRegistry = JSON.parse(finalRegistryText) as {
      topics: Array<{ slug: string; summary: string; aliases?: string[] }>;
    };
    assert.deepEqual(finalRegistry.topics.map(({ slug }) => slug), ["canonical-guns", "review-only"]);
    assert.equal(
      finalRegistry.topics[0]?.summary,
      "A curated summary that must survive the merge.",
    );
    assert.deepEqual(finalRegistry.topics[0]?.aliases, ["Old Guns", "existing alias"]);

    const expanded = JSON.parse(built.expandedRegistryText) as { topics: Array<{ slug: string }> };
    assert.deepEqual(
      expanded.topics.map(({ slug }) => slug),
      ["old-guns", "canonical-guns", "review-only"],
    );
    validateReviewedTopicNormalizationPlan(reviewedPlan);
    assert.equal(
      canonicalTopicNormalizationPlanJson(reviewedPlan),
      `${JSON.stringify(reviewedPlan, null, 2)}\n`,
    );
    assert.equal(await readFile(fixture.registryPath, "utf8"), beforeRegistry);
    assert.equal(await readFile(fixture.shardPath, "utf8"), beforeShard);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("blocks a family with conflicting curated summaries", async () => {
  const fixture = await createFixture({
    topics: [
      { slug: "old-topic", title: "Old Topic", summary: "Source-specific curated summary." },
      { slug: "new-topic", title: "New Topic", summary: "Different canonical curated summary." },
    ],
    shardText: `${JSON.stringify({
      videoId: "fixture-video",
      topics: ["old-topic"],
      segments: [],
    }, null, 2)}\n`,
    rows: [[
      "migrate-old-topic",
      "active",
      "migration",
      "exact",
      "old-topic",
      "new-topic",
      "New Topic",
      "[]",
      "redirect",
      "Reviewed fixture identity",
    ].join("\t")],
  });

  try {
    const { reviewedPlan } = await buildTopicNormalizationPlan({
      patternsInput: fixture.patternsPath,
      segmentsInput: fixture.segmentsPath,
    });
    assert.equal(reviewedPlan.blockers.length, 1);
    assert.match(reviewedPlan.blockers[0] ?? "", /conflicting curated summaries/u);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createFixture(input: {
  topics: unknown[];
  shardText: string;
  rows: string[];
}): Promise<{
  root: string;
  segmentsPath: string;
  registryPath: string;
  shardPath: string;
  patternsPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "topic-normalization-plan-"));
  const segmentsPath = join(root, "segments");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(segmentsPath);
  const registryPath = join(segmentsPath, "topics.json");
  const shardPath = join(segmentsPath, "fixture.json");
  const patternsPath = join(root, "patterns.tsv");
  await Promise.all([
    writeFile(registryPath, `${JSON.stringify({ schemaVersion: 1, topics: input.topics }, null, 2)}\n`, "utf8"),
    writeFile(shardPath, input.shardText, "utf8"),
    writeFile(patternsPath, `${topicNormalizationPatternHeader.join("\t")}\n${input.rows.join("\n")}\n`, "utf8"),
  ]);
  return { root, segmentsPath, registryPath, shardPath, patternsPath };
}
