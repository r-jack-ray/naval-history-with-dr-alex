import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  defaultTopicSummary,
  isDefaultTopicSummary,
  loadTopicNormalizationCatalog,
  parseTopicNormalizationCatalog,
  resolveTopicCreation,
  resolveTopicDisplayTitle,
  topicCollisionKey,
  topicNormalizationPatternHeader,
  topicTitleFromSlug,
  type TopicNormalizationCatalog,
} from "./topic-normalization.js";

test("parses the strict nine-column TSV and separates canonical and source hashes", async () => {
  const canonical = catalogText([
    row({
      ruleId: "token-mm",
      scope: "display",
      matchKind: "token",
      match: "mm",
      replacement: "mm",
      notes: "SI unit remains lowercase",
    }),
  ]);
  const crlf = canonical.replaceAll("\n", "\r\n");
  const parsed = parseTopicNormalizationCatalog(crlf, { sourcePath: "patterns.tsv" });

  assert.equal(topicNormalizationPatternHeader.length, 9);
  assert.equal(parsed.sourcePath, "patterns.tsv");
  assert.equal(parsed.rules.length, 1);
  assert.equal(parsed.rules[0]?.lineNumber, 2);
  assert.equal(parsed.rules[0]?.ruleId, "token-mm");
  assert.equal(parsed.canonicalText, canonical);
  assert.equal(
    parsed.sha256,
    createHash("sha256").update(canonical, "utf8").digest("hex"),
  );
  assert.equal(
    parsed.sourceSha256,
    createHash("sha256").update(crlf, "utf8").digest("hex"),
  );
  assert.notEqual(parsed.sha256, parsed.sourceSha256);

  const directory = await mkdtemp(join(tmpdir(), "topic-normalization-catalog-"));
  const path = join(directory, "patterns.tsv");
  try {
    await writeFile(path, canonical, "utf8");
    const loaded = await loadTopicNormalizationCatalog(path);
    assert.equal(loaded.sourcePath, path);
    assert.equal(loaded.sha256, parsed.sha256);
    assert.equal(loaded.sourceSha256, loaded.sha256);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("uses exact, regex, token, and fallback rules in deterministic precedence", () => {
  const catalog = resolutionCatalog();

  assert.deepEqual(resolveTopicCreation(catalog, "57mm-guns"), {
    input: "57mm-guns",
    slug: "57-mm-guns",
    changed: true,
    matchedRuleIds: ["normalize-57mm-guns"],
  });
  assert.deepEqual(resolveTopicCreation(catalog, "76mm-guns"), {
    input: "76mm-guns",
    slug: "76-mm-guns",
    changed: true,
    matchedRuleIds: ["create-metric-mm-guns"],
  });
  assert.equal(topicTitleFromSlug("57-mm-guns", catalog), "57 mm Guns");
  assert.equal(topicTitleFromSlug("76-mm-guns", catalog), "76 mm Guns");
  assert.equal(topicTitleFromSlug("5-25-inch-guns", catalog), "5.25-inch Guns");
  assert.equal(topicTitleFromSlug("qf-2-pounder", catalog), "QF 2 Pounder");
  assert.equal(topicTitleFromSlug("pre-world-war-i", catalog), "Pre World War I");
  assert.equal(topicTitleFromSlug("live-q-and-a", catalog), "Live Q&A");

  assert.deepEqual(resolveTopicDisplayTitle(catalog, "76-mm-guns"), {
    slug: "76-mm-guns",
    title: "76 mm Guns",
    matchedRuleIds: ["display-metric-mm-guns"],
    resolution: "regex",
  });
  assert.deepEqual(resolveTopicDisplayTitle(catalog, "plain-topic"), {
    slug: "plain-topic",
    title: "Plain Topic",
    matchedRuleIds: [],
    resolution: "fallback",
  });
});

test("production policy canonicalizes numeric millimeter gun topics", async () => {
  const catalog = await loadTopicNormalizationCatalog(
    "src/derived/topic-normalization-patterns.tsv",
  );

  assert.deepEqual(resolveTopicCreation(catalog, "40-millimeter-guns"), {
    input: "40-millimeter-guns",
    slug: "40-mm-guns",
    changed: true,
    matchedRuleIds: ["normalize-40-millimeter-guns"],
  });
  assert.deepEqual(resolveTopicCreation(catalog, "120-millimeter-guns"), {
    input: "120-millimeter-guns",
    slug: "120-mm-guns",
    changed: true,
    matchedRuleIds: ["normalize-120-millimeter-guns"],
  });
  assert.deepEqual(resolveTopicCreation(catalog, "90-millimeter-guns"), {
    input: "90-millimeter-guns",
    slug: "90-mm-guns",
    changed: true,
    matchedRuleIds: ["create-numeric-millimeter-guns"],
  });
  assert.deepEqual(resolveTopicCreation(catalog, "90-millimetre-guns"), {
    input: "90-millimetre-guns",
    slug: "90-mm-guns",
    changed: true,
    matchedRuleIds: ["create-numeric-millimeter-guns"],
  });
  assert.deepEqual(resolveTopicCreation(catalog, "forty-millimeter-guns"), {
    input: "forty-millimeter-guns",
    slug: "40-mm-guns",
    changed: true,
    matchedRuleIds: ["normalize-forty-millimeter-guns"],
  });
  assert.deepEqual(resolveTopicCreation(catalog, "x-millimeter-guns"), {
    input: "x-millimeter-guns",
    slug: "x-millimeter-guns",
    changed: false,
    matchedRuleIds: [],
  });
  assert.deepEqual(resolveTopicCreation(catalog, "sixty-millimeter-guns"), {
    input: "sixty-millimeter-guns",
    slug: "sixty-millimeter-guns",
    changed: false,
    matchedRuleIds: [],
  });
});

test("exact review policy suppresses broader active creation rules", () => {
  const catalog = resolutionCatalog();

  assert.deepEqual(resolveTopicCreation(catalog, "155mm-guns"), {
    input: "155mm-guns",
    slug: "155mm-guns",
    changed: false,
    matchedRuleIds: ["review-155mm-guns"],
  });
  assert.deepEqual(resolveTopicCreation(catalog, "203mm-guns"), {
    input: "203mm-guns",
    slug: "203-mm-guns",
    changed: true,
    matchedRuleIds: ["create-metric-mm-guns"],
  });
});

test("disabled exact policy does not suppress an active regex rule", () => {
  const catalog = parseTopicNormalizationCatalog(catalogText([
    row({
      ruleId: "disabled-76mm-guns",
      status: "disabled",
      scope: "creation",
      match: "76mm-guns",
      replacement: "retired-topic",
      notes: "Disabled exception",
    }),
    row({
      ruleId: "create-metric-mm-guns",
      scope: "creation",
      matchKind: "regex",
      match: "^([0-9]+)mm-guns$",
      replacement: "$1-mm-guns",
      notes: "Generic metric construction",
    }),
  ]));

  assert.equal(resolveTopicCreation(catalog, "76mm-guns").slug, "76-mm-guns");
});

test("rejects malformed rows and incompatible rule contracts with line numbers", () => {
  const invalidRows = [
    row({ ruleId: "bad-scope", scope: "display+creation", notes: "Wrong order" }),
    row({
      ruleId: "bad-regex",
      scope: "creation",
      matchKind: "regex",
      match: "([0-9]+)mm-guns",
      replacement: "$2-mm-guns",
      notes: "Unanchored and missing capture",
    }),
    row({
      ruleId: "bad-token",
      scope: "creation+display",
      matchKind: "token",
      match: "qf",
      replacement: "QF",
      notes: "Token scope is invalid",
    }),
  ];

  assert.throws(
    () => parseTopicNormalizationCatalog(catalogText(invalidRows), { sourcePath: "bad.tsv" }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Invalid topic normalization catalog bad\.tsv/u);
      assert.match(error.message, /line 2: scope/u);
      assert.match(error.message, /line 3: a regex match must be fully anchored/u);
      assert.match(error.message, /line 3: replacement references missing regex capture \$2/u);
      assert.match(error.message, /line 4: a token rule must use display scope only/u);
      return true;
    },
  );
});

test("rejects duplicate IDs, conflicting titles, mapping chains, and active duplicate matches", () => {
  const invalid = catalogText([
    row({ ruleId: "duplicate", match: "old-a", replacement: "new-a", scope: "creation", notes: "First" }),
    row({ ruleId: "duplicate", match: "old-b", replacement: "new-b", scope: "creation", notes: "Second" }),
    row({ ruleId: "chain-one", match: "chain-a", replacement: "chain-b", scope: "creation", notes: "Chain" }),
    row({ ruleId: "chain-two", match: "chain-b", replacement: "chain-c", scope: "creation", notes: "Chain" }),
    row({
      ruleId: "title-one",
      match: "title-old-a",
      replacement: "title-target",
      scope: "creation",
      canonicalTitle: "Title One",
      notes: "Conflict",
    }),
    row({
      ruleId: "title-two",
      match: "title-old-b",
      replacement: "title-target",
      scope: "creation",
      canonicalTitle: "Title Two",
      notes: "Conflict",
    }),
    row({ ruleId: "match-one", match: "same-source", replacement: "first-target", scope: "creation", notes: "Conflict" }),
    row({ ruleId: "match-two", match: "same-source", replacement: "second-target", scope: "creation", notes: "Conflict" }),
  ]);

  assert.throws(
    () => parseTopicNormalizationCatalog(invalid),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /duplicate rule_id duplicate/u);
      assert.match(error.message, /active creation exact match/u);
      assert.match(error.message, /forms a chain or cycle/u);
      assert.match(error.message, /conflicting titles/u);
      return true;
    },
  );
});

