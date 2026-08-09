import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import { readVideoMetadataStore, resolveVideoState } from "../youtube/video-metadata.js";
import {
  readRenderedHtmlSiteSnapshot,
  type RenderedDateValue,
  type RenderedHtmlPageSnapshot,
  type RenderedHtmlSiteSnapshot,
} from "./seo-validation.js";

const canonicalDatePattern = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/u;
const canonicalTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;

export interface GeneratedVideoDateRecord {
  videoId: string;
  slug: string;
  videoDateAt: string;
  videoDateLabel: string;
  durationLabel: string;
  videoKind: "upload" | "stream";
  segmentSlugs: string[];
}

interface PagefindFragment {
  url: string;
  content: string;
  meta?: Record<string, unknown>;
}

export interface RenderedVideoDateValidationOptions {
  siteDist: string;
  generatedVideosPath: string;
  siteOrigin: string;
  basePath: string;
  concurrency?: number;
}

export interface RenderedVideoDateHtmlValidationResult {
  htmlFiles: number;
  timeElements: number;
}

export interface RenderedVideoDateValidationResult extends RenderedVideoDateHtmlValidationResult {
  videos: number;
  pagefindFragments: number;
}

export async function validateRenderedVideoDates(
  options: RenderedVideoDateValidationOptions,
  renderedHtml?: RenderedHtmlSiteSnapshot,
): Promise<RenderedVideoDateValidationResult> {
  const videos = await readGeneratedVideos(options.generatedVideosPath);
  for (const video of videos) validateGeneratedVideo(video);

  const renderedSite = renderedHtml ?? await readRenderedHtmlSiteSnapshot({
    distRoot: options.siteDist,
    siteOrigin: options.siteOrigin,
    basePath: options.basePath,
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  });
  if (renderedSite.distRoot !== resolve(options.siteDist)) {
    throw new Error("Rendered HTML snapshot does not match the video-date validation target.");
  }
  const htmlResult = validateRenderedVideoDateHtml(videos, renderedSite);

  const pagefindRoot = join(options.siteDist, "pagefind");
  const fragments = await readPagefindFragments(pagefindRoot);
  const fragmentsByUrl = new Map(fragments.map((fragment) => [fragment.url, fragment]));
  const videosById = new Map(videos.map((video) => [video.videoId, video]));
  for (const video of videos) {
    const fragment = fragmentsByUrl.get(`/videos/${video.slug}/`);
    if (fragment === undefined) {
      throw new Error(`Pagefind is missing video detail page: ${video.videoId}`);
    }
    const expectedDateText = `Date${video.videoDateLabel}`;
    if (!fragment.content.includes(expectedDateText)) {
      throw new Error(`Pagefind has no canonical Date value for video ${video.videoId}.`);
    }
    validatePagefindDateMeta(fragment, video);
    for (const legacyLabel of ["Published", "Start date", "Streamed", "Scheduled for"] as const) {
      if (fragment.content.includes(`${legacyLabel}${video.videoDateLabel}`)) {
        throw new Error(`Pagefind retains legacy date wording for video ${video.videoId}: ${legacyLabel}`);
      }
    }
    for (const segmentSlug of video.segmentSlugs) {
      const segmentFragment = fragmentsByUrl.get(`/segments/${segmentSlug}/`);
      if (segmentFragment === undefined) {
        throw new Error(`Pagefind is missing segment detail page: ${segmentSlug}`);
      }
      validatePagefindDateMeta(segmentFragment, video);
      if (!segmentFragment.content.includes(`Date${video.videoDateLabel}`)) {
        throw new Error(`Pagefind segment has no canonical Source Date value: ${segmentSlug}`);
      }
    }
  }

  for (const fragment of fragments) {
    if (pagefindMetaText(fragment, "type") !== "segment") continue;
    const videoId = pagefindMetaText(fragment, "videoId");
    const video = videosById.get(videoId);
    if (video === undefined) {
      throw new Error(`Pagefind segment ${fragment.url} references missing video ${videoId || "unknown"}.`);
    }
    validatePagefindDateMeta(fragment, video);
    if (!fragment.content.includes(`Date${video.videoDateLabel}`)) {
      throw new Error(`Segment detail page does not render the canonical Date field: ${fragment.url}`);
    }
  }

  await validateNotReadyVideosAreAbsent(videos);
  validateBruships250(videos, fragmentsByUrl);

  return {
    videos: videos.length,
    htmlFiles: htmlResult.htmlFiles,
    timeElements: htmlResult.timeElements,
    pagefindFragments: fragments.length,
  };
}

