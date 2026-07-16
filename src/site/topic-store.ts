import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeTextAtomically } from "../pipeline/atomic-write.js";
import type {
  CuratedTopicSeed,
  CuratedTopicStore,
  CuratedVideoFileSeed,
} from "./curated-seed.js";
import { discoverVideoSegmentShards } from "./video-segment-files.js";

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

const uppercaseTokens = new Set([
  "aew",
  "ai",
  "asw",
  "hms",
  "hmcs",
  "nato",
  "opv",
  "qf",
  "raf",
  "ran",
  "rcn",
  "rnas",
  "uk",
  "us",
  "uss",
  "vls",
]);
const romanNumerals = new Set(["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]);
const adjacentNumericSlugPattern = /(?:^|-)\d+-\d+(?:-|$)/u;

export async function synchronizeCuratedTopicStore(
  inputDirectory: string,
): Promise<SynchronizeTopicStoreResult> {
  const usedSlugs = await collectUsedTopicSlugs(inputDirectory);
  const topicStorePath = join(inputDirectory, "topics.json");
  const existingStore = await readTopicStoreIfPresent(topicStorePath);
  const topics = existingStore?.topics ?? [];
  validateExistingTopics(topics);

  const knownSlugs = new Set(topics.map((topic) => topic.slug));
  const addedSlugs = usedSlugs.filter((slug) => !knownSlugs.has(slug));
  const addedTopics = addedSlugs.map(buildDefaultTopic);
  const effectiveTopics = [...topics, ...addedTopics];

  if (existingStore === undefined || addedSlugs.length > 0) {
    const updatedStore: CuratedTopicStore = {
      schemaVersion: 1,
      topics: effectiveTopics,
    };
    await writeTextAtomically(topicStorePath, `${JSON.stringify(updatedStore, null, 2)}\n`);
  }

  return {
    addedSlugs,
    changed: existingStore === undefined || addedSlugs.length > 0,
    reviewTopics: collectTopicReviewItems(effectiveTopics),
    topicCount: effectiveTopics.length,
    usedTopicCount: usedSlugs.length,
  };
}

export async function collectUsedTopicSlugs(inputDirectory: string): Promise<string[]> {
  const { shards } = await discoverVideoSegmentShards(inputDirectory);
  const slugs = new Set<string>();

  for (const { fileName, value } of shards) {
    const video = value as CuratedVideoFileSeed;
    collectTopicArray(video.topics, `${fileName} video`, slugs);
    if (!Array.isArray(video.segments)) {
      throw new Error(`Curated video file ${fileName} must include a segments array.`);
    }
    for (const segment of video.segments) {
      collectTopicArray(segment.topics, `${fileName} segment ${segment.id}`, slugs);
    }
  }

  return [...slugs].sort((left, right) => left.localeCompare(right));
}

function collectTopicArray(value: unknown, source: string, slugs: Set<string>): void {
  if (!Array.isArray(value)) {
    throw new Error(`${source} must include a topics array.`);
  }
  for (const slug of value) {
    if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
      throw new Error(`${source} references invalid topic slug: ${JSON.stringify(slug)}`);
    }
    slugs.add(slug);
  }
}

async function readTopicStoreIfPresent(path: string): Promise<CuratedTopicStore | undefined> {
  try {
    const store = JSON.parse(await readFile(path, "utf8")) as CuratedTopicStore;
    if (store.schemaVersion !== 1) {
      throw new Error("Curated topic store schemaVersion must be 1.");
    }
    if (!Array.isArray(store.topics)) {
      throw new Error("Curated topic store must include a topics array.");
    }
    return store;
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

function buildDefaultTopic(slug: string): CuratedTopicSeed {
  const title = topicTitleFromSlug(slug);
  return {
    slug,
    title,
    summary: `Watch points covering ${title} across Dr. Alex Clarke's videos.`,
  };
}

export function topicTitleFromSlug(slug: string): string {
  const specialTitles: Readonly<Record<string, string>> = {
    "live-q-and-a": "Live Q&A",
    "u-boats": "U-Boats",
  };
  const specialTitle = specialTitles[slug];
  if (specialTitle !== undefined) {
    return specialTitle;
  }

  const decimalTitle = terminalDecimalInchTitleFromSlug(slug);
  if (decimalTitle !== undefined) {
    return decimalTitle;
  }

  return genericTopicTitleFromSlug(slug);
}

function terminalDecimalInchTitleFromSlug(slug: string): string | undefined {
  const tokens = slug.split("-");
  if (tokens.length < 4) {
    return undefined;
  }

  const [whole, fraction, unit, noun] = tokens.slice(-4);
  if (
    whole === undefined
    || fraction === undefined
    || !/^\d+$/u.test(whole)
    || !/^\d+$/u.test(fraction)
    || unit !== "inch"
    || (noun !== "gun" && noun !== "guns")
  ) {
    return undefined;
  }

  const prefix = formatTopicTokens(tokens.slice(0, -4));
  const calibre = `${whole}.${fraction}-inch ${noun === "gun" ? "Gun" : "Guns"}`;
  return prefix.length > 0 ? `${prefix} ${calibre}` : calibre;
}

function genericTopicTitleFromSlug(slug: string): string {
  return formatTopicTokens(slug.split("-"));
}

function formatTopicTokens(tokens: string[]): string {
  return tokens.map((token) => {
    if (uppercaseTokens.has(token) || romanNumerals.has(token)) {
      return token.toUpperCase();
    }
    return `${token.slice(0, 1).toUpperCase()}${token.slice(1)}`;
  }).join(" ");
}

function collectTopicReviewItems(topics: CuratedTopicSeed[]): TopicReviewItem[] {
  return topics.flatMap((topic) => {
    if (
      !adjacentNumericSlugPattern.test(topic.slug)
      || terminalDecimalInchTitleFromSlug(topic.slug) !== undefined
    ) {
      return [];
    }

    const generatedTitle = genericTopicTitleFromSlug(topic.slug);
    return topic.title === generatedTitle
      ? [{ slug: topic.slug, generatedTitle }]
      : [];
  });
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}
