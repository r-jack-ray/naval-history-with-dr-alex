import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeTextAtomically } from "../pipeline/atomic-write.js";
import type {
  CuratedTopicSeed,
  CuratedTopicStore,
  CuratedVideoFileSeed,
} from "./curated-seed.js";
import { auditTopicNormalization } from "./topic-normalization-audit.js";
import {
  defaultTopicSummary,
  loadTopicNormalizationCatalog,
  resolveTopicCreation,
  resolveTopicDisplayTitle,
  topicCollisionKey,
  topicTitleFromSlug as normalizedTopicTitleFromSlug,
  type TopicNormalizationCatalog,
} from "./topic-normalization.js";
import { discoverVideoSegmentShards } from "./video-segment-files.js";

export const defaultTopicNormalizationPatternsInput =
  "src/derived/topic-normalization-patterns.tsv";

export interface SynchronizeTopicStoreResult {
  addedSlugs: string[];
  changed: boolean;
  reviewTopics: TopicReviewItem[];
  topicCount: number;
  usedTopicCount: number;
}

export interface TopicReviewItem {
  slug: string;
  generatedTitle: string;
}

export interface PlanTopicStoreSynchronizationOptions {
  segmentsInput: string;
  patternsInput?: string;
}

export interface TopicStoreSynchronizationPlan extends SynchronizeTopicStoreResult {
  catalog: TopicNormalizationCatalog;
  patternsInput: string;
  topicStorePath: string;
  preimageText: string | undefined;
  postimageText: string;
}

interface TopicCorpusScan {
  usedSlugs: string[];
  policyFindings: string[];
}

const adjacentNumericSlugPattern = /(?:^|-)\d+-\d+(?:-|$)/u;

/**
 * Plans topic-store synchronization without writing source or generated data.
 * Catalog validation and the full normalization preflight intentionally happen
 * before the append-only topic-store plan is returned.
 */
export async function planTopicStoreSynchronization(
  options: PlanTopicStoreSynchronizationOptions,
): Promise<TopicStoreSynchronizationPlan> {
  const patternsInput = options.patternsInput ?? defaultTopicNormalizationPatternsInput;
  const catalog = await loadTopicNormalizationCatalog(patternsInput);
  const corpus = await scanTopicCorpus(options.segmentsInput, catalog);
  const topicStorePath = join(options.segmentsInput, "topics.json");
  const preimageText = await readTextIfPresent(topicStorePath);
  const existingStore = preimageText === undefined
    ? undefined
    : parseTopicStore(preimageText, topicStorePath);
  const topics = existingStore?.topics ?? [];
  validateExistingTopics(topics);

  const knownSlugs = new Set(topics.map((topic) => topic.slug));
  const addedSlugs = corpus.usedSlugs.filter((slug) => !knownSlugs.has(slug));
  const preflightFindings = [...corpus.policyFindings];

  for (const slug of addedSlugs) {
    const creation = resolveTopicCreation(catalog, slug);
    if (creation.changed) {
      preflightFindings.push(
        `New topic ${slug} resolves through active creation rule ${creation.matchedRuleIds.join(", ")} to ${creation.slug}; update the owning shard instead of appending a noncanonical registry record.`,
      );
    }
  }

  if (existingStore !== undefined) {
    const audit = await auditTopicNormalization({
      patternsInput,
      segmentsInput: options.segmentsInput,
    });
    if (
      audit.catalog.sha256 !== catalog.sha256
      || audit.catalog.sourceSha256 !== catalog.sourceSha256
    ) {
      preflightFindings.push(
        `Topic normalization catalog changed while synchronization was being planned: ${patternsInput}.`,
      );
    }
    const appendableSlugs = new Set(addedSlugs.filter((slug) => (
      !resolveTopicCreation(catalog, slug).changed
    )));
    preflightFindings.push(...audit.blockers.filter((blocker) => (
      !isAppendableMissingTopicBlocker(blocker, appendableSlugs)
    )));
    for (const topic of existingStore.topics) {
      const creation = resolveTopicCreation(catalog, topic.slug);
      if (creation.changed) {
        preflightFindings.push(
          `Topic registry record ${topic.slug} resolves through active creation rule ${creation.matchedRuleIds.join(", ")} to ${creation.slug}.`,
        );
      }
    }
  }

  if (preflightFindings.length > 0) {
    throw new Error([
      "Topic normalization preflight failed before topic-store synchronization:",
      ...[...new Set(preflightFindings)].map((finding) => `- ${finding}`),
      "Run the read-only topic-normalization audit and update the owning source data before synchronizing topics.",
    ].join("\n"));
  }

  const addedTopics = addedSlugs.map((slug) => buildDefaultTopic(slug, catalog));
  const effectiveTopics = [...topics, ...addedTopics];
  const updatedStore: CuratedTopicStore = {
    schemaVersion: 1,
    topics: effectiveTopics,
  };
  const postimageText = `${JSON.stringify(updatedStore, null, 2)}\n`;

  return {
    catalog,
    patternsInput,
    topicStorePath,
    preimageText,
    postimageText,
    addedSlugs,
    changed: existingStore === undefined || addedSlugs.length > 0,
    reviewTopics: collectTopicReviewItems(effectiveTopics, catalog),
    topicCount: effectiveTopics.length,
    usedTopicCount: corpus.usedSlugs.length,
  };
}

