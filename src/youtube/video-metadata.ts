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
  refreshVideoIds?: string[];
  logger?: (message: string) => void;
}

export interface VideoNamingMetadata {
  title?: string;
  timestamp?: string;
  dateKind?: VideoDateKind;
  videoKind?: VideoKind;
}

export type VideoDateKind = "actual_start" | "scheduled_start" | "published";
export type VideoKind = "upload" | "stream";
export type VideoReadinessReason =
  | "upcoming"
  | "live_in_progress"
  | "processing"
  | "metadata_missing"
  | "invalid_metadata";

export const maxBlockedTranscriptDurationSeconds = 61;
export const defaultDeferredMetadataRetryDelayMs = 24 * 60 * 60 * 1_000;

export type VideoStateResult =
  | {
      state: "ready";
      videoKind: VideoKind;
      videoDateAt: string;
      videoDateKind: VideoDateKind;
      durationSeconds: number;
    }
  | {
      state: "deferred";
      videoKind: VideoKind;
      reason: VideoReadinessReason;
      diagnostic: string;
    }
  | {
      state: "invalid";
      videoKind: VideoKind;
      reason: VideoReadinessReason;
      diagnostic: string;
    };

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
  const state = resolveVideoState(record);
  const metadata: VideoNamingMetadata = {};

  if (title !== undefined) {
    metadata.title = title;
  }
  if (state.state === "ready") {
    metadata.timestamp = state.videoDateAt;
    metadata.dateKind = state.videoDateKind;
    metadata.videoKind = state.videoKind;
  }

  return metadata;
}

/** @deprecated Use resolveVideoState so completion and processing are checked together. */
export function isPublishedButUnstarted(record: VideoMetadataRecord | undefined): boolean {
  return record?.liveStreamingDetails?.scheduledStartTime != null &&
    record.liveStreamingDetails.actualStartTime == null;
}

export function resolveVideoState(record: VideoMetadataRecord | undefined): VideoStateResult {
  if (record === undefined) {
    return invalidVideoState("upload", "metadata_missing", "Video metadata is missing.");
  }

  const videoKind: VideoKind = record.liveStreamingDetails !== undefined ||
    record.snippet?.liveBroadcastContent === "upcoming" ||
    record.snippet?.liveBroadcastContent === "live"
    ? "stream"
    : "upload";
  const broadcastState = record.snippet?.liveBroadcastContent ?? undefined;
  if (broadcastState === "upcoming") {
    return deferredVideoState(videoKind, "upcoming", "The video is scheduled but has not started.");
  }
  if (broadcastState === "live") {
    return deferredVideoState(videoKind, "live_in_progress", "The livestream is currently in progress.");
  }

  const uploadStatus = record.status?.uploadStatus ?? undefined;
  if (uploadStatus !== "processed") {
    if (uploadStatus === "uploaded") {
      return deferredVideoState(videoKind, "processing", "YouTube has not finished processing the video.");
    }
    return invalidVideoState(
      videoKind,
      uploadStatus === undefined ? "metadata_missing" : "invalid_metadata",
      uploadStatus === undefined
        ? "Video metadata is missing status.uploadStatus."
        : `YouTube upload status is ${uploadStatus}, not processed.`,
    );
  }

  const durationSeconds = parseYoutubeDurationSeconds(record.contentDetails?.duration ?? undefined);
  if (durationSeconds === undefined || durationSeconds <= 0) {
    return invalidVideoState(
      videoKind,
      "invalid_metadata",
      `Processed video has an invalid or non-positive duration: ${record.contentDetails?.duration ?? "missing"}.`,
    );
  }

  const actualStartTime = canonicalVideoTimestamp(record.liveStreamingDetails?.actualStartTime ?? undefined);
  const scheduledStartTime = canonicalVideoTimestamp(record.liveStreamingDetails?.scheduledStartTime ?? undefined);
  const actualEndTime = canonicalVideoTimestamp(record.liveStreamingDetails?.actualEndTime ?? undefined);
  const publishedAt = canonicalVideoTimestamp(record.snippet?.publishedAt ?? undefined);
  const malformedTimestamp = [actualStartTime, scheduledStartTime, actualEndTime, publishedAt]
    .find((value) => value === null);
  if (malformedTimestamp === null) {
    return invalidVideoState(videoKind, "invalid_metadata", "Video metadata contains a malformed timestamp.");
  }

  if (videoKind === "stream") {
    if (actualEndTime === undefined) {
      return deferredVideoState(
        videoKind,
        "live_in_progress",
        "Livestream metadata does not yet prove completion with actualEndTime.",
      );
    }
    if (
      typeof actualStartTime === "string" &&
      typeof actualEndTime === "string" &&
      Date.parse(actualEndTime) < Date.parse(actualStartTime)
    ) {
      return invalidVideoState(videoKind, "invalid_metadata", "Livestream actualEndTime precedes actualStartTime.");
    }
  }

  const candidates: [VideoDateKind, string | undefined][] = [
    ["actual_start", actualStartTime ?? undefined],
    ["scheduled_start", scheduledStartTime ?? undefined],
    ["published", publishedAt ?? undefined],
  ];
  const selected = candidates.find(([, value]) => value !== undefined);
  if (selected === undefined || selected[1] === undefined) {
    return invalidVideoState(videoKind, "metadata_missing", "No canonical publication or stream timestamp is available.");
  }

  return {
    state: "ready",
    videoKind,
    videoDateAt: selected[1],
    videoDateKind: selected[0],
    durationSeconds,
  };
}

