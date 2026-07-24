import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
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

test("production policy consolidates the A-6F variant into the A-6 Intruder topic", async () => {
  const catalog = await loadTopicNormalizationCatalog(
    "src/derived/topic-normalization-patterns.tsv",
  );

  assert.deepEqual(resolveTopicCreation(catalog, "a-6f-intruder"), {
    input: "a-6f-intruder",
    slug: "a-6-intruder",
    changed: true,
    matchedRuleIds: ["normalize-a-6f-intruder"],
  });
});

test("production policy applies the repository-owner topic normalization batch", async () => {
  const catalog = await loadTopicNormalizationCatalog(
    "src/derived/topic-normalization-patterns.tsv",
  );

  const creationExpected = [
    ["arc-royal", "ark-royal", "normalize-arc-royal"],
    ["arc-royal-class", "ark-royal-class", "normalize-arc-royal-class"],
    ["hms-arc-royal", "hms-ark-royal", "normalize-hms-arc-royal"],
    ["hmnz-achilles", "hmnzs-achilles", "normalize-hmnz-achilles"],
    ["hmnz-canterbury", "hmnzs-canterbury", "normalize-hmnz-ship-prefix"],
    ["first-world-war", "world-war-i", "normalize-first-world-war"],
    ["world-war-one", "world-war-i", "normalize-world-war-one"],
    ["great-war", "world-war-i", "normalize-great-war"],
    ["second-world-war", "world-war-ii", "normalize-second-world-war"],
    ["world-war-two", "world-war-ii", "normalize-world-war-two"],
    ["phony-war", "phoney-war", "normalize-phony-war"],
    ["pom-pom", "pom-pom-guns", "normalize-pom-pom"],
    ["pom-pom-gun", "pom-pom-guns", "normalize-pom-pom-gun"],
    ["pom-poms", "pom-pom-guns", "normalize-pom-poms"],
    ["wrens", "wrns", "normalize-wrens"],
    [
      "womens-royal-naval-service",
      "wrns",
      "normalize-womens-royal-naval-service",
    ],
    ["all-or-nothing-armor", "all-or-nothing-armour", "normalize-all-or-nothing-armor"],
    ["planetary-defense", "planetary-defence", "normalize-planetary-defense"],
    [
      "model-1924-203-mm-gun",
      "203-mm-guns",
      "normalize-model-1924-203-mm-gun",
    ],
    [
      "qf-2-pounder-pom-pom",
      "2-pounder-guns",
      "normalize-qf-2-pounder-pom-pom",
    ],
  ] as const;

  for (const [input, slug, ruleId] of creationExpected) {
    assert.deepEqual(resolveTopicCreation(catalog, input), {
      input,
      slug,
      changed: true,
      matchedRuleIds: [ruleId],
    });
  }

  for (const namedWeapon of [
    "type-91-pom-pom",
    "vickers-pom-pom",
  ]) {
    assert.equal(resolveTopicCreation(catalog, namedWeapon).slug, namedWeapon);
  }

  const displayExpected = new Map([
    ["3d-printing", "3D Printing"],
    ["fairey-tsr", "Fairey TSR"],
    ["hmas-australia", "HMAS Australia"],
    ["hmnzs-canterbury", "HMNZS Canterbury"],
    ["pgm-1-class", "PGM-1 Class"],
    ["pgm-9-class", "PGM-9 Class"],
    ["pla-air-force", "PLA Air Force"],
    ["pla-navy", "PLA Navy"],
    ["pq-17", "PQ 17"],
    ["convoy-pq-13", "Convoy PQ 13"],
    ["qp-11", "QP 11"],
    ["wrns", "WRNS"],
    ["world-war-i", "World War I"],
    ["world-war-ii", "World War II"],
  ]);
  for (const [slug, title] of displayExpected) {
    assert.equal(resolveTopicDisplayTitle(catalog, slug).title, title, slug);
  }

  assert.deepEqual(
    catalog.rules.find((rule) => rule.ruleId === "display-world-war-i")?.aliases,
    [
      "WWI",
      "WW1",
      "World War 1",
      "World War One",
      "First World War",
      "1st World War",
      "Great War",
      "The Great War",
    ],
  );
  assert.deepEqual(
    catalog.rules.find((rule) => rule.ruleId === "display-world-war-ii")?.aliases,
    [
      "WWII",
      "WW2",
      "World War 2",
      "World War Two",
      "Second World War",
      "The Second World War",
      "2nd World War",
    ],
  );
});

