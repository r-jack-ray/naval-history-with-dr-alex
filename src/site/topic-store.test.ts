import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  collectUsedTopicSlugs,
  synchronizeCuratedTopicStore,
  topicTitleFromSlug,
} from "./topic-store.js";

test("collects unique topics from video and segment topic arrays", async () => {
  const directory = await makeTopicDirectory();
  try {
    assert.deepEqual(await collectUsedTopicSlugs(directory), [
      "airborne-early-warning",
      "destroyers",
      "royal-navy",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("creates a topic store from video shards when one does not exist", async () => {
  const directory = await makeTopicDirectory();
  try {
    const result = await synchronizeCuratedTopicStore(directory);
    const store = JSON.parse(await readFile(join(directory, "topics.json"), "utf8")) as {
      topics: Array<{ slug: string; title: string; summary: string }>;
    };

    assert.equal(result.changed, true);
    assert.deepEqual(result.addedSlugs, ["airborne-early-warning", "destroyers", "royal-navy"]);
    assert.deepEqual(store.topics.map((topic) => topic.slug), result.addedSlugs);
    assert.equal(store.topics[0]?.title, "Airborne Early Warning");
    assert.match(store.topics[0]?.summary ?? "", /Watch points covering Airborne Early Warning/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("preserves curated and unused topic records while appending missing usage", async () => {
  const directory = await makeTopicDirectory();
  try {
    await writeFile(join(directory, "topics.json"), `${JSON.stringify({
      schemaVersion: 1,
      topics: [
        {
          slug: "destroyers",
          title: "Destroyers",
          summary: "A curated summary.",
          aliases: ["tin cans"],
        },
        {
          slug: "unused-topic",
          title: "Unused Topic",
          summary: "Kept for future content.",
        },
      ],
    }, null, 2)}\n`, "utf8");

    const result = await synchronizeCuratedTopicStore(directory);
    const store = JSON.parse(await readFile(join(directory, "topics.json"), "utf8")) as {
      topics: Array<{ slug: string; summary: string; aliases?: string[] }>;
    };

    assert.deepEqual(result.addedSlugs, ["airborne-early-warning", "royal-navy"]);
    assert.equal(store.topics[0]?.summary, "A curated summary.");
    assert.deepEqual(store.topics[0]?.aliases, ["tin cans"]);
    assert.equal(store.topics[1]?.slug, "unused-topic");
    assert.deepEqual(store.topics.slice(2).map((topic) => topic.slug), result.addedSlugs);

    const secondResult = await synchronizeCuratedTopicStore(directory);
    assert.equal(secondResult.changed, false);
    assert.deepEqual(secondResult.addedSlugs, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("formats common naval topic acronyms without AI processing", () => {
  assert.equal(topicTitleFromSlug("hms-warrior"), "HMS Warrior");
  assert.equal(topicTitleFromSlug("pre-world-war-i"), "Pre World War I");
  assert.equal(topicTitleFromSlug("live-q-and-a"), "Live Q&A");
});

async function makeTopicDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "naval-topic-store-"));
  await writeFile(join(directory, "video-abc123.json"), JSON.stringify({
    schemaVersion: 1,
    videoId: "abc123",
    topics: ["royal-navy", "destroyers"],
    segments: [
      {
        id: "segment-one",
        slug: "segment-one",
        videoId: "abc123",
        title: "Segment one",
        kind: "chapter",
        start: "0:00",
        topics: ["destroyers", "airborne-early-warning"],
        summary: "Summary.",
        body: "Body.",
      },
    ],
  }), "utf8");
  return directory;
}