/** Writes an already validated synchronization plan after checking its preimage. */
export async function writeTopicStoreSynchronization(
  plan: TopicStoreSynchronizationPlan,
): Promise<SynchronizeTopicStoreResult> {
  const currentText = await readTextIfPresent(plan.topicStorePath);
  if (currentText !== plan.preimageText) {
    throw new Error(
      `Topic store changed after normalization preflight: ${plan.topicStorePath}. Re-plan before writing.`,
    );
  }
  if (plan.changed) {
    await writeTextAtomically(plan.topicStorePath, plan.postimageText);
  }
  return synchronizationResultFromPlan(plan);
}

export async function synchronizeCuratedTopicStore(
  inputDirectory: string,
  patternsInput = defaultTopicNormalizationPatternsInput,
): Promise<SynchronizeTopicStoreResult> {
  const plan = await planTopicStoreSynchronization({
    segmentsInput: inputDirectory,
    patternsInput,
  });
  return writeTopicStoreSynchronization(plan);
}

export async function collectUsedTopicSlugs(inputDirectory: string): Promise<string[]> {
  return (await scanTopicCorpus(inputDirectory)).usedSlugs;
}

async function scanTopicCorpus(
  inputDirectory: string,
  catalog?: TopicNormalizationCatalog,
): Promise<TopicCorpusScan> {
  const { shards } = await discoverVideoSegmentShards(inputDirectory);
  const slugs = new Set<string>();
  const policyFindings: string[] = [];

  for (const { fileName, value } of shards) {
    const video = value as CuratedVideoFileSeed;
    collectTopicArray(video.topics, `${fileName} video`, slugs, catalog, policyFindings);
    if (!Array.isArray(video.segments)) {
      throw new Error(`Curated video file ${fileName} must include a segments array.`);
    }
    for (const segment of video.segments) {
      collectTopicArray(
        segment.topics,
        `${fileName} segment ${segment.id}`,
        slugs,
        catalog,
        policyFindings,
      );
    }
  }

  return {
    usedSlugs: [...slugs].sort((left, right) => left.localeCompare(right)),
    policyFindings,
  };
}

