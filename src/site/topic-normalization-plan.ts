import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { CuratedTopicSeed, CuratedTopicStore } from "./curated-seed.js";
import {
  defaultTopicSummary,
  getActiveLegacyRedirects,
  isDefaultTopicSummary,
  loadTopicNormalizationCatalog,
  normalizeTopicSlugArray,
  resolveTopicDisplayTitle,
  topicCollisionKey,
  type ActiveLegacyTopicRedirect,
  type TopicNormalizationCatalog,
  type TopicNormalizationRule,
} from "./topic-normalization.js";
import {
  editTopicArraysPreservingFormatting,
  inspectTopicArrays,
  topicArrayPathKey,
  type TopicArrayPath,
} from "./topic-array-editor.js";
import { discoverVideoSegmentShards } from "./video-segment-files.js";

export interface BuildTopicNormalizationPlanOptions {
  patternsInput: string;
  segmentsInput: string;
}

export interface TopicNormalizationInputRecord {
  path: string;
  preimageSha256: string;
}

export interface TopicNormalizationRuleStats {
  ruleId: string;
  sourceSlug: string;
  canonicalSlug: string;
  topLevelReferences: number;
  segmentReferences: number;
  shardCount: number;
  sourceRegistryRecord: boolean;
}

export interface TopicNormalizationArrayOperation {
  path: string;
  before: string[];
  after: string[];
  migrations: Array<{ from: string; to: string; ruleId: string }>;
  removedDuplicates: string[];
}

export interface TopicNormalizationFileOperation {
  path: string;
  kind: "shard" | "registry";
  preimageSha256: string;
  postimageSha256: string;
  arrays?: TopicNormalizationArrayOperation[];
  removedRegistrySlugs?: string[];
  addedRegistrySlugs?: string[];
  changedRegistrySlugs?: string[];
}

export interface TopicNormalizationReviewedPlan {
  schemaVersion: 1;
  catalog: {
    path: string;
    sha256: string;
    sourceSha256: string;
    rules: TopicNormalizationRule[];
  };
  segmentsInput: string;
  inputs: TopicNormalizationInputRecord[];
  operations: TopicNormalizationFileOperation[];
  ruleStats: TopicNormalizationRuleStats[];
  redirects: ActiveLegacyTopicRedirect[];
  warnings: string[];
  reviews: string[];
  blockers: string[];
  digest: string;
}

export interface BuiltTopicNormalizationPlan {
  reviewedPlan: TopicNormalizationReviewedPlan;
  catalog: TopicNormalizationCatalog;
  preimages: ReadonlyMap<string, string>;
  postimages: ReadonlyMap<string, string>;
  expandedRegistryText: string;
  registryPath: string;
}

interface MutableRuleStats extends TopicNormalizationRuleStats {
  shards: Set<string>;
}

