import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applyTopicSummaryLedger,
  auditTopicSummaries,
  buildTopicSummaryIndex,
  createTopicSummaryBatch,
  parseTopicSummaryLedger,
  type TopicSummaryBatchSpec,
  type TopicSummaryIndexOptions,
} from "./topic-summary-review.js";
import { topicNormalizationPatternHeader } from "./topic-normalization.js";

test("indexes every video and segment key deterministically with metadata fallback", async () => {
  const fixture = await makeFixture();
  try {
    const first = await buildTopicSummaryIndex(fixture.options);
    const second = await buildTopicSummaryIndex(fixture.options);
    assert.equal(first.indexVersion, second.indexVersion);
    assert.deepEqual(first.counts, {
      registryTopics: 3,
      usedTopics: 2,
      orphanTopics: 1,
      videoKeys: 1,
      segmentKeys: 3,
      duplicateSourceArraySlugs: 0,
    });
    const alpha = first.topics.find((topic) => topic.slug === "alpha-topic");
    assert.ok(alpha);
    assert.deepEqual(alpha.occurrenceIds, [
      "segment:abc123:segment-one:alpha-topic",
      "video:abc123:alpha-topic",
    ]);
    assert.equal(first.videos[0]?.canonicalTitle, "Episode fallback title");
    assert.equal(first.videos[0]?.similarityDescription, "00:00 Opening section");
    assert.equal(alpha.similarity.normalizationRuleIds.includes("display-alpha"), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects repeated topic slugs inside one source array", async () => {
  const fixture = await makeFixture();
  try {
    const shardPath = join(fixture.options.segmentsInput, "fixture_abc123.json");
    const shard = JSON.parse(await readFile(shardPath, "utf8")) as { topics: string[] };
    shard.topics.push("alpha-topic");
    await writeFile(shardPath, JSON.stringify(shard), "utf8");
    await assert.rejects(buildTopicSummaryIndex(fixture.options), /repeats topic slug alpha-topic/u);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("creates restartable packets and applies only exact verified summaries", async () => {
  const fixture = await makeFixture();
  try {
    const index = await buildTopicSummaryIndex(fixture.options);
    const evidencePacketPath = join(fixture.root, "review", "alpha.evidence.json");
    const outputLedgerPath = join(fixture.root, "review", "alpha.ledger.jsonl");
    const spec: TopicSummaryBatchSpec = {
      schemaVersion: 1,
      batchId: "alpha-batch",
      indexVersion: index.indexVersion,
      primaryGroup: "broad-generic-groups",
      subgroup: "fixture",
      slugs: ["alpha-topic"],
      evidencePacketPath,
      outputLedgerPath,
    };
    await createTopicSummaryBatch(index, spec);
    const records = parseTopicSummaryLedger(await readFile(outputLedgerPath, "utf8"));
    const record = records[0];
    assert.ok(record);
    record.proposedSummary = "A test subject used to prove exact, evidence-checked topic summary replacement.";
    record.reviewedVideoKeyCount = record.videoKeyCount;
    record.reviewedSegmentKeyCount = record.segmentKeyCount;
    record.reviewStatus = "verified";
    await writeFile(outputLedgerPath, `${JSON.stringify(record)}\n`, "utf8");

    const dryRun = await applyTopicSummaryLedger({
      index,
      ledgerPath: outputLedgerPath,
      topicStorePath: join(fixture.options.segmentsInput, "topics.json"),
      selectedSlugs: ["alpha-topic"],
      dryRun: true,
    });
    assert.equal(dryRun.length, 1);
    const before = await readFile(join(fixture.options.segmentsInput, "topics.json"), "utf8");
    await applyTopicSummaryLedger({
      index,
      ledgerPath: outputLedgerPath,
      topicStorePath: join(fixture.options.segmentsInput, "topics.json"),
      selectedSlugs: ["alpha-topic"],
      dryRun: false,
    });
    const after = JSON.parse(await readFile(join(fixture.options.segmentsInput, "topics.json"), "utf8")) as {
      topics: Array<{ slug: string; summary: string }>;
    };
    assert.notEqual(before, JSON.stringify(after));
    assert.equal(after.topics.find((topic) => topic.slug === "alpha-topic")?.summary, record.proposedSummary);
    assert.equal(after.topics.find((topic) => topic.slug === "beta-topic")?.summary, "Beta is a distinct fixture subject with a concise definition.");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("audits pending, legacy, hollow, long, and duplicate summaries", async () => {
  const fixture = await makeFixture();
  try {
    const topicPath = join(fixture.options.segmentsInput, "topics.json");
    const store = JSON.parse(await readFile(topicPath, "utf8")) as { topics: Array<{ slug: string; summary: string }> };
    store.topics[0]!.summary = "Watch points covering Alpha across Dr. Alex Clarke's videos.";
    store.topics[1]!.summary = "Watch points covering Alpha across Dr. Alex Clarke's videos.";
    await writeFile(topicPath, JSON.stringify(store), "utf8");
    const index = await buildTopicSummaryIndex(fixture.options);
    const audit = auditTopicSummaries(index);
    assert.deepEqual(audit.legacyDefaultSlugs, ["alpha-topic", "beta-topic"]);
    assert.deepEqual(audit.duplicateSummaryGroups, [["alpha-topic", "beta-topic"]]);
    assert.equal(audit.pendingReviewSlugs.length, 3);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

interface Fixture {
  root: string;
  options: TopicSummaryIndexOptions;
}

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "topic-summary-review-"));
  const segmentsInput = join(root, "segments");
  await mkdir(segmentsInput);
  const patternsInput = join(root, "patterns.tsv");
  const episodesInput = join(root, "episodes.json");
  const metadataInput = join(root, "metadata.json");
  const transcriptsInput = join(root, "manifest.json");
  await writeFile(patternsInput, `${topicNormalizationPatternHeader.join("\t")}\n${[
    "display-alpha", "active", "display", "exact", "alpha-topic", "alpha-topic", "Alpha Topic", "[]", "Fixture display rule",
  ].join("\t")}\n`, "utf8");
  await writeFile(episodesInput, JSON.stringify({ episodes: [{ videoId: "abc123", title: "Episode fallback title" }] }), "utf8");
  await writeFile(metadataInput, JSON.stringify({ videos: [{
    videoId: "abc123",
    snippet: {
      description: "Support This Channel\nPatreon: https://example.test\n00:00 Opening section",
    },
  }] }), "utf8");
  await writeFile(transcriptsInput, JSON.stringify({ transcripts: [{ videoId: "abc123", paths: { txt: "txt/fixture.txt" } }] }), "utf8");
  await writeFile(join(segmentsInput, "topics.json"), `${JSON.stringify({
    schemaVersion: 1,
    topics: [
      { slug: "alpha-topic", title: "Alpha Topic", summary: "Alpha is a broad fixture subject used for deterministic indexing." },
      { slug: "beta-topic", title: "Beta Topic", summary: "Beta is a distinct fixture subject with a concise definition." },
      { slug: "orphan-topic", title: "Orphan Topic", summary: "An unkeyed fixture record retained for disposition testing." },
    ],
  }, null, 2)}\n`, "utf8");
  await writeFile(join(segmentsInput, "fixture_abc123.json"), JSON.stringify({
    schemaVersion: 1,
    videoId: "abc123",
    topics: ["alpha-topic"],
    segments: [
      {
        id: "segment-one",
        slug: "segment-one",
        videoId: "abc123",
        title: "Alpha in context",
        kind: "chapter",
        start: "0:00",
        topics: ["alpha-topic", "beta-topic"],
        summary: "The first fixture context.",
        body: "A complete body explaining the alpha and beta relationship.",
        sourcePath: "src/transcripts/txt/fixture.txt",
        evidence: [{ start: "0:00", note: "Fixture evidence." }],
      },
      {
        id: "segment-two",
        slug: "segment-two",
        videoId: "abc123",
        title: "Beta alone",
        kind: "notable_point",
        start: "1:00",
        topics: ["beta-topic"],
        summary: "The second fixture context.",
        body: "A complete body explaining beta independently.",
      },
    ],
  }), "utf8");
  return {
    root,
    options: { segmentsInput, patternsInput, episodesInput, metadataInput, transcriptsInput },
  };
}
