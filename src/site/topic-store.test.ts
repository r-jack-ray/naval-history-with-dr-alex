import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  collectUsedTopicSlugs,
  planTopicStoreSynchronization,
  synchronizeCuratedTopicStore,
  topicTitleFromSlug,
  writeTopicStoreSynchronization,
} from "./topic-store.js";
import {
  loadTopicNormalizationCatalog,
  parseTopicNormalizationCatalog,
  resolveTopicDisplayTitle,
  topicNormalizationPatternHeader,
} from "./topic-normalization.js";

const testCatalogText = makeTestCatalogText();
const testCatalog = parseTopicNormalizationCatalog(testCatalogText, {
  sourcePath: "fixture-patterns.tsv",
});

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
    const synchronizationPlan = await planTopicStoreSynchronization({
      segmentsInput: directory,
      patternsInput: fixturePatternsPath(directory),
    });
    await assert.rejects(readFile(join(directory, "topics.json"), "utf8"), { code: "ENOENT" });
    const result = await writeTopicStoreSynchronization(synchronizationPlan);
    const store = JSON.parse(await readFile(join(directory, "topics.json"), "utf8")) as {
      topics: Array<{ slug: string; title: string; summary?: string }>;
    };

    assert.equal(result.changed, true);
    assert.deepEqual(result.addedSlugs, ["airborne-early-warning", "destroyers", "royal-navy"]);
    assert.deepEqual(store.topics.map((topic) => topic.slug), result.addedSlugs);
    assert.equal(store.topics[0]?.title, "Airborne Early Warning");
    assert.equal(store.topics[0]?.summary, "");
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

    const result = await synchronizeFixture(directory);
    const store = JSON.parse(await readFile(join(directory, "topics.json"), "utf8")) as {
      topics: Array<{ slug: string; title: string; summary?: string; aliases?: string[] }>;
    };

    assert.deepEqual(result.addedSlugs, ["airborne-early-warning", "royal-navy"]);
    assert.equal(store.topics[0]?.title, "Destroyers");
    assert.equal(store.topics[0]?.summary, "A curated summary.");
    assert.deepEqual(store.topics[0]?.aliases, ["tin cans"]);
    assert.equal(store.topics[1]?.slug, "unused-topic");
    assert.deepEqual(store.topics.slice(2).map((topic) => topic.slug), result.addedSlugs);

    const beforeSecondSynchronization = await readFile(join(directory, "topics.json"), "utf8");
    const secondResult = await synchronizeFixture(directory);
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
  assert.equal(topicTitleFromSlug("hms-warrior", testCatalog), "HMS Warrior");
  assert.equal(topicTitleFromSlug("pre-world-war-i", testCatalog), "Pre World War I");
  assert.equal(topicTitleFromSlug("live-q-and-a", testCatalog), "Live Q&A");
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
    assert.equal(topicTitleFromSlug(slug, testCatalog), title, slug);
  }

  assert.equal(topicTitleFromSlug("war-1828-1829", testCatalog), "War 1828 1829");
  assert.equal(topicTitleFromSlug("4-5-inch-gun-mount", testCatalog), "4 5 Inch Gun Mount");
  assert.equal(topicTitleFromSlug("4-to-5-inch-guns", testCatalog), "4 To 5 Inch Guns");
});

test("capitalizes QF in generic non-decimal topic titles", () => {
  assert.equal(topicTitleFromSlug("qf-2-pounder", testCatalog), "QF 2 Pounder");
  assert.equal(topicTitleFromSlug("qf-ammunition", testCatalog), "QF Ammunition");
});

