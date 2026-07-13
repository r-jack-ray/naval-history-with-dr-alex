import { dirname } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import {
  defaultTranscriptStorageRoot,
  fetchVideoTranscript,
  findStoredTranscriptRecord,
  writeTranscriptStorage,
  type FetchVideoTranscriptOptions,
  type VideoTranscript,
} from "./transcripts.js";
import { createRateLimitedFetch } from "./channel-video-links.js";
import {
  defaultVideoMetadataInput,
  defaultVideoMetadataOutput,
  isPublishedButUnstarted,
  readVideoMetadataStore,
  videoNamingMetadata,
  type VideoMetadataRecord,
  type VideoNamingMetadata,
} from "./video-metadata.js";

export const defaultTranscriptBatchInput = defaultVideoMetadataInput;
export const defaultTranscriptBatchStatusOutput = "src/transcripts/fetch-status.json";

export interface TranscriptBatchEpisode {
  videoId: string;
  title?: string;
  publishedAt?: string;
  streamStartAt?: string;
  uploadDate?: string;
  channelOrder?: number;
  tabs: string[];
}

export interface TranscriptBatchFailure {
  videoId: string;
  attemptedAt: string;
  classification: TranscriptFailureClassification;
  error: string;
  title?: string;
  publishedAt?: string;
  channelOrder?: number;
  tabs: string[];
}

export type TranscriptFailureClassification =
  | "no_caption_tracks"
  | "language_unavailable"
  | "empty_transcript"
  | "rate_limited_or_blocked"
  | "fetch_failed";

export interface TranscriptBatchStatus {
  schemaVersion: 1;
  updatedAt: string;
  inputPath: string;
  outputRoot: string;
  requestDelayMs: number;
  retryFailed: boolean;
  force: boolean;
  stats: {
    inputVideoCount: number;
    skippedStoredCount: number;
    skippedUnstartedCount: number;
    skippedPreviousFailureCount: number;
    attemptedCount: number;
    fetchedCount: number;
    failedCount: number;
    pendingCount: number;
    totalFailureCount: number;
  };
  failures: TranscriptBatchFailure[];
  metadataInput?: string;
  language?: string;
  limit?: number;
}

export interface FetchTranscriptBatchOptions {
  inputPath: string;
  outputRoot: string;
  statusOutput: string;
  requestDelayMs: number;
  metadataInput?: string;
  language?: string;
  limit?: number;
  retryFailed?: boolean;
  force?: boolean;
  dryRun?: boolean;
  logger?: (message: string) => void;
  fetchTranscript?: (options: FetchVideoTranscriptOptions) => Promise<VideoTranscript>;
}

interface TranscriptBatchCounters {
  skippedStoredCount: number;
  skippedUnstartedCount: number;
  skippedPreviousFailureCount: number;
  attemptedCount: number;
  fetchedCount: number;
  failedCount: number;
  pendingCount: number;
}