test("production policy encodes the dc950 topic audit without collapsing semantic distinctions", async () => {
  const catalog = await loadTopicNormalizationCatalog(
    "src/derived/topic-normalization-patterns.tsv",
  );
  const auditRules = catalog.rules.filter(({ ruleId }) =>
    ruleId.startsWith("normalize-dc950-"),
  );

  assert.equal(auditRules.length, 109);
  for (const rule of auditRules) {
    assert.equal(rule.status, "active", rule.ruleId);
    assert.deepEqual(rule.scopes, ["creation"], rule.ruleId);
    assert.equal(rule.matchKind, "exact", rule.ruleId);
    assert.deepEqual(resolveTopicCreation(catalog, rule.match), {
      input: rule.match,
      slug: rule.replacement,
      changed: true,
      matchedRuleIds: [rule.ruleId],
    });
  }

  const highRiskMappings = new Map([
    ["flooding-control", "damage-control"],
    ["warship-repairs", "warship-repair"],
    ["european-defense", "european-defence"],
    ["ship-artifacts", "warship-artifacts"],
    ["c-class-light-cruisers", "c-class-cruisers"],
    ["j-class", "j-class-destroyers"],
    ["k-class", "k-class-destroyers"],
    ["uss-john-f-kennedy", "uss-john-f-kennedy-cv-67"],
    ["second-naval-lord", "second-sea-lord"],
    ["rfa-sir-david-attenborough", "rrs-sir-david-attenborough"],
    ["rss-sir-david-attenborough", "rrs-sir-david-attenborough"],
    ["bremerton-naval-shipyard", "puget-sound-naval-shipyard"],
    ["port-stanley-airport", "stanley-airport"],
    ["ship-engineering", "fiction-spacecraft-engineering"],
    ["grand-admiral-thrawn", "fiction-star-wars-grand-admiral-thrawn"],
    ["hms-thunderchild", "fiction-hms-thunder-child"],
    ["hms-fundra", "fiction-world-of-warships-fundra"],
    ["unsc", "fiction-halo-united-nations-space-command"],
    ["un-security-council", "united-nations-security-council"],
  ]);
  for (const [input, expected] of highRiskMappings) {
    assert.equal(resolveTopicCreation(catalog, input).slug, expected, input);
  }

  for (const distinctTopic of [
    "submarine-fleet",
    "fleet-submarines",
    "destroyer-fleet",
    "fleet-destroyers",
    "cruiser-scouting",
    "scouting-cruisers",
    "hms-oak",
    "ammunition-stowage",
    "air-launched-torpedoes",
    "sea-lightning",
    "science-fiction",
    "alternate-history",
  ]) {
    assert.deepEqual(resolveTopicCreation(catalog, distinctTopic), {
      input: distinctTopic,
      slug: distinctTopic,
      changed: false,
      matchedRuleIds: [],
    });
  }

  assert.deepEqual(resolveTopicCreation(catalog, "uss-texas"), {
    input: "uss-texas",
    slug: "uss-texas",
    changed: false,
    matchedRuleIds: ["review-contextual-uss-texas"],
  });
});

test("production policy consolidates generic inch-gun topics without collapsing named models", async () => {
  const catalog = await loadTopicNormalizationCatalog(
    "src/derived/topic-normalization-patterns.tsv",
  );

  for (const calibre of ["14", "15", "16", "18", "20"]) {
    assert.deepEqual(resolveTopicCreation(catalog, `${calibre}-inch-gun`), {
      input: `${calibre}-inch-gun`,
      slug: `${calibre}-inch-guns`,
      changed: true,
      matchedRuleIds: ["create-singular-integer-inch-gun"],
    });
  }
  assert.deepEqual(resolveTopicCreation(catalog, "17-5-inch-gun"), {
    input: "17-5-inch-gun",
    slug: "17-5-inch-guns",
    changed: true,
    matchedRuleIds: ["create-singular-decimal-inch-gun"],
  });
  assert.deepEqual(resolveTopicCreation(catalog, "british-15-inch-gun"), {
    input: "british-15-inch-gun",
    slug: "15-inch-guns",
    changed: true,
    matchedRuleIds: ["normalize-british-15-inch-gun"],
  });
  assert.deepEqual(resolveTopicCreation(catalog, "five-inch-38-caliber-gun"), {
    input: "five-inch-38-caliber-gun",
    slug: "5-inch-guns",
    changed: true,
    matchedRuleIds: ["normalize-five-inch-38-caliber-gun"],
  });
  assert.deepEqual(resolveTopicCreation(catalog, "automatic-eight-inch-guns"), {
    input: "automatic-eight-inch-guns",
    slug: "8-inch-guns",
    changed: true,
    matchedRuleIds: ["normalize-automatic-eight-inch-guns"],
  });
  assert.deepEqual(resolveTopicCreation(catalog, "nine-inch-guns"), {
    input: "nine-inch-guns",
    slug: "9-inch-guns",
    changed: true,
    matchedRuleIds: ["normalize-nine-inch-guns"],
  });
  for (const modelSlug of [
    "bl-15-inch-mark-i",
    "qf-4-5-inch-gun",
    "six-inch-mark-xxiii",
    "15-inch-gun-mount",
  ]) {
    assert.deepEqual(resolveTopicCreation(catalog, modelSlug), {
      input: modelSlug,
      slug: modelSlug,
      changed: false,
      matchedRuleIds: [],
    });
  }
});

