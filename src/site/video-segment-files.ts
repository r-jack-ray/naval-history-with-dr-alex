import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  parseCuratedVideoFile,
  type CuratedVideoFileSeed,
} from "../content/schemas/index.js";

export const curatedTopicStoreFileName = "topics.json";

export interface VideoSegmentShard {
  fileName: string;
  filePath: string;
  videoId: string;
  value: CuratedVideoFileSeed;
}

export interface VideoSegmentShardIndex {
  shards: VideoSegmentShard[];
  byVideoId: ReadonlyMap<string, VideoSegmentShard>;
}

/**
 * Returns the canonical per-video shard basename for a stored transcript
 * manifest stem. Callers must use the stored stem rather than recomputing one
 * from mutable video metadata.
 */
export function canonicalVideoSegmentFileName(fileStem: string): string {
  return `${fileStem}.json`;
}

/**
 * Reads every regular JSON shard except the shared topic store once, validates
 * it against the canonical curated-video schema, and exposes deterministic
 * video-ID ordering plus a reusable lookup index.
 */
export async function discoverVideoSegmentShards(
  inputDirectory: string,
): Promise<VideoSegmentShardIndex> {
  const fileNames = await listVideoSegmentShardFileNames(inputDirectory);
  return buildVideoSegmentShardIndex(
    await loadVideoSegmentShardFiles(inputDirectory, fileNames),
  );
}

export async function listVideoSegmentShardFileNames(
  inputDirectory: string,
): Promise<string[]> {
  const entries = await readdir(inputDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => (
      entry.isFile()
      && entry.name.endsWith(".json")
      && entry.name !== curatedTopicStoreFileName
    ))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function loadVideoSegmentShardFiles(
  inputDirectory: string,
  fileNames: readonly string[],
): Promise<VideoSegmentShard[]> {
  return await Promise.all(fileNames.map(async (fileName) => {
    const filePath = join(inputDirectory, fileName);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    } catch (error) {
      throw new Error(`Could not parse curated video shard ${filePath}.`, { cause: error });
    }
    const value = parseCuratedVideoFile(parsed, `Curated video shard ${filePath}`);
    return { fileName, filePath, videoId: value.videoId, value };
  }));
}

export function buildVideoSegmentShardIndex(
  loaded: readonly VideoSegmentShard[],
): VideoSegmentShardIndex {
  const byVideoId = new Map<string, VideoSegmentShard>();
  for (const shard of loaded) {
    const existing = byVideoId.get(shard.videoId);
    if (existing !== undefined) {
      throw new Error(
        `Video ${shard.videoId} appears in both ${existing.filePath} and ${shard.filePath}.`,
      );
    }
    byVideoId.set(shard.videoId, shard);
  }

  const shards = [...loaded].sort((left, right) => left.videoId.localeCompare(right.videoId));
  return { shards, byVideoId };
}