test("creates decimal topic defaults without adding them to title review", async () => {
  const directory = await makeTopicDirectory(
    ["qf-5-25-inch-gun"],
    ["qf-5-25-inch-gun"],
  );
  try {
    const result = await synchronizeFixture(directory);
    const store = JSON.parse(await readFile(join(directory, "topics.json"), "utf8")) as {
      topics: Array<{ slug: string; title: string; summary?: string }>;
    };

    assert.deepEqual(result.addedSlugs, ["qf-5-25-inch-gun"]);
    assert.deepEqual(result.reviewTopics, []);
    assert.deepEqual(store.topics[0], {
      slug: "qf-5-25-inch-gun",
      title: "QF 5.25-inch Gun",
      summary: "",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("persists unresolved numeric title review until the stored title is curated", async () => {
  const directory = await makeTopicDirectory(["war-1828-1829"], ["war-1828-1829"]);
  const topicStorePath = join(directory, "topics.json");
  try {
    const firstResult = await synchronizeFixture(directory);
    const firstBytes = await readFile(topicStorePath, "utf8");
    const firstStore = JSON.parse(firstBytes) as {
      schemaVersion: 1;
      topics: Array<{ slug: string; title: string; summary?: string }>;
    };

    assert.equal(topicTitleFromSlug("war-1828-1829", testCatalog), "War 1828 1829");
    assert.equal(firstStore.topics[0]?.title, "War 1828 1829");
    assert.deepEqual(firstResult.reviewTopics, [
      { slug: "war-1828-1829", generatedTitle: "War 1828 1829" },
    ]);

    const secondResult = await synchronizeFixture(directory);
    assert.equal(secondResult.changed, false);
    assert.deepEqual(secondResult.reviewTopics, firstResult.reviewTopics);
    assert.equal(await readFile(topicStorePath, "utf8"), firstBytes);

    firstStore.topics[0]!.title = "Russo-Turkish War (1828–1829)";
    await writeFile(topicStorePath, `${JSON.stringify(firstStore, null, 2)}\n`, "utf8");

    const curatedResult = await synchronizeFixture(directory);
    assert.equal(curatedResult.changed, false);
    assert.deepEqual(curatedResult.reviewTopics, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses a noncanonical topic without changing the topic store", async () => {
  const directory = await makeTopicDirectory(["57mm-gun"], ["57mm-gun"]);
  const topicStorePath = join(directory, "topics.json");
  const before = `${JSON.stringify({
    schemaVersion: 1,
    topics: [{
      slug: "57mm-gun",
      title: "57mm Gun",
      summary: "Manually curated fixture description.",
    }],
  }, null, 2)}\n`;
  try {
    await writeFile(topicStorePath, before, "utf8");
    await assert.rejects(
      synchronizeFixture(directory),
      /Topic normalization preflight failed.*57mm-gun/su,
    );
    assert.equal(await readFile(topicStorePath, "utf8"), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses a new noncanonical creation slug before creating topics.json", async () => {
  const directory = await makeTopicDirectory(["90mm-guns"], ["90mm-guns"]);
  try {
    await assert.rejects(
      synchronizeFixture(directory),
      /90mm-guns resolves through active creation rule create-metric-mm-guns to 90-mm-guns/u,
    );
    await assert.rejects(readFile(join(directory, "topics.json"), "utf8"), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("uses catalog display policy when appending a canonical topic", async () => {
  const directory = await makeTopicDirectory(["57-mm-guns"], ["57-mm-guns"]);
  try {
    await synchronizeFixture(directory);
    const store = JSON.parse(await readFile(join(directory, "topics.json"), "utf8")) as {
      topics: Array<{ slug: string; title: string; summary?: string }>;
    };
    assert.deepEqual(store.topics, [{
      slug: "57-mm-guns",
      title: "57 mm Guns",
      summary: "",
      aliases: ["57mm Gun"],
    }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps the bounded production topic titles and aliases curated without descriptions", async () => {
  const store = JSON.parse(
    await readFile(new URL("../../src/derived/video-segments/topics.json", import.meta.url), "utf8"),
  ) as {
    topics: Array<{ slug: string; title: string; summary?: string; aliases?: string[] }>;
  };
  const topicsBySlug = new Map(store.topics.map((topic) => [topic.slug, topic]));

  assert.equal(productionTopicMapping.length, 22);
  assert.equal(new Set(productionTopicMapping.map(({ slug }) => slug)).size, 22);
  for (const expected of productionTopicMapping) {
    const topic = topicsBySlug.get(expected.slug);
    assert.ok(topic, `Missing production topic ${expected.slug}`);
    assert.equal(topic.title, expected.title, `${expected.slug} title`);
    assert.deepEqual(topic.aliases ?? [], expected.aliases, `${expected.slug} aliases`);
    assert.equal(topic.summary, undefined, `${expected.slug} description removed`);
  }
});

test("keeps the repository-owner normalization batch canonical in the production store", async () => {
  const store = JSON.parse(
    await readFile(new URL("../../src/derived/video-segments/topics.json", import.meta.url), "utf8"),
  ) as {
    topics: Array<{ slug: string; title: string; summary?: string; aliases?: string[] }>;
  };
  const catalog = await loadTopicNormalizationCatalog(
    fileURLToPath(new URL("../../src/derived/topic-normalization-patterns.tsv", import.meta.url)),
  );
  const topicsBySlug = new Map(store.topics.map((topic) => [topic.slug, topic]));

  for (const deprecated of [
    "arc-royal",
    "arc-royal-class",
    "hms-arc-royal",
    "hmnz-achilles",
    "first-world-war",
    "world-war-one",
    "second-world-war",
    "world-war-two",
    "phony-war",
    "pom-pom",
    "pom-pom-gun",
    "pom-poms",
    "wrens",
    "womens-royal-naval-service",
  ]) {
    assert.equal(topicsBySlug.has(deprecated), false, deprecated);
  }

  const expected = new Map<string, { title: string; aliases?: string[] }>([
    ["3d-printing", { title: "3D Printing" }],
    ["ark-royal", { title: "Ark Royal", aliases: ["Arc Royal"] }],
    ["ark-royal-class", { title: "Ark Royal Class", aliases: ["Arc Royal Class"] }],
    ["fairey-tsr", { title: "Fairey TSR" }],
    ["hmnzs-achilles", { title: "HMNZS Achilles", aliases: ["HMNZ Achilles"] }],
    ["hms-ark-royal", { title: "HMS Ark Royal", aliases: ["HMS Arc Royal"] }],
    ["pgm-1-class", { title: "PGM-1 Class" }],
    ["pgm-9-class", { title: "PGM-9 Class" }],
    ["phoney-war", { title: "Phoney War", aliases: ["Phony War"] }],
    ["pla-air-force", { title: "PLA Air Force" }],
    ["pla-navy", { title: "PLA Navy" }],
    ["pom-pom-guns", { title: "Pom Pom Guns", aliases: ["Pom Pom", "Pom Pom Gun", "Pom Poms"] }],
    [
      "world-war-i",
      {
        title: "World War I",
        aliases: [
          "WWI",
          "First World War",
          "WW1",
          "World War 1",
          "World War One",
          "1st World War",
          "Great War",
          "The Great War",
        ],
      },
    ],
    [
      "world-war-ii",
      {
        title: "World War II",
        aliases: [
          "WWII",
          "WW2",
          "World War 2",
          "World War Two",
          "Second World War",
          "The Second World War",
          "2nd World War",
        ],
      },
    ],
    [
      "wrns",
      {
        title: "WRNS",
        aliases: ["Wrens", "Women's Royal Naval Service", "Womens Royal Naval Service"],
      },
    ],
  ]);

  for (const [slug, expectedTopic] of expected) {
    const topic = topicsBySlug.get(slug);
    assert.ok(topic, `Missing production topic ${slug}`);
    assert.equal(topic.title, expectedTopic.title, `${slug} title`);
    assert.deepEqual(topic.aliases ?? [], expectedTopic.aliases ?? [], `${slug} aliases`);
    assert.equal(topic.summary, undefined, `${slug} description removed`);
  }

  for (const topic of store.topics.filter(({ slug }) => (
    slug.startsWith("hmas-")
    || slug.startsWith("hmnzs-")
    || slug.startsWith("pq-")
    || slug.startsWith("qp-")
    || slug.includes("-pq-")
    || slug.includes("-qp-")
  ))) {
    assert.equal(
      topic.title,
      resolveTopicDisplayTitle(catalog, topic.slug).title,
      `${topic.slug} acronym title`,
    );
  }

  assert.equal(
    topicsBySlug.get("mers-el-kebir")?.aliases?.includes("Ark Royal") ?? false,
    false,
    "Ark Royal must resolve only to the Ark Royal topic",
  );
});

async function makeTopicDirectory(
  videoTopics = ["royal-navy", "destroyers"],
  segmentTopics = ["destroyers", "airborne-early-warning"],
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "naval-topic-store-"));
  await writeFile(fixturePatternsPath(directory), testCatalogText, "utf8");
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

async function synchronizeFixture(directory: string) {
  return synchronizeCuratedTopicStore(directory, fixturePatternsPath(directory));
}

function fixturePatternsPath(directory: string): string {
  return join(directory, "patterns.tsv");
}

function makeTestCatalogText(): string {
  const rows = [
    catalogRow("token-hms", "active", "display", "token", "hms", "HMS", "", "[]", "Naval prefix"),
    catalogRow("token-qf", "active", "display", "token", "qf", "QF", "", "[]", "Gun prefix"),
    catalogRow("display-live-q-and-a", "active", "display", "exact", "live-q-and-a", "live-q-and-a", "Live Q&A", "[]", "Established title"),
    catalogRow("display-decimal-inch-gun", "active", "display", "regex", "^([0-9]+)-([0-9]+)-inch-gun$", "$1-$2-inch-gun", "$1.$2-inch Gun", "[]", "Decimal calibre"),
    catalogRow("display-decimal-inch-guns", "active", "display", "regex", "^([0-9]+)-([0-9]+)-inch-guns$", "$1-$2-inch-guns", "$1.$2-inch Guns", "[]", "Decimal calibre"),
    catalogRow("display-qf-decimal-inch-gun", "active", "display", "regex", "^qf-([0-9]+)-([0-9]+)-inch-gun$", "qf-$1-$2-inch-gun", "QF $1.$2-inch Gun", "[]", "QF decimal calibre"),
    catalogRow("display-metric-mm-guns", "active", "display", "regex", "^([0-9]+)-mm-guns$", "$1-mm-guns", "$1 mm Guns", "[]", "Metric calibre"),
    catalogRow("create-metric-mm-guns", "active", "creation", "regex", "^([0-9]+)mm-guns$", "$1-mm-guns", "$1 mm Guns", "[]", "Future metric construction"),
    catalogRow("normalize-57mm-gun", "active", "creation", "exact", "57mm-gun", "57-mm-guns", "57 mm Guns", "[\"57mm Gun\"]", "Confirmed fixture duplicate"),
  ];
  return `${topicNormalizationPatternHeader.join("\t")}\n${rows.join("\n")}\n`;
}

function catalogRow(...fields: [string, string, string, string, string, string, string, string, string]): string {
  return fields.join("\t");
}

const productionTopicMapping = [
  {
    slug: "40-mm-guns",
    title: "40 mm Guns",
    aliases: ["40 Millimeter Guns", "Forty Millimeter Guns"],
  },
  {
    slug: "120-mm-guns",
    title: "120 mm Guns",
    aliases: ["120 Millimeter Guns"],
  },
  {
    slug: "4-5-inch-guns",
    title: "4.5-inch Guns",
    aliases: ["4.5-inch Gun", "Four Point Five Inch Gun", "Four Point Five Inch Guns"],
  },
  {
    slug: "4-7-inch-guns",
    title: "4.7-inch Guns",
    aliases: ["Four Point Seven Inch Guns"],
  },
  {
    slug: "5-25-inch-guns",
    title: "5.25-inch Guns",
    aliases: ["Five Point Two Inch Guns", "Five Point Two Five Inch Gun", "Five Point Two Five Inch Guns"],
  },
  {
    slug: "9-2-inch-guns",
    title: "9.2-inch Guns",
    aliases: ["Nine Point Two Inch Guns"],
  },
  {
    slug: "13-5-inch-guns",
    title: "13.5-inch Guns",
    aliases: ["13.5-inch Gun", "Thirteen Point Five Inch Guns"],
  },
  {
    slug: "qf-4-5-inch-gun",
    title: "QF 4.5-inch Gun",
    aliases: [],
  },
  {
    slug: "qf-4-7-inch-gun",
    title: "QF 4.7-inch Gun",
    aliases: [],
  },
  {
    slug: "qf-5-25-inch-gun",
    title: "QF 5.25-inch Gun",
    aliases: [],
  },
  {
    slug: "anglo-spanish-war-1654-1660",
    title: "Anglo-Spanish War (1654–1660)",
    aliases: [],
  },
  {
    slug: "russo-swedish-war-1741-1743",
    title: "Russo-Swedish War (1741–1743)",
    aliases: [],
  },
  {
    slug: "russo-swedish-war-1788-1790",
    title: "Russo-Swedish War (1788–1790)",
    aliases: [],
  },
  {
    slug: "russo-turkish-war-1828-1829",
    title: "Russo-Turkish War (1828–1829)",
    aliases: [],
  },
  {
    slug: "russo-turkish-war-1877-1878",
    title: "Russo-Turkish War (1877–1878)",
    aliases: [],
  },
  {
    slug: "venezuelan-crisis-of-1902-1903",
    title: "Venezuelan Crisis of 1902–1903",
    aliases: [],
  },
  {
    slug: "naval-warfare-1900-1939",
    title: "Naval Warfare, 1900–1939",
    aliases: [],
  },
  {
    slug: "gloster-e-28-39",
    title: "Gloster E.28/39",
    aliases: [],
  },
  {
    slug: "specification-m-1-30",
    title: "Specification M.1/30",
    aliases: [],
  },
  {
    slug: "otobreda-127-64",
    title: "OTO Melara 127/64",
    aliases: [],
  },
  {
    slug: "qf-2-pounder-pom-pom",
    title: "QF 2-pounder Pom-Pom",
    aliases: [],
  },
  {
    slug: "qf-2-pounder",
    title: "QF 2-pounder",
    aliases: [],
  },
] as const;
