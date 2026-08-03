export interface YoutubeChannel {
  id?: string | null;
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string | null;
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface YoutubePlaylistItem {
  contentDetails?: {
    videoId?: string | null;
    videoPublishedAt?: string | null;
    [key: string]: unknown;
  } | null;
  snippet?: {
    title?: string | null;
    publishedAt?: string | null;
    resourceId?: {
      videoId?: string | null;
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface YoutubeVideoSnippet {
  title?: string | null;
  description?: string | null;
  publishedAt?: string | null;
  liveBroadcastContent?: string | null;
  thumbnails?: {
    default?: YoutubeThumbnail | null;
    medium?: YoutubeThumbnail | null;
    high?: YoutubeThumbnail | null;
    standard?: YoutubeThumbnail | null;
    maxres?: YoutubeThumbnail | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface YoutubeThumbnail {
  url?: string | null;
  width?: number | null;
  height?: number | null;
  [key: string]: unknown;
}

export interface YoutubeVideoContentDetails {
  duration?: string | null;
  [key: string]: unknown;
}

export interface YoutubeVideoStatistics {
  viewCount?: string | null;
  likeCount?: string | null;
  commentCount?: string | null;
  [key: string]: unknown;
}

export interface YoutubeVideoStatus {
  uploadStatus?: string | null;
  [key: string]: unknown;
}

export interface YoutubeVideoLiveStreamingDetails {
  scheduledStartTime?: string | null;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  [key: string]: unknown;
}

export interface YoutubeVideo {
  id?: string | null;
  etag?: string | null;
  kind?: string | null;
  snippet?: YoutubeVideoSnippet | null;
  contentDetails?: YoutubeVideoContentDetails | null;
  statistics?: YoutubeVideoStatistics | null;
  status?: YoutubeVideoStatus | null;
  liveStreamingDetails?: YoutubeVideoLiveStreamingDetails | null;
  [key: string]: unknown;
}

export interface YoutubeListResponse<T> {
  items: T[];
  nextPageToken?: string;
}

export interface ListChannelsParams {
  part: readonly string[];
  id?: readonly string[];
  forHandle?: string;
}

export interface ListPlaylistItemsParams {
  part: readonly string[];
  playlistId: string;
  maxResults: number;
  pageToken?: string;
}

export interface ListVideosParams {
  part: readonly string[];
  id: readonly string[];
  maxResults: number;
}

export interface YoutubeDataApiClient {
  listChannels(params: ListChannelsParams, label?: string): Promise<YoutubeListResponse<YoutubeChannel>>;
  listPlaylistItems(
    params: ListPlaylistItemsParams,
    label?: string,
  ): Promise<YoutubeListResponse<YoutubePlaylistItem>>;
  listVideos(params: ListVideosParams, label?: string): Promise<YoutubeListResponse<YoutubeVideo>>;
}

export interface YoutubeDataApiClientOptions {
  apiKey: string;
  requestDelayMs: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  logger?: (message: string) => void;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  maxRetryDelayMs?: number;
}

const youtubeDataApiRoot = "https://www.googleapis.com/youtube/v3/";
const defaultMaxAttempts = 3;
const defaultRetryBaseDelayMs = 1_000;
const defaultMaxRetryDelayMs = 60_000;
const transientStatusCodes = new Set([408, 429, 500, 502, 503, 504]);

export function createYoutubeDataApiClient(options: YoutubeDataApiClientOptions): YoutubeDataApiClient {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error("A YouTube Data API key is required. Pass --api-key or set YOUTUBE_API_KEY.");
  }
  assertNonNegativeInteger(options.requestDelayMs, "requestDelayMs");
  const maxAttempts = options.maxAttempts ?? defaultMaxAttempts;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("maxAttempts must be a positive integer.");
  }
  const retryBaseDelayMs = options.retryBaseDelayMs ?? defaultRetryBaseDelayMs;
  assertNonNegativeInteger(retryBaseDelayMs, "retryBaseDelayMs");
  const maxRetryDelayMs = options.maxRetryDelayMs ?? defaultMaxRetryDelayMs;
  assertNonNegativeInteger(maxRetryDelayMs, "maxRetryDelayMs");

  const baseFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());
  let lastRequestStartMs: number | undefined;
  let requestCount = 0;

  const waitForRequestSlot = async (label: string, attempt: number): Promise<void> => {
    if (lastRequestStartMs !== undefined) {
      const waitMs = Math.max(0, lastRequestStartMs + options.requestDelayMs - now());
      if (waitMs > 0) {
        options.logger?.(`Waiting ${Math.ceil(waitMs / 1000)}s before the next YouTube Data API request.`);
        await sleep(waitMs);
      }
    }

    lastRequestStartMs = now();
    requestCount += 1;
    const attemptLabel = attempt === 1 ? "" : ` (attempt ${attempt}/${maxAttempts})`;
    options.logger?.(`YouTube Data API request ${requestCount}: ${label}${attemptLabel}`);
  };

  const request = async <T extends Record<string, unknown>>(
    resource: string,
    params: URLSearchParams,
    label: string,
  ): Promise<YoutubeListResponse<T>> => {
    params.set("key", apiKey);
    const requestUrl = new URL(resource, youtubeDataApiRoot);
    requestUrl.search = params.toString();

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await waitForRequestSlot(label, attempt);
      let response: Response;
      try {
        response = await baseFetch(requestUrl, {
          headers: { accept: "application/json" },
        });
      } catch (error) {
        if (attempt < maxAttempts) {
          const retryDelayMs = boundedExponentialDelay(
            retryBaseDelayMs,
            attempt,
            maxRetryDelayMs,
          );
          options.logger?.(
            `YouTube Data API ${label} failed before receiving a response; retrying in ${retryDelayMs}ms.`,
          );
          await sleep(retryDelayMs);
          continue;
        }
        throw new Error(
          `YouTube Data API ${label} failed after ${maxAttempts} attempts: ${safeErrorMessage(error, apiKey)}`,
        );
      }

      if (!response.ok) {
        const responseMessage = await readErrorResponse(response, apiKey);
        const retryable = transientStatusCodes.has(response.status);
        if (retryable && attempt < maxAttempts) {
          const retryDelayMs = retryDelayFromResponse(
            response,
            now(),
            boundedExponentialDelay(retryBaseDelayMs, attempt, maxRetryDelayMs),
            maxRetryDelayMs,
          );
          options.logger?.(
            `YouTube Data API ${label} returned HTTP ${response.status}; retrying in ${retryDelayMs}ms.`,
          );
          await sleep(retryDelayMs);
          continue;
        }

        const exhaustion = retryable ? ` after ${attempt} attempts` : "";
        throw new Error(
          `YouTube Data API ${label} failed${exhaustion} with HTTP ${response.status}` +
          `${response.statusText ? ` ${response.statusText}` : ""}${responseMessage ? `: ${responseMessage}` : "."}`,
        );
      }

      return parseListResponse<T>(await readSuccessfulResponse(response, label), label);
    }

    throw new Error(`YouTube Data API ${label} exhausted its retry budget.`);
  };

  return {
    listChannels(params, label = "channels.list") {
      return request<YoutubeChannel>(
        "channels",
        listParams({
          part: params.part,
          ...(params.id !== undefined ? { id: params.id } : {}),
          ...(params.forHandle !== undefined ? { forHandle: params.forHandle } : {}),
        }),
        label,
      );
    },
    listPlaylistItems(params, label = "playlistItems.list") {
      return request<YoutubePlaylistItem>(
        "playlistItems",
        listParams({
          part: params.part,
          playlistId: params.playlistId,
          maxResults: params.maxResults,
          ...(params.pageToken !== undefined ? { pageToken: params.pageToken } : {}),
        }),
        label,
      );
    },
    listVideos(params, label = "videos.list") {
      return request<YoutubeVideo>(
        "videos",
        listParams({
          part: params.part,
          id: params.id,
          maxResults: params.maxResults,
        }),
        label,
      );
    },
  };
}

function listParams(
  values: Readonly<Record<string, string | number | readonly string[]>>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return params;
}

function parseListResponse<T extends Record<string, unknown>>(
  value: unknown,
  label: string,
): YoutubeListResponse<T> {
  if (!isRecord(value)) {
    throw new Error(`YouTube Data API ${label} returned a malformed response: expected an object.`);
  }
  const rawItems = value.items;
  if (rawItems !== undefined && !Array.isArray(rawItems)) {
    throw new Error(`YouTube Data API ${label} returned a malformed response: items must be an array.`);
  }
  const items = rawItems ?? [];
  if (items.some((item) => !isRecord(item))) {
    throw new Error(`YouTube Data API ${label} returned a malformed response: every item must be an object.`);
  }
  const nextPageToken = value.nextPageToken;
  if (nextPageToken !== undefined && typeof nextPageToken !== "string") {
    throw new Error(`YouTube Data API ${label} returned a malformed response: nextPageToken must be a string.`);
  }

  return {
    items: items as T[],
    ...(nextPageToken !== undefined ? { nextPageToken } : {}),
  };
}

async function readSuccessfulResponse(response: Response, label: string): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    throw new Error(`YouTube Data API ${label} returned malformed JSON.`);
  }
}