function collectTopicArray(
  value: unknown,
  source: string,
  slugs: Set<string>,
  catalog: TopicNormalizationCatalog | undefined,
  policyFindings: string[],
): void {
  if (!Array.isArray(value)) {
    throw new Error(`${source} must include a topics array.`);
  }
  const topics: string[] = [];
  for (const slug of value) {
    if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
      throw new Error(`${source} references invalid topic slug: ${JSON.stringify(slug)}`);
    }
    slugs.add(slug);
    topics.push(slug);
  }
  if (catalog !== undefined) {
    for (const slug of topics) {
      const creation = resolveTopicCreation(catalog, slug);
      if (creation.changed) {
        policyFindings.push(
          `${source} references noncanonical topic ${slug}; active creation rule ${creation.matchedRuleIds.join(", ")} resolves it to ${creation.slug}.`,
        );
      }
    }
  }
}

function parseTopicStore(text: string, path: string): CuratedTopicStore {
  const store = JSON.parse(text) as CuratedTopicStore;
  if (store.schemaVersion !== 1) {
    throw new Error(`Curated topic store schemaVersion must be 1: ${path}.`);
  }
  if (!Array.isArray(store.topics)) {
    throw new Error(`Curated topic store must include a topics array: ${path}.`);
  }
  return store;
}

async function readTextIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function validateExistingTopics(topics: CuratedTopicSeed[]): void {
  const slugs = new Set<string>();
  for (const topic of topics) {
    if (typeof topic.slug !== "string" || topic.slug.length === 0) {
      throw new Error("Every curated topic must include a slug.");
    }
    if (slugs.has(topic.slug)) {
      throw new Error(`Duplicate topic slug: ${topic.slug}`);
    }
    slugs.add(topic.slug);
  }
}

function buildDefaultTopic(
  slug: string,
  catalog: TopicNormalizationCatalog,
): CuratedTopicSeed {
  const policyRules = catalog.rules.filter((rule) => (
    rule.status === "active"
    && rule.matchKind === "exact"
    && (
      rule.scopes.includes("creation") && rule.replacement === slug
      || rule.scopes.includes("display") && rule.match === slug
    )
  ));
  const title = policyRules.find((rule) => rule.canonicalTitle.length > 0)?.canonicalTitle
    ?? normalizedTopicTitleFromSlug(slug, catalog);
  const seenAliases = new Set([topicCollisionKey(title)]);
  const aliases = policyRules.flatMap((rule) => rule.aliases).filter((alias) => {
    const key = topicCollisionKey(alias);
    if (key.length === 0 || seenAliases.has(key)) {
      return false;
    }
    seenAliases.add(key);
    return true;
  });
  const topic: CuratedTopicSeed = {
    slug,
    title,
    summary: defaultTopicSummary(title),
  };
  if (aliases.length > 0) {
    topic.aliases = aliases;
  }
  return topic;
}

export function topicTitleFromSlug(
  slug: string,
  catalog: TopicNormalizationCatalog,
): string {
  return normalizedTopicTitleFromSlug(slug, catalog);
}

function collectTopicReviewItems(
  topics: CuratedTopicSeed[],
  catalog: TopicNormalizationCatalog,
): TopicReviewItem[] {
  return topics.flatMap((topic) => {
    if (!adjacentNumericSlugPattern.test(topic.slug)) {
      return [];
    }
    const display = resolveTopicDisplayTitle(catalog, topic.slug);
    if (display.resolution === "exact" || display.resolution === "regex") {
      return [];
    }
    return topic.title === display.title
      ? [{ slug: topic.slug, generatedTitle: display.title }]
      : [];
  });
}

function isAppendableMissingTopicBlocker(
  blocker: string,
  appendableSlugs: ReadonlySet<string>,
): boolean {
  const match = /^Topic reference ([a-z0-9]+(?:-[a-z0-9]+)*) has no registry record\.$/u.exec(blocker);
  return match?.[1] !== undefined && appendableSlugs.has(match[1]);
}

function synchronizationResultFromPlan(
  plan: TopicStoreSynchronizationPlan,
): SynchronizeTopicStoreResult {
  return {
    addedSlugs: [...plan.addedSlugs],
    changed: plan.changed,
    reviewTopics: plan.reviewTopics.map((topic) => ({ ...topic })),
    topicCount: plan.topicCount,
    usedTopicCount: plan.usedTopicCount,
  };
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}
