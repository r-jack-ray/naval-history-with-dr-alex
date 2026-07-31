import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type {
  CuratedArchiveSeed,
  CuratedVideoSeed,
} from "../content/curated-archive-model.js";
import {
  parseCuratedTopicStore,
  type CuratedSegmentSeed,
  type CuratedTopicSeed,
  type CuratedTopicStore,
  type CuratedVideoFileSeed,
} from "../content/schemas/index.js";
import {
  discoverVideoSegmentShards,
  type VideoSegmentShardIndex,
} from "./video-segment-files.js";

export type {
  CuratedArchiveSeed,
  CuratedVideoSeed,
} from "../content/curated-archive-model.js";
export type {
  CuratedSegmentEvidenceSeed,
  CuratedSegmentSeed,
  CuratedTopicSeed,
  CuratedTopicStore,
  CuratedVideoFileSeed,
} from "../content/schemas/index.js";

export interface CuratedSegmentOccurrence {
  filePath: string;
  videoId: string;
  segment: CuratedSegmentSeed;
}

export interface CuratedSegmentDuplicate {
  field: "id" | "slug";
  value: string;
  occurrences: CuratedSegmentOccurrence[];
}

interface LoadedCuratedVideoFile {
  filePath: string;
  video: CuratedVideoFileSeed;
}

export async function loadCuratedArchiveSeed(
  inputDirectory: string,
  preloadedShardIndex?: VideoSegmentShardIndex,
): Promise<CuratedArchiveSeed> {
  const { seed, loadedVideos } = await loadCuratedSeedFiles(
    inputDirectory,
    preloadedShardIndex,
  );
  const duplicates = collectCuratedSegmentDuplicates(loadedVideos);
  if (duplicates.length > 0) {
    throw new Error(duplicates.map(formatCuratedSegmentDuplicate).join("\n\n"));
  }
  return seed;
}

/**
 * Loads topic-report inputs without applying archive route-uniqueness checks.
 * Topic usage depends on video/topic relationships, so an unrelated duplicate
 * segment ID or slug must not prevent taxonomy curation.
 */
export async function loadCuratedTopicUsageSeed(
  inputDirectory: string,
  preloadedShardIndex?: VideoSegmentShardIndex,
): Promise<CuratedArchiveSeed> {
  return (await loadCuratedSeedFiles(inputDirectory, preloadedShardIndex)).seed;
}

async function loadCuratedSeedFiles(
  inputDirectory: string,
  preloadedShardIndex?: VideoSegmentShardIndex,
): Promise<{
  seed: CuratedArchiveSeed;
  loadedVideos: LoadedCuratedVideoFile[];
}> {
  await validateInputDirectory(inputDirectory);
  const topicStorePath = join(inputDirectory, "topics.json");
  const topicStore = parseCuratedTopicStore(
    await readJson(topicStorePath),
    `Curated topic store ${topicStorePath}`,
  );

  const loadedVideos = await loadCuratedVideoFiles(inputDirectory, preloadedShardIndex);
  return {
    seed: {
      videos: loadedVideos.map(({ video }) => ({
        videoId: video.videoId,
        topics: [...video.topics],
      })),
      topics: topicStore.topics,
      segments: loadedVideos.flatMap(({ video }) => video.segments),
    },
    loadedVideos,
  };
}

export async function findCuratedSegmentDuplicates(
  inputDirectory: string,
): Promise<CuratedSegmentDuplicate[]> {
  await validateInputDirectory(inputDirectory);
  return collectCuratedSegmentDuplicates(await loadCuratedVideoFiles(inputDirectory));
}

export function formatCuratedSegmentDuplicate(duplicate: CuratedSegmentDuplicate): string {
  const label = duplicate.field === "id" ? "ID" : "slug";
  const occurrences = duplicate.occurrences.map(({ filePath, videoId, segment }) => (
    `  - ${filePath} (videoId ${videoId}, start ${segment.start}, title ${JSON.stringify(segment.title)})`
  ));
  return [`Duplicate segment ${label}: ${duplicate.value}`, ...occurrences].join("\n");
}

async function validateInputDirectory(inputDirectory: string): Promise<void> {
  const inputStats = await stat(inputDirectory);
  if (!inputStats.isDirectory()) {
    throw new Error(`Curated site content input must be a per-video directory, not a file: ${inputDirectory}`);
  }
}

async function loadCuratedVideoFiles(
  inputDirectory: string,
  preloadedShardIndex?: VideoSegmentShardIndex,
): Promise<LoadedCuratedVideoFile[]> {
  const { shards } = preloadedShardIndex ?? await discoverVideoSegmentShards(inputDirectory);
  return shards.map(({ fileName, filePath, value }) => {
    return { filePath, video: value };
  });
}

function collectCuratedSegmentDuplicates(
  loadedVideos: LoadedCuratedVideoFile[],
): CuratedSegmentDuplicate[] {
  const duplicates: CuratedSegmentDuplicate[] = [];

  for (const field of ["id", "slug"] as const) {
    const occurrencesByValue = new Map<string, CuratedSegmentOccurrence[]>();
    for (const { filePath, video } of loadedVideos) {
      for (const segment of video.segments) {
        const occurrences = occurrencesByValue.get(segment[field]) ?? [];
        occurrences.push({ filePath, videoId: video.videoId, segment });
        occurrencesByValue.set(segment[field], occurrences);
      }
    }

    for (const [value, occurrences] of occurrencesByValue) {
      if (occurrences.length > 1) {
        duplicates.push({ field, value, occurrences });
      }
    }
  }

  return duplicates.sort((left, right) => (
    left.field.localeCompare(right.field) || left.value.localeCompare(right.value)
  ));
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
