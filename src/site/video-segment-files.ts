import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const curatedTopicStoreFileName = "topics.json";

export interface VideoSegmentShard {
  fileName: string;
  filePath: string;
  videoId: string;
  value: unknown;
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
 * its JSON video identity, and exposes deterministic video-ID ordering plus a
 * reusable lookup index.
 */
export async function discoverVideoSegmentShards(
  inputDirectory: string,
): Promise<VideoSegmentShardIndex> {
  const entries = await readdir(inputDirectory, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) => (
      entry.isFile()
      && entry.name.endsWith(".json")
      && entry.name !== curatedTopicStoreFileName
    ))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const loaded = await Promise.all(fileNames.map(async (fileName) => {
    const filePath = join(inputDirectory, fileName);
    let value: unknown;
    try {
      value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    } catch (error) {
      throw new Error(`Could not parse curated video shard ${filePath}.`, { cause: error });
    }
    if (!isRecord(value) || typeof value.videoId !== "string" || !isSafeVideoId(value.videoId)) {
      throw new Error(`Curated video shard ${filePath} must contain a safe string videoId.`);
    }
    return { fileName, filePath, videoId: value.videoId, value };
  }));

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

function isSafeVideoId(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