test("production policy preserves the distinct 11-inch and 1.1-inch gun topics", async () => {
  const catalog = await loadTopicNormalizationCatalog(
    "src/derived/topic-normalization-patterns.tsv",
  );

  assert.equal(resolveTopicCreation(catalog, "11-inch-guns").slug, "11-inch-guns");
  assert.equal(resolveTopicCreation(catalog, "1-1-inch-guns").slug, "1-1-inch-guns");
  assert.equal(topicTitleFromSlug("11-inch-guns", catalog), "11-inch Guns");
  assert.equal(topicTitleFromSlug("1-1-inch-guns", catalog), "1.1-inch Guns");
  assert.notEqual(
    resolveTopicCreation(catalog, "11-inch-guns").slug,
    resolveTopicCreation(catalog, "1-1-inch-guns").slug,
  );
});

test("production policy normalizes pounder, metric, and rapid-firing gun variants", async () => {
  const catalog = await loadTopicNormalizationCatalog(
    "src/derived/topic-normalization-patterns.tsv",
  );
  const expected = [
    ["6-pounder-gun", "6-pounder-guns", "normalize-numeric-pounder-gun"],
    ["2-pounder-gun", "2-pounder-guns", "normalize-numeric-pounder-gun"],
    ["12-pounder-gun", "12-pounder-guns", "normalize-numeric-pounder-gun"],
    ["two-pounder", "2-pounder-guns", "normalize-written-two-pounder"],
    ["two-pounder-guns", "2-pounder-guns", "normalize-written-two-pounder"],
    ["six-pounder", "6-pounder-guns", "normalize-written-six-pounder"],
    ["seventeen-pounder", "17-pounder-guns", "normalize-written-seventeen-pounder"],
    ["forty-eight-pounder", "48-pounder-guns", "normalize-written-forty-eight-pounder"],
    ["sixty-eight-pounder", "68-pounder-guns", "normalize-written-sixty-eight-pounder"],
    ["long-nine-pounder", "9-pounder-guns", "normalize-long-nine-pounder"],
    ["hotchkiss-3-pounder", "3-pounder-guns", "normalize-hotchkiss-3-pounder"],
    ["two-pounder-pom-pom", "2-pounder-guns", "normalize-two-pounder-pom-pom"],
    ["qf-2-pounder", "2-pounder-guns", "normalize-qf-2-pounder"],
    ["qf-2-pounder-pom-pom", "2-pounder-guns", "normalize-qf-2-pounder-pom-pom"],
    ["qf-17-pounder", "17-pounder-guns", "normalize-qf-17-pounder"],
    ["pounder-guns", "gun-nomenclature", "normalize-pounder-guns"],
    [
      "forty-two-centimeter-guns",
      "420-mm-guns",
      "normalize-forty-two-centimeter-guns",
    ],
    ["35-centimeter-guns", "350-mm-guns", "normalize-35-centimeter-guns"],
    ["rapid-fire-guns", "quick-firing-guns", "normalize-rapid-fire-guns"],
    ["rapid-firing-guns", "quick-firing-guns", "normalize-rapid-firing-guns"],
  ] as const;

  for (const [input, slug, ruleId] of expected) {
    assert.deepEqual(resolveTopicCreation(catalog, input), {
      input,
      slug,
      changed: true,
      matchedRuleIds: [ruleId],
    });
  }
});

test("production policy applies the reviewed full-corpus singular and plural consolidation", async () => {
  const catalog = await loadTopicNormalizationCatalog(
    "src/derived/topic-normalization-patterns.tsv",
  );
  const fullScanRules = catalog.rules.filter(({ ruleId }) =>
    ruleId.startsWith("normalize-full-scan-"),
  );

  assert.equal(fullScanRules.length, 155);
  for (const rule of fullScanRules) {
    assert.equal(rule.status, "active", rule.ruleId);
    assert.deepEqual(rule.scopes, ["creation"], rule.ruleId);
    assert.equal(rule.matchKind, "exact", rule.ruleId);
    assert.deepEqual(resolveTopicCreation(catalog, rule.match), {
      input: rule.match,
      slug: rule.replacement,
      changed: true,
      matchedRuleIds: [rule.ruleId],
    });
  }

  const expected = [
    ["leander-class-cruiser", "leander-class-cruisers"],
    ["leander-class-frigate", "leander-class-frigates"],
    ["zumwalt-class", "zumwalt-class-destroyers"],
    ["zumwalt-class-destroyer", "zumwalt-class-destroyers"],
    ["alaska-class", "alaska-class-large-cruisers"],
    ["alaska-class-cruisers", "alaska-class-large-cruisers"],
  ] as const;
  for (const [input, slug] of expected) {
    assert.equal(resolveTopicCreation(catalog, input).slug, slug, input);
  }

  assert.deepEqual(resolveTopicCreation(catalog, "leander-class"), {
    input: "leander-class",
    slug: "leander-class",
    changed: false,
    matchedRuleIds: ["review-contextual-leander-class"],
  });
});