export async function fetchAndStoreTranscriptBatch(
  options: FetchTranscriptBatchOptions,
): Promise<TranscriptBatchStatus> {
  const episodes = await readTranscriptBatchEpisodes(options.inputPath);
  const existingStatus = await readTranscriptBatchStatus(options.statusOutput);
  const failuresById = new Map(existingStatus.failures.map((failure) => [failure.videoId, failure]));
  const metadataById = await readVideoMetadataById(options.metadataInput);
  const sharedFetch = createRateLimitedFetch({
    delayMs: options.requestDelayMs,
    ...(options.logger ? { logger: options.logger } : {}),
  });
  const fetchTranscript = options.fetchTranscript ?? fetchVideoTranscript;
  const counters: TranscriptBatchCounters = {
    skippedStoredCount: 0,
    skippedUnstartedCount: 0,
    skippedPreviousFailureCount: 0,
    attemptedCount: 0,
    fetchedCount: 0,
    failedCount: 0,
    pendingCount: 0,
  };

  for (const videoId of failuresById.keys()) {
    if (isPublishedButUnstarted(metadataById.get(videoId))) {
      failuresById.delete(videoId);
    }
  }

  await writeTranscriptBatchStatus(options, episodes, counters, failuresById);

  for (const episode of episodes) {
    const stored = options.force
      ? undefined
      : await findStoredTranscriptRecord({
        videoId: episode.videoId,
        root: options.outputRoot,
        ...(options.language !== undefined ? { language: options.language } : {}),
      });
    if (stored !== undefined) {
      counters.skippedStoredCount += 1;
      options.logger?.(`Skipping stored transcript: ${episode.videoId}`);
      continue;
    }

    const metadata = metadataById.get(episode.videoId);
    if (isPublishedButUnstarted(metadata)) {
      failuresById.delete(episode.videoId);
      counters.skippedUnstartedCount += 1;
      options.logger?.(`Skipping published but unstarted video: ${episode.videoId}`);
      continue;
    }

    const previousFailure = failuresById.get(episode.videoId);
    if (previousFailure !== undefined && !options.retryFailed) {
      counters.skippedPreviousFailureCount += 1;
      options.logger?.(`Skipping previous transcript failure: ${episode.videoId}`);
      continue;
    }

    if (options.limit !== undefined && counters.attemptedCount >= options.limit) {
      counters.pendingCount += 1;
      continue;
    }

    counters.attemptedCount += 1;
    if (options.dryRun) {
      counters.pendingCount += 1;
      options.logger?.(`Dry run would fetch transcript: ${episode.videoId}`);
      await writeTranscriptBatchStatus(options, episodes, counters, failuresById);
      continue;
    }

    try {
      options.logger?.(`Fetching transcript ${counters.attemptedCount}: ${episode.videoId}`);
      const fetchOptions: FetchVideoTranscriptOptions = {
        videoId: episode.videoId,
        requestDelayMs: options.requestDelayMs,
        fetch: sharedFetch,
      };
      if (options.language !== undefined) {
        fetchOptions.language = options.language;
      }
      if (options.logger !== undefined) {
        fetchOptions.logger = options.logger;
      }

      const transcript = await fetchTranscript(fetchOptions);
      applyNamingMetadata(transcript, namingMetadataForEpisode(episode, metadata));
      const paths = await writeTranscriptStorage(transcript, options.outputRoot);
      failuresById.delete(episode.videoId);
      counters.fetchedCount += 1;
      options.logger?.(`Stored transcript TXT: ${paths.txtOutput}`);
    } catch (error) {
      counters.failedCount += 1;
      const failure = transcriptBatchFailure(episode, error);
      failuresById.set(episode.videoId, failure);
      options.logger?.(`Transcript fetch failed for ${episode.videoId}: ${failure.error}`);
    }

    await writeTranscriptBatchStatus(options, episodes, counters, failuresById);
  }

  return writeTranscriptBatchStatus(options, episodes, counters, failuresById);
}

export async function readTranscriptBatchEpisodes(path: string): Promise<TranscriptBatchEpisode[]> {
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  const object = asRecord(value);
  const episodes = object?.episodes;
  if (!Array.isArray(episodes)) {
    throw new Error("Transcript batch input must contain an episodes array.");
  }

  const seen = new Set<string>();
  const result: TranscriptBatchEpisode[] = [];
  for (const episode of episodes) {
    const record = asRecord(episode);
    const videoId = readString(record, "videoId");
    if (videoId === undefined || seen.has(videoId)) {
      continue;
    }
    seen.add(videoId);

    const batchEpisode: TranscriptBatchEpisode = {
      videoId,
      tabs: readStringArray(record?.tabs),
    };
    const title = readString(record, "title");
    const publishedAt = readString(record, "publishedAt");
    const streamStartAt = readString(record, "streamStartAt");
    const uploadDate = readString(record, "uploadDate");
    const channelOrder = integerValue(record?.channelOrder);

    if (title !== undefined) {
      batchEpisode.title = title;
    }
    if (publishedAt !== undefined) {
      batchEpisode.publishedAt = publishedAt;
    }
    if (streamStartAt !== undefined) {
      batchEpisode.streamStartAt = streamStartAt;
    }
    if (uploadDate !== undefined) {
      batchEpisode.uploadDate = uploadDate;
    }
    if (channelOrder !== undefined) {
      batchEpisode.channelOrder = channelOrder;
    }

    result.push(batchEpisode);
  }

  return result;
}