export function resolveVideoFetchState(
  record: VideoMetadataRecord | undefined,
  metadataLookupEnabled: boolean,
): VideoStateResult | undefined {
  return metadataLookupEnabled ? resolveVideoState(record) : undefined;
}

export function deferredMetadataRetryAt(
  record: VideoMetadataRecord,
  retryDelayMs = defaultDeferredMetadataRetryDelayMs,
): string | undefined {
  if (resolveVideoState(record).state !== "deferred") {
    return undefined;
  }

  const scheduledStartAt = canonicalVideoTimestamp(record.liveStreamingDetails?.scheduledStartTime ?? undefined);
  const fetchedAtMs = Date.parse(record.fetchedAt);
  const retryBases = [
    ...(typeof scheduledStartAt === "string" ? [Date.parse(scheduledStartAt)] : []),
    ...(Number.isFinite(fetchedAtMs) ? [fetchedAtMs] : []),
  ];
  if (retryBases.length === 0) {
    return undefined;
  }

  return new Date(Math.max(...retryBases) + retryDelayMs).toISOString();
}

export function selectVideoMetadataTargetIds(options: {
  videoIds: readonly string[];
  recordsById: ReadonlyMap<string, VideoMetadataRecord>;
  refreshVideoIds?: readonly string[];
  force?: boolean;
  now?: Date;
  deferredRetryDelayMs?: number;
}): string[] {
  if (options.force) {
    return [...options.videoIds];
  }

  const refreshIds = new Set(options.refreshVideoIds ?? []);
  const nowMs = (options.now ?? new Date()).getTime();
  const retryDelayMs = options.deferredRetryDelayMs ?? defaultDeferredMetadataRetryDelayMs;
  return options.videoIds.filter((videoId) => {
    const record = options.recordsById.get(videoId);
    if (record === undefined || refreshIds.has(videoId)) {
      return true;
    }

    const retryAt = deferredMetadataRetryAt(record, retryDelayMs);
    return retryAt !== undefined && Date.parse(retryAt) <= nowMs;
  });
}

export function canonicalVideoTimestamp(value: string | undefined): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  const timestamp = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.0+)?(?:Z|[+-]\d{2}:?\d{2})$/u.test(timestamp)) {
    return null;
  }
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) {
    return null;
  }
  return new Date(milliseconds).toISOString().replace(/\.000Z$/u, "Z");
}

export function parseYoutubeDurationSeconds(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/u.exec(value);
  if (match === null || match.slice(1).every((part) => part === undefined)) {
    return undefined;
  }
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const total = (days * 86_400) + (hours * 3_600) + (minutes * 60) + seconds;
  return Number.isFinite(total) ? total : undefined;
}

export function isBlockedTranscriptDuration(durationSeconds: number | undefined): boolean {
  // YouTube can report a nominal 60-second clip as 61 seconds because of
  // container rounding or padding. Keep the tolerance narrow so eligibility
  // begins at 62 seconds.
  return durationSeconds !== undefined &&
    durationSeconds > 0 &&
    durationSeconds <= maxBlockedTranscriptDurationSeconds;
}

function deferredVideoState(
  videoKind: VideoKind,
  reason: VideoReadinessReason,
  diagnostic: string,
): VideoStateResult {
  return { state: "deferred", videoKind, reason, diagnostic };
}

function invalidVideoState(
  videoKind: VideoKind,
  reason: VideoReadinessReason,
  diagnostic: string,
): VideoStateResult {
  return { state: "invalid", videoKind, reason, diagnostic };
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
  const targetIds = selectVideoMetadataTargetIds({
    videoIds,
    recordsById,
    ...(options.refreshVideoIds !== undefined ? { refreshVideoIds: options.refreshVideoIds } : {}),
    ...(options.force !== undefined ? { force: options.force } : {}),
  });
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
    await gate(`videos.list full metadata ${index + 1}-${index + batch.length}/${pendingIds.length}`);
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
