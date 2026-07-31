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
  type TopicSlugResolution,
} from "./topic-normalization.js";
import {
  discoverVideoSegmentShards,
  type VideoSegmentShardIndex,
} from "./video-segment-files.js";

export interface AuditTopicNormalizationOptions {
  patternsInput: string;
  precomputedCreationResolutions?: ReadonlyMap<string, TopicSlugResolution>;
  preloadedCatalog?: TopicNormalizationCatalog;
  preloadedShardIndex?: VideoSegmentShardIndex;
  segmentsInput: string;
}

export interface TopicNormalizationRuleReviewFinding {
  kind: "rule";
  ruleId: string;
  slug: string;
  replacement: string;
  canonicalTitle: string;
  notes: string;
  sources: string[];
  action: string;
}

export interface TopicNormalizationCollisionOwner {
  slug: string;
  values: string[];
  sources: string[];
}

export interface TopicNormalizationCollisionReviewFinding {
  kind: "collision";
  collisionKey: string;
  owners: [TopicNormalizationCollisionOwner, TopicNormalizationCollisionOwner];
  action: string;
}

export type TopicNormalizationReviewFinding =
  | TopicNormalizationRuleReviewFinding
  | TopicNormalizationCollisionReviewFinding;

export interface TopicNormalizationAuditResult {
  catalog: TopicNormalizationCatalog;
  shardCount: number;
  topicCount: number;
  usedTopicCount: number;
  blockers: string[];
  reviews: string[];
  reviewFindings: TopicNormalizationReviewFinding[];
}

interface MutableRuleReview {
  rule: TopicNormalizationRule;
  slug: string;
  sources: Set<string>;
}

/** Audits the steady-state topic policy without writing source or generated data. */
export async function auditTopicNormalization(
  options: AuditTopicNormalizationOptions,
): Promise<TopicNormalizationAuditResult> {
  const catalog = options.preloadedCatalog
    ?? await loadTopicNormalizationCatalog(options.patternsInput);
  const registryPath = join(options.segmentsInput, "topics.json");
  const store = parseTopicStore(await readFile(registryPath, "utf8"), registryPath);
  const { shards } = options.preloadedShardIndex
    ?? await discoverVideoSegmentShards(options.segmentsInput);
  const topicsBySlug = new Map(store.topics.map((topic) => [topic.slug, topic]));
  const usedSlugs = new Set<string>();
  const blockers: string[] = [];
  const ruleReviews = new Map<string, MutableRuleReview>();
  const sourcesBySlug = new Map<string, Set<string>>();
  const creationResolutions = new Map(options.precomputedCreationResolutions ?? []);

  for (const shard of shards) {
    auditTopicArray(
      shard.value.topics,
      `${shard.fileName} video`,
      catalog,
      usedSlugs,
      blockers,
      ruleReviews,
      sourcesBySlug,
      creationResolutions,
    );
    for (const segment of shard.value.segments) {
      auditTopicArray(
        segment.topics,
        `${shard.fileName} segment ${String(segment.id)}`,
        catalog,
        usedSlugs,
        blockers,
        ruleReviews,
        sourcesBySlug,
        creationResolutions,
      );
    }
  }

  for (const topic of store.topics) {
    const source = `Topic registry record ${topic.slug}`;
    addTopicSource(sourcesBySlug, topic.slug, source);
    auditCreationInput(
      source,
      topic.slug,
      catalog,
      blockers,
      ruleReviews,
      creationResolutions,
    );
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
  const reviewFindings = [
    ...collectRuleReviewFindings(ruleReviews),
    ...collectCollisionReviewFindings(store.topics, sourcesBySlug),
  ].sort(compareReviewFindings);
  const reviews = reviewFindings.map(formatTopicNormalizationReviewFinding);

  return {
    catalog,
    shardCount: shards.length,
    topicCount: store.topics.length,
    usedTopicCount: usedSlugs.size,
    blockers: uniqueSorted(blockers),
    reviews,
    reviewFindings,
  };
}

function auditTopicArray(
  value: unknown,
  source: string,
  catalog: TopicNormalizationCatalog,
  usedSlugs: Set<string>,
  blockers: string[],
  ruleReviews: Map<string, MutableRuleReview>,
  sourcesBySlug: Map<string, Set<string>>,
  creationResolutions: Map<string, TopicSlugResolution>,
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
    addTopicSource(sourcesBySlug, valueSlug, source);
    auditCreationInput(
      source,
      valueSlug,
      catalog,
      blockers,
      ruleReviews,
      creationResolutions,
    );
  }
}

