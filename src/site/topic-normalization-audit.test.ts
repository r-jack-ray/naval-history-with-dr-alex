import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { auditTopicNormalization } from "./topic-normalization-audit.js";
import {
  loadTopicNormalizationCatalog,
  resolveTopicCreation,
  topicNormalizationPatternHeader,
} from "./topic-normalization.js";
import { discoverVideoSegmentShards } from "./video-segment-files.js";

test("audits canonical source data without writing and reports exact review policy", async () => {
  const fixture = await makeFixture(["57-mm-guns", "155mm-guns"]);
  try {
    const beforePatterns = await readFile(fixture.patternsInput, "utf8");
    const beforeRegistry = await readFile(join(fixture.segmentsInput, "topics.json"), "utf8");
    const beforeShard = await readFile(fixture.shardPath, "utf8");
    const result = await auditTopicNormalization(fixture);

    assert.equal(result.blockers.length, 0);
    assert.equal(result.shardCount, 1);
    assert.equal(result.topicCount, 2);
    assert.equal(result.usedTopicCount, 2);
    assert.equal(result.reviewFindings.length, 1);
    const review = result.reviewFindings[0];
    assert.equal(review?.kind, "rule");
    if (review?.kind === "rule") {
      assert.equal(review.ruleId, "review-155mm-guns");
      assert.equal(review.slug, "155mm-guns");
      assert.equal(review.replacement, "155-mm-guns");
      assert.equal(review.notes, "Named-system context still requires review");
      assert.deepEqual(new Set(review.sources), new Set([
        "Topic registry record 155mm-guns",
        "fixture-video_abc123.json video",
        "fixture-video_abc123.json segment one",
      ]));
    }
    assert.match(result.reviews[0] ?? "", /Sources \(3\):/u);
    assert.match(result.reviews[0] ?? "", /Action:/u);
    assert.equal(await readFile(fixture.patternsInput, "utf8"), beforePatterns);
    assert.equal(await readFile(join(fixture.segmentsInput, "topics.json"), "utf8"), beforeRegistry);
    assert.equal(await readFile(fixture.shardPath, "utf8"), beforeShard);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("reports exact title and alias collision owners, values, and sources", async () => {
  const fixture = await makeFixture(["57-mm-guns", "155mm-guns"]);
  try {
    const registryPath = join(fixture.segmentsInput, "topics.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as {
      topics: Array<{ slug: string; title: string; summary: string; aliases?: string[] }>;
    };
    registry.topics[1]!.aliases = ["57 mm Guns"];
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");

    const result = await auditTopicNormalization(fixture);
    const collision = result.reviewFindings.find((finding) => finding.kind === "collision");
    assert.equal(collision?.kind, "collision");
    if (collision?.kind === "collision") {
      assert.equal(collision.collisionKey, "57 mm guns");
      assert.deepEqual(collision.owners.map((owner) => owner.slug), [
        "155mm-guns",
        "57-mm-guns",
      ]);
      assert.deepEqual(collision.owners[0].values, ["57 mm Guns"]);
      assert.deepEqual(collision.owners[1].values, ["57 mm Guns"]);
      assert.ok(collision.owners.every((owner) => owner.sources.length > 0));
    }
    assert.match(
      result.reviews.find((finding) => finding.includes("Title/alias collision")) ?? "",
      /155mm-guns[\s\S]*57-mm-guns/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects active noncanonical inputs and missing policy aliases", async () => {
  const fixture = await makeFixture(["57mm-gun"]);
  try {
    const registryPath = join(fixture.segmentsInput, "topics.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as {
      topics: Array<{ slug: string; title: string; summary: string; aliases?: string[] }>;
    };
    registry.topics[0]!.aliases = [];
    registry.topics.push({
      slug: "57mm-gun",
      title: "57mm Gun",
      summary: "Noncanonical fixture topic.",
    });
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");

    const result = await auditTopicNormalization(fixture);
    assert.ok(result.blockers.some((finding) => (
      finding.includes("uses noncanonical topic 57mm-gun")
      && finding.includes("normalize-57mm-gun")
    )));
    assert.ok(result.blockers.includes("Topic 57-mm-guns does not represent policy alias \"57mm Gun\"."));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("precomputed Bun-style creation resolutions preserve audit output", async () => {
  const fixture = await makeFixture(["57-mm-guns", "155mm-guns"]);
  try {
    const [expected, catalog, shardIndex] = await Promise.all([
      auditTopicNormalization(fixture),
      loadTopicNormalizationCatalog(fixture.patternsInput),
      discoverVideoSegmentShards(fixture.segmentsInput),
    ]);
    const slugs = ["57-mm-guns", "155mm-guns"];
    const actual = await auditTopicNormalization({
      ...fixture,
      precomputedCreationResolutions: new Map(
        slugs.map((slug) => [slug, resolveTopicCreation(catalog, slug)]),
      ),
      preloadedCatalog: catalog,
      preloadedShardIndex: shardIndex,
    });

    assert.deepEqual(actual, expected);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function makeFixture(topics: string[]): Promise<{
  root: string;
  patternsInput: string;
  segmentsInput: string;
  shardPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "topic-normalization-audit-"));
  const segmentsInput = join(root, "segments");
  const patternsInput = join(root, "patterns.tsv");
  const shardPath = join(segmentsInput, "fixture-video_abc123.json");
  await mkdir(segmentsInput);
  await writeFile(patternsInput, catalogText(), "utf8");
  await writeFile(join(segmentsInput, "topics.json"), `${JSON.stringify({
    topics: [
      {
        slug: "57-mm-guns",
        title: "57 mm Guns",
        summary: "Canonical metric topic.",
        aliases: ["57mm Gun"],
      },
      {
        slug: "155mm-guns",
        title: "155mm Guns",
        summary: "Review candidate retained unchanged.",
      },
    ],
  }, null, 2)}\n`, "utf8");
  await writeFile(shardPath, `${JSON.stringify({
    videoId: "abc123",
    topics,
    segments: [{
      id: "one",
      videoId: "abc123",
      slug: "one",
      title: "Fixture segment",
      kind: "chapter",
      start: "0:00",
      topics,
      summary: "Fixture summary.",
      body: "Fixture body.",
      sourcePath: "src/transcripts/txt/fixture-video_abc123.txt",
      evidence: [{
        start: "0:00",
        note: "Fixture evidence.",
      }],
    }],
  }, null, 2)}\n`, "utf8");
  return { root, patternsInput, segmentsInput, shardPath };
}

function catalogText(): string {
  const rows = [
    [
      "normalize-57mm-gun",
      "active",
      "creation",
      "exact",
      "57mm-gun",
      "57-mm-guns",
      "57 mm Guns",
      "[\"57mm Gun\"]",
      "Established exact construction policy",
    ],
    [
      "create-metric-mm-guns",
      "active",
      "creation",
      "regex",
      "^([0-9]+)mm-guns$",
      "$1-mm-guns",
      "$1 mm Guns",
      "[]",
      "Future generic metric construction",
    ],
    [
      "review-155mm-guns",
      "review",
      "creation",
      "exact",
      "155mm-guns",
      "155-mm-guns",
      "155 mm Guns",
      "[\"155mm Guns\"]",
      "Named-system context still requires review",
    ],
  ];
  return `${[topicNormalizationPatternHeader, ...rows].map((row) => row.join("\t")).join("\n")}\n`;
}
