import { dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { Innertube } from "youtubei.js";

export type ChannelVideoTab = "videos" | "streams";

export interface ChannelVideoLink {
  videoId: string;
  url: string;
  title?: string;
  durationText?: string;
  publishedText?: string;
  viewCountText?: string;
  publishDate?: string;
  uploadDate?: string;
  streamStartAt?: string;
  streamEndAt?: string;
  tabs: ChannelVideoTab[];
  tabPositions: Partial<Record<ChannelVideoTab, number>>;
}

export interface ChannelVideoLinksResult {
  channelUrl: string;
  channelId: string;
  fetchedAt: string;
  requestDelayMs: number;
  tabs: Record<ChannelVideoTab, { url: string; pagesFetched: number; rawCount: number }>;
  links: ChannelVideoLink[];
}

export interface FetchChannelVideoLinksOptions {
  channelUrl: string;
  requestDelayMs: number;
  maxPages?: number;
  includeVideoDetails?: boolean;
  detailLimit?: number;
  checkpointOutput?: string;
  logger?: (message: string) => void;
}

export interface ChannelVideoListResult {
  channelUrl: string;
  channelId: string;
  fetchedAt: string;
  requestDelayMs: number;
  tabs: ChannelVideoLinksResult["tabs"];
  videos: {
    videoId: string;
    url: string;
    tabs: ChannelVideoTab[];
    tabPositions: Partial<Record<ChannelVideoTab, number>>;
  }[];
}

export interface ChannelVideoMetadataResult {
  channelUrl: string;
  channelId: string;
  fetchedAt: string;
  requestDelayMs: number;
  exactDetailsIncluded: boolean;
  videos: {
    videoId: string;
    title?: string;
    durationText?: string;
    publishedText?: string;
    viewCountText?: string;
    publishDate?: string;
    uploadDate?: string;
    streamStartAt?: string;
    streamEndAt?: string;
  }[];
}

export interface RateLimitedFetchOptions {
  delayMs: number;
  baseFetch?: typeof fetch;
  logger?: (message: string) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

type FeedLike = {
  videos: unknown[];
  has_continuation: boolean;
  getContinuation(): Promise<FeedLike>;
};

type TabCollection = {
  records: ChannelVideoLink[];
  pagesFetched: number;
  rawCount: number;
};

type TabProgressCallback = (collection: TabCollection) => Promise<void>;

const defaultChannelUrl = "https://www.youtube.com/@DrAlexClarke";

export function createRateLimitedFetch(options: RateLimitedFetchOptions): typeof fetch {
  const baseFetch = options.baseFetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());
  let lastStartMs: number | undefined;
  let chain = Promise.resolve();
  let requestCount = 0;

  const limitedFetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const run = async () => {
      if (lastStartMs !== undefined) {
        const waitMs = Math.max(0, lastStartMs + options.delayMs - now());
        if (waitMs > 0) {
          options.logger?.(`Waiting ${Math.ceil(waitMs / 1000)}s before the next YouTube request.`);
          await sleep(waitMs);
        }
      }

      lastStartMs = now();
      requestCount += 1;
      options.logger?.(`YouTube request ${requestCount}: ${requestHost(input)}`);
      return baseFetch(input, init);
    };

    const result = chain.then(run, run);
    chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return limitedFetch as typeof fetch;
}

export async function fetchChannelVideoLinks(
  options: FetchChannelVideoLinksOptions,
): Promise<ChannelVideoLinksResult> {
  const channelUrl = normalizeChannelUrl(options.channelUrl);
  const rateLimitOptions: RateLimitedFetchOptions = {
    delayMs: options.requestDelayMs,
  };

  if (options.logger) {
    rateLimitOptions.logger = options.logger;
  }

  const limitedFetch = createRateLimitedFetch(rateLimitOptions);
  const youtube = await Innertube.create({
    fetch: limitedFetch,
    generate_session_locally: true,
    retrieve_player: false,
  });

  const endpoint = await youtube.resolveURL(channelUrl);
  const channelId = readString(endpoint.payload, "browseId");
  if (!channelId) {
    throw new Error(`Could not resolve a channel ID from ${channelUrl}.`);
  }

  const channel = await youtube.getChannel(channelId);
  const fetchedAt = new Date().toISOString();
  const tabState: ChannelVideoLinksResult["tabs"] = {
    videos: {
      url: `${channelUrl}/videos`,
      pagesFetched: 0,
      rawCount: 0,
    },
    streams: {
      url: `${channelUrl}/streams`,
      pagesFetched: 0,
      rawCount: 0,
    },
  };
  const recordsByTab: Record<ChannelVideoTab, ChannelVideoLink[]> = {
    videos: [],
    streams: [],
  };

  const writeCheckpoint = async (tab: ChannelVideoTab, collection: TabCollection) => {
    recordsByTab[tab] = [...collection.records];
    tabState[tab] = {
      ...tabState[tab],
      pagesFetched: collection.pagesFetched,
      rawCount: collection.rawCount,
    };
    options.logger?.(
      `${tab}: fetched page ${collection.pagesFetched}; raw items=${collection.rawCount}; extracted links=${collection.records.length}`,
    );

    if (options.checkpointOutput) {
      await writeVideoLinksOutput(
        options.checkpointOutput,
        buildLinksResult(channelUrl, channelId, fetchedAt, options.requestDelayMs, tabState, recordsByTab),
      );
    }
  };

  const [videos, streams] = [
    await collectTab("videos", (await channel.getVideos()) as FeedLike, options.maxPages, (collection) =>
      writeCheckpoint("videos", collection),
    ),
    await collectTab("streams", (await channel.getLiveStreams()) as FeedLike, options.maxPages, (collection) =>
      writeCheckpoint("streams", collection),
    ),
  ];
  const links = mergeLinks([...videos.records, ...streams.records]);

  if (options.includeVideoDetails) {
    await enrichWithVideoDetails(youtube, links, options.detailLimit, options.logger);
  }

  return {
    channelUrl,
    channelId,
    fetchedAt,
    requestDelayMs: options.requestDelayMs,
    tabs: tabState,
    links,
  };
}

export async function writeVideoLinksOutput(path: string, result: ChannelVideoLinksResult): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

export async function writeSplitVideoLinksOutput(
  linksPath: string,
  metadataPath: string,
  result: ChannelVideoLinksResult,
): Promise<void> {
  const { list, metadata } = splitChannelVideoLinksResult(result);
  await Promise.all([
    writeJsonFile(linksPath, list),
    writeJsonFile(metadataPath, metadata),
  ]);
}

export function splitChannelVideoLinksResult(result: ChannelVideoLinksResult): {
  list: ChannelVideoListResult;
  metadata: ChannelVideoMetadataResult;
} {
  return {
    list: {
      channelUrl: result.channelUrl,
      channelId: result.channelId,
      fetchedAt: result.fetchedAt,
      requestDelayMs: result.requestDelayMs,
      tabs: result.tabs,
      videos: result.links.map((link) => ({
        videoId: link.videoId,
        url: link.url,
        tabs: link.tabs,
        tabPositions: link.tabPositions,
      })),
    },
    metadata: {
      channelUrl: result.channelUrl,
      channelId: result.channelId,
      fetchedAt: result.fetchedAt,
      requestDelayMs: result.requestDelayMs,
      exactDetailsIncluded: result.links.some(
        (link) =>
          link.publishDate !== undefined ||
          link.uploadDate !== undefined ||
          link.streamStartAt !== undefined ||
          link.streamEndAt !== undefined,
      ),
      videos: result.links.map((link) => videoMetadataRecord(link)),
    },
  };
}

export function extractVideoLink(
  node: unknown,
  tab: ChannelVideoTab,
  tabPosition: number,
): ChannelVideoLink | undefined {
  const object = asRecord(node);
  if (!object) {
    return undefined;
  }

  const contentType = readString(object, "content_type");
  const videoId =
    readString(object, "video_id") ??
    (contentType === "VIDEO" ? readString(object, "content_id") : undefined) ??
    readStringPath(object, ["renderer_context", "command_context", "on_tap", "payload", "videoId"]);

  if (!videoId) {
    return undefined;
  }

  const record: ChannelVideoLink = {
    videoId,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    tabs: [tab],
    tabPositions: { [tab]: tabPosition },
  };

  const title =
    textValue(object.title) ??
    textValue(readPath(object, ["metadata", "title"])) ??
    accessibilityTitle(object);
  const durationText =
    textValue(readPath(object, ["duration", "text"])) ??
    textValue(object.length_text) ??
    thumbnailBadgeText(object);
  const publishedText = firstMetadataPart(object, (text) => looksLikePublishedText(text));
  const viewCountText = firstMetadataPart(object, (text) => /\bviews?\b/i.test(text));

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

export function defaultChannelVideoLinksOptions(): FetchChannelVideoLinksOptions {
  return {
    channelUrl: defaultChannelUrl,
    requestDelayMs: 60_000,
  };
}

async function collectTab(
  tab: ChannelVideoTab,
  firstFeed: FeedLike,
  maxPages?: number,
  onPage?: TabProgressCallback,
): Promise<TabCollection> {
  const records: ChannelVideoLink[] = [];
  let feed = firstFeed;
  let pagesFetched = 0;
  let rawCount = 0;
  let tabPosition = 0;

  while (true) {
    pagesFetched += 1;
    rawCount += feed.videos.length;

    for (const node of feed.videos) {
      tabPosition += 1;
      const record = extractVideoLink(node, tab, tabPosition);
      if (record) {
        records.push(record);
      }
    }

    await onPage?.({ records, pagesFetched, rawCount });

    if (!feed.has_continuation || (maxPages !== undefined && pagesFetched >= maxPages)) {
      return { records, pagesFetched, rawCount };
    }

    feed = await feed.getContinuation();
  }
}

function mergeLinks(records: ChannelVideoLink[]): ChannelVideoLink[] {
  const linksById = new Map<string, ChannelVideoLink>();

  for (const record of records) {
    const existing = linksById.get(record.videoId);
    if (!existing) {
      linksById.set(record.videoId, { ...record, tabs: [...record.tabs] });
      continue;
    }

    for (const tab of record.tabs) {
      if (!existing.tabs.includes(tab)) {
        existing.tabs.push(tab);
      }
      if (existing.tabPositions[tab] === undefined && record.tabPositions[tab] !== undefined) {
        existing.tabPositions[tab] = record.tabPositions[tab];
      }
    }

    if (existing.title === undefined && record.title !== undefined) {
      existing.title = record.title;
    }
    if (existing.durationText === undefined && record.durationText !== undefined) {
      existing.durationText = record.durationText;
    }
    if (existing.publishedText === undefined && record.publishedText !== undefined) {
      existing.publishedText = record.publishedText;
    }
    if (existing.viewCountText === undefined && record.viewCountText !== undefined) {
      existing.viewCountText = record.viewCountText;
    }
    if (existing.publishDate === undefined && record.publishDate !== undefined) {
      existing.publishDate = record.publishDate;
    }
    if (existing.uploadDate === undefined && record.uploadDate !== undefined) {
      existing.uploadDate = record.uploadDate;
    }
    if (existing.streamStartAt === undefined && record.streamStartAt !== undefined) {
      existing.streamStartAt = record.streamStartAt;
    }
    if (existing.streamEndAt === undefined && record.streamEndAt !== undefined) {
      existing.streamEndAt = record.streamEndAt;
    }
  }

  return [...linksById.values()];
}

function buildLinksResult(
  channelUrl: string,
  channelId: string,
  fetchedAt: string,
  requestDelayMs: number,
  tabs: ChannelVideoLinksResult["tabs"],
  recordsByTab: Record<ChannelVideoTab, ChannelVideoLink[]>,
): ChannelVideoLinksResult {
  return {
    channelUrl,
    channelId,
    fetchedAt,
    requestDelayMs,
    tabs: {
      videos: { ...tabs.videos },
      streams: { ...tabs.streams },
    },
    links: mergeLinks([...recordsByTab.videos, ...recordsByTab.streams]),
  };
}

async function enrichWithVideoDetails(
  youtube: Awaited<ReturnType<typeof Innertube.create>>,
  links: ChannelVideoLink[],
  detailLimit: number | undefined,
  logger: ((message: string) => void) | undefined,
): Promise<void> {
  const limitedLinks = detailLimit === undefined ? links : links.slice(0, detailLimit);

  for (const [index, link] of limitedLinks.entries()) {
    logger?.(`Fetching exact video metadata ${index + 1}/${limitedLinks.length}: ${link.videoId}`);
    const info = await youtube.getBasicInfo(link.videoId);
    const microformat = asRecord(readPath(info, ["page", "0", "microformat"]));
    const basicInfo = asRecord(readPath(info, ["basic_info"]));

    const publishDate = microformat ? readString(microformat, "publish_date") : undefined;
    const uploadDate = microformat ? readString(microformat, "upload_date") : undefined;
    const streamStartAt = dateValue(readPath(basicInfo, ["start_timestamp"])) ?? dateValue(readPath(microformat, ["start_timestamp"]));
    const streamEndAt = dateValue(readPath(basicInfo, ["end_timestamp"])) ?? dateValue(readPath(microformat, ["end_timestamp"]));

    if (publishDate !== undefined) {
      link.publishDate = publishDate;
    }
    if (uploadDate !== undefined) {
      link.uploadDate = uploadDate;
    }
    if (streamStartAt !== undefined) {
      link.streamStartAt = streamStartAt;
    }
    if (streamEndAt !== undefined) {
      link.streamEndAt = streamEndAt;
    }
  }
}

function videoMetadataRecord(link: ChannelVideoLink): ChannelVideoMetadataResult["videos"][number] {
  const record: ChannelVideoMetadataResult["videos"][number] = {
    videoId: link.videoId,
  };

  if (link.title !== undefined) {
    record.title = link.title;
  }
  if (link.durationText !== undefined) {
    record.durationText = link.durationText;
  }
  if (link.publishedText !== undefined) {
    record.publishedText = link.publishedText;
  }
  if (link.viewCountText !== undefined) {
    record.viewCountText = link.viewCountText;
  }
  if (link.publishDate !== undefined) {
    record.publishDate = link.publishDate;
  }
  if (link.uploadDate !== undefined) {
    record.uploadDate = link.uploadDate;
  }
  if (link.streamStartAt !== undefined) {
    record.streamStartAt = link.streamStartAt;
  }
  if (link.streamEndAt !== undefined) {
    record.streamEndAt = link.streamEndAt;
  }

  return record;
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeChannelUrl(channelUrl: string): string {
  return channelUrl.replace(/\/(?:videos|streams)\/?$/u, "").replace(/\/$/u, "");
}

function requestHost(input: Parameters<typeof fetch>[0]): string {
  const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
  return new URL(url).host;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  const object = asRecord(value);
  if (!object) {
    return undefined;
  }

  const text = readString(object, "text");
  if (text) {
    return text.trim() || undefined;
  }

  const runs = object.runs;
  if (Array.isArray(runs)) {
    const combined = runs.map((run) => textValue(readPath(run, ["text"]))).filter(Boolean).join("");
    return combined.trim() || undefined;
  }

  return undefined;
}

function firstMetadataPart(object: Record<string, unknown>, predicate: (value: string) => boolean): string | undefined {
  const rows = readPath(object, ["metadata", "metadata", "metadata_rows"]);
  if (!Array.isArray(rows)) {
    return undefined;
  }

  for (const row of rows) {
    const parts = readPath(row, ["metadata_parts"]);
    if (!Array.isArray(parts)) {
      continue;
    }

    for (const part of parts) {
      const text = textValue(readPath(part, ["text"]));
      if (text && predicate(text)) {
        return text;
      }
    }
  }

  return undefined;
}

function looksLikePublishedText(text: string): boolean {
  return (
    /\b(?:ago|premiered|streamed|scheduled|watching|waiting|live)\b/i.test(text) ||
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b\.?\s+\d{1,2},?\s+\d{4}\b/i.test(text)
  );
}

function thumbnailBadgeText(object: Record<string, unknown>): string | undefined {
  const overlays = readPath(object, ["content_image", "overlays"]);
  if (!Array.isArray(overlays)) {
    return undefined;
  }

  for (const overlay of overlays) {
    const badges = readPath(overlay, ["badges"]);
    if (!Array.isArray(badges)) {
      continue;
    }

    for (const badge of badges) {
      const text = textValue(readPath(badge, ["text"]));
      if (text && /^\d{1,2}:\d{2}(?::\d{2})?$/u.test(text)) {
        return text;
      }
    }
  }

  return undefined;
}

function accessibilityTitle(object: Record<string, unknown>): string | undefined {
  const label = readStringPath(object, ["renderer_context", "accessibility_context", "label"]);
  return label?.replace(/\s+\d+\s+(?:seconds?|minutes?|hours?).*$/iu, "").trim() || undefined;
}

function readString(object: Record<string, unknown>, key: string): string | undefined {
  const value = object[key];
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
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function dateValue(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }

  return undefined;
}
