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
      topics: Array<{ slug: string; title: string; summary: string; aliases?: string[] }>;
    };

    assert.deepEqual(result.addedSlugs, ["airborne-early-warning", "royal-navy"]);
    assert.equal(store.topics[0]?.title, "Destroyers");
    assert.equal(store.topics[0]?.summary, "A curated summary.");
    assert.deepEqual(store.topics[0]?.aliases, ["tin cans"]);
    assert.equal(store.topics[1]?.slug, "unused-topic");
    assert.deepEqual(store.topics.slice(2).map((topic) => topic.slug), result.addedSlugs);

    const beforeSecondSynchronization = await readFile(join(directory, "topics.json"), "utf8");
    const secondResult = await synchronizeCuratedTopicStore(directory);
    assert.equal(secondResult.changed, false);
    assert.deepEqual(secondResult.addedSlugs, []);
    assert.equal(
      await readFile(join(directory, "topics.json"), "utf8"),
      beforeSecondSynchronization,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("formats common naval topic acronyms without AI processing", () => {
  assert.equal(topicTitleFromSlug("hms-warrior"), "HMS Warrior");
  assert.equal(topicTitleFromSlug("pre-world-war-i"), "Pre World War I");
  assert.equal(topicTitleFromSlug("live-q-and-a"), "Live Q&A");
});

test("formats only terminal decimal-inch gun slugs with calibre punctuation", () => {
  const cases = [
    ["4-5-inch-gun", "4.5-inch Gun"],
    ["4-7-inch-guns", "4.7-inch Guns"],
    ["5-25-inch-guns", "5.25-inch Guns"],
    ["9-2-inch-guns", "9.2-inch Guns"],
    ["13-5-inch-gun", "13.5-inch Gun"],
    ["qf-4-5-inch-gun", "QF 4.5-inch Gun"],
    ["qf-4-7-inch-gun", "QF 4.7-inch Gun"],
    ["qf-5-25-inch-gun", "QF 5.25-inch Gun"],
  ] as const;

  for (const [slug, title] of cases) {
    assert.equal(topicTitleFromSlug(slug), title, slug);
  }

  assert.equal(topicTitleFromSlug("war-1828-1829"), "War 1828 1829");
  assert.equal(topicTitleFromSlug("4-5-inch-gun-mount"), "4 5 Inch Gun Mount");
  assert.equal(topicTitleFromSlug("4-to-5-inch-guns"), "4 To 5 Inch Guns");
});

test("capitalizes QF in generic non-decimal topic titles", () => {
  assert.equal(topicTitleFromSlug("qf-2-pounder"), "QF 2 Pounder");
  assert.equal(topicTitleFromSlug("qf-ammunition"), "QF Ammunition");
});

test("creates decimal topic defaults without adding them to title review", async () => {
  const directory = await makeTopicDirectory(
    ["qf-5-25-inch-gun"],
    ["qf-5-25-inch-gun"],
  );
  try {
    const result = await synchronizeCuratedTopicStore(directory);
    const store = JSON.parse(await readFile(join(directory, "topics.json"), "utf8")) as {
      topics: Array<{ slug: string; title: string; summary: string }>;
    };

    assert.deepEqual(result.addedSlugs, ["qf-5-25-inch-gun"]);
    assert.deepEqual(result.reviewTopics, []);
    assert.deepEqual(store.topics[0], {
      slug: "qf-5-25-inch-gun",
      title: "QF 5.25-inch Gun",
      summary: "Watch points covering QF 5.25-inch Gun across Dr. Alex Clarke's videos.",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("persists unresolved numeric title review until the stored title is curated", async () => {
  const directory = await makeTopicDirectory(["war-1828-1829"], ["war-1828-1829"]);
  const topicStorePath = join(directory, "topics.json");
  try {
    const firstResult = await synchronizeCuratedTopicStore(directory);
    const firstBytes = await readFile(topicStorePath, "utf8");
    const firstStore = JSON.parse(firstBytes) as {
      schemaVersion: 1;
      topics: Array<{ slug: string; title: string; summary: string }>;
    };

    assert.equal(topicTitleFromSlug("war-1828-1829"), "War 1828 1829");
    assert.equal(firstStore.topics[0]?.title, "War 1828 1829");
    assert.deepEqual(firstResult.reviewTopics, [
      { slug: "war-1828-1829", generatedTitle: "War 1828 1829" },
    ]);

    const secondResult = await synchronizeCuratedTopicStore(directory);
    assert.equal(secondResult.changed, false);
    assert.deepEqual(secondResult.reviewTopics, firstResult.reviewTopics);
    assert.equal(await readFile(topicStorePath, "utf8"), firstBytes);

    firstStore.topics[0]!.title = "Russo-Turkish War (1828–1829)";
    await writeFile(topicStorePath, `${JSON.stringify(firstStore, null, 2)}\n`, "utf8");

    const curatedResult = await synchronizeCuratedTopicStore(directory);
    assert.equal(curatedResult.changed, false);
    assert.deepEqual(curatedResult.reviewTopics, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps the bounded production topic titles, aliases, and summaries curated", async () => {
  const store = JSON.parse(
    await readFile(new URL("../../src/derived/video-segments/topics.json", import.meta.url), "utf8"),
  ) as {
    topics: Array<{ slug: string; title: string; summary: string; aliases?: string[] }>;
  };
  const topicsBySlug = new Map(store.topics.map((topic) => [topic.slug, topic]));

  assert.equal(productionTopicMapping.length, 20);
  assert.equal(new Set(productionTopicMapping.map(({ slug }) => slug)).size, 20);
  for (const expected of productionTopicMapping) {
    const topic = topicsBySlug.get(expected.slug);
    assert.ok(topic, `Missing production topic ${expected.slug}`);
    assert.equal(topic.title, expected.title, `${expected.slug} title`);
    assert.deepEqual(topic.aliases, expected.aliases, `${expected.slug} aliases`);
    assert.ok(
      topic.summary.includes(expected.title),
      `${expected.slug} summary must include ${JSON.stringify(expected.title)}`,
    );
  }
});

async function makeTopicDirectory(
  videoTopics = ["royal-navy", "destroyers"],
  segmentTopics = ["destroyers", "airborne-early-warning"],
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "naval-topic-store-"));
  await writeFile(join(directory, "2026-07-08_T00-00-00_topic-fixture_abc123.json"), JSON.stringify({
    schemaVersion: 1,
    videoId: "abc123",
    topics: videoTopics,
    segments: [
      {
        id: "segment-one",
        slug: "segment-one",
        videoId: "abc123",
        title: "Segment one",
        kind: "chapter",
        start: "0:00",
        topics: segmentTopics,
        summary: "Summary.",
        body: "Body.",
      },
    ],
  }), "utf8");
  return directory;
}

const productionTopicMapping = [
  {
    slug: "4-5-inch-gun",
    title: "4.5-inch Gun",
    aliases: ["4.5 inch gun", "4 5 inch gun"],
  },
  {
    slug: "4-7-inch-guns",
    title: "4.7-inch Guns",
    aliases: ["4.7 inch guns", "4 7 inch guns"],
  },
  {
    slug: "5-25-inch-guns",
    title: "5.25-inch Guns",
    aliases: ["5.25 inch guns", "5 25 inch guns"],
  },
  {
    slug: "9-2-inch-guns",
    title: "9.2-inch Guns",
    aliases: ["9.2 inch guns", "9 2 inch guns"],
  },
  {
    slug: "13-5-inch-gun",
    title: "13.5-inch Gun",
    aliases: ["13.5 inch gun", "13 5 inch gun"],
  },
  {
    slug: "qf-4-5-inch-gun",
    title: "QF 4.5-inch Gun",
    aliases: ["QF 4.5 inch gun", "QF 4 5 inch gun"],
  },
  {
    slug: "qf-4-7-inch-gun",
    title: "QF 4.7-inch Gun",
    aliases: ["QF 4.7 inch gun", "QF 4 7 inch gun"],
  },
  {
    slug: "qf-5-25-inch-gun",
    title: "QF 5.25-inch Gun",
    aliases: ["QF 5.25 inch gun", "QF 5 25 inch gun"],
  },
  {
    slug: "anglo-spanish-war-1654-1660",
    title: "Anglo-Spanish War (1654–1660)",
    aliases: ["Anglo-Spanish War 1654-1660", "Anglo Spanish War 1654 1660"],
  },
  {
    slug: "russo-swedish-war-1741-1743",
    title: "Russo-Swedish War (1741–1743)",
    aliases: ["Russo-Swedish War 1741-1743", "Russo Swedish War 1741 1743"],
  },
  {
    slug: "russo-swedish-war-1788-1790",
    title: "Russo-Swedish War (1788–1790)",
    aliases: ["Russo-Swedish War 1788-1790", "Russo Swedish War 1788 1790"],
  },
  {
    slug: "russo-turkish-war-1828-1829",
    title: "Russo-Turkish War (1828–1829)",
    aliases: ["Russo-Turkish War 1828-1829", "Russo Turkish War 1828 1829"],
  },
  {
    slug: "russo-turkish-war-1877-1878",
    title: "Russo-Turkish War (1877–1878)",
    aliases: ["Russo-Turkish War 1877-1878", "Russo Turkish War 1877 1878"],
  },
  {
    slug: "venezuelan-crisis-of-1902-1903",
    title: "Venezuelan Crisis of 1902–1903",
    aliases: ["Venezuelan Crisis of 1902-1903", "Venezuelan Crisis of 1902 1903"],
  },
  {
    slug: "naval-warfare-1900-1939",
    title: "Naval Warfare, 1900–1939",
    aliases: ["Naval Warfare 1900-1939", "Naval Warfare 1900 1939"],
  },
  {
    slug: "gloster-e-28-39",
    title: "Gloster E.28/39",
    aliases: ["Gloster E 28 39"],
  },
  {
    slug: "specification-m-1-30",
    title: "Specification M.1/30",
    aliases: ["Specification M 1 30"],
  },
  {
    slug: "otobreda-127-64",
    title: "OTO Melara 127/64",
    aliases: ["OTO Melara 127 64"],
  },
  {
    slug: "qf-2-pounder-pom-pom",
    title: "QF 2-pounder Pom-Pom",
    aliases: ["QF 2 pounder pom pom"],
  },
  {
    slug: "qf-2-pounder",
    title: "QF 2-pounder",
    aliases: ["QF 2 pounder"],
  },
] as const;