export async function readTranscriptBatchStatus(path: string): Promise<TranscriptBatchStatus> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    return normalizeTranscriptBatchStatus(value);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return emptyTranscriptBatchStatus();
    }
    throw error;
  }
}

function applyNamingMetadata(transcript: VideoTranscript, metadata: VideoNamingMetadata): void {
  if (metadata.title !== undefined) {
    transcript.videoTitle = metadata.title;
  }
  if (metadata.timestamp !== undefined) {
    transcript.videoPublishedAt = metadata.timestamp;
  }
}

function namingMetadataForEpisode(
  episode: TranscriptBatchEpisode,
  metadataRecord: VideoMetadataRecord | undefined,
): VideoNamingMetadata {
  const metadata = videoNamingMetadata(metadataRecord);
  const result: VideoNamingMetadata = {};
  const title = metadata.title ?? episode.title;
  const timestamp = metadata.timestamp ?? episode.streamStartAt ?? episode.publishedAt ?? episode.uploadDate;

  if (title !== undefined) {
    result.title = title;
  }
  if (timestamp !== undefined) {
    result.timestamp = timestamp;
  }

  return result;
}

async function readVideoMetadataById(path: string | undefined): Promise<ReadonlyMap<string, VideoMetadataRecord>> {
  if (path === undefined) {
    return new Map();
  }

  const store = await readVideoMetadataStore(path);
  return new Map(store?.videos.map((record) => [record.videoId, record]) ?? []);
}

async function writeTranscriptBatchStatus(
  options: FetchTranscriptBatchOptions,
  episodes: TranscriptBatchEpisode[],
  counters: TranscriptBatchCounters,
  failuresById: ReadonlyMap<string, TranscriptBatchFailure>,
): Promise<TranscriptBatchStatus> {
  const status = buildTranscriptBatchStatus(options, episodes, counters, failuresById);
  await mkdir(dirname(options.statusOutput), { recursive: true });
  await writeFile(options.statusOutput, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  return status;
}

function buildTranscriptBatchStatus(
  options: FetchTranscriptBatchOptions,
  episodes: TranscriptBatchEpisode[],
  counters: TranscriptBatchCounters,
  failuresById: ReadonlyMap<string, TranscriptBatchFailure>,
): TranscriptBatchStatus {
  const processedCount = counters.skippedStoredCount +
    counters.skippedUnstartedCount +
    counters.skippedPreviousFailureCount +
    counters.fetchedCount +
    counters.failedCount +
    counters.pendingCount;
  const pendingCount = counters.pendingCount + Math.max(0, episodes.length - processedCount);
  const status: TranscriptBatchStatus = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    inputPath: options.inputPath,
    outputRoot: options.outputRoot,
    requestDelayMs: options.requestDelayMs,
    retryFailed: options.retryFailed ?? false,
    force: options.force ?? false,
    stats: {
      inputVideoCount: episodes.length,
      skippedStoredCount: counters.skippedStoredCount,
      skippedUnstartedCount: counters.skippedUnstartedCount,
      skippedPreviousFailureCount: counters.skippedPreviousFailureCount,
      attemptedCount: counters.attemptedCount,
      fetchedCount: counters.fetchedCount,
      failedCount: counters.failedCount,
      pendingCount,
      totalFailureCount: failuresById.size,
    },
    failures: [...failuresById.values()].sort((left, right) => left.videoId.localeCompare(right.videoId)),
  };

  if (options.metadataInput !== undefined) {
    status.metadataInput = options.metadataInput;
  }
  if (options.language !== undefined) {
    status.language = options.language;
  }
  if (options.limit !== undefined) {
    status.limit = options.limit;
  }

  return status;
}