test("production policy merges reviewed duplicate topics without guessing ambiguous context", async () => {
  const catalog = await loadTopicNormalizationCatalog(
    "src/derived/topic-normalization-patterns.tsv",
  );
  const expected = [
    ["aav-7", "aav7", "normalize-duplicate-aav-7"],
    ["abdacom", "abda-command", "normalize-duplicate-abdacom"],
    [
      "uncrewed-combat-aircraft",
      "ucav",
      "normalize-duplicate-uncrewed-combat-aircraft",
    ],
    ["v-2", "v-2-rocket", "normalize-duplicate-v-2"],
    ["v-2-rockets", "v-2-rocket", "normalize-duplicate-v-2-rockets"],
    ["n3-battleship-design", "n3-class-battleships", "normalize-duplicate-n3-battleship-design"],
    [
      "queen-elizabeth-class-carrier",
      "queen-elizabeth-class-aircraft-carriers",
      "normalize-duplicate-queen-elizabeth-class-carrier",
    ],
    [
      "queen-elizabeth-class-battleship",
      "queen-elizabeth-class-battleships",
      "normalize-duplicate-queen-elizabeth-class-battleship",
    ],
    ["uss-enterprise-cv6", "uss-enterprise-cv-6", "normalize-duplicate-uss-enterprise-cv6"],
  ] as const;

  for (const [input, slug, ruleId] of expected) {
    assert.deepEqual(resolveTopicCreation(catalog, input), {
      input,
      slug,
      changed: true,
      matchedRuleIds: [ruleId],
    });
  }
  assert.deepEqual(resolveTopicCreation(catalog, "queen-elizabeth-class"), {
    input: "queen-elizabeth-class",
    slug: "queen-elizabeth-class",
    changed: false,
    matchedRuleIds: ["review-contextual-queen-elizabeth-class"],
  });
});

test("production policy uses reviewed official and common display forms", async () => {
  const catalog = await loadTopicNormalizationCatalog(
    "src/derived/topic-normalization-patterns.tsv",
  );
  const expectedTitles = new Map([
    ["aav7", "AAV7"],
    ["abda-command", "ABDA Command"],
    ["abc-1-staff-talks", "U.S.–British Staff Conference (ABC-1)"],
    ["aden-cannon", "ADEN Cannon"],
    ["ub-43", "UB-43"],
    ["sm-u-21", "SM U-21"],
    ["type-ub-iii-submarine", "Type UB III Submarine"],
    ["type-uc-ii-submarine", "Type UC II Submarine"],
    ["uavs", "UAVs"],
    ["ucav", "UCAV"],
    ["uuvs", "UUVs"],
    ["n3-class-battleships", "N3 Class Battleships"],
    ["queen-elizabeth-class-aircraft-carriers", "Queen Elizabeth Class Aircraft Carriers"],
    ["queen-elizabeth-class-battleships", "Queen Elizabeth Class Battleships"],
    ["u-5", "U-5"],
    ["vf-2", "VF-2"],
    ["vfa-2", "VFA-2"],
    ["vmf-214", "VMF-214"],
    ["uc-43", "UC-43"],
    ["uss-enterprise-cv-6", "USS Enterprise (CV-6)"],
    ["uss-enterprise-cvn-65", "USS Enterprise (CVN-65)"],
    ["uss-texas-bb-35", "USS Texas (BB-35)"],
    ["uss-turner-dd-648", "USS Turner (DD-648)"],
    ["v-1-flying-bomb", "V-1 Flying Bomb"],
    ["v-2-rocket", "V-2 Rocket"],
    ["vstol-aircraft", "V/STOL Aircraft"],
    ["vtol-aircraft", "VTOL Aircraft"],
    ["vt-fuzes", "VT Fuzes"],
  ]);

  for (const [slug, title] of expectedTitles) {
    assert.equal(resolveTopicDisplayTitle(catalog, slug).title, title, slug);
  }
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

test("shares collision-key behavior", () => {
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
