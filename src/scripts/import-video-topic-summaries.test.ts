import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseCuratedTopicStore } from "../content/schemas/index.js";
import {
  formatVideoTopicSummaryImportResult,
  importVideoTopicSummaries,
} from "./import-video-topic-summaries.js";

test("imports only changed topic summaries and reports slugs that cannot be updated", async () => {
  const directory = await mkdtemp(join(tmpdir(), "topic-summary-import-"));
  const reportInput = join(directory, "video-topic-usage.tsv");
  const topicsInput = join(directory, "topics.json");
  await writeFile(topicsInput, `${JSON.stringify({
    topics: [
      {slug: "alpha", title: "Alpha", summary: "Old summary.", aliases: ["A"]},
      {slug: "beta", title: "Beta"},
      {slug: "conflict", title: "Conflict", summary: "Keep this."},
      {slug: "gamma", title: "Gamma", summary: "Remove this."},
      {slug: "same", title: "Same", summary: '"Already" current.'},
    ],
  }, null, 2)}\n`, "utf8");
  await writeFile(reportInput, [
    "topic slug\tdisplay name\tentity type\tsummary\ttopic aliases",
    "alpha\tAlpha\tship\tNew summary.\tA",
    "beta\tBeta\tship\tAdded summary.\t",
    "conflict\tConflict\tother\tFirst value.\t",
    "conflict\tConflict\tother\tSecond value.\t",
    "gamma\tGamma\tother\t\t",
    "missing\tMissing\tother\tCannot add this.\t",
    'same\tSame with a 12" gun\tother\t"Already" current.\t',
    "unregistered-blank\tUnregistered Blank\tother\t\t",
    "",
  ].join("\n"), "utf8");

  const result = await importVideoTopicSummaries({reportInput, topicsInput});

  assert.deepEqual(result, {
    changed: true,
    unableSlugs: ["conflict", "missing"],
    updatedCount: 3,
  });
  const store = parseCuratedTopicStore(
      JSON.parse(await readFile(topicsInput, "utf8")) as unknown,
      topicsInput,
  );
  assert.deepEqual(store.topics, [
    {slug: "alpha", title: "Alpha", summary: "New summary.", aliases: ["A"]},
    {slug: "beta", title: "Beta", summary: "Added summary."},
    {slug: "conflict", title: "Conflict", summary: "Keep this."},
    {slug: "gamma", title: "Gamma"},
    {slug: "same", title: "Same", summary: '"Already" current.'},
  ]);
});

test("accepts a quoted Google Sheets CSV export", async () => {
  const directory = await mkdtemp(join(tmpdir(), "topic-summary-csv-import-"));
  const reportInput = join(directory, "video-topic-usage.csv");
  const topicsInput = join(directory, "topics.json");
  await writeFile(topicsInput, '{"topics":[{"slug":"alpha","title":"Alpha"}]}\n', "utf8");
  await writeFile(
      reportInput,
      '\uFEFF"topic slug","entity type","summary"\r\nalpha,ship,"A ""quoted"", useful summary."\r\n',
      "utf8",
  );

  const result = await importVideoTopicSummaries({reportInput, topicsInput});

  assert.equal(result.updatedCount, 1);
  assert.deepEqual(result.unableSlugs, []);
  const store = parseCuratedTopicStore(
      JSON.parse(await readFile(topicsInput, "utf8")) as unknown,
      topicsInput,
  );
  assert.equal(store.topics[0]?.summary, 'A "quoted", useful summary.');
});

test("formats the requested command-line summary with bare unable slugs", () => {
  assert.equal(formatVideoTopicSummaryImportResult({
    changed: true,
    unableSlugs: ["alpha", "beta"],
    updatedCount: 4,
  }), [
    "Topic summaries updated: 4",
    "Topic summary changes not updated: 2",
    "alpha",
    "beta",
  ].join("\n"));
});