async function readErrorResponse(response: Response, apiKey: string): Promise<string | undefined> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return undefined;
  }
  if (!text) {
    return undefined;
  }

  let message = text;
  try {
    const value = JSON.parse(text) as unknown;
    const object = isRecord(value) ? value : undefined;
    const error = isRecord(object?.error) ? object.error : undefined;
    if (typeof error?.message === "string") {
      message = error.message;
    }
  } catch {
    // A non-JSON error body is still useful after redaction and truncation.
  }
  return redactSecret(message, apiKey).slice(0, 500);
}

function retryDelayFromResponse(
  response: Response,
  nowMs: number,
  fallbackDelayMs: number,
  maxDelayMs: number,
): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter === null) {
    return fallbackDelayMs;
  }
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(maxDelayMs, Math.ceil(seconds * 1_000));
  }
  const dateMs = Date.parse(retryAfter);
  return Number.isFinite(dateMs)
    ? Math.min(maxDelayMs, Math.max(0, dateMs - nowMs))
    : fallbackDelayMs;
}

function boundedExponentialDelay(baseDelayMs: number, attempt: number, maxDelayMs: number): number {
  return Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
}

function safeErrorMessage(error: unknown, apiKey: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecret(message, apiKey);
}

function redactSecret(value: string, secret: string): string {
  return secret ? value.replaceAll(secret, "[REDACTED]") : value;
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
