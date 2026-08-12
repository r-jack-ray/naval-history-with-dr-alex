import { readFile } from "node:fs/promises";

export const defaultIgnoredVideosInput = "src/channel/ignored-videos.json";

export interface IgnoredVideoRecord {
  videoId: string;
  url: string;
  classification: "erroneous_stream";
  reason: string;
}

export interface IgnoredVideosConfig {
  schemaVersion: 1;
  ignoredVideos: IgnoredVideoRecord[];
}

export async function readIgnoredVideos(
    path = defaultIgnoredVideosInput,
): Promise<ReadonlyMap<string, IgnoredVideoRecord>> {
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  const config = parseIgnoredVideosConfig(value, path);
  return new Map(config.ignoredVideos.map((record) => [record.videoId, record]));
}

export function parseIgnoredVideosConfig(
    value: unknown,
    source = "ignored videos config",
): IgnoredVideosConfig {
  const object = asRecord(value);
  if (object?.schemaVersion !== 1 || !Array.isArray(object.ignoredVideos)) {
    throw new Error(`${source} must contain schemaVersion 1 and an ignoredVideos array.`);
  }

  const seen = new Set<string>();
  const ignoredVideos = object.ignoredVideos.map((value, index) => {
    const record = asRecord(value);
    const videoId = readString(record, "videoId");
    const url = readString(record, "url");
    const classification = record?.classification;
    const reason = readString(record, "reason");
    const label = `${source} ignoredVideos[${index}]`;

    if (videoId === undefined || !/^[A-Za-z0-9_-]{11}$/u.test(videoId)) {
      throw new Error(`${label} must contain a valid 11-character YouTube videoId.`);
    }
    if (seen.has(videoId)) {
      throw new Error(`${source} contains duplicate ignored video ID ${videoId}.`);
    }
    if (url !== `https://www.youtube.com/watch?v=${videoId}`) {
      throw new Error(`${label} must use the canonical YouTube watch URL for ${videoId}.`);
    }
    if (classification !== "erroneous_stream") {
      throw new Error(`${label} classification must be erroneous_stream.`);
    }
    if (reason === undefined) {
      throw new Error(`${label} must contain a non-empty reason.`);
    }

    seen.add(videoId);
    return {
      videoId,
      url,
      classification: "erroneous_stream" as const,
      reason,
    };
  });

  return {
    schemaVersion: 1,
    ignoredVideos,
  };
}

export function omitIgnoredVideoIds(
    videoIds: readonly string[],
    ignoredVideoIds: ReadonlySet<string>,
): string[] {
  return videoIds.filter((videoId) => !ignoredVideoIds.has(videoId));
}

function readString(object: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = object?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
}
