#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import {
  getActiveLegacyRedirects,
  loadTopicNormalizationCatalog,
} from "../site/topic-normalization.js";

const siteDist = "site/dist";
const generatedManifestPath = "site/src/data/generated/archive/index.json";
const generatedTopicsPath = "site/src/data/generated/archive/topics.json";
const patternsPath = "src/derived/topic-normalization-patterns.tsv";
const pagefindRoot = join(siteDist, "pagefind");
const publicSiteBase = "https://r-jack-ray.github.io/naval-history-with-dr-alex/";
const topicSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

interface GeneratedTopic {
  slug: string;
  title: string;
  legacySlugs: string[];
  videoCount: number;
  segmentCount: number;
}

interface PagefindFragment {
  url: string;
}

async function main(): Promise<void> {
  const topics = await readGeneratedTopics();
  const catalog = await loadTopicNormalizationCatalog(patternsPath);
  await validateGeneratedProvenance(catalog.sha256, catalog.sourceSha256);
  const activeRedirects = getActiveLegacyRedirects(catalog);
  const canonicalSlugs = new Set<string>();
  const legacyTargets = new Map<string, GeneratedTopic>();

  for (const topic of topics) {
    validateGeneratedTopic(topic);
    if (canonicalSlugs.has(topic.slug)) {
      throw new Error(`Generated topics repeat canonical slug ${topic.slug}.`);
    }
    canonicalSlugs.add(topic.slug);
  }

  for (const topic of topics) {
    for (const legacySlug of topic.legacySlugs) {
      if (canonicalSlugs.has(legacySlug) || legacyTargets.has(legacySlug)) {
        throw new Error(`Generated topics contain a colliding legacy route ${legacySlug}.`);
      }
      legacyTargets.set(legacySlug, topic);
    }
  }

  const activeRedirectTargets = new Map(
    activeRedirects.map((redirect) => [redirect.legacySlug, redirect.canonicalSlug]),
  );
  if (activeRedirectTargets.size !== legacyTargets.size) {
    throw new Error(
      `Generated topics expose ${legacyTargets.size} legacy routes for ${activeRedirectTargets.size} active catalog redirects.`,
    );
  }
  for (const [legacySlug, canonicalSlug] of activeRedirectTargets) {
    if (legacyTargets.get(legacySlug)?.slug !== canonicalSlug) {
      throw new Error(
        `Generated legacy route ${legacySlug} does not target catalog canonical topic ${canonicalSlug}.`,
      );
    }
  }

  await validateRenderedRouteSet(canonicalSlugs, new Set(legacyTargets.keys()));

  const checkedCanonicalTargets = new Set<string>();
  for (const [legacySlug, topic] of legacyTargets) {
    const canonicalUrl = `${publicSiteBase}topics/${topic.slug}/`;
    const redirectPath = join(siteDist, "topics", legacySlug, "index.html");
    const redirectHtml = await readFile(redirectPath, "utf8");
    validateRedirectHtml(redirectHtml, legacySlug, canonicalUrl);

    if (!checkedCanonicalTargets.has(topic.slug)) {
      const canonicalPath = join(siteDist, "topics", topic.slug, "index.html");
      const canonicalHtml = await readFile(canonicalPath, "utf8");
      validateCanonicalTopicHtml(canonicalHtml, topic);
      checkedCanonicalTargets.add(topic.slug);
    }
  }

  const pagefindUrls = new Set((await readPagefindFragments()).map((fragment) => fragment.url));
  for (const [legacySlug, topic] of legacyTargets) {
    const legacyUrl = `/topics/${legacySlug}/`;
    const canonicalUrl = `/topics/${topic.slug}/`;
    if (pagefindUrls.has(legacyUrl)) {
      throw new Error(`Pagefind includes legacy topic redirect ${legacyUrl}.`);
    }
    if (!pagefindUrls.has(canonicalUrl)) {
      throw new Error(`Pagefind is missing canonical topic destination ${canonicalUrl}.`);
    }
  }

  console.log(
    `Rendered topic redirect regression passed: ${topics.length} canonical topics, ` +
    `${legacyTargets.size} legacy redirects, ${checkedCanonicalTargets.size} canonical destinations.`,
  );
}

async function validateGeneratedProvenance(
  patternsSha256: string,
  patternsSourceSha256: string,
): Promise<void> {
  const value = JSON.parse(await readFile(generatedManifestPath, "utf8")) as unknown;
  if (
    typeof value !== "object" ||
    value === null ||
    !("source" in value) ||
    typeof value.source !== "object" ||
    value.source === null ||
    !("patternsInput" in value.source) ||
    value.source.patternsInput !== patternsPath ||
    !("patternsSha256" in value.source) ||
    value.source.patternsSha256 !== patternsSha256 ||
    !("patternsSourceSha256" in value.source) ||
    value.source.patternsSourceSha256 !== patternsSourceSha256
  ) {
    throw new Error("Generated archive topic-normalization provenance does not match the catalog.");
  }
}

async function readGeneratedTopics(): Promise<GeneratedTopic[]> {
  const value = JSON.parse(await readFile(generatedTopicsPath, "utf8")) as unknown;
  if (!Array.isArray(value)) {
    throw new Error(`${generatedTopicsPath} must contain an array.`);
  }
  return value as GeneratedTopic[];
}