export function validateRenderedVideoDateHtml(
  videos: readonly GeneratedVideoDateRecord[],
  renderedSite: RenderedHtmlSiteSnapshot,
): RenderedVideoDateHtmlValidationResult {
  const videosBySegmentSlug = new Map<string, GeneratedVideoDateRecord>();
  for (const video of videos) {
    validateGeneratedVideo(video);
    for (const segmentSlug of video.segmentSlugs) {
      if (videosBySegmentSlug.has(segmentSlug)) {
        throw new Error(`Generated videos reference duplicate segment slug ${segmentSlug}.`);
      }
      videosBySegmentSlug.set(segmentSlug, video);
    }
  }

  const pagesByRelativePath = new Map(renderedSite.pages.map((page) => [page.relativePath, page]));
  const segmentDetailsWithDates = new Set<string>();
  const browseCardsWithDates = new Set<string>();
  let timeCount = 0;

  for (const page of renderedSite.pages) {
    const snapshot = requirePageSnapshot(page);
    for (const forbidden of snapshot.renderedDates.forbiddenPublicText) {
      throw new Error(
        `Rendered output contains forbidden public date/runtime text ${JSON.stringify(forbidden)}: ${page.path}`,
      );
    }
    for (const value of snapshot.renderedDates.timeElements) {
      if (!canonicalTimestampPattern.test(value.datetime) || !canonicalDatePattern.test(value.label)) {
        throw new Error(`Rendered output contains a noncanonical date <time>: ${page.path}`);
      }
      timeCount += 1;
    }

    const segmentDetailMatch = /^segments\/([^/]+)\/index\.html$/u.exec(page.relativePath);
    const segmentSlug = segmentDetailMatch?.[1];
    if (segmentSlug !== undefined && segmentSlug !== "browse") {
      const video = videosBySegmentSlug.get(segmentSlug);
      if (video === undefined) {
        throw new Error(`Rendered segment detail references unknown segment slug ${segmentSlug}.`);
      }
      if (!hasCanonicalDate(snapshot.renderedDates.sourceDateFields, video)) {
        throw new Error(`Segment detail page does not render the canonical Source Date field: ${segmentSlug}`);
      }
      segmentDetailsWithDates.add(segmentSlug);
    }

    if (page.relativePath.startsWith("segments/browse/")) {
      for (const card of snapshot.renderedDates.segmentBrowseCards) {
        const browseSegmentSlug = card.segmentSlug;
        const video = videosBySegmentSlug.get(browseSegmentSlug);
        if (video === undefined) {
          throw new Error(`Rendered browse card references unknown segment slug ${browseSegmentSlug || "unknown"}.`);
        }
        if (!hasCanonicalDate(card.dates, video)) {
          throw new Error(`Time Notes browse card does not render the canonical video date: ${browseSegmentSlug}`);
        }
        if (browseCardsWithDates.has(browseSegmentSlug)) {
          throw new Error(`Time Notes browse renders duplicate segment card ${browseSegmentSlug}.`);
        }
        browseCardsWithDates.add(browseSegmentSlug);
      }
    }
  }

  validateSegmentDateCoverage("detail pages", segmentDetailsWithDates, videosBySegmentSlug);
  validateSegmentDateCoverage("browse cards", browseCardsWithDates, videosBySegmentSlug);

  for (const video of videos) {
    const relativePath = `videos/${video.slug}/index.html`;
    const detail = requirePageSnapshot(requireRenderedPage(pagesByRelativePath, relativePath));
    if (!hasCanonicalDate(detail.renderedDates.videoDetailDateFields, video)) {
      throw new Error(
        `Video detail page does not render the canonical Date field: ${video.videoId} (${join(renderedSite.distRoot, relativePath)})`,
      );
    }
  }

  const latestVideo = [...videos]
    .filter((video) => video.segmentSlugs.length > 0)
    .sort((left, right) => (
      Date.parse(right.videoDateAt) - Date.parse(left.videoDateAt)
      || left.videoId.localeCompare(right.videoId)
    ))[0];
  if (latestVideo === undefined) {
    throw new Error("The home page has no dated video guide to feature.");
  }
  const home = requirePageSnapshot(requireRenderedPage(pagesByRelativePath, "index.html"));
  if (!hasCanonicalDate(home.renderedDates.latestVideoGuideDates, latestVideo)) {
    throw new Error(`The home-page latest-video card does not render the canonical date for ${latestVideo.videoId}.`);
  }

  return { htmlFiles: renderedSite.pages.length, timeElements: timeCount };
}

async function readGeneratedVideos(path: string): Promise<GeneratedVideoDateRecord[]> {
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!Array.isArray(value)) throw new Error(`${path} must contain an array.`);
  return value as GeneratedVideoDateRecord[];
}

function validateGeneratedVideo(video: GeneratedVideoDateRecord): void {
  if (
    typeof video.videoId !== "string"
    || typeof video.slug !== "string"
    || !canonicalTimestampPattern.test(video.videoDateAt)
    || !canonicalDatePattern.test(video.videoDateLabel)
    || video.durationLabel === "P0D"
    || video.durationLabel === "0:00"
    || !Array.isArray(video.segmentSlugs)
  ) {
    throw new Error(`Generated video has an invalid public date/runtime contract: ${video.videoId ?? "unknown"}`);
  }
}

function hasCanonicalDate(
  values: readonly RenderedDateValue[],
  video: GeneratedVideoDateRecord,
): boolean {
  return values.some((value) => (
    value.datetime === video.videoDateAt && value.label === video.videoDateLabel
  ));
}