function auditCreationInput(
  source: string,
  slug: string,
  catalog: TopicNormalizationCatalog,
  blockers: string[],
  ruleReviews: Map<string, MutableRuleReview>,
  creationResolutions: Map<string, TopicSlugResolution>,
): void {
  const resolution = creationResolutions.get(slug)
    ?? resolveTopicCreation(catalog, slug);
  creationResolutions.set(slug, resolution);
  if (resolution.changed) {
    blockers.push(
      `${source} uses noncanonical topic ${slug}; active creation rule ${resolution.matchedRuleIds.join(", ")} resolves it to ${resolution.slug}.`,
    );
    return;
  }
  for (const ruleId of resolution.matchedRuleIds) {
    const rule = catalog.rules.find((candidate) => candidate.ruleId === ruleId);
    if (rule?.status === "review") {
      const key = `${rule.ruleId}\u0000${slug}`;
      const review = ruleReviews.get(key) ?? {
        rule,
        slug,
        sources: new Set<string>(),
      };
      review.sources.add(source);
      ruleReviews.set(key, review);
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

function collectRuleReviewFindings(
  reviews: ReadonlyMap<string, MutableRuleReview>,
): TopicNormalizationRuleReviewFinding[] {
  return [...reviews.values()].map(({ rule, slug, sources }) => ({
    kind: "rule",
    ruleId: rule.ruleId,
    slug,
    replacement: rule.replacement,
    canonicalTitle: rule.canonicalTitle,
    notes: rule.notes,
    sources: [...sources].sort((left, right) => left.localeCompare(right)),
    action: rule.replacement === slug
      ? `Replace ${slug} with context-specific topic slug(s), or retain it only through an explicitly approved contextual exception.`
      : `Inspect every source before mapping ${slug} to ${rule.replacement}; promote the rule to active only if one global mapping is valid.`,
  }));
}

function collectCollisionReviewFindings(
  topics: readonly CuratedTopicSeed[],
  sourcesBySlug: ReadonlyMap<string, ReadonlySet<string>>,
): TopicNormalizationCollisionReviewFinding[] {
  const ownersByKey = new Map<string, Map<string, Set<string>>>();
  for (const topic of topics) {
    for (const value of [topic.title, ...(topic.aliases ?? [])]) {
      const key = topicCollisionKey(value);
      const owners = ownersByKey.get(key) ?? new Map<string, Set<string>>();
      const values = owners.get(topic.slug) ?? new Set<string>();
      values.add(value);
      owners.set(topic.slug, values);
      ownersByKey.set(key, owners);
    }
  }

  const findings: TopicNormalizationCollisionReviewFinding[] = [];
  for (const [collisionKey, owners] of ownersByKey) {
    const slugs = [...owners.keys()].sort((left, right) => left.localeCompare(right));
    for (let leftIndex = 0; leftIndex < slugs.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < slugs.length; rightIndex += 1) {
        const leftSlug = slugs[leftIndex]!;
        const rightSlug = slugs[rightIndex]!;
        findings.push({
          kind: "collision",
          collisionKey,
          owners: [
            collisionOwner(leftSlug, owners.get(leftSlug), sourcesBySlug),
            collisionOwner(rightSlug, owners.get(rightSlug), sourcesBySlug),
          ],
          action: "Choose one canonical topic and migrate the other slug, or rename/remove the conflicting title or alias when the topics are intentionally distinct.",
        });
      }
    }
  }
  return findings;
}

function collisionOwner(
  slug: string,
  values: ReadonlySet<string> | undefined,
  sourcesBySlug: ReadonlyMap<string, ReadonlySet<string>>,
): TopicNormalizationCollisionOwner {
  return {
    slug,
    values: [...(values ?? [])].sort((left, right) => left.localeCompare(right)),
    sources: [...(sourcesBySlug.get(slug) ?? [])].sort((left, right) => left.localeCompare(right)),
  };
}

function addTopicSource(
  sourcesBySlug: Map<string, Set<string>>,
  slug: string,
  source: string,
): void {
  const sources = sourcesBySlug.get(slug) ?? new Set<string>();
  sources.add(source);
  sourcesBySlug.set(slug, sources);
}

function compareReviewFindings(
  left: TopicNormalizationReviewFinding,
  right: TopicNormalizationReviewFinding,
): number {
  if (left.kind !== right.kind) {
    return left.kind === "rule" ? -1 : 1;
  }
  if (left.kind === "rule" && right.kind === "rule") {
    return left.ruleId.localeCompare(right.ruleId) || left.slug.localeCompare(right.slug);
  }
  if (left.kind === "collision" && right.kind === "collision") {
    return left.collisionKey.localeCompare(right.collisionKey)
      || left.owners[0].slug.localeCompare(right.owners[0].slug)
      || left.owners[1].slug.localeCompare(right.owners[1].slug);
  }
  return 0;
}

export function formatTopicNormalizationReviewFinding(
  finding: TopicNormalizationReviewFinding,
): string {
  if (finding.kind === "rule") {
    const candidate = finding.replacement === finding.slug
      ? ""
      : `\n  Candidate: ${finding.slug} -> ${finding.replacement}`
        + (finding.canonicalTitle.length > 0 ? ` (${JSON.stringify(finding.canonicalTitle)})` : "");
    return `Rule ${finding.ruleId} matched ${finding.slug}.${candidate}\n`
      + `  Notes: ${finding.notes}\n`
      + `  Sources (${finding.sources.length}):\n`
      + `${finding.sources.map((source) => `    - ${source}`).join("\n")}\n`
      + `  Action: ${finding.action}`;
  }

  const [left, right] = finding.owners;
  return `Title/alias collision ${JSON.stringify(finding.collisionKey)}.\n`
    + `  Topic: ${left.slug} via ${left.values.map((value) => JSON.stringify(value)).join(", ")}\n`
    + `    Sources (${left.sources.length}): ${left.sources.join(" | ")}\n`
    + `  Topic: ${right.slug} via ${right.values.map((value) => JSON.stringify(value)).join(", ")}\n`
    + `    Sources (${right.sources.length}): ${right.sources.join(" | ")}\n`
    + `  Action: ${finding.action}`;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