test("rejects an input that matches multiple active regex rules at resolution time", () => {
  const catalog = parseTopicNormalizationCatalog(catalogText([
    row({
      ruleId: "generic-mm",
      scope: "creation",
      matchKind: "regex",
      match: "^([0-9]+)mm-guns$",
      replacement: "$1-mm-guns",
      notes: "Generic metric rule",
    }),
    row({
      ruleId: "specific-57",
      scope: "creation",
      matchKind: "regex",
      match: "^(57)mm-guns$",
      replacement: "$1-mm-guns",
      notes: "Overlapping rule",
    }),
  ]));

  assert.throws(
    () => resolveTopicCreation(catalog, "57mm-guns"),
    /ambiguously matches active creation rules: generic-mm, specific-57/u,
  );
});

test("shares default-summary and collision-key behavior", () => {
  const title = "57 mm Guns";
  const summary = defaultTopicSummary(title);

  assert.equal(summary, "Watch points covering 57 mm Guns across Dr. Alex Clarke's videos.");
  assert.equal(isDefaultTopicSummary(summary, title), true);
  assert.equal(isDefaultTopicSummary("A curated summary.", title), false);
  assert.equal(topicCollisionKey("  OTO 76/62—SR  "), "oto 76 62 sr");
  assert.equal(topicCollisionKey("ＯＴＯ 76 62 SR"), "oto 76 62 sr");
});