function validateGeneratedTopic(topic: GeneratedTopic): void {
  if (
    !topicSlugPattern.test(topic.slug) ||
    typeof topic.title !== "string" ||
    topic.title.length === 0 ||
    !Array.isArray(topic.legacySlugs) ||
    !Number.isInteger(topic.videoCount) ||
    topic.videoCount < 0 ||
    !Number.isInteger(topic.segmentCount) ||
    topic.segmentCount < 0
  ) {
    throw new Error(`Generated topic has an invalid redirect/count contract: ${topic.slug ?? "unknown"}.`);
  }
  for (const legacySlug of topic.legacySlugs) {
    if (!topicSlugPattern.test(legacySlug)) {
      throw new Error(`Generated topic ${topic.slug} has invalid legacy slug ${String(legacySlug)}.`);
    }
  }
}

async function validateRenderedRouteSet(
  canonicalSlugs: ReadonlySet<string>,
  legacySlugs: ReadonlySet<string>,
): Promise<void> {
  const entries = await readdir(join(siteDist, "topics"), { withFileTypes: true });
  const renderedSlugs = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  const expectedSlugs = new Set([...canonicalSlugs, ...legacySlugs]);

  for (const slug of expectedSlugs) {
    if (!renderedSlugs.has(slug)) {
      throw new Error(`Rendered site is missing topic route ${slug}.`);
    }
  }
  for (const slug of renderedSlugs) {
    if (!expectedSlugs.has(slug)) {
      throw new Error(`Rendered site contains unowned topic route ${slug}.`);
    }
  }
}

function validateRedirectHtml(html: string, legacySlug: string, canonicalUrl: string): void {
  const tags = {
    links: tagsNamed(html, "link"),
    metas: tagsNamed(html, "meta"),
    anchors: tagsNamed(html, "a"),
  };
  const canonicalLinks = tags.links.filter((tag) => (
    attribute(tag, "rel") === "canonical" && attribute(tag, "href") === canonicalUrl
  ));
  if (canonicalLinks.length !== 1) {
    throw new Error(`Legacy topic ${legacySlug} must contain one absolute canonical link.`);
  }
  const robots = tags.metas.filter((tag) => (
    attribute(tag, "name") === "robots" && attribute(tag, "content") === "noindex,follow"
  ));
  if (robots.length !== 1) {
    throw new Error(`Legacy topic ${legacySlug} must contain robots=noindex,follow.`);
  }
  const refreshes = tags.metas.filter((tag) => (
    attribute(tag, "http-equiv")?.toLowerCase() === "refresh" &&
    attribute(tag, "content")?.replace(/^0;\s*url=/u, "") === canonicalUrl
  ));
  if (refreshes.length !== 1) {
    throw new Error(`Legacy topic ${legacySlug} must contain one zero-delay canonical refresh.`);
  }
  if (!tags.anchors.some((tag) => attribute(tag, "href") === canonicalUrl)) {
    throw new Error(`Legacy topic ${legacySlug} must contain a canonical fallback link.`);
  }
  if (/data-pagefind-/u.test(html)) {
    throw new Error(`Legacy topic ${legacySlug} exposes Pagefind body, metadata, or filters.`);
  }
}

function validateCanonicalTopicHtml(html: string, topic: GeneratedTopic): void {
  if (!html.includes("data-pagefind-body") || !html.includes('data-pagefind-meta="topic[content]"')) {
    throw new Error(`Canonical topic ${topic.slug} is missing its Pagefind contract.`);
  }
  if (/<meta\b[^>]*name="robots"[^>]*content="noindex,follow"/iu.test(html)) {
    throw new Error(`Canonical topic ${topic.slug} is incorrectly marked noindex.`);
  }

  const renderedSegments = countListItems(html, "ol", "topic-segment-list");
  const renderedVideos = countListItems(html, "ul", "small-card-list");
  if (renderedSegments !== topic.segmentCount || renderedVideos !== topic.videoCount) {
    throw new Error(
      `Canonical topic ${topic.slug} renders ${renderedVideos}/${topic.videoCount} videos and ` +
      `${renderedSegments}/${topic.segmentCount} time notes.`,
    );
  }
}

function countListItems(html: string, element: "ol" | "ul", className: string): number {
  const pattern = new RegExp(
    `<${element}\\b[^>]*class="[^"]*\\b${escapeRegExp(className)}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/${element}>`,
    "iu",
  );
  const body = pattern.exec(html)?.[1];
  if (body === undefined) {
    throw new Error(`Rendered canonical topic is missing ${element}.${className}.`);
  }
  return (body.match(/<li\b/giu) ?? []).length;
}

function tagsNamed(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "giu"))].map((match) => match[0]);
}

function attribute(tag: string, name: string): string | undefined {
  const escapedName = escapeRegExp(name);
  const match = new RegExp(`\\s${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "iu").exec(tag);
  return match?.[1] ?? match?.[2];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

async function readPagefindFragments(): Promise<PagefindFragment[]> {
  const fragmentPaths = await listFiles(
    join(pagefindRoot, "fragment"),
    (path) => path.endsWith(".pf_fragment"),
  );
  const fragments: PagefindFragment[] = [];
  for (const path of fragmentPaths) {
    const inflated = gunzipSync(await readFile(path)).toString("utf8");
    const objectStart = inflated.indexOf("{");
    if (objectStart < 0) {
      throw new Error(`Pagefind fragment has no JSON payload: ${path}`);
    }
    const value = JSON.parse(inflated.slice(objectStart)) as Partial<PagefindFragment>;
    if (typeof value.url !== "string") {
      throw new Error(`Pagefind fragment has an invalid URL payload: ${path}`);
    }
    fragments.push(value as PagefindFragment);
  }
  return fragments;
}

async function listFiles(root: string, include: (path: string) => boolean): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listFiles(path, include);
    return include(path) ? [path] : [];
  }));
  return nested.flat().sort((left, right) => left.localeCompare(right));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
