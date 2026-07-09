import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { SegmentKind } from "../index.js";

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
  summary: string;
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

export async function loadCuratedArchiveSeed(inputDirectory: string): Promise<CuratedArchiveSeed> {
  const inputStats = await stat(inputDirectory);
  if (!inputStats.isDirectory()) {
    throw new Error(`Curated site content input must be a per-video directory, not a file: ${inputDirectory}`);
  }

  const topicStore = await readJson<CuratedTopicStore>(join(inputDirectory, "topics.json"));
  if (topicStore.schemaVersion !== 1) {
    throw new Error("Curated topic store schemaVersion must be 1.");
  }
  if (!Array.isArray(topicStore.topics)) {
    throw new Error("Curated topic store must include a topics array.");
  }

  const entries = await readdir(inputDirectory, { withFileTypes: true });
  const videoFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "topics.json")
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const videos = await Promise.all(videoFiles.map(async (fileName) => {
    const video = await readJson<CuratedVideoFileSeed>(join(inputDirectory, fileName));
    validateVideoFileSeed(video, fileName);
    return video;
  }));

  return {
    schemaVersion: 1,
    videos: videos.map((video) => ({
      videoId: video.videoId,
      topics: [...video.topics],
    })),
    topics: topicStore.topics,
    segments: videos.flatMap((video) => video.segments),
  };
}

export function curatedVideoSeedFileName(videoId: string): string {
  return `video-${videoId}.json`;
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

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}
