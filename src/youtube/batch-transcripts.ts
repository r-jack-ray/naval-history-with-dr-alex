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
import { isBlockedTranscriptDuration } from "./channel-video-links.js";
import {
  defaultVideoMetadataInput,
  defaultVideoMetadataOutput,
  readVideoMetadataStore,
  resolveVideoState,
  videoNamingMetadata,
  type VideoDateKind,
  type VideoMetadataRecord,
  type VideoNamingMetadata,
  type VideoReadinessReason,
  type VideoStateResult,
} from "./video-metadata.js";

export const defaultTranscriptBatchInput = defaultVideoMetadataInput;
export const defaultTranscriptBatchStatusOutput = "src/transcripts/fetch-status.json";

export interface TranscriptBatchEpisode {
  videoId: string;
  title?: string;
  publishedAt?: string;
  scheduledStartAt?: string;
  actualStartAt?: string;
  actualEndAt?: string;
  videoDateAt?: string;
  videoDateKind?: VideoDateKind;
  channelOrder?: number;
  tabs: string[];
}

export interface TranscriptBatchFailure {
  videoId: string;
  attemptedAt: string;
  classification: TranscriptFailureClassification;
  error: string;
  title?: string;
  videoDateAt?: string;
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
  schemaVersion: 2;
  updatedAt: string;
  inputPath: string;
  outputRoot: string;
  requestDelayMs: number;
  retryFailed: boolean;
  force: boolean;
  stats: {
    inputVideoCount: number;
    skippedStoredCount: number;
    skippedDeferredCount: number;
    skippedShortDurationCount: number;
    deferredCounts: Record<VideoReadinessReason, number>;
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
  skippedDeferredCount: number;
  skippedShortDurationCount: number;
  deferredCounts: Record<VideoReadinessReason, number>;
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
    skippedDeferredCount: 0,
    skippedShortDurationCount: 0,
    deferredCounts: emptyDeferredCounts(),
    skippedPreviousFailureCount: 0,
    attemptedCount: 0,
    fetchedCount: 0,
    failedCount: 0,
    pendingCount: 0,
  };

  for (const videoId of failuresById.keys()) {
    const state = resolveVideoState(metadataById.get(videoId));
    if (state.state === "deferred" || (state.state === "ready" && isBlockedTranscriptDuration(state.durationSeconds))) {
      failuresById.delete(videoId);
    }
  }

  await writeTranscriptBatchStatus(options, episodes, counters, failuresById);

