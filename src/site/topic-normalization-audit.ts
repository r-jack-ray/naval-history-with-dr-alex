import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  parseCuratedTopicStore,
  type CuratedTopicSeed,
} from "../content/schemas/index.js";
import {
  isTopicSlug,
  loadTopicNormalizationCatalog,
  resolveTopicCreation,
  resolveTopicDisplayTitle,
  topicCollisionKey,
  type TopicNormalizationCatalog,
  type TopicNormalizationRule,
} from "./topic-normalization.js";
import { discoverVideoSegmentShards } from "./video-segment-files.js";

export interface AuditTopicNormalizationOptions {
  patternsInput: string;
  segmentsInput: string;
}

export interface TopicNormalizationAuditResult {
  catalog: TopicNormalizationCatalog;
  shardCount: number;
  topicCount: number;
  usedTopicCount: number;
  blockers: string[];
  reviews: string[];
}

/** Audits the steady-state topic policy without writing source or generated data. */
export async function auditTopicNormalization(
  options: AuditTopicNormalizationOptions,
): Promise<TopicNormalizationAuditResult> {
  const catalog = await loadTopicNormalizationCatalog(options.patternsInput);
  const registryPath = join(options.segmentsInput, "topics.json");
  const store = parseTopicStore(await readFile(registryPath, "utf8"), registryPath);
  const { shards } = await discoverVideoSegmentShards(options.segmentsInput);
  const topicsBySlug = new Map(store.topics.map((topic) => [topic.slug, topic]));
  const usedSlugs = new Set<string>();
  const blockers: string[] = [];
  const reviews = new Set<string>();

  for (const shard of shards) {
    auditTopicArray(shard.value.topics, `${shard.fileName} video`, catalog, usedSlugs, blockers, reviews);
    for (const segment of shard.value.segments) {
      auditTopicArray(
        segment.topics,
        `${shard.fileName} segment ${String(segment.id)}`,
        catalog,
        usedSlugs,
        blockers,
        reviews,
      );
    }
  }

  for (const topic of store.topics) {
    auditCreationInput(`Topic registry record ${topic.slug}`, topic.slug, catalog, blockers, reviews);
    const display = resolveTopicDisplayTitle(catalog, topic.slug);
    if (
      (display.resolution === "exact" || display.resolution === "regex")
      && topic.title !== display.title
    ) {
      blockers.push(
        `Topic ${topic.slug} title ${JSON.stringify(topic.title)} does not match active display policy ${JSON.stringify(display.title)}.`,
      );
    }
  }

  for (const slug of usedSlugs) {
    if (!topicsBySlug.has(slug)) {
      blockers.push(`Topic reference ${slug} has no registry record.`);
    }
  }

  auditExactPolicyTargets(catalog, topicsBySlug, blockers);
  const collisionCount = countCrossTopicCollisions(store.topics);
  if (collisionCount > 0) {
    reviews.add(`Topic title/alias collision pairs retained for review: ${collisionCount}.`);
  }

  return {
    catalog,
    shardCount: shards.length,
    topicCount: store.topics.length,
    usedTopicCount: usedSlugs.size,
    blockers: uniqueSorted(blockers),
    reviews: uniqueSorted([...reviews]),
  };
}

function auditTopicArray(
  value: unknown,
  source: string,
  catalog: TopicNormalizationCatalog,
  usedSlugs: Set<string>,
  blockers: string[],
  reviews: Set<string>,
): void {
  if (!Array.isArray(value)) {
    throw new Error(`${source} must include a topics array.`);
  }
  const seen = new Set<string>();
  for (const valueSlug of value) {
    if (typeof valueSlug !== "string" || !isTopicSlug(valueSlug)) {
      throw new Error(`${source} references invalid topic slug: ${JSON.stringify(valueSlug)}.`);
    }
    if (seen.has(valueSlug)) {
      blockers.push(`${source} repeats topic ${valueSlug}.`);
    }
    seen.add(valueSlug);
    usedSlugs.add(valueSlug);
    auditCreationInput(source, valueSlug, catalog, blockers, reviews);
  }
}

function auditCreationInput(
  source: string,
  slug: string,
  catalog: TopicNormalizationCatalog,
  blockers: string[],
  reviews: Set<string>,
): void {
  const resolution = resolveTopicCreation(catalog, slug);
  if (resolution.changed) {
    blockers.push(
      `${source} uses noncanonical topic ${slug}; active creation rule ${resolution.matchedRuleIds.join(", ")} resolves it to ${resolution.slug}.`,
    );
    return;
  }
  for (const ruleId of resolution.matchedRuleIds) {
    const rule = catalog.rules.find((candidate) => candidate.ruleId === ruleId);
    if (rule?.status === "review") {
      reviews.add(`Review rule ${rule.ruleId} remains unresolved for ${slug}: ${rule.notes}.`);
    }
  }
}

function auditExactPolicyTargets(
  catalog: TopicNormalizationCatalog,
  topicsBySlug: ReadonlyMap<string, CuratedTopicSeed>,
  blockers: string[],
): void {
  const rules = catalog.rules.filter((rule) => (
    rule.status === "active"
    && rule.matchKind === "exact"
    && (rule.scopes.includes("creation") || rule.scopes.includes("display"))
  ));
  const byTarget = new Map<string, TopicNormalizationRule[]>();
  for (const rule of rules) {
    const target = rule.scopes.includes("creation") ? rule.replacement : rule.match;
    const targetRules = byTarget.get(target) ?? [];
    targetRules.push(rule);
    byTarget.set(target, targetRules);
  }

  for (const [target, targetRules] of byTarget) {
    const topic = topicsBySlug.get(target);
    if (topic === undefined) {
      continue;
    }
    const canonicalTitle = targetRules.find((rule) => rule.canonicalTitle.length > 0)?.canonicalTitle;
    if (canonicalTitle !== undefined && topic.title !== canonicalTitle) {
      blockers.push(
        `Topic ${target} title ${JSON.stringify(topic.title)} does not match policy title ${JSON.stringify(canonicalTitle)}.`,
      );
    }
    const represented = new Set([topic.title, ...(topic.aliases ?? [])].map(topicCollisionKey));
    for (const alias of targetRules.flatMap((rule) => rule.aliases)) {
      if (!represented.has(topicCollisionKey(alias))) {
        blockers.push(`Topic ${target} does not represent policy alias ${JSON.stringify(alias)}.`);
      }
    }
  }
}

function parseTopicStore(text: string, path: string) {
  return parseCuratedTopicStore(JSON.parse(text) as unknown, `Curated topic store ${path}`);
}

function countCrossTopicCollisions(topics: readonly CuratedTopicSeed[]): number {
  const ownersByKey = new Map<string, Set<string>>();
  for (const topic of topics) {
    for (const value of [topic.title, ...(topic.aliases ?? [])]) {
      const key = topicCollisionKey(value);
      const owners = ownersByKey.get(key) ?? new Set<string>();
      owners.add(topic.slug);
      ownersByKey.set(key, owners);
    }
  }
  let count = 0;
  for (const owners of ownersByKey.values()) {
    count += owners.size * (owners.size - 1) / 2;
  }
  return count;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
