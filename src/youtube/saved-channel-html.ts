import type {
  ChannelVideoLink,
  ChannelVideoLinksResult,
  ChannelVideoTab,
} from "./channel-video-links.js";

export const defaultSavedVideosHtmlInput = "reports/Naval History with Dr Alex - YouTube_videos.html";
export const defaultSavedStreamsHtmlInput = "reports/Naval History with Dr Alex - YouTube_live_streams.html";

const defaultChannelUrl = "https://www.youtube.com/@DrAlexClarke";
const defaultChannelId = "UCE2x09tU0GwAGiSbFPEhIwQ";

export interface ExtractSavedChannelHtmlOptions {
  tab: ChannelVideoTab;
  channelUrl?: string;
  channelId?: string;
  fetchedAt?: string;
  sourcePath?: string;
}

export interface SavedChannelHtmlExtraction {
  schemaVersion: 1;
  source: {
    path?: string;
    savedFromUrl?: string;
    extractedAt: string;
    contentLength: number;
    continuationTokenCount: number;
    hasContinuation: boolean;
    extractionMethod: "rendered-lockups" | "yt-initial-data";
  };
  stats: {
    renderedLockupCount: number;
    initialDataLockupCount: number;
    extractedVideoCount: number;
    fieldCounts: {
      title: number;
      durationText: number;
      publishedText: number;
      viewCountText: number;
      publishedAt: number;
      publishDate: number;
    };
  };
  result: ChannelVideoLinksResult;
}

export function extractSavedChannelHtml(
  html: string,
  options: ExtractSavedChannelHtmlOptions,
): SavedChannelHtmlExtraction {
  const initialData = tryParseInitialData(html);
  const renderedRecords = extractRenderedLockupRecords(html, options.tab);
  const initialDataRecords = initialData ? extractInitialDataLockupRecords(initialData, options.tab) : [];
  const extractionMethod = renderedRecords.length > 0 ? "rendered-lockups" : "yt-initial-data";
  const records = dedupeByVideoId(extractionMethod === "rendered-lockups" ? renderedRecords : initialDataRecords);
  const channelUrl = normalizeChannelUrl(options.channelUrl ?? savedFromUrl(html) ?? defaultChannelUrl);
  const channelId = options.channelId ?? (initialData ? findChannelId(initialData) : undefined) ?? defaultChannelId;
  const extractedAt = options.fetchedAt ?? new Date().toISOString();
  const continuationTokenCount = initialData ? countKeys(initialData, "continuationCommand") : countRenderedContinuations(html);

  return {
    schemaVersion: 1,
    source: buildSourceMetadata(html, extractedAt, continuationTokenCount, extractionMethod, options.sourcePath),
    stats: {
      renderedLockupCount: renderedRecords.length,
      initialDataLockupCount: initialDataRecords.length,
      extractedVideoCount: records.length,
      fieldCounts: fieldCounts(records),
    },
    result: {
      channelUrl,
      channelId,
      fetchedAt: extractedAt,
      requestDelayMs: 0,
      tabs: tabState(channelUrl, options.tab, records.length),
      links: records,
    },
  };
}