function transcriptBatchFailure(episode: TranscriptBatchEpisode, error: unknown): TranscriptBatchFailure {
  const message = error instanceof Error ? error.message : String(error);
  const failure: TranscriptBatchFailure = {
    videoId: episode.videoId,
    attemptedAt: new Date().toISOString(),
    classification: classifyTranscriptFailure(message),
    error: message,
    tabs: episode.tabs,
  };

  if (episode.title !== undefined) {
    failure.title = episode.title;
  }
  if (episode.publishedAt !== undefined) {
    failure.publishedAt = episode.publishedAt;
  }
  if (episode.channelOrder !== undefined) {
    failure.channelOrder = episode.channelOrder;
  }

  return failure;
}

function classifyTranscriptFailure(message: string): TranscriptFailureClassification {
  if (/no caption tracks?/iu.test(message)) {
    return "no_caption_tracks";
  }
  if (/no caption track matched language/iu.test(message)) {
    return "language_unavailable";
  }
  if (/no segments|no transcript segments|contained no transcript/iu.test(message)) {
    return "empty_transcript";
  }
  if (/\b429\b|too many requests|blocked|captcha|temporar(?:y|ily)/iu.test(message)) {
    return "rate_limited_or_blocked";
  }

  return "fetch_failed";
}

function normalizeTranscriptBatchStatus(value: unknown): TranscriptBatchStatus {
  const object = asRecord(value);
  if (!object || !Array.isArray(object.failures)) {
    return emptyTranscriptBatchStatus();
  }

  return {
    ...emptyTranscriptBatchStatus(),
    failures: object.failures
      .map((failure) => transcriptBatchFailureFromJson(failure))
      .filter((failure): failure is TranscriptBatchFailure => failure !== undefined),
  };
}

function transcriptBatchFailureFromJson(value: unknown): TranscriptBatchFailure | undefined {
  const object = asRecord(value);
  const videoId = readString(object, "videoId");
  const attemptedAt = readString(object, "attemptedAt");
  const error = readString(object, "error");
  const classification = readTranscriptFailureClassification(object?.classification);
  if (!object || videoId === undefined || attemptedAt === undefined || error === undefined) {
    return undefined;
  }

  const failure: TranscriptBatchFailure = {
    videoId,
    attemptedAt,
    classification,
    error,
    tabs: readStringArray(object.tabs),
  };
  const title = readString(object, "title");
  const publishedAt = readString(object, "publishedAt");
  const channelOrder = integerValue(object.channelOrder);

  if (title !== undefined) {
    failure.title = title;
  }
  if (publishedAt !== undefined) {
    failure.publishedAt = publishedAt;
  }
  if (channelOrder !== undefined) {
    failure.channelOrder = channelOrder;
  }

  return failure;
}

function readTranscriptFailureClassification(value: unknown): TranscriptFailureClassification {
  return value === "no_caption_tracks" ||
    value === "language_unavailable" ||
    value === "empty_transcript" ||
    value === "rate_limited_or_blocked" ||
    value === "fetch_failed"
    ? value
    : "fetch_failed";
}

function emptyTranscriptBatchStatus(): TranscriptBatchStatus {
  return {
    schemaVersion: 1,
    updatedAt: new Date(0).toISOString(),
    inputPath: "",
    outputRoot: defaultTranscriptStorageRoot,
    requestDelayMs: 5_000,
    retryFailed: false,
    force: false,
    stats: {
      inputVideoCount: 0,
      skippedStoredCount: 0,
      skippedUnstartedCount: 0,
      skippedPreviousFailureCount: 0,
      attemptedCount: 0,
      fetchedCount: 0,
      failedCount: 0,
      pendingCount: 0,
      totalFailureCount: 0,
    },
    failures: [],
  };
}

function readString(object: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = object?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function integerValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}
