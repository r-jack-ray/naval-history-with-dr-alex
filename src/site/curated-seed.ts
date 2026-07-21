import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { SegmentKind } from "../index.js";
import { discoverVideoSegmentShards } from "./video-segment-files.js";

export interface CuratedArchiveSeed {
  schemaVersion: 1;
  videos: CuratedVideoSeed[];
  topics: CuratedTopicSeed[];
  segments: CuratedSegmentSeed[];
}

export interface CuratedVideoSeed {
  videoId: string;
  topics: string[];
}

export interface CuratedTopicSeed {
  slug: string;
  title: string;
  summary?: string;
  aliases?: string[];
}

export interface CuratedSegmentSeed {
  id: string;
  videoId: string;
  slug: string;
  title: string;
  kind: SegmentKind;
  start: string;
  end?: string;
  topics: string[];
  summary: string;
  body: string;
  question?: string;
  answerShort?: string;
  sourcePath?: string;
  evidence?: CuratedSegmentEvidenceSeed[];
}

export interface CuratedSegmentEvidenceSeed {
  start: string;
  end?: string;
  note: string;
}

export interface CuratedTopicStore {
  schemaVersion: 1;
  topics: CuratedTopicSeed[];
}

export interface CuratedVideoFileSeed {
  schemaVersion: 1;
  videoId: string;
  topics: string[];
  segments: CuratedSegmentSeed[];
}

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

export async function loadCuratedArchiveSeed(inputDirectory: string): Promise<CuratedArchiveSeed> {
  await validateInputDirectory(inputDirectory);
  const topicStore = await readJson<CuratedTopicStore>(join(inputDirectory, "topics.json"));
  if (topicStore.schemaVersion !== 1) {
    throw new Error("Curated topic store schemaVersion must be 1.");
  }
  if (!Array.isArray(topicStore.topics)) {
    throw new Error("Curated topic store must include a topics array.");
  }

  const loadedVideos = await loadCuratedVideoFiles(inputDirectory);
  const duplicates = collectCuratedSegmentDuplicates(loadedVideos);
  if (duplicates.length > 0) {
    throw new Error(duplicates.map(formatCuratedSegmentDuplicate).join("\n\n"));
  }

  return {
    schemaVersion: 1,
    videos: loadedVideos.map(({ video }) => ({
      videoId: video.videoId,
      topics: [...video.topics],
    })),
    topics: topicStore.topics,
    segments: loadedVideos.flatMap(({ video }) => video.segments),
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

function validateVideoFileSeed(video: CuratedVideoFileSeed, fileName: string): void {
  if (video.schemaVersion !== 1) {
    throw new Error(`Curated video file ${fileName} schemaVersion must be 1.`);
  }
  if (typeof video.videoId !== "string" || !/^[A-Za-z0-9_-]+$/u.test(video.videoId)) {
    throw new Error(`Curated video file ${fileName} must include a valid videoId.`);
  }
  if (!Array.isArray(video.topics)) {
    throw new Error(`Curated video file ${fileName} must include a topics array.`);
  }
  if (!Array.isArray(video.segments)) {
    throw new Error(`Curated video file ${fileName} must include a segments array.`);
  }

  for (const segment of video.segments) {
    if (segment.videoId !== video.videoId) {
      throw new Error(`Segment ${segment.id} in ${fileName} must use videoId ${video.videoId}.`);
    }
  }
}

async function validateInputDirectory(inputDirectory: string): Promise<void> {
  const inputStats = await stat(inputDirectory);
  if (!inputStats.isDirectory()) {
    throw new Error(`Curated site content input must be a per-video directory, not a file: ${inputDirectory}`);
  }
}

async function loadCuratedVideoFiles(inputDirectory: string): Promise<LoadedCuratedVideoFile[]> {
  const { shards } = await discoverVideoSegmentShards(inputDirectory);
  return shards.map(({ fileName, filePath, value }) => {
    const video = value as CuratedVideoFileSeed;
    validateVideoFileSeed(video, fileName);
    return { filePath, video };
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

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}