function extractRenderedLockupRecords(html: string, tab: ChannelVideoTab): ChannelVideoLink[] {
  const blocks = html
    .split(/<yt-lockup-view-model\b/iu)
    .slice(1)
    .map((block) => `<yt-lockup-view-model${block.split(/<\/yt-lockup-view-model>/iu)[0] ?? ""}</yt-lockup-view-model>`);
  const records: ChannelVideoLink[] = [];

  for (const block of blocks) {
    const videoId = firstMatch(block, /href="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]+)/iu);
    if (videoId === undefined) {
      continue;
    }

    const record: ChannelVideoLink = {
      videoId,
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      tabs: [tab],
      tabPositions: { [tab]: records.length + 1 },
    };
    const title = renderedTitle(block);
    const durationText = renderedDuration(block);
    const metadataSpans = renderedMetadataSpans(block);
    const viewCountText = metadataSpans.find((text) => /\bviews?\b/iu.test(text));
    const dateMetadata = renderedDateMetadata(block, videoId);
    const publishedText = dateMetadata.publishedText ?? metadataSpans.find((text) => looksLikePublishedText(text));

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
    if (dateMetadata.publishedAt !== undefined) {
      record.publishedAt = dateMetadata.publishedAt;
      record.publishDate = dateMetadata.publishedAt.slice(0, 10);
    }

    records.push(record);
  }

  return records;
}

function extractInitialDataLockupRecords(initialData: unknown, tab: ChannelVideoTab): ChannelVideoLink[] {
  const lockups = collectValuesForKey(initialData, "lockupViewModel");
  const records: ChannelVideoLink[] = [];

  for (const lockupValue of lockups) {
    const lockup = asRecord(lockupValue);
    if (!lockup) {
      continue;
    }

    const videoId =
      readString(lockup, "contentId") ??
      readStringPath(lockup, [
        "rendererContext",
        "commandContext",
        "onTap",
        "innertubeCommand",
        "watchEndpoint",
        "videoId",
      ]);
    if (videoId === undefined) {
      continue;
    }

    const metadataObject = asRecord(readPath(lockup, ["metadata", "lockupMetadataViewModel"]));
    const metadataParts = metadataObject ? initialDataMetadataParts(metadataObject) : [];
    const record: ChannelVideoLink = {
      videoId,
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      tabs: [tab],
      tabPositions: { [tab]: records.length + 1 },
    };
    const title =
      textValue(readPath(metadataObject, ["title"])) ??
      readStringPath(lockup, ["rendererContext", "accessibilityContext", "label"]);
    const durationText = initialDataDuration(readPath(lockup, ["contentImage", "thumbnailViewModel", "overlays"]));
    const viewCountText = metadataParts.find((text) => /\bviews?\b/iu.test(text));
    const publishedText = metadataParts.find((text) => looksLikePublishedText(text));

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

    records.push(record);
  }

  return records;
}

function renderedTitle(block: string): string | undefined {
  return decodeHtmlText(firstMatch(block, /<h3\b[^>]*\btitle="([^"]+)"/iu)) ??
    decodeHtmlText(firstMatch(block, /class="[^"]*ytLockupMetadataViewModelTitle[^"]*"[\s\S]*?<span\b[^>]*>([\s\S]*?)<\/span>/iu)?.replace(/<[^>]+>/gu, ""));
}

function renderedDuration(block: string): string | undefined {
  const matches = [...block.matchAll(/<div\b[^>]*class="[^"]*ytBadgeShapeText[^"]*"[^>]*>([^<]+)<\/div>/giu)]
    .map((match) => decodeHtmlText(match[1]))
    .filter((text): text is string => text !== undefined);
  return matches.find((text) => /^\d{1,2}:\d{2}(?::\d{2})?$/u.test(text));
}

function renderedMetadataSpans(block: string): string[] {
  const row = firstMatch(block, /<div\b[^>]*class="[^"]*ytContentMetadataViewModelMetadataRow[^"]*"[\s\S]*?<\/div>/iu, 0);
  if (row === undefined) {
    return [];
  }

  return [...row.matchAll(/<span\b[^>]*role="text"[^>]*>([\s\S]*?)<\/span>/giu)]
    .map((match) => decodeHtmlText(match[1]?.replace(/<[^>]+>/gu, "")))
    .filter((text): text is string => text !== undefined);
}

function renderedDateMetadata(block: string, videoId: string): {
  publishedAt?: string;
  publishedText?: string;
} {
  const spans = [...block.matchAll(/<span\b[^>]*(?:data-videoid|data-date)[^>]*>[\s\S]*?<\/span>/giu)];

  for (const match of spans) {
    const span = match[0];
    if (attributeValue(span, "data-videoid") !== videoId) {
      continue;
    }

    const publishedAt = attributeValue(span, "data-date");
    const displayedText = decodeHtmlText(span.replace(/<[^>]+>/gu, ""));
    const relativeText = attributeValue(span, "aria-label");
    const result: { publishedAt?: string; publishedText?: string } = {};

    if (publishedAt !== undefined) {
      result.publishedAt = publishedAt;
    }
    if (displayedText !== undefined) {
      result.publishedText = displayedText;
    } else if (relativeText !== undefined) {
      result.publishedText = relativeText;
    }

    return result;
  }

  return {};
}

function tryParseInitialData(html: string): unknown | undefined {
  try {
    return JSON.parse(extractJsonObjectAfter(html, "ytInitialData")) as unknown;
  } catch {
    return undefined;
  }
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

function buildSourceMetadata(
  html: string,
  extractedAt: string,
  continuationTokenCount: number,
  extractionMethod: SavedChannelHtmlExtraction["source"]["extractionMethod"],
  sourcePath: string | undefined,
): SavedChannelHtmlExtraction["source"] {
  const source: SavedChannelHtmlExtraction["source"] = {
    extractedAt,
    contentLength: html.length,
    continuationTokenCount,
    hasContinuation: continuationTokenCount > 0,
    extractionMethod,
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

function tabState(
  channelUrl: string,
  tab: ChannelVideoTab,
  count: number,
): ChannelVideoLinksResult["tabs"] {
  return {
    videos: {
      url: `${channelUrl}/videos`,
      pagesFetched: tab === "videos" ? 1 : 0,
      rawCount: tab === "videos" ? count : 0,
    },
    streams: {
      url: `${channelUrl}/streams`,
      pagesFetched: tab === "streams" ? 1 : 0,
      rawCount: tab === "streams" ? count : 0,
    },
  };
}

function fieldCounts(records: ChannelVideoLink[]): SavedChannelHtmlExtraction["stats"]["fieldCounts"] {
  return {
    title: records.filter((record) => record.title !== undefined).length,
    durationText: records.filter((record) => record.durationText !== undefined).length,
    publishedText: records.filter((record) => record.publishedText !== undefined).length,
    viewCountText: records.filter((record) => record.viewCountText !== undefined).length,
    publishedAt: records.filter((record) => record.publishedAt !== undefined).length,
    publishDate: records.filter((record) => record.publishDate !== undefined).length,
  };
}

function initialDataMetadataParts(metadataObject: Record<string, unknown>): string[] {
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

function initialDataDuration(value: unknown): string | undefined {
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

function dedupeByVideoId(records: ChannelVideoLink[]): ChannelVideoLink[] {
  const seen = new Set<string>();
  const deduped: ChannelVideoLink[] = [];

  for (const record of records) {
    if (seen.has(record.videoId)) {
      continue;
    }
    const tab = record.tabs[0];
    if (tab === undefined) {
      continue;
    }

    seen.add(record.videoId);
    deduped.push({
      ...record,
      tabPositions: { [tab]: deduped.length + 1 },
    });
  }

  return deduped;
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

function countRenderedContinuations(html: string): number {
  return [...html.matchAll(/continuationCommand/giu)].length;
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

function decodeHtmlText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const decoded = value
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, "\"")
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/\s+/gu, " ")
    .trim();

  return decoded || undefined;
}

function attributeValue(tag: string, name: string): string | undefined {
  return decodeHtmlText(firstMatch(tag, new RegExp(`\\b${name}="([^"]*)"`, "iu")));
}

function firstMatch(value: string, pattern: RegExp, group = 1): string | undefined {
  return pattern.exec(value)?.[group];
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
