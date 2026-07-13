import { dirname } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { google, type youtube_v3 } from "googleapis";

export const defaultVideoMetadataInput = "src/channel/episodes.json";
export const defaultVideoMetadataOutput = "src/channel/video-metadata.json";
export const defaultVideoMetadataParts = [
  "snippet",
  "contentDetails",
  "statistics",
  "status",
  "liveStreamingDetails",
] as const;

export interface VideoMetadataStore {
  schemaVersion: 1;
  generatedAt: string;
  source: {
    api: "youtube-data-api-v3";
    inputPath: string;
    additionalVideoIds?: string[];
    requestDelayMs: number;
    batchSize: number;
    parts: string[];
  };
  stats: {
    inputVideoCount: number;
    storedVideoCount: number;
    pendingVideoCount: number;
    missingVideoCount: number;
    batchesFetched: number;
  };
  pendingVideoIds: string[];
  missingVideoIds: string[];
  videos: VideoMetadataRecord[];
}

export interface VideoMetadataRecord {
  videoId: string;
  fetchedAt: string;
  etag?: string;
  kind?: string;
  snippet?: youtube_v3.Schema$VideoSnippet;
  contentDetails?: youtube_v3.Schema$VideoContentDetails;
  statistics?: youtube_v3.Schema$VideoStatistics;
  status?: youtube_v3.Schema$VideoStatus;
  liveStreamingDetails?: youtube_v3.Schema$VideoLiveStreamingDetails;
}

export interface FetchVideoMetadataOptions {
  apiKey: string;
  inputPath: string;
  outputPath: string;
  requestDelayMs: number;
  batchSize: number;
  limit?: number;
  force?: boolean;
  additionalVideoIds?: string[];
  logger?: (message: string) => void;
}

export interface VideoNamingMetadata {
  title?: string;
  timestamp?: string;
}

export function readVideoIdsFromEpisodeMaster(value: unknown): string[] {
  const object = asRecord(value);
  const episodes = object?.episodes;
  if (!Array.isArray(episodes)) {
    throw new Error("Episode master must contain an episodes array.");
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const episode of episodes) {
    const videoId = readString(asRecord(episode), "videoId");
    if (videoId !== undefined && !seen.has(videoId)) {
      seen.add(videoId);
      ids.push(videoId);
    }
  }

  return ids;
}

export function mergeVideoIds(videoIds: readonly string[], additionalVideoIds: readonly string[] = []): string[] {
  return [...new Set([...videoIds, ...additionalVideoIds])];
}

export function resolveAdditionalVideoIds(
  inputVideoIds: readonly string[],
  storedAdditionalVideoIds: readonly string[] = [],
  requestedAdditionalVideoIds: readonly string[] = [],
): string[] {
  const inputIds = new Set(inputVideoIds);
  return mergeVideoIds(storedAdditionalVideoIds, requestedAdditionalVideoIds)
    .filter((videoId) => !inputIds.has(videoId));
}

export async function findVideoMetadataRecord(
  videoId: string,
  path = defaultVideoMetadataOutput,
): Promise<VideoMetadataRecord | undefined> {
  const store = await readVideoMetadataStore(path);
  return store?.videos.find((record) => record.videoId === videoId);
}

export async function readVideoMetadataStore(path = defaultVideoMetadataOutput): Promise<VideoMetadataStore | undefined> {
  return readExistingStore(path);
}

export function videoNamingMetadata(record: VideoMetadataRecord | undefined): VideoNamingMetadata {
  if (record === undefined) {
    return {};
  }

  const title = record.snippet?.title ?? undefined;
  const timestamp = record.liveStreamingDetails?.actualStartTime ??
    record.liveStreamingDetails?.scheduledStartTime ??
    record.snippet?.publishedAt ??
    undefined;
  const metadata: VideoNamingMetadata = {};

  if (title !== undefined) {
    metadata.title = title;
  }
  if (timestamp !== undefined) {
    metadata.timestamp = timestamp;
  }

  return metadata;
}

export function isPublishedButUnstarted(record: VideoMetadataRecord | undefined): boolean {
  return record?.liveStreamingDetails?.scheduledStartTime != null &&
    record.liveStreamingDetails.actualStartTime == null;
}

