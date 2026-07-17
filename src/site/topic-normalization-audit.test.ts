import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { auditTopicNormalization } from "./topic-normalization-audit.js";
import { topicNormalizationPatternHeader } from "./topic-normalization.js";

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
    assert.deepEqual(result.reviews, [
      "Review rule review-155mm-guns remains unresolved for 155mm-guns: Named-system context still requires review.",
    ]);
    assert.equal(await readFile(fixture.patternsInput, "utf8"), beforePatterns);
    assert.equal(await readFile(join(fixture.segmentsInput, "topics.json"), "utf8"), beforeRegistry);
    assert.equal(await readFile(fixture.shardPath, "utf8"), beforeShard);
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
    schemaVersion: 1,
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
    schemaVersion: 1,
    videoId: "abc123",
    topics,
    segments: [{ id: "one", topics }],
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
