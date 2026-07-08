import type {
  ChannelVideoLink,
  ChannelVideoLinksResult,
} from "./channel-video-links.js";

export const defaultLiveStreamsHtmlInput = "reports/Naval History with Dr Alex - YouTube_live_streams.html";
const defaultChannelUrl = "https://www.youtube.com/@DrAlexClarke";
const defaultChannelId = "UCE2x09tU0GwAGiSbFPEhIwQ";

export interface ExtractLiveStreamsHtmlOptions {
  channelUrl?: string;
  channelId?: string;
  fetchedAt?: string;
  sourcePath?: string;
}

export interface LiveStreamsHtmlExtraction {
  schemaVersion: 1;
  source: {
    path?: string;
    savedFromUrl?: string;
    extractedAt: string;
    contentLength: number;
    continuationTokenCount: number;
    hasContinuation: boolean;
  };
  stats: {
    renderedLockupCount: number;
    extractedStreamCount: number;
    fieldCounts: {
      title: number;
      durationText: number;
      publishedText: number;
      viewCountText: number;
    };
  };
  result: ChannelVideoLinksResult;
}

export function extractLiveStreamsHtml(
  html: string,
  options: ExtractLiveStreamsHtmlOptions = {},
): LiveStreamsHtmlExtraction {
  const initialData = JSON.parse(extractJsonObjectAfter(html, "ytInitialData")) as unknown;
  const lockups = collectValuesForKey(initialData, "lockupViewModel");
  const records = lockups
    .map((lockup, index) => extractLiveStreamRecord(lockup, index + 1))
    .filter((record): record is ChannelVideoLink => record !== undefined);
  const channelUrl = normalizeChannelUrl(options.channelUrl ?? savedFromUrl(html) ?? defaultChannelUrl);
  const channelId = options.channelId ?? findChannelId(initialData) ?? defaultChannelId;
  const extractedAt = options.fetchedAt ?? new Date().toISOString();
  const continuationTokenCount = countKeys(initialData, "continuationCommand");

  return {
    schemaVersion: 1,
    source: buildSourceMetadata(html, extractedAt, continuationTokenCount, options.sourcePath),
    stats: {
      renderedLockupCount: lockups.length,
      extractedStreamCount: records.length,
      fieldCounts: {
        title: records.filter((record) => record.title !== undefined).length,
        durationText: records.filter((record) => record.durationText !== undefined).length,
        publishedText: records.filter((record) => record.publishedText !== undefined).length,
        viewCountText: records.filter((record) => record.viewCountText !== undefined).length,
      },
    },
    result: {
      channelUrl,
      channelId,
      fetchedAt: extractedAt,
      requestDelayMs: 0,
      tabs: {
        videos: {
          url: `${channelUrl}/videos`,
          pagesFetched: 0,
          rawCount: 0,
        },
        streams: {
          url: `${channelUrl}/streams`,
          pagesFetched: 1,
          rawCount: lockups.length,
        },
      },
      links: records,
    },
  };
}

function buildSourceMetadata(
  html: string,
  extractedAt: string,
  continuationTokenCount: number,
  sourcePath: string | undefined,
): LiveStreamsHtmlExtraction["source"] {
  const source: LiveStreamsHtmlExtraction["source"] = {
    extractedAt,
    contentLength: html.length,
    continuationTokenCount,
    hasContinuation: continuationTokenCount > 0,
  };
  const fromUrl = savedFromUrl(html);

  if (sourcePath !== undefined) {
    source.path = sourcePath;
  }
  if (fromUrl !== undefined) {
    source.savedFromUrl = fromUrl;
  }

  return source;
}

function extractLiveStreamRecord(value: unknown, tabPosition: number): ChannelVideoLink | undefined {
  const lockup = asRecord(value);
  if (!lockup) {
    return undefined;
  }

  const contentType = readString(lockup, "contentType");
  if (contentType !== undefined && !contentType.includes("VIDEO")) {
    return undefined;
  }

  const endpointUrl = readStringPath(lockup, [
    "rendererContext",
    "commandContext",
    "onTap",
    "innertubeCommand",
    "commandMetadata",
    "webCommandMetadata",
    "url",
  ]);
  const videoId =
    readString(lockup, "contentId") ??
    readStringPath(lockup, [
      "rendererContext",
      "commandContext",
      "onTap",
      "innertubeCommand",
      "watchEndpoint",
      "videoId",
    ]) ??
    videoIdFromUrl(endpointUrl);

  if (videoId === undefined) {
    return undefined;
  }

  const metadata = readPath(lockup, ["metadata", "lockupMetadataViewModel"]);
  const metadataObject = asRecord(metadata);
  const metadataParts = metadataObject ? collectMetadataParts(metadataObject) : [];
  const record: ChannelVideoLink = {
    videoId,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    tabs: ["streams"],
    tabPositions: { streams: tabPosition },
  };
  const title =
    textValue(readPath(metadataObject, ["title"])) ??
    readStringPath(lockup, ["rendererContext", "accessibilityContext", "label"]);
  const viewCountText = metadataParts.find((part) => /\bviews?\b/iu.test(part));
  const publishedText = metadataParts.find((part) => looksLikePublishedText(part));
  const durationText = findDurationText(readPath(lockup, ["contentImage", "thumbnailViewModel", "overlays"]));

  if (title !== undefined) {
    record.title = title;
  }
  if (durationText !== undefined) {
    record.durationText = durationText;
  }
  if (publishedText !== undefined) {
    record.publishedText = publishedText;
  }
  if (viewCountText !== undefined) {
    record.viewCountText = viewCountText;
  }

  return record;
}