  for (const episode of episodes) {
    const metadata = metadataById.get(episode.videoId);
    const state = resolveVideoState(metadata);
    if (state.state === "ready" && isBlockedTranscriptDuration(state.durationSeconds)) {
      failuresById.delete(episode.videoId);
      counters.skippedShortDurationCount += 1;
      options.logger?.(`Blocking short video ${episode.videoId}: duration=${state.durationSeconds}s`);
      continue;
    }

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

    if (state.state !== "ready") {
      if (state.state === "deferred") {
        failuresById.delete(episode.videoId);
      }
      counters.skippedDeferredCount += 1;
      counters.deferredCounts[state.reason] += 1;
      options.logger?.(`Skipping not-ready video ${episode.videoId}: ${state.reason} (${state.diagnostic})`);
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
      applyNamingMetadata(transcript, namingMetadataForEpisode(episode, metadata, state));
      const paths = await writeTranscriptStorage(transcript, options.outputRoot);
      failuresById.delete(episode.videoId);
      counters.fetchedCount += 1;
      options.logger?.(`Stored transcript TXT: ${paths.txtOutput}`);
    } catch (error) {
      counters.failedCount += 1;
      const failure = transcriptBatchFailure(episode, error, state.videoDateAt);
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
    const scheduledStartAt = readString(record, "scheduledStartAt");
    const actualStartAt = readString(record, "actualStartAt");
    const actualEndAt = readString(record, "actualEndAt");
    const videoDateAt = readString(record, "videoDateAt");
    const videoDateKind = readVideoDateKind(record?.videoDateKind);
    const channelOrder = integerValue(record?.channelOrder);

    if (title !== undefined) {
      batchEpisode.title = title;
    }
    if (publishedAt !== undefined) {
      batchEpisode.publishedAt = publishedAt;
    }
    if (scheduledStartAt !== undefined) {
      batchEpisode.scheduledStartAt = scheduledStartAt;
    }
    if (actualStartAt !== undefined) {
      batchEpisode.actualStartAt = actualStartAt;
    }
    if (actualEndAt !== undefined) {
      batchEpisode.actualEndAt = actualEndAt;
    }
    if (videoDateAt !== undefined) {
      batchEpisode.videoDateAt = videoDateAt;
    }
    if (videoDateKind !== undefined) {
      batchEpisode.videoDateKind = videoDateKind;
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
    transcript.videoDateAt = metadata.timestamp;
  }
  if (metadata.dateKind !== undefined) {
    transcript.videoDateKind = metadata.dateKind;
  }
}

function namingMetadataForEpisode(
  episode: TranscriptBatchEpisode,
  metadataRecord: VideoMetadataRecord | undefined,
  state: Extract<VideoStateResult, { state: "ready" }>,
): VideoNamingMetadata {
  const metadata = videoNamingMetadata(metadataRecord);
  const result: VideoNamingMetadata = {};
  const title = metadata.title ?? episode.title;
  const timestamp = metadata.timestamp ?? state.videoDateAt ?? episode.videoDateAt;

  if (title !== undefined) {
    result.title = title;
  }
  if (timestamp !== undefined) {
    result.timestamp = timestamp;
  }
  result.dateKind = metadata.dateKind ?? state.videoDateKind ?? episode.videoDateKind;
  result.videoKind = metadata.videoKind ?? state.videoKind;

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
    counters.skippedDeferredCount +
    counters.skippedShortDurationCount +
    counters.skippedPreviousFailureCount +
    counters.fetchedCount +
    counters.failedCount +
    counters.pendingCount;
  const pendingCount = counters.pendingCount + Math.max(0, episodes.length - processedCount);
  const status: TranscriptBatchStatus = {
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    inputPath: options.inputPath,
    outputRoot: options.outputRoot,
    requestDelayMs: options.requestDelayMs,
    retryFailed: options.retryFailed ?? false,
    force: options.force ?? false,
    stats: {
      inputVideoCount: episodes.length,
      skippedStoredCount: counters.skippedStoredCount,
      skippedDeferredCount: counters.skippedDeferredCount,
      skippedShortDurationCount: counters.skippedShortDurationCount,
      deferredCounts: { ...counters.deferredCounts },
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

function transcriptBatchFailure(
  episode: TranscriptBatchEpisode,
  error: unknown,
  videoDateAt: string,
): TranscriptBatchFailure {
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
  failure.videoDateAt = videoDateAt;
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
  const videoDateAt = readString(object, "videoDateAt") ?? readString(object, "publishedAt");
  const channelOrder = integerValue(object.channelOrder);

  if (title !== undefined) {
    failure.title = title;
  }
  if (videoDateAt !== undefined) {
    failure.videoDateAt = videoDateAt;
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
    schemaVersion: 2,
    updatedAt: new Date(0).toISOString(),
    inputPath: "",
    outputRoot: defaultTranscriptStorageRoot,
    requestDelayMs: 5_000,
    retryFailed: false,
    force: false,
    stats: {
      inputVideoCount: 0,
      skippedStoredCount: 0,
      skippedDeferredCount: 0,
      skippedShortDurationCount: 0,
      deferredCounts: emptyDeferredCounts(),
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

function emptyDeferredCounts(): Record<VideoReadinessReason, number> {
  return {
    upcoming: 0,
    live_in_progress: 0,
    processing: 0,
    metadata_missing: 0,
    invalid_metadata: 0,
  };
}

function readVideoDateKind(value: unknown): VideoDateKind | undefined {
  return value === "actual_start" || value === "scheduled_start" || value === "published"
    ? value
    : undefined;
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