export async function fetchAndStoreVideoMetadata(options: FetchVideoMetadataOptions): Promise<VideoMetadataStore> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error("A YouTube Data API key is required. Pass --api-key or set YOUTUBE_API_KEY.");
  }

  const input = JSON.parse(await readFile(options.inputPath, "utf8")) as unknown;
  const existing = await readExistingStore(options.outputPath);
  const inputVideoIds = readVideoIdsFromEpisodeMaster(input);
  const additionalVideoIds = resolveAdditionalVideoIds(
    inputVideoIds,
    existing?.source.additionalVideoIds,
    options.additionalVideoIds,
  );
  const videoIds = mergeVideoIds(inputVideoIds, additionalVideoIds);
  const recordsById = new Map(existing?.videos.map((record) => [record.videoId, record]) ?? []);
  const targetIds = options.force ? videoIds : videoIds.filter((videoId) => !recordsById.has(videoId));
  const pendingIds = options.limit === undefined ? targetIds : targetIds.slice(0, options.limit);
  const youtube = google.youtube({ version: "v3", auth: apiKey });
  const gateOptions: {
    delayMs: number;
    logger?: (message: string) => void;
  } = {
    delayMs: options.requestDelayMs,
  };
  if (options.logger !== undefined) {
    gateOptions.logger = options.logger;
  }
  const gate = createRequestGate(gateOptions);
  let batchesFetched = 0;

  for (let index = 0; index < pendingIds.length; index += options.batchSize) {
    const batch = pendingIds.slice(index, index + options.batchSize);
    await gate(`videos.list ${index + 1}-${index + batch.length}/${pendingIds.length}`);
    const response = await youtube.videos.list({
      part: [...defaultVideoMetadataParts],
      id: batch,
      maxResults: batch.length,
    });
    const fetchedAt = new Date().toISOString();
    batchesFetched += 1;

    for (const video of response.data.items ?? []) {
      const record = videoToMetadataRecord(video, fetchedAt);
      if (record !== undefined) {
        recordsById.set(record.videoId, record);
      }
    }

    await writeVideoMetadataStore(options.outputPath, buildVideoMetadataStore({
      inputPath: options.inputPath,
      requestDelayMs: options.requestDelayMs,
      batchSize: options.batchSize,
      videoIds,
      recordsById,
      batchesFetched,
      ...(additionalVideoIds.length > 0 ? { additionalVideoIds } : {}),
    }));
    options.logger?.(`Stored metadata for ${recordsById.size}/${videoIds.length} videos.`);
  }

  const store = buildVideoMetadataStore({
    inputPath: options.inputPath,
    requestDelayMs: options.requestDelayMs,
    batchSize: options.batchSize,
    videoIds,
    recordsById,
    batchesFetched,
    ...(additionalVideoIds.length > 0 ? { additionalVideoIds } : {}),
  });
  if (batchesFetched === 0) {
    await writeVideoMetadataStore(options.outputPath, store);
  }
  return store;
}

export function buildVideoMetadataStore(options: {
  inputPath: string;
  requestDelayMs: number;
  batchSize: number;
  videoIds: string[];
  recordsById: ReadonlyMap<string, VideoMetadataRecord>;
  batchesFetched: number;
  additionalVideoIds?: string[];
}): VideoMetadataStore {
  const videos = options.videoIds
    .map((videoId) => options.recordsById.get(videoId))
    .filter((record): record is VideoMetadataRecord => record !== undefined);
  const pendingVideoIds = options.videoIds.filter((videoId) => !options.recordsById.has(videoId));
  const missingVideoIds = pendingVideoIds;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      api: "youtube-data-api-v3",
      inputPath: options.inputPath,
      ...(options.additionalVideoIds !== undefined ? { additionalVideoIds: options.additionalVideoIds } : {}),
      requestDelayMs: options.requestDelayMs,
      batchSize: options.batchSize,
      parts: [...defaultVideoMetadataParts],
    },
    stats: {
      inputVideoCount: options.videoIds.length,
      storedVideoCount: videos.length,
      pendingVideoCount: pendingVideoIds.length,
      missingVideoCount: missingVideoIds.length,
      batchesFetched: options.batchesFetched,
    },
    pendingVideoIds,
    missingVideoIds,
    videos,
  };
}

async function readExistingStore(path: string): Promise<VideoMetadataStore | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as VideoMetadataStore;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function writeVideoMetadataStore(path: string, store: VideoMetadataStore): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function videoToMetadataRecord(
  video: youtube_v3.Schema$Video,
  fetchedAt: string,
): VideoMetadataRecord | undefined {
  const videoId = video.id ?? undefined;
  if (videoId === undefined) {
    return undefined;
  }

  const record: VideoMetadataRecord = {
    videoId,
    fetchedAt,
  };

  if (video.etag !== undefined && video.etag !== null) {
    record.etag = video.etag;
  }
  if (video.kind !== undefined && video.kind !== null) {
    record.kind = video.kind;
  }
  if (video.snippet !== undefined && video.snippet !== null) {
    record.snippet = video.snippet;
  }
  if (video.contentDetails !== undefined && video.contentDetails !== null) {
    record.contentDetails = video.contentDetails;
  }
  if (video.statistics !== undefined && video.statistics !== null) {
    record.statistics = video.statistics;
  }
  if (video.status !== undefined && video.status !== null) {
    record.status = video.status;
  }
  if (video.liveStreamingDetails !== undefined && video.liveStreamingDetails !== null) {
    record.liveStreamingDetails = video.liveStreamingDetails;
  }

  return record;
}

function createRequestGate(options: {
  delayMs: number;
  logger?: (message: string) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): (label: string) => Promise<void> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());
  let lastStartMs: number | undefined;
  let requestCount = 0;

  return async (label: string) => {
    if (lastStartMs !== undefined) {
      const waitMs = Math.max(0, lastStartMs + options.delayMs - now());
      if (waitMs > 0) {
        options.logger?.(`Waiting ${Math.ceil(waitMs / 1000)}s before the next YouTube Data API request.`);
        await sleep(waitMs);
      }
    }

    lastStartMs = now();
    requestCount += 1;
    options.logger?.(`YouTube Data API request ${requestCount}: ${label}`);
  };
}

function readString(object: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = object?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