function resolutionCatalog(): TopicNormalizationCatalog {
  return parseTopicNormalizationCatalog(catalogText([
    row({
      ruleId: "normalize-57mm-guns",
      scope: "creation",
      match: "57mm-guns",
      replacement: "57-mm-guns",
      canonicalTitle: "57 mm Guns",
      notes: "Exact policy wins over generic regex",
    }),
    row({
      ruleId: "create-metric-mm-guns",
      scope: "creation",
      matchKind: "regex",
      match: "^([0-9]+)mm-guns$",
      replacement: "$1-mm-guns",
      canonicalTitle: "$1 mm Guns",
      notes: "Generic metric calibre construction",
    }),
    row({
      ruleId: "display-metric-mm-guns",
      scope: "display",
      matchKind: "regex",
      match: "^([0-9]+)-mm-guns$",
      replacement: "$1-mm-guns",
      canonicalTitle: "$1 mm Guns",
      notes: "Canonical generic calibre title",
    }),
    row({
      ruleId: "review-155mm-guns",
      status: "review",
      scope: "creation",
      match: "155mm-guns",
      replacement: "155-mm-guns",
      canonicalTitle: "155 mm Guns",
      notes: "Named-system context still requires review",
    }),
    row({
      ruleId: "token-mm",
      scope: "display",
      matchKind: "token",
      match: "mm",
      replacement: "mm",
      notes: "SI unit remains lowercase",
    }),
    row({
      ruleId: "token-qf",
      scope: "display",
      matchKind: "token",
      match: "qf",
      replacement: "QF",
      notes: "Established acronym casing",
    }),
    row({
      ruleId: "decimal-inch",
      scope: "display",
      matchKind: "regex",
      match: "^([0-9]+)-([0-9]+)-inch-guns$",
      replacement: "$1-$2-inch-guns",
      canonicalTitle: "$1.$2-inch Guns",
      notes: "Terminal decimal-inch display",
    }),
    row({
      ruleId: "live-q-and-a-title",
      scope: "display",
      match: "live-q-and-a",
      replacement: "live-q-and-a",
      canonicalTitle: "Live Q&A",
      notes: "Established exact title",
    }),
  ]));
}

interface RowOptions {
  ruleId: string;
  status?: "active" | "review" | "disabled";
  scope?: string;
  matchKind?: "exact" | "regex" | "token";
  match?: string;
  replacement?: string;
  canonicalTitle?: string;
  aliases?: string[];
  notes: string;
}

function row(options: RowOptions): string {
  return [
    options.ruleId,
    options.status ?? "active",
    options.scope ?? "display",
    options.matchKind ?? "exact",
    options.match ?? "example-topic",
    options.replacement ?? options.match ?? "example-topic",
    options.canonicalTitle ?? "",
    JSON.stringify(options.aliases ?? []),
    options.notes,
  ].join("\t");
}

function catalogText(rows: readonly string[]): string {
  return `${[topicNormalizationPatternHeader.join("\t"), ...rows].join("\n")}\n`;
}