function extractJsonObjectAfter(html: string, marker: string): string {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`Could not find ${marker} in the HTML.`);
  }

  const start = html.indexOf("{", markerIndex);
  if (start < 0) {
    throw new Error(`Could not find the ${marker} JSON object.`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < html.length; index += 1) {
    const char = html[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return html.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Could not parse the ${marker} JSON object.`);
}

function collectValuesForKey(value: unknown, key: string): unknown[] {
  const values: unknown[] = [];

  walk(value, (object) => {
    if (key in object) {
      values.push(object[key]);
    }
  });

  return values;
}

function countKeys(value: unknown, key: string): number {
  let count = 0;

  walk(value, (object) => {
    if (key in object) {
      count += 1;
    }
  });

  return count;
}

function walk(value: unknown, visit: (object: Record<string, unknown>) => void): void {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, visit);
    }
    return;
  }

  const object = value as Record<string, unknown>;
  visit(object);

  for (const child of Object.values(object)) {
    walk(child, visit);
  }
}

function collectMetadataParts(metadataObject: Record<string, unknown>): string[] {
  const rows = readPath(metadataObject, ["metadata", "contentMetadataViewModel", "metadataRows"]);
  if (!Array.isArray(rows)) {
    return [];
  }

  const parts: string[] = [];
  for (const row of rows) {
    const metadataParts = readPath(row, ["metadataParts"]);
    if (!Array.isArray(metadataParts)) {
      continue;
    }

    for (const part of metadataParts) {
      const text = textValue(readPath(part, ["text"])) ?? readString(asRecord(part), "accessibilityLabel");
      if (text !== undefined) {
        parts.push(text);
      }
    }
  }

  return parts;
}

function findDurationText(value: unknown): string | undefined {
  let duration: string | undefined;

  walk(value, (object) => {
    if (duration !== undefined) {
      return;
    }

    for (const child of Object.values(object)) {
      const text = textValue(child);
      if (text !== undefined && /^\d{1,2}:\d{2}(?::\d{2})?$/u.test(text)) {
        duration = text;
        return;
      }
    }
  });

  return duration;
}

function findChannelId(value: unknown): string | undefined {
  let channelId: string | undefined;

  walk(value, (object) => {
    if (channelId !== undefined) {
      return;
    }

    for (const key of ["externalId", "channelId", "browseId"]) {
      const candidate = readString(object, key);
      if (candidate !== undefined && /^UC[A-Za-z0-9_-]{22}$/u.test(candidate)) {
        channelId = candidate;
        return;
      }
    }
  });

  return channelId;
}

function savedFromUrl(html: string): string | undefined {
  const match = /saved from url=\(\d+\)(https:\/\/www\.youtube\.com\/[^ "]+)/u.exec(html);
  return match?.[1];
}

function normalizeChannelUrl(channelUrl: string): string {
  return channelUrl.replace(/\/(?:videos|streams)\/?$/u, "").replace(/\/$/u, "");
}

function videoIdFromUrl(url: string | undefined): string | undefined {
  if (url === undefined) {
    return undefined;
  }

  const normalizedUrl = url.startsWith("/") ? `https://www.youtube.com${url}` : url;
  try {
    return new URL(normalizedUrl).searchParams.get("v") ?? undefined;
  } catch {
    return undefined;
  }
}

function looksLikePublishedText(text: string): boolean {
  return (
    /\b(?:ago|premiered|streamed|scheduled|watching|waiting|live)\b/iu.test(text) ||
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b\.?\s+\d{1,2},?\s+\d{4}\b/iu.test(text)
  );
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  const object = asRecord(value);
  if (!object) {
    return undefined;
  }

  const content = readString(object, "content");
  if (content !== undefined) {
    return content.trim() || undefined;
  }

  const text = readString(object, "text");
  if (text !== undefined) {
    return text.trim() || undefined;
  }

  const simpleText = readString(object, "simpleText");
  if (simpleText !== undefined) {
    return simpleText.trim() || undefined;
  }

  const runs = object.runs;
  if (Array.isArray(runs)) {
    const combined = runs.map((run) => textValue(readPath(run, ["text"]))).filter(Boolean).join("");
    return combined.trim() || undefined;
  }

  return undefined;
}

function readString(object: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = object?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readStringPath(value: unknown, path: string[]): string | undefined {
  const result = readPath(value, path);
  return typeof result === "string" && result.trim() ? result : undefined;
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;

  for (const part of path) {
    const object = asRecord(current);
    if (!object) {
      return undefined;
    }
    current = object[part];
  }

  return current;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
