import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { defaultTopicSummary, topicNormalizationPatternHeader } from "../site/topic-normalization.js";
import { runNormalizeVideoTopics, type TopicNormalizationCliRuntime } from "./normalize-video-topics.js";

test("dry-run is byte-preserving, writes only a requested plan, and check reports pending work", async () => {
  const fixture = await createFixture("dry-run");
  try {
    const patternsBefore = await readFile(fixture.patterns, "utf8");
    const registryBefore = await readFile(fixture.registry, "utf8");
    const shardBefore = await readFile(fixture.shard, "utf8");
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runtime = captureRuntime(fixture, stdout, stderr);

    assert.equal(await runNormalizeVideoTopics([
      "--dry-run",
      "--patterns-input", fixture.patterns,
      "--segments-input", fixture.segments,
      "--plan-output", fixture.plan,
    ], runtime), 0);

    const plan = JSON.parse(await readFile(fixture.plan, "utf8")) as {
      digest: string;
      operations: unknown[];
      blockers: unknown[];
    };
    assert.match(plan.digest, /^[a-f0-9]{64}$/u);
    assert.equal(plan.operations.length, 2);
    assert.deepEqual(plan.blockers, []);
    assert.match(stdout.join(""), new RegExp(plan.digest, "u"));
    assert.match(stderr.join(""), /2 operation\(s\)/u);
    assert.equal(await readFile(fixture.patterns, "utf8"), patternsBefore);
    assert.equal(await readFile(fixture.registry, "utf8"), registryBefore);
    assert.equal(await readFile(fixture.shard, "utf8"), shardBefore);

    stdout.length = 0;
    stderr.length = 0;
    assert.equal(await runNormalizeVideoTopics([
      "--check",
      "--patterns-input", fixture.patterns,
      "--segments-input", fixture.segments,
    ], runtime), 1);
    assert.equal(stdout.join(""), "");
    assert.equal(await pathExists(fixture.transactions), false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("apply rejects a missing lease and a stale reviewed preimage before staging", async () => {
  const fixture = await createFixture("guards");
  try {
    await createReviewedPlan(fixture);
    await assert.rejects(
      runNormalizeVideoTopics([
        "--apply", "--plan", fixture.plan,
        "--patterns-input", fixture.patterns,
        "--segments-input", fixture.segments,
      ], captureRuntime(fixture, [], [])),
      /requires CONTENT_PIPELINE_LOCK_TOKEN/u,
    );

    await createLease(fixture.lock, fixture.token);
    const originalRegistry = await readFile(fixture.registry, "utf8");
    const changedShard = `${(await readFile(fixture.shard, "utf8")).trimEnd()}\n `;
    await writeFile(fixture.shard, changedShard, "utf8");
    await assert.rejects(
      runNormalizeVideoTopics([
        "--apply", "--plan", fixture.plan,
        "--patterns-input", fixture.patterns,
        "--segments-input", fixture.segments,
      ], { ...captureRuntime(fixture, [], []), lockToken: fixture.token }),
      /Reviewed topic-normalization plan is stale/u,
    );
    assert.equal(await readFile(fixture.registry, "utf8"), originalRegistry);
    assert.equal(await readFile(fixture.shard, "utf8"), changedShard);
    assert.equal(await pathExists(fixture.transactions), false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

for (const failureStep of ["expanded-registry", "shards", "final-registry"] as const) {
  test(`journal resumes safely after the ${failureStep} commit stage and completed replay is a no-op`, async () => {
    const fixture = await createFixture(failureStep);
    try {
      const plan = await createReviewedPlan(fixture);
      await createLease(fixture.lock, fixture.token);
      const args = [
        "--apply", "--plan", fixture.plan,
        "--patterns-input", fixture.patterns,
        "--segments-input", fixture.segments,
      ];
      await assert.rejects(
        runNormalizeVideoTopics(args, {
          ...captureRuntime(fixture, [], []),
          lockToken: fixture.token,
          failAfterStep: failureStep,
        }),
        new RegExp(`Injected topic-normalization failure after ${failureStep}`, "u"),
      );

      const interruptedRegistry = await readTopicSlugs(fixture.registry);
      const interruptedShard = await readShardTopics(fixture.shard);
      if (failureStep === "expanded-registry") {
        assert.deepEqual(interruptedRegistry, ["old-topic", "new-topic"]);
        assert.deepEqual(interruptedShard, {
          video: ["old-topic"],
          segment: ["old-topic", "new-topic"],
        });
      } else if (failureStep === "shards") {
        assert.deepEqual(interruptedRegistry, ["old-topic", "new-topic"]);
        assert.deepEqual(interruptedShard, { video: ["new-topic"], segment: ["new-topic"] });
      } else {
        assert.deepEqual(interruptedRegistry, ["new-topic"]);
        assert.deepEqual(interruptedShard, { video: ["new-topic"], segment: ["new-topic"] });
      }

      assert.equal(await runNormalizeVideoTopics(args, {
        ...captureRuntime(fixture, [], []),
        lockToken: fixture.token,
      }), 0);
      const finalRegistryText = await readFile(fixture.registry, "utf8");
      const finalShardText = await readFile(fixture.shard, "utf8");
      const store = JSON.parse(finalRegistryText) as {
        topics: Array<{ slug: string; title: string; summary: string; aliases?: string[] }>;
      };
      assert.deepEqual(store.topics, [{
        slug: "new-topic",
        title: "New Topic",
        summary: defaultTopicSummary("New Topic"),
        aliases: ["Old Topic"],
      }]);
      assert.deepEqual(await readShardTopics(fixture.shard), {
        video: ["new-topic"],
        segment: ["new-topic"],
      });
      const journal = JSON.parse(await readFile(
        join(fixture.transactions, plan.digest, "journal.json"),
        "utf8",
      )) as { status: string; pending?: unknown };
      assert.equal(journal.status, "completed");
      assert.equal(journal.pending, undefined);

      assert.equal(await runNormalizeVideoTopics(args, {
        ...captureRuntime(fixture, [], []),
        lockToken: fixture.token,
      }), 0);
      assert.equal(await readFile(fixture.registry, "utf8"), finalRegistryText);
      assert.equal(await readFile(fixture.shard, "utf8"), finalShardText);
      assert.equal(await runNormalizeVideoTopics([
        "--check",
        "--patterns-input", fixture.patterns,
        "--segments-input", fixture.segments,
      ], captureRuntime(fixture, [], [])), 0);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
}

interface Fixture {
  root: string;
  patterns: string;
  segments: string;
  registry: string;
  shard: string;
  plan: string;
  lock: string;
  transactions: string;
  token: string;
}

async function createFixture(label: string): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), `topic-normalization-cli-${label}-`));
  const segments = join(root, "segments");
  const patterns = join(root, "patterns.tsv");
  const registry = join(segments, "topics.json");
  const shard = join(segments, "fixture.json");
  const plan = join(root, "reviewed-plan.json");
  const lock = join(root, "writer.lock");
  const transactions = join(root, "transactions");
  await mkdir(segments, { recursive: true });
  await writeFile(patterns, [
    topicNormalizationPatternHeader.join("\t"),
    [
      "migrate-old-topic",
      "active",
      "migration",
      "exact",
      "old-topic",
      "new-topic",
      "New Topic",
      "[\"Old Topic\"]",
      "redirect",
      "Fixture exact duplicate approved for focused transaction tests",
    ].join("\t"),
    "",
  ].join("\n"), "utf8");
  await writeFile(registry, `${JSON.stringify({
    schemaVersion: 1,
    topics: [
      { slug: "old-topic", title: "Old Topic", summary: defaultTopicSummary("Old Topic") },
      { slug: "new-topic", title: "New Topic", summary: defaultTopicSummary("New Topic") },
    ],
  }, null, 2)}\n`, "utf8");
  await writeFile(shard, [
    "{",
    "  \"schemaVersion\": 1,",
    "  \"videoId\": \"fixture\",",
    "  \"topics\": [\"old-topic\"],",
    "  \"segments\": [",
    "    {\"id\": \"one\", \"topics\": [\"old-topic\", \"new-topic\"]}",
    "  ]",
    "}",
    "",
  ].join("\n"), "utf8");
  return {
    root,
    patterns,
    segments,
    registry,
    shard,
    plan,
    lock,
    transactions,
    token: `fixture-${label}-token`,
  };
}

async function createReviewedPlan(fixture: Fixture): Promise<{ digest: string }> {
  assert.equal(await runNormalizeVideoTopics([
    "--dry-run",
    "--patterns-input", fixture.patterns,
    "--segments-input", fixture.segments,
    "--plan-output", fixture.plan,
  ], captureRuntime(fixture, [], [])), 0);
  return JSON.parse(await readFile(fixture.plan, "utf8")) as { digest: string };
}

async function createLease(path: string, token: string): Promise<void> {
  const now = new Date();
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "owner.json"), `${JSON.stringify({
    schemaVersion: 1,
    token,
    owner: "focused-test",
    purpose: "topic-normalization",
    pid: process.pid,
    host: "focused-test",
    acquiredAt: now.toISOString(),
    renewedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
  }, null, 2)}\n`, "utf8");
}

function captureRuntime(
  fixture: Fixture,
  stdout: string[],
  stderr: string[],
): TopicNormalizationCliRuntime {
  return {
    lockPath: fixture.lock,
    transactionRoot: fixture.transactions,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  };
}

async function readTopicSlugs(path: string): Promise<string[]> {
  const store = JSON.parse(await readFile(path, "utf8")) as { topics: Array<{ slug: string }> };
  return store.topics.map((topic) => topic.slug);
}

async function readShardTopics(path: string): Promise<{ video: string[]; segment: string[] }> {
  const shard = JSON.parse(await readFile(path, "utf8")) as {
    topics: string[];
    segments: Array<{ topics: string[] }>;
  };
  return { video: shard.topics, segment: shard.segments[0]?.topics ?? [] };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