const legacyUppercaseTokens = new Set([
  "aew", "ai", "asw", "hms", "hmcs", "nato", "opv", "qf", "raf", "ran",
  "rcn", "rnas", "uk", "us", "uss", "vls",
]);
const romanNumerals = new Set(["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]);

export async function buildTopicNormalizationPlan(
  options: BuildTopicNormalizationPlanOptions,
): Promise<BuiltTopicNormalizationPlan> {
  const catalog = await loadTopicNormalizationCatalog(options.patternsInput);
  const registryPath = join(options.segmentsInput, "topics.json");
  const [patternsText, registryText, shardIndex] = await Promise.all([
    readFile(options.patternsInput, "utf8"),
    readFile(registryPath, "utf8"),
    discoverVideoSegmentShards(options.segmentsInput),
  ]);
  const store = parseTopicStore(registryText, registryPath);
  const migrationRules = catalog.rules.filter((rule) => (
    rule.status === "active" && rule.scopes.includes("migration") && rule.matchKind === "exact"
  ));
  const ruleStatsById = new Map<string, MutableRuleStats>(migrationRules.map((rule) => [
    rule.ruleId,
    {
      ruleId: rule.ruleId,
      sourceSlug: rule.match,
      canonicalSlug: rule.replacement,
      topLevelReferences: 0,
      segmentReferences: 0,
      shardCount: 0,
      sourceRegistryRecord: store.topics.some((topic) => topic.slug === rule.match),
      shards: new Set<string>(),
    },
  ]));
  const preimages = new Map<string, string>([
    [normalizePath(options.patternsInput), patternsText],
    [normalizePath(registryPath), registryText],
  ]);
  const postimages = new Map<string, string>();
  const operations: TopicNormalizationFileOperation[] = [];
  const usedBefore = new Set<string>();
  const usedAfter = new Set<string>();

  for (const shard of shardIndex.shards) {
    const shardPath = normalizePath(shard.filePath);
    const text = await readFile(shard.filePath, "utf8");
    preimages.set(shardPath, text);
    const updates: Array<{ path: TopicArrayPath; topics: string[] }> = [];
    const arrayOperations: TopicNormalizationArrayOperation[] = [];

    for (const location of inspectTopicArrays(text, shard.filePath)) {
      for (const slug of location.topics) {
        usedBefore.add(slug);
      }
      const resolved = normalizeTopicSlugArray(catalog, location.topics);
      for (const slug of resolved.topics) {
        usedAfter.add(slug);
      }
      for (const migration of resolved.migrations) {
        const stats = ruleStatsById.get(migration.ruleId);
        if (stats !== undefined) {
          if (location.kind === "video") {
            stats.topLevelReferences += 1;
          } else {
            stats.segmentReferences += 1;
          }
          stats.shards.add(shardPath);
        }
      }
      if (!resolved.changed) {
        continue;
      }
      updates.push({ path: location.path, topics: resolved.topics });
      arrayOperations.push({
        path: topicArrayPathKey(location.path),
        before: [...location.topics],
        after: [...resolved.topics],
        migrations: resolved.migrations.map(({ from, to, ruleId }) => ({ from, to, ruleId })),
        removedDuplicates: resolved.removedDuplicates.map(({ slug }) => slug),
      });
    }

    const edited = editTopicArraysPreservingFormatting(text, updates, shard.filePath);
    if (edited.changed) {
      postimages.set(shardPath, edited.text);
      operations.push({
        path: shardPath,
        kind: "shard",
        preimageSha256: sha256(text),
        postimageSha256: sha256(edited.text),
        arrays: arrayOperations,
      });
    }
  }

  const blockers: string[] = [];
  const warnings: string[] = [];
  const reviews: string[] = [];
  const registryResult = normalizeRegistry(store.topics, catalog, usedBefore, blockers);
  const finalStore: CuratedTopicStore = { schemaVersion: 1, topics: registryResult.finalTopics };
  const expandedStore: CuratedTopicStore = { schemaVersion: 1, topics: registryResult.expandedTopics };
  const finalRegistryText = canonicalJson(finalStore);
  const expandedRegistryText = canonicalJson(expandedStore);
  if (finalRegistryText !== registryText) {
    postimages.set(normalizePath(registryPath), finalRegistryText);
    operations.push({
      path: normalizePath(registryPath),
      kind: "registry",
      preimageSha256: sha256(registryText),
      postimageSha256: sha256(finalRegistryText),
      removedRegistrySlugs: registryResult.removedSlugs,
      addedRegistrySlugs: registryResult.addedSlugs,
      changedRegistrySlugs: registryResult.changedSlugs,
    });
  }

  const registryBeforeSlugs = new Set(store.topics.map((topic) => topic.slug));
  const registryAfterSlugs = new Set(registryResult.finalTopics.map((topic) => topic.slug));
  for (const slug of usedBefore) {
    if (!registryBeforeSlugs.has(slug)) {
      blockers.push(`Live topic reference ${slug} has no registry record before normalization.`);
    }
  }
  for (const slug of usedAfter) {
    if (!registryAfterSlugs.has(slug)) {
      blockers.push(`Normalized topic reference ${slug} has no canonical registry record.`);
    }
  }

  const activeSourceSlugs = new Set(migrationRules.map((rule) => rule.match));
  for (const topic of registryResult.finalTopics) {
    if (activeSourceSlugs.has(topic.slug)) {
      blockers.push(`Deprecated topic registry record remains after planning: ${topic.slug}.`);
    }
  }
  for (const slug of usedAfter) {
    if (activeSourceSlugs.has(slug)) {
      blockers.push(`Deprecated topic reference remains after planning: ${slug}.`);
    }
  }

  collectCollisionFindings(store.topics, registryResult.finalTopics, reviews, blockers);
  collectReviewRuleFindings(catalog, store.topics, usedBefore, reviews);
  for (const rule of migrationRules) {
    const stats = ruleStatsById.get(rule.ruleId);
    if (
      stats !== undefined
      && stats.topLevelReferences === 0
      && stats.segmentReferences === 0
      && !stats.sourceRegistryRecord
      && rule.legacyRoute !== "redirect"
    ) {
      warnings.push(`Active rule ${rule.ruleId} matched no reference or registry record.`);
    }
  }

  const inputs = [...preimages.entries()].map(([path, text]) => ({
    path,
    preimageSha256: sha256(text),
  })).sort((left, right) => left.path.localeCompare(right.path));
  operations.sort((left, right) => left.path.localeCompare(right.path));
  const ruleStats = [...ruleStatsById.values()].map((stats) => ({
    ruleId: stats.ruleId,
    sourceSlug: stats.sourceSlug,
    canonicalSlug: stats.canonicalSlug,
    topLevelReferences: stats.topLevelReferences,
    segmentReferences: stats.segmentReferences,
    shardCount: stats.shards.size,
    sourceRegistryRecord: stats.sourceRegistryRecord,
  })).sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  const planWithoutDigest = {
    schemaVersion: 1 as const,
    catalog: {
      path: normalizePath(options.patternsInput),
      sha256: catalog.sha256,
      sourceSha256: catalog.sourceSha256,
      rules: catalog.rules.map((rule) => ({ ...rule, scopes: [...rule.scopes], aliases: [...rule.aliases] })),
    },
    segmentsInput: normalizePath(options.segmentsInput),
    inputs,
    operations,
    ruleStats,
    redirects: getActiveLegacyRedirects(catalog),
    warnings: uniqueSorted(warnings),
    reviews: uniqueSorted(reviews),
    blockers: uniqueSorted(blockers),
  };
  const digest = sha256(canonicalJson(planWithoutDigest));
  const reviewedPlan: TopicNormalizationReviewedPlan = { ...planWithoutDigest, digest };

  return {
    reviewedPlan,
    catalog,
    preimages,
    postimages,
    expandedRegistryText,
    registryPath: normalizePath(registryPath),
  };
}

export function canonicalTopicNormalizationPlanJson(
  plan: TopicNormalizationReviewedPlan,
): string {
  return canonicalJson(plan);
}

export function validateReviewedTopicNormalizationPlan(
  value: unknown,
): asserts value is TopicNormalizationReviewedPlan {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.digest !== "string") {
    throw new Error("Reviewed topic-normalization plan must use schemaVersion 1 and include a digest.");
  }
  const { digest, ...withoutDigest } = value;
  if (!/^[a-f0-9]{64}$/u.test(digest) || sha256(canonicalJson(withoutDigest)) !== digest) {
    throw new Error("Reviewed topic-normalization plan digest does not match its canonical content.");
  }
  if (
    !isRecord(value.catalog)
    || typeof value.catalog.sha256 !== "string"
    || typeof value.catalog.sourceSha256 !== "string"
    || !Array.isArray(value.catalog.rules)
  ) {
    throw new Error("Reviewed topic-normalization plan catalog provenance is invalid.");
  }
  if (!Array.isArray(value.inputs) || !Array.isArray(value.operations) || !Array.isArray(value.blockers)) {
    throw new Error("Reviewed topic-normalization plan arrays are invalid.");
  }
}

function normalizeRegistry(
  topics: CuratedTopicSeed[],
  catalog: TopicNormalizationCatalog,
  usedBefore: ReadonlySet<string>,
  blockers: string[],
): {
  finalTopics: CuratedTopicSeed[];
  expandedTopics: CuratedTopicSeed[];
  removedSlugs: string[];
  addedSlugs: string[];
  changedSlugs: string[];
} {
  const bySlug = new Map(topics.map((topic) => [topic.slug, topic]));
  const migrationRules = catalog.rules.filter((rule) => (
    rule.status === "active" && rule.scopes.includes("migration") && rule.matchKind === "exact"
  ));
  const sourceToTarget = new Map(migrationRules.map((rule) => [rule.match, rule.replacement]));
  const rulesByTarget = groupRulesByTarget(migrationRules);
  const exactDisplayBySlug = new Map(catalog.rules.filter((rule) => (
    rule.status === "active"
    && rule.scopes.includes("display")
    && rule.matchKind === "exact"
  )).map((rule) => [rule.match, rule]));
  const titleOwners = new Map<string, Set<string>>();
  for (const topic of topics) {
    const key = topicCollisionKey(topic.title);
    const owners = titleOwners.get(key) ?? new Set<string>();
    owners.add(topic.slug);
    titleOwners.set(key, owners);
  }
  const aliasOwner = new Map<string, string>();
  for (const rule of catalog.rules.filter((candidate) => candidate.status === "active")) {
    const target = rule.scopes.includes("migration") ? rule.replacement : rule.match;
    for (const alias of rule.aliases) {
      const key = topicCollisionKey(alias);
      const previous = aliasOwner.get(key);
      if (previous !== undefined && previous !== target) {
        blockers.push(`Active normalization aliases collide across ${previous} and ${target}: ${alias}.`);
      } else {
        aliasOwner.set(key, target);
      }
    }
  }

  const canonicalRecords = new Map<string, CuratedTopicSeed>();
  for (const [target, rules] of rulesByTarget) {
    const members = [bySlug.get(target), ...rules.map((rule) => bySlug.get(rule.match))]
      .filter((topic): topic is CuratedTopicSeed => topic !== undefined);
    const hasReferencedSource = rules.some((rule) => usedBefore.has(rule.match));
    if (members.length === 0 && !hasReferencedSource) {
      continue;
    }
    for (const rule of rules) {
      if (usedBefore.has(rule.match) && !bySlug.has(rule.match)) {
        blockers.push(`Mapped source ${rule.match} is referenced but has no registry metadata.`);
      }
    }
    const existing = bySlug.get(target);
    const canonicalTitle = rules[0]?.canonicalTitle || resolveTopicDisplayTitle(catalog, target).title;
    const nonDefaultSummaries = uniqueSorted(members.filter((topic) => (
      !isDefaultTopicSummary(topic.summary, topic.title)
    )).map((topic) => topic.summary));
    if (nonDefaultSummaries.length > 1) {
      blockers.push(`Canonical family ${target} has conflicting curated summaries: ${nonDefaultSummaries.join(" | ")}.`);
    }
    const summary = nonDefaultSummaries[0] ?? defaultTopicSummary(canonicalTitle);
    const aliases = mergeAliases({
      slug: target,
      title: canonicalTitle,
      currentAliases: existing?.aliases ?? [],
      ruleAliases: [
        ...(exactDisplayBySlug.get(target)?.aliases ?? []),
        ...rules.flatMap((rule) => rule.aliases),
      ],
      titleOwners,
      aliasOwner,
    });
    canonicalRecords.set(target, topicRecord(target, canonicalTitle, summary, aliases));
  }

  const normalizedBySlug = new Map<string, CuratedTopicSeed>();
  for (const topic of topics) {
    const canonical = canonicalRecords.get(topic.slug);
    if (canonical !== undefined) {
      normalizedBySlug.set(topic.slug, canonical);
      continue;
    }
    if (sourceToTarget.has(topic.slug)) {
      continue;
    }
    const display = resolveTopicDisplayTitle(catalog, topic.slug);
    const ownsTitle = display.resolution === "exact" || display.resolution === "regex";
    const tokenGenerated = display.resolution === "token" && topic.title === legacyTopicTitleFromSlug(topic.slug);
    const title = ownsTitle || tokenGenerated ? display.title : topic.title;
    const summary = title !== topic.title && isDefaultTopicSummary(topic.summary, topic.title)
      ? defaultTopicSummary(title)
      : topic.summary;
    const displayRule = exactDisplayBySlug.get(topic.slug);
    const aliases = displayRule === undefined
      ? [...(topic.aliases ?? [])]
      : mergeAliases({
        slug: topic.slug,
        title,
        currentAliases: topic.aliases ?? [],
        ruleAliases: displayRule.aliases,
        titleOwners,
        aliasOwner,
      });
    normalizedBySlug.set(topic.slug, topicRecord(topic.slug, title, summary, aliases));
  }

  const missingTargets = new Set([...canonicalRecords.keys()].filter((slug) => !bySlug.has(slug)));
  const inserted = new Set<string>();
  const finalTopics: CuratedTopicSeed[] = [];
  const expandedTopics: CuratedTopicSeed[] = [];
  for (const topic of topics) {
    const target = sourceToTarget.get(topic.slug);
    if (target !== undefined && missingTargets.has(target) && !inserted.has(target)) {
      const canonical = canonicalRecords.get(target);
      if (canonical !== undefined) {
        finalTopics.push(canonical);
        expandedTopics.push(canonical);
        inserted.add(target);
      }
    }
    if (target !== undefined) {
      expandedTopics.push(topic);
      continue;
    }
    const normalized = normalizedBySlug.get(topic.slug) ?? topic;
    finalTopics.push(normalized);
    expandedTopics.push(normalized);
  }

  const removedSlugs = topics.map((topic) => topic.slug).filter((slug) => sourceToTarget.has(slug));
  const addedSlugs = finalTopics.map((topic) => topic.slug).filter((slug) => !bySlug.has(slug));
  const changedSlugs = finalTopics.filter((topic) => {
    const before = bySlug.get(topic.slug);
    return before !== undefined && JSON.stringify(before) !== JSON.stringify(topic);
  }).map((topic) => topic.slug);
  return {
    finalTopics,
    expandedTopics,
    removedSlugs: removedSlugs.sort(),
    addedSlugs: addedSlugs.sort(),
    changedSlugs: changedSlugs.sort(),
  };
}

function mergeAliases(input: {
  slug: string;
  title: string;
  currentAliases: readonly string[];
  ruleAliases: readonly string[];
  titleOwners: ReadonlyMap<string, ReadonlySet<string>>;
  aliasOwner: ReadonlyMap<string, string>;
}): string[] {
  const result: string[] = [];
  const seen = new Set<string>([topicCollisionKey(input.title)]);
  const approved = new Set(input.ruleAliases.map(topicCollisionKey));
  const add = (alias: string): void => {
    const key = topicCollisionKey(alias);
    if (key.length === 0 || seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(alias);
  };
  for (const alias of input.ruleAliases) {
    add(alias);
  }
  for (const alias of input.currentAliases) {
    const key = topicCollisionKey(alias);
    const ownedElsewhere = input.aliasOwner.get(key);
    const otherTitle = [...(input.titleOwners.get(key) ?? [])].some((slug) => slug !== input.slug);
    if (!approved.has(key) && (ownedElsewhere !== undefined && ownedElsewhere !== input.slug || otherTitle)) {
      continue;
    }
    add(alias);
  }
  return result;
}

function collectReviewRuleFindings(
  catalog: TopicNormalizationCatalog,
  topics: readonly CuratedTopicSeed[],
  usedSlugs: ReadonlySet<string>,
  reviews: string[],
): void {
  const registrySlugs = new Set(topics.map((topic) => topic.slug));
  for (const rule of catalog.rules.filter((candidate) => candidate.status === "review")) {
    if (rule.matchKind === "exact" && (registrySlugs.has(rule.match) || usedSlugs.has(rule.match))) {
      reviews.push(`Review rule ${rule.ruleId} remains unresolved for ${rule.match}: ${rule.notes}.`);
    }
  }
}

function collectCollisionFindings(
  before: readonly CuratedTopicSeed[],
  after: readonly CuratedTopicSeed[],
  reviews: string[],
  blockers: string[],
): void {
  const beforeCollisions = collisionPairs(before);
  const afterCollisions = collisionPairs(after);
  if (beforeCollisions.size > 0) {
    reviews.push(`Pre-existing topic title/alias collision pairs retained for review: ${beforeCollisions.size}.`);
  }
  for (const pair of afterCollisions) {
    if (!beforeCollisions.has(pair)) {
      blockers.push(`Normalization introduces a new cross-topic title/alias collision: ${pair}.`);
    }
  }
}

function collisionPairs(topics: readonly CuratedTopicSeed[]): Set<string> {
  const values = new Map<string, Set<string>>();
  for (const topic of topics) {
    for (const value of [topic.title, ...(topic.aliases ?? [])]) {
      const key = topicCollisionKey(value);
      const owners = values.get(key) ?? new Set<string>();
      owners.add(topic.slug);
      values.set(key, owners);
    }
  }
  const pairs = new Set<string>();
  for (const [key, owners] of values) {
    const sorted = [...owners].sort();
    for (let left = 0; left < sorted.length; left += 1) {
      for (let right = left + 1; right < sorted.length; right += 1) {
        pairs.add(`${key}: ${sorted[left]} <> ${sorted[right]}`);
      }
    }
  }
  return pairs;
}

function groupRulesByTarget(
  rules: readonly TopicNormalizationRule[],
): Map<string, TopicNormalizationRule[]> {
  const result = new Map<string, TopicNormalizationRule[]>();
  for (const rule of rules) {
    const current = result.get(rule.replacement) ?? [];
    current.push(rule);
    result.set(rule.replacement, current);
  }
  return result;
}

function topicRecord(slug: string, title: string, summary: string, aliases: string[]): CuratedTopicSeed {
  return aliases.length === 0 ? { slug, title, summary } : { slug, title, summary, aliases };
}

function legacyTopicTitleFromSlug(slug: string): string {
  if (slug === "live-q-and-a") return "Live Q&A";
  if (slug === "u-boats") return "U-Boats";
  const tokens = slug.split("-");
  const tail = tokens.slice(-4);
  if (
    tail.length === 4
    && /^\d+$/u.test(tail[0] ?? "")
    && /^\d+$/u.test(tail[1] ?? "")
    && tail[2] === "inch"
    && (tail[3] === "gun" || tail[3] === "guns")
  ) {
    const prefix = formatLegacyTokens(tokens.slice(0, -4));
    const calibre = `${tail[0]}.${tail[1]}-inch ${tail[3] === "gun" ? "Gun" : "Guns"}`;
    return prefix.length > 0 ? `${prefix} ${calibre}` : calibre;
  }
  return formatLegacyTokens(tokens);
}

function formatLegacyTokens(tokens: readonly string[]): string {
  return tokens.map((token) => (
    legacyUppercaseTokens.has(token) || romanNumerals.has(token)
      ? token.toUpperCase()
      : `${token.slice(0, 1).toUpperCase()}${token.slice(1)}`
  )).join(" ");
}

function parseTopicStore(text: string, path: string): CuratedTopicStore {
  const value = JSON.parse(text) as CuratedTopicStore;
  if (value.schemaVersion !== 1 || !Array.isArray(value.topics)) {
    throw new Error(`Curated topic store must use schemaVersion 1 and contain topics: ${path}.`);
  }
  const slugs = new Set<string>();
  for (const topic of value.topics) {
    if (typeof topic.slug !== "string" || slugs.has(topic.slug)) {
      throw new Error(`Curated topic store has an invalid or duplicate slug: ${String(topic.slug)}.`);
    }
    if (typeof topic.title !== "string" || typeof topic.summary !== "string") {
      throw new Error(`Curated topic ${topic.slug} must contain title and summary strings.`);
    }
    if (topic.aliases !== undefined && (!Array.isArray(topic.aliases) || topic.aliases.some((alias) => typeof alias !== "string"))) {
      throw new Error(`Curated topic ${topic.slug} aliases must be strings.`);
    }
    slugs.add(topic.slug);
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
