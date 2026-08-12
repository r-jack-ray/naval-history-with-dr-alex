import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  collectUsedTopicSlugs,
  planTopicStoreSynchronization,
  synchronizeCuratedTopicStore,
  topicTitleFromSlug,
  writeTopicStoreSynchronization,
} from "./topic-store.js";
import {
  parseTopicNormalizationCatalog,
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

test("keeps similarly worded fixture topics as separate registry records", async () => {
  const expectedSlugs = [
    "scout-vessels",
    "scouting-activity",
    "scouting-aviation-units",
  ];
  const directory = await makeTopicDirectory(
    ["scout-vessels", "scouting-activity"],
    ["scout-vessels", "scouting-aviation-units"],
  );
  try {
    const result = await synchronizeFixture(directory);
    const store = JSON.parse(await readFile(join(directory, "topics.json"), "utf8")) as {
      topics: Array<{ slug: string; title: string; summary?: string; aliases?: string[] }>;
    };
    const topicsBySlug = new Map(store.topics.map((topic) => [topic.slug, topic]));

    assert.equal(result.addedSlugs.length, expectedSlugs.length);
    assert.equal(topicsBySlug.size, expectedSlugs.length);
    for (const slug of expectedSlugs) {
      assert.ok(topicsBySlug.has(slug), `Missing fixture topic ${slug}`);
    }
    assert.equal(topicsBySlug.has("ambiguous-scouting"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function makeTopicDirectory(
  videoTopics = ["royal-navy", "destroyers"],
  segmentTopics = ["destroyers", "airborne-early-warning"],
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "naval-topic-store-"));
  await writeFile(fixturePatternsPath(directory), testCatalogText, "utf8");
  await writeFile(join(directory, "2026-07-08_T00-00-00_topic-fixture_abc123.json"), JSON.stringify({
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
        sourcePath: "src/transcripts/txt/topic-fixture_abc123.txt",
        evidence: [{
          start: "0:00",
          note: "Fixture evidence.",
        }],
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