function requireRenderedPage(
  pagesByRelativePath: ReadonlyMap<string, RenderedHtmlPageSnapshot>,
  relativePath: string,
): RenderedHtmlPageSnapshot {
  const page = pagesByRelativePath.get(relativePath);
  if (page === undefined) throw new Error(`Rendered HTML page is missing: ${relativePath}`);
  return page;
}

function requirePageSnapshot(page: RenderedHtmlPageSnapshot) {
  if (page.snapshot === undefined) {
    throw new Error(`Could not parse rendered HTML ${page.path}: ${page.error ?? "unknown error"}`);
  }
  return page.snapshot;
}

function validateSegmentDateCoverage(
  surface: string,
  renderedSlugs: ReadonlySet<string>,
  videosBySegmentSlug: ReadonlyMap<string, GeneratedVideoDateRecord>,
): void {
  if (renderedSlugs.size === videosBySegmentSlug.size) return;
  let missingSlug = "unknown";
  for (const slug of videosBySegmentSlug.keys()) {
    if (!renderedSlugs.has(slug)) {
      missingSlug = slug;
      break;
    }
  }
  throw new Error(
    `Rendered segment ${surface} contain ${renderedSlugs.size} of ${videosBySegmentSlug.size} canonical dates; `
    + `first missing segment: ${missingSlug}.`,
  );
}

function pagefindMetaText(fragment: PagefindFragment, key: string): string {
  const value = fragment.meta?.[key];
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : "";
  }
  return typeof value === "string" ? value : "";
}

function validatePagefindDateMeta(fragment: PagefindFragment, video: GeneratedVideoDateRecord): void {
  if (
    pagefindMetaText(fragment, "videoDateAt") !== video.videoDateAt
    || pagefindMetaText(fragment, "videoDateLabel") !== video.videoDateLabel
  ) {
    throw new Error(`Pagefind has no canonical video-date metadata for ${fragment.url}.`);
  }
}

async function readPagefindFragments(pagefindRoot: string): Promise<PagefindFragment[]> {
  const entry = JSON.parse(await readFile(join(pagefindRoot, "pagefind-entry.json"), "utf8")) as {
    languages?: { en?: { page_count?: number } };
  };
  const fragmentPaths = await listFiles(join(pagefindRoot, "fragment"), (path) => path.endsWith(".pf_fragment"));
  const fragments: PagefindFragment[] = [];
  for (const path of fragmentPaths) {
    const inflated = gunzipSync(await readFile(path)).toString("utf8");
    const objectStart = inflated.indexOf("{");
    if (objectStart < 0) throw new Error(`Pagefind fragment has no JSON payload: ${path}`);
    const value = JSON.parse(inflated.slice(objectStart)) as Partial<PagefindFragment>;
    if (typeof value.url !== "string" || typeof value.content !== "string") {
      throw new Error(`Pagefind fragment has an invalid payload: ${path}`);
    }
    if (value.content.includes("Scheduled for") || value.content.includes("P0D")) {
      throw new Error(`Pagefind fragment contains forbidden public date/runtime text: ${value.url}`);
    }
    fragments.push(value as PagefindFragment);
  }
  const expectedCount = entry.languages?.en?.page_count;
  if (expectedCount !== fragments.length) {
    throw new Error(`Pagefind entry reports ${String(expectedCount)} pages but ${fragments.length} fragments exist.`);
  }
  return fragments;
}

async function validateNotReadyVideosAreAbsent(videos: readonly GeneratedVideoDateRecord[]): Promise<void> {
  const publicIds = new Set(videos.map((video) => video.videoId));
  const metadataStore = await readVideoMetadataStore();
  if (metadataStore === undefined) {
    throw new Error("Video metadata is required for the public eligibility regression.");
  }
  const notReadyIds = metadataStore.videos
    .filter((metadata) => resolveVideoState(metadata).state !== "ready")
    .map((metadata) => metadata.videoId);
  const exposed = notReadyIds.filter((videoId) => publicIds.has(videoId));
  if (exposed.length > 0) {
    throw new Error(`Not-ready videos appear in the generated public archive: ${exposed.join(", ")}`);
  }
}

function validateBruships250(
  videos: readonly GeneratedVideoDateRecord[],
  fragmentsByUrl: ReadonlyMap<string, PagefindFragment>,
): void {
  const video = videos.find((candidate) => candidate.videoId === "670r43jZo5o");
  if (video === undefined) {
    throw new Error("Bruships 250 is absent after its metadata refresh proved completion.");
  }
  if (
    video.videoDateAt !== "2026-07-12T18:30:05Z"
    || video.videoDateLabel !== "Jul 12, 2026"
    || video.durationLabel !== "4:32:47"
    || video.videoKind !== "stream"
  ) {
    throw new Error("Bruships 250 does not have the refreshed canonical date/runtime contract.");
  }
  const fragment = fragmentsByUrl.get(`/videos/${video.slug}/`);
  if (
    fragment === undefined
    || !fragment.content.includes("DateJul 12, 2026")
    || !fragment.content.includes("Runtime4:32:47")
    || !fragment.content.includes("FormatStream")
  ) {
    throw new Error("Bruships 250 Pagefind content does not contain the refreshed public metadata.");
  }
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
