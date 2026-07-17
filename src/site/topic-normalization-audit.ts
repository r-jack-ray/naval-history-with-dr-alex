import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { CuratedTopicSeed, CuratedTopicStore, CuratedVideoFileSeed } from "./curated-seed.js";
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
    const video = shard.value as CuratedVideoFileSeed;
    auditTopicArray(video.topics, `${shard.fileName} video`, catalog, usedSlugs, blockers, reviews);
    if (!Array.isArray(video.segments)) {
      throw new Error(`Curated video file ${shard.fileName} must include a segments array.`);
    }
    for (const segment of video.segments) {
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

function parseTopicStore(text: string, path: string): CuratedTopicStore {
  const value = JSON.parse(text) as unknown;
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.topics)) {
    throw new Error(`Curated topic store must use schemaVersion 1 and contain topics: ${path}.`);
  }
  const topics: CuratedTopicSeed[] = [];
  const slugs = new Set<string>();
  for (const candidate of value.topics) {
    if (
      !isRecord(candidate)
      || typeof candidate.slug !== "string"
      || !isTopicSlug(candidate.slug)
      || slugs.has(candidate.slug)
      || typeof candidate.title !== "string"
      || candidate.title.length === 0
      || typeof candidate.summary !== "string"
      || candidate.summary.length === 0
      || (
        candidate.aliases !== undefined
        && (!Array.isArray(candidate.aliases) || candidate.aliases.some((alias) => typeof alias !== "string"))
      )
    ) {
      throw new Error(`Curated topic store has an invalid or duplicate record: ${path}.`);
    }
    slugs.add(candidate.slug);
    topics.push(candidate as unknown as CuratedTopicSeed);
  }
  return { schemaVersion: 1, topics };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
