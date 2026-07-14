#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import {
  readVideoMetadataStore,
  resolveVideoState,
} from "../youtube/video-metadata.js";

const siteDist = "site/dist";
const generatedVideosPath = "site/src/data/generated/archive/videos.json";
const pagefindRoot = join(siteDist, "pagefind");
const canonicalDatePattern = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/u;
const canonicalTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const forbiddenPublicText = [
  "Scheduled for",
  '<span class="label">Published</span>',
  '<span class="label">Start date</span>',
  '<span class="label">Streamed</span>',
  ">P0D<",
] as const;

interface GeneratedVideo {
  videoId: string;
  slug: string;
  videoDateAt: string;
  videoDateLabel: string;
  durationLabel: string;
  videoKind: "upload" | "stream";
}

interface PagefindFragment {
  url: string;
  content: string;
}

async function main(): Promise<void> {
  const videos = await readGeneratedVideos();
  const htmlPaths = await listFiles(siteDist, (path) => path.endsWith(".html"));
  let timeCount = 0;

  for (const path of htmlPaths) {
    const html = await readFile(path, "utf8");
    for (const forbidden of forbiddenPublicText) {
      if (html.includes(forbidden)) {
        throw new Error(`Rendered output contains forbidden public date/runtime text ${JSON.stringify(forbidden)}: ${path}`);
      }
    }
    for (const match of html.matchAll(/<time\s+datetime="([^"]+)">([^<]+)<\/time>/gu)) {
      const timestamp = match[1] ?? "";
      const label = match[2] ?? "";
      if (!canonicalTimestampPattern.test(timestamp) || !canonicalDatePattern.test(label)) {
        throw new Error(`Rendered output contains a noncanonical date <time>: ${path}`);
      }
      timeCount += 1;
    }
  }

  for (const video of videos) {
    validateGeneratedVideo(video);
    const detailPath = join(siteDist, "videos", video.slug, "index.html");
    const detail = await readFile(detailPath, "utf8");
    const expected = `<span class="label">Date</span><strong><time datetime="${video.videoDateAt}">${video.videoDateLabel}</time></strong>`;
    if (!detail.includes(expected)) {
      throw new Error(`Video detail page does not render the canonical Date field: ${video.videoId} (${detailPath})`);
    }
  }

  const fragments = await readPagefindFragments();
  const fragmentsByUrl = new Map(fragments.map((fragment) => [fragment.url, fragment]));
  for (const video of videos) {
    const fragment = fragmentsByUrl.get(`/videos/${video.slug}/`);
    if (fragment === undefined) {
      throw new Error(`Pagefind is missing video detail page: ${video.videoId}`);
    }
    const expectedDateText = `Date${video.videoDateLabel}`;
    if (!fragment.content.includes(expectedDateText)) {
      throw new Error(`Pagefind has no canonical Date value for video ${video.videoId}.`);
    }
    for (const legacyLabel of ["Published", "Start date", "Streamed", "Scheduled for"] as const) {
      if (fragment.content.includes(`${legacyLabel}${video.videoDateLabel}`)) {
        throw new Error(`Pagefind retains legacy date wording for video ${video.videoId}: ${legacyLabel}`);
      }
    }
  }

  await validateNotReadyVideosAreAbsent(videos);
  validateBruships250(videos, fragmentsByUrl);

  console.log(
    `Rendered video-date regression passed: ${videos.length} videos, ${htmlPaths.length} HTML files, ` +
    `${timeCount} semantic dates, ${fragments.length} Pagefind fragments.`,
  );
}

async function readGeneratedVideos(): Promise<GeneratedVideo[]> {
  const value = JSON.parse(await readFile(generatedVideosPath, "utf8")) as unknown;
  if (!Array.isArray(value)) {
    throw new Error(`${generatedVideosPath} must contain an array.`);
  }
  return value as GeneratedVideo[];
}

function validateGeneratedVideo(video: GeneratedVideo): void {
  if (
    typeof video.videoId !== "string" ||
    typeof video.slug !== "string" ||
    !canonicalTimestampPattern.test(video.videoDateAt) ||
    !canonicalDatePattern.test(video.videoDateLabel) ||
    video.durationLabel === "P0D" ||
    video.durationLabel === "0:00"
  ) {
    throw new Error(`Generated video has an invalid public date/runtime contract: ${video.videoId ?? "unknown"}`);
  }
}

async function readPagefindFragments(): Promise<PagefindFragment[]> {
  const entry = JSON.parse(await readFile(join(pagefindRoot, "pagefind-entry.json"), "utf8")) as {
    languages?: { en?: { page_count?: number } };
  };
  const fragmentPaths = await listFiles(join(pagefindRoot, "fragment"), (path) => path.endsWith(".pf_fragment"));
  const fragments: PagefindFragment[] = [];
  for (const path of fragmentPaths) {
    const inflated = gunzipSync(await readFile(path)).toString("utf8");
    const objectStart = inflated.indexOf("{");
    if (objectStart < 0) {
      throw new Error(`Pagefind fragment has no JSON payload: ${path}`);
    }
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

async function validateNotReadyVideosAreAbsent(videos: readonly GeneratedVideo[]): Promise<void> {
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
  videos: readonly GeneratedVideo[],
  fragmentsByUrl: ReadonlyMap<string, PagefindFragment>,
): void {
  const video = videos.find((candidate) => candidate.videoId === "670r43jZo5o");
  if (video === undefined) {
    throw new Error("Bruships 250 is absent after its metadata refresh proved completion.");
  }
  if (
    video.videoDateAt !== "2026-07-12T18:30:05Z" ||
    video.videoDateLabel !== "Jul 12, 2026" ||
    video.durationLabel !== "4:32:47" ||
    video.videoKind !== "stream"
  ) {
    throw new Error("Bruships 250 does not have the refreshed canonical date/runtime contract.");
  }
  const fragment = fragmentsByUrl.get(`/videos/${video.slug}/`);
  if (fragment === undefined || !fragment.content.includes("DateJul 12, 2026Runtime4:32:47FormatStream")) {
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
