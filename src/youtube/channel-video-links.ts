import { dirname } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { google, type youtube_v3 } from "googleapis";

import { slugifyVideoTitle, videoFileStem } from "../naming.js";
import {
  defaultVideoMetadataOutput,
  isBlockedTranscriptDuration,
  maxBlockedTranscriptDurationSeconds,
  readVideoMetadataStore,
  resolveVideoState,
  parseYoutubeDurationSeconds,
  type VideoDateKind,
  type VideoKind,
  type VideoMetadataRecord,
} from "./video-metadata.js";

export type ChannelVideoTab = "videos" | "streams";
export type ChannelInventoryCompleteness = "complete" | "partial" | "unknown";

export const defaultChannelSourceRoot = "src/channel";
export const defaultEpisodeMasterOutput = `${defaultChannelSourceRoot}/episodes.json`;

export interface ResolveChannelVideoLinksMasterOutputOptions {
  output?: string;
  masterOutput?: string;
  linksOutput?: string;
  metadataOutput?: string;
  maxPages?: number;
}

export function resolveChannelVideoLinksMasterOutput(
  options: ResolveChannelVideoLinksMasterOutputOptions,
): string | undefined {
  if (options.masterOutput !== undefined) {
    return options.masterOutput;
  }

  if (
    options.output !== undefined ||
    options.linksOutput !== undefined ||
    options.metadataOutput !== undefined ||
    options.maxPages !== undefined
  ) {
    return undefined;
  }

  return defaultEpisodeMasterOutput;
}
export const defaultTranscriptManifestInput = "src/transcripts/manifest.json";

export interface ChannelVideoLink {
  videoId: string;
  url: string;
  title?: string;
  durationText?: string;
  durationSeconds?: number;
  publishedText?: string;
  viewCountText?: string;
  publishedAt?: string;
  publishDate?: string;
  scheduledStartAt?: string;
  actualStartAt?: string;
  actualEndAt?: string;
  videoDateAt?: string;
  videoDateKind?: VideoDateKind;
  videoKind?: VideoKind;
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
  apiKey?: string;
  channelId?: string;
  uploadsPlaylistId?: string;
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
    publishedAt?: string;
    publishDate?: string;
    scheduledStartAt?: string;
    actualStartAt?: string;
    actualEndAt?: string;
    videoDateAt?: string;
    videoDateKind?: VideoDateKind;
    videoKind?: VideoKind;
  }[];
}

export interface ChannelEpisodeMasterResult {
  schemaVersion: 2;
  channelUrl: string;
  channelId: string;
  fetchedAt: string;
  requestDelayMs: number;
  inventory: {
    completeness: ChannelInventoryCompleteness;
    tabs: ChannelVideoLinksResult["tabs"];
    notes: string[];
  };
  storage: {
    transcriptsManifest: "src/transcripts/manifest.json";
  };
  episodes: ChannelEpisodeRecord[];
}

export interface ChannelEpisodeRecord {
  videoId: string;
  slug?: string;
  fileStem: string;
  url: string;
  channelOrder: number;
  title?: string;
  durationText?: string;
  durationSeconds?: number;
  publishedText?: string;
  viewCountText?: string;
  publishedAt?: string;
  scheduledStartAt?: string;
  actualStartAt?: string;
  actualEndAt?: string;
  videoDateAt?: string;
  videoDateKind?: VideoDateKind;
  videoKind: VideoKind;
  tabs: ChannelVideoTab[];
  tabPositions: Partial<Record<ChannelVideoTab, number>>;
  transcript: ChannelEpisodeTranscriptState;
}

export type ChannelEpisodeTranscriptState =
  | {
      status: "stored";
      txtPath: string;
      segmentCount?: number;
      selectedLanguage?: string;
      fetchedAt?: string;
    }
  | {
      status: "not_checked";
    };

export interface BuildChannelEpisodeMasterOptions {
  completeness?: ChannelInventoryCompleteness;
  notes?: string[];
  transcriptStates?: ReadonlyMap<string, ChannelEpisodeTranscriptState>;
  storedTranscripts?: ReadonlyMap<string, StoredTranscriptEpisodeRecord>;
  metadataRecords?: ReadonlyMap<string, VideoMetadataRecord>;
  transcriptsManifestPath?: string;
  videoMetadataPath?: string;
}

export interface StoredTranscriptEpisodeRecord {
  fileStem: string;
  txtPath: string;
  segmentCount?: number;
  selectedLanguage?: string;
  fetchedAt?: string;
}

export interface RateLimitedFetchOptions {
  delayMs: number;
  baseFetch?: typeof fetch;
  logger?: (message: string) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

type RequestGate = (label: string) => Promise<void>;
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;
type LabeledFetchInit = FetchInit & { [fetchRequestLabel]?: string };

type OfficialChannelInfo = {
  channelId: string;
  uploadsPlaylistId: string;
};

const defaultChannelUrl = "https://www.youtube.com/@DrAlexClarke";
const fetchRequestLabel = Symbol("fetchRequestLabel");

export function fetchInitWithRequestLabel(init: FetchInit, label: string): FetchInit {
  Object.defineProperty(init, fetchRequestLabel, {
    value: label,
    enumerable: false,
  });
  return init;
}

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
      options.logger?.(`YouTube request ${requestCount}: ${requestDescription(input, init)}`);
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
  const apiKey = options.apiKey;
  if (!apiKey) {
    throw new Error("A YouTube Data API key is required. Pass --api-key or set YOUTUBE_API_KEY.");
  }

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
  const resolveOptions: {
    channelUrl: string;
    channelId?: string;
    uploadsPlaylistId?: string;
    gate: RequestGate;
  } = {
    channelUrl,
    gate,
  };
  if (options.channelId !== undefined) {
    resolveOptions.channelId = options.channelId;
  }
  if (options.uploadsPlaylistId !== undefined) {
    resolveOptions.uploadsPlaylistId = options.uploadsPlaylistId;
  }
  const channel = await resolveOfficialChannel(youtube, resolveOptions);
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

  const records: ChannelVideoLink[] = [];
  let pagesFetched = 0;
  let rawCount = 0;
  let pageToken: string | undefined;

  while (true) {
    pagesFetched += 1;
    await gate(`playlistItems.list uploads page ${pagesFetched}`);
    const params: youtube_v3.Params$Resource$Playlistitems$List = {
      part: ["snippet", "contentDetails", "status"],
      playlistId: channel.uploadsPlaylistId,
      maxResults: 50,
    };
    if (pageToken !== undefined) {
      params.pageToken = pageToken;
    }

    const response = await youtube.playlistItems.list(params);
    const items = response.data.items ?? [];
    rawCount += items.length;

    for (const item of items) {
      const record = playlistItemToVideoLink(item, records.length + 1);
      if (record !== undefined) {
        records.push(record);
      }
    }

    tabState.videos = {
      ...tabState.videos,
      pagesFetched,
      rawCount,
    };
    options.logger?.(
      `videos: fetched uploads page ${pagesFetched}; raw items=${rawCount}; extracted links=${records.length}`,
    );
    if (options.checkpointOutput) {
      await writeVideoLinksOutput(
        options.checkpointOutput,
        {
          channelUrl,
          channelId: channel.channelId,
          fetchedAt,
          requestDelayMs: options.requestDelayMs,
          tabs: tabState,
          links: records,
        },
      );
    }

    if (!response.data.nextPageToken || (options.maxPages !== undefined && pagesFetched >= options.maxPages)) {
      break;
    }
    pageToken = response.data.nextPageToken;
  }

  await enrichWithOfficialVideoDetails(
    youtube,
    records,
    options.detailLimit,
    options.includeVideoDetails ?? false,
    gate,
    options.logger,
  );
  const eligibleRecords = records.filter((record) => !isBlockedTranscriptDuration(record.durationSeconds));
  const blockedCount = records.length - eligibleRecords.length;
  if (blockedCount > 0) {
    options.logger?.(
      `Blocked ${blockedCount} video(s) at or below the ${maxBlockedTranscriptDurationSeconds}s transcript cutoff.`,
    );
  }
  if (options.checkpointOutput) {
    await writeVideoLinksOutput(options.checkpointOutput, {
      channelUrl,
      channelId: channel.channelId,
      fetchedAt,
      requestDelayMs: options.requestDelayMs,
      tabs: tabState,
      links: eligibleRecords,
    });
  }

  return {
    channelUrl,
    channelId: channel.channelId,
    fetchedAt,
    requestDelayMs: options.requestDelayMs,
    tabs: tabState,
    links: eligibleRecords,
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

export async function writeChannelEpisodeMasterOutput(
  path: string,
  result: ChannelVideoLinksResult,
  options: BuildChannelEpisodeMasterOptions = {},
): Promise<void> {
  const storedTranscripts = options.storedTranscripts ??
    await readStoredTranscriptEpisodeRecords(options.transcriptsManifestPath ?? defaultTranscriptManifestInput);
  const metadataStore = options.metadataRecords === undefined
    ? await readVideoMetadataStore(options.videoMetadataPath ?? defaultVideoMetadataOutput)
    : undefined;
  const metadataRecords = options.metadataRecords ??
    new Map(metadataStore?.videos.map((record) => [record.videoId, record]) ?? []);
  await writeJsonFile(path, buildChannelEpisodeMaster(result, {
    ...options,
    storedTranscripts,
    metadataRecords,
  }));
}

export function buildChannelEpisodeMaster(
  result: ChannelVideoLinksResult,
  options: BuildChannelEpisodeMasterOptions = {},
): ChannelEpisodeMasterResult {
  const notes = [...(options.notes ?? [])];
  if (result.tabs.streams.pagesFetched === 0) {
    notes.push("Streams tab has not been fetched in this inventory.");
  }

  return {
    schemaVersion: 2,
    channelUrl: result.channelUrl,
    channelId: result.channelId,
    fetchedAt: result.fetchedAt,
    requestDelayMs: result.requestDelayMs,
    inventory: {
      completeness: options.completeness ?? "unknown",
      tabs: result.tabs,
      notes,
    },
    storage: {
      transcriptsManifest: "src/transcripts/manifest.json",
    },
    episodes: result.links.map((link, index) => channelEpisodeRecord(link, index + 1, options)),
  };
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
          link.publishedAt !== undefined ||
          link.scheduledStartAt !== undefined ||
          link.actualStartAt !== undefined ||
          link.actualEndAt !== undefined,
      ),
      videos: result.links.map((link) => videoMetadataRecord(link)),
    },
  };
}

export function mergeChannelVideoLinksResults(results: ChannelVideoLinksResult[]): ChannelVideoLinksResult {
  if (results.length === 0) {
    throw new Error("At least one channel video link result is required.");
  }

  const first = results[0];
  if (first === undefined) {
    throw new Error("At least one channel video link result is required.");
  }

  return {
    channelUrl: first.channelUrl,
    channelId: first.channelId,
    fetchedAt: new Date().toISOString(),
    requestDelayMs: Math.max(...results.map((result) => result.requestDelayMs)),
    tabs: {
      videos: mergeTabState(results, "videos"),
      streams: mergeTabState(results, "streams"),
    },
    links: mergeLinks(results.flatMap((result) => result.links)),
  };
}

function channelEpisodeRecord(
  link: ChannelVideoLink,
  channelOrder: number,
  options: BuildChannelEpisodeMasterOptions,
): ChannelEpisodeRecord {
  const metadata = options.metadataRecords?.get(link.videoId);
  const state = resolveVideoState(metadata);
  const stored = options.storedTranscripts?.get(link.videoId);
  const title = metadata?.snippet?.title ?? link.title;
  const normalizedDate = state.state === "ready" ? state.videoDateAt : undefined;
  const fallbackDate = link.videoDateAt ?? link.actualStartAt ?? link.publishedAt;
  const videoKind = metadata === undefined
    ? link.videoKind ?? (link.tabs.includes("streams") ? "stream" : "upload")
    : state.videoKind;
  const record: ChannelEpisodeRecord = {
    videoId: link.videoId,
    fileStem: stored?.fileStem ?? videoFileStem(link.videoId, title, normalizedDate ?? fallbackDate),
    url: link.url,
    channelOrder,
    tabs: link.tabs,
    tabPositions: link.tabPositions,
    videoKind,
    transcript: stored === undefined
      ? options.transcriptStates?.get(link.videoId) ?? { status: "not_checked" }
      : storedTranscriptState(stored),
  };

  if (title !== undefined) {
    record.title = title;
    const slug = slugifyVideoTitle(title);
    if (slug !== undefined) {
      record.slug = slug;
    }
  }
  if (link.durationText !== undefined) {
    record.durationText = link.durationText;
  }
  if (link.durationSeconds !== undefined) {
    record.durationSeconds = link.durationSeconds;
  }
  if (link.publishedText !== undefined) {
    record.publishedText = link.publishedText;
  }
  if (link.viewCountText !== undefined) {
    record.viewCountText = link.viewCountText;
  }
  copyAuthoritativeEpisodeDates(record, metadata, link, state);

  return record;
}

function storedTranscriptState(stored: StoredTranscriptEpisodeRecord): ChannelEpisodeTranscriptState {
  const state: Extract<ChannelEpisodeTranscriptState, { status: "stored" }> = {
    status: "stored",
    txtPath: stored.txtPath,
  };
  if (stored.segmentCount !== undefined) {
    state.segmentCount = stored.segmentCount;
  }
  if (stored.selectedLanguage !== undefined) {
    state.selectedLanguage = stored.selectedLanguage;
  }
  if (stored.fetchedAt !== undefined) {
    state.fetchedAt = stored.fetchedAt;
  }
  return state;
}

function copyAuthoritativeEpisodeDates(
  record: ChannelEpisodeRecord,
  metadata: VideoMetadataRecord | undefined,
  link: ChannelVideoLink,
  state: ReturnType<typeof resolveVideoState>,
): void {
  const publishedAt = metadata?.snippet?.publishedAt ?? link.publishedAt;
  const scheduledStartAt = metadata?.liveStreamingDetails?.scheduledStartTime ?? link.scheduledStartAt;
  const actualStartAt = metadata?.liveStreamingDetails?.actualStartTime ?? link.actualStartAt;
  const actualEndAt = metadata?.liveStreamingDetails?.actualEndTime ?? link.actualEndAt;
  if (publishedAt !== undefined) {
    record.publishedAt = publishedAt;
  }
  if (scheduledStartAt !== undefined) {
    record.scheduledStartAt = scheduledStartAt;
  }
  if (actualStartAt !== undefined) {
    record.actualStartAt = actualStartAt;
  }
  if (actualEndAt !== undefined) {
    record.actualEndAt = actualEndAt;
  }
  if (state.state === "ready") {
    record.videoDateAt = state.videoDateAt;
    record.videoDateKind = state.videoDateKind;
  }
}

export async function readStoredTranscriptEpisodeRecords(
  path = defaultTranscriptManifestInput,
): Promise<ReadonlyMap<string, StoredTranscriptEpisodeRecord>> {
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  const object = asRecord(value);
  const transcripts = object?.transcripts;
  if (!Array.isArray(transcripts)) {
    throw new Error(`Transcript manifest must contain a transcripts array: ${path}`);
  }
  const records = new Map<string, StoredTranscriptEpisodeRecord>();
  for (const value of transcripts) {
    const transcript = asRecord(value);
    const paths = asRecord(transcript?.paths);
    if (transcript === undefined || paths === undefined) {
      continue;
    }
    const videoId = readString(transcript, "videoId");
    const fileStem = readString(transcript, "fileStem");
    const txtPath = readString(paths, "txt");
    if (videoId === undefined || fileStem === undefined || txtPath === undefined) {
      continue;
    }
    const record: StoredTranscriptEpisodeRecord = { fileStem, txtPath };
    const segmentCount = transcript.segmentCount;
    const selectedLanguage = readString(transcript, "selectedLanguage");
    const fetchedAt = readString(transcript, "fetchedAt");
    if (typeof segmentCount === "number" && Number.isInteger(segmentCount)) {
      record.segmentCount = segmentCount;
    }
    if (selectedLanguage !== undefined) {
      record.selectedLanguage = selectedLanguage;
    }
    if (fetchedAt !== undefined) {
      record.fetchedAt = fetchedAt;
    }
    records.set(videoId, record);
  }
  return records;
}

function videoToResolverRecord(videoId: string, video: youtube_v3.Schema$Video): VideoMetadataRecord {
  const record: VideoMetadataRecord = { videoId, fetchedAt: new Date(0).toISOString() };
  if (video.snippet !== undefined && video.snippet !== null) {
    record.snippet = video.snippet;
  }
  if (video.contentDetails !== undefined && video.contentDetails !== null) {
    record.contentDetails = video.contentDetails;
  }
  if (video.status !== undefined && video.status !== null) {
    record.status = video.status;
  }
  if (video.liveStreamingDetails !== undefined && video.liveStreamingDetails !== null) {
    record.liveStreamingDetails = video.liveStreamingDetails;
  }
  return record;
}

function mergeTabState(
  results: ChannelVideoLinksResult[],
  tab: ChannelVideoTab,
): ChannelVideoLinksResult["tabs"][ChannelVideoTab] {
  const first = results.find((result) => result.tabs[tab].pagesFetched > 0)?.tabs[tab] ?? results[0]?.tabs[tab];

  return {
    url: first?.url ?? `${defaultChannelUrl}/${tab}`,
    pagesFetched: results.reduce((sum, result) => sum + result.tabs[tab].pagesFetched, 0),
    rawCount: results.reduce((sum, result) => sum + result.tabs[tab].rawCount, 0),
  };
}

function mergeLinks(records: ChannelVideoLink[]): ChannelVideoLink[] {
  const linksById = new Map<string, ChannelVideoLink>();

  for (const record of records) {
    const existing = linksById.get(record.videoId);
    if (!existing) {
      linksById.set(record.videoId, { ...record, tabs: [...record.tabs], tabPositions: { ...record.tabPositions } });
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
    if (existing.publishedAt === undefined && record.publishedAt !== undefined) {
      existing.publishedAt = record.publishedAt;
    }
    if (existing.publishDate === undefined && record.publishDate !== undefined) {
      existing.publishDate = record.publishDate;
    }
  }

  return [...linksById.values()];
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
    requestDelayMs: 1_000,
  };
}

function createRequestGate(options: {
  delayMs: number;
  logger?: (message: string) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): RequestGate {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());
  let lastStartMs: number | undefined;
  let requestCount = 0;

  return async (label: string) => {
    if (lastStartMs !== undefined) {
      const waitMs = Math.max(0, lastStartMs + options.delayMs - now());
      if (waitMs > 0) {
        options.logger?.(`Waiting ${Math.ceil(waitMs / 1000)}s before the next YouTube request.`);
        await sleep(waitMs);
      }
    }

    lastStartMs = now();
    requestCount += 1;
    options.logger?.(`YouTube Data API request ${requestCount}: ${label}`);
  };
}

async function resolveOfficialChannel(
  youtube: youtube_v3.Youtube,
  options: {
    channelUrl: string;
    channelId?: string;
    uploadsPlaylistId?: string;
    gate: RequestGate;
  },
): Promise<OfficialChannelInfo> {
  const channelId = options.channelId ?? channelIdFromUrl(options.channelUrl);
  if (channelId !== undefined && options.uploadsPlaylistId !== undefined) {
    return {
      channelId,
      uploadsPlaylistId: options.uploadsPlaylistId,
    };
  }

  const params: youtube_v3.Params$Resource$Channels$List = {
    part: ["contentDetails"],
  };

  if (channelId !== undefined) {
    params.id = [channelId];
  } else {
    const handle = handleFromChannelUrl(options.channelUrl);
    if (handle === undefined) {
      throw new Error("Could not resolve a channel handle. Pass --channel-id for non-handle URLs.");
    }
    params.forHandle = handle;
  }

  await options.gate("channels.list contentDetails");
  const response = await youtube.channels.list(params);
  const channel = response.data.items?.[0];
  const resolvedChannelId = channel?.id ?? channelId;
  const uploadsPlaylistId =
    options.uploadsPlaylistId ?? channel?.contentDetails?.relatedPlaylists?.uploads ?? undefined;

  if (resolvedChannelId === undefined || uploadsPlaylistId === undefined) {
    throw new Error(`Could not resolve channel uploads playlist from ${options.channelUrl}.`);
  }

  return {
    channelId: resolvedChannelId,
    uploadsPlaylistId,
  };
}

function playlistItemToVideoLink(
  item: youtube_v3.Schema$PlaylistItem,
  tabPosition: number,
): ChannelVideoLink | undefined {
  const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? undefined;
  if (videoId === undefined) {
    return undefined;
  }

  const record: ChannelVideoLink = {
    videoId,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    tabs: ["videos"],
    tabPositions: { videos: tabPosition },
  };
  const title = item.snippet?.title ?? undefined;
  const publishedAt = item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt ?? undefined;

  if (title !== undefined && title !== "Deleted video" && title !== "Private video") {
    record.title = title;
  }
  if (publishedAt !== undefined) {
    record.publishedAt = publishedAt;
    record.publishDate = publishedAt.slice(0, 10);
    record.publishedText = record.publishDate;
  }

  return record;
}

async function enrichWithOfficialVideoDetails(
  youtube: youtube_v3.Youtube,
  links: ChannelVideoLink[],
  detailLimit: number | undefined,
  includeVideoDetails: boolean,
  gate: RequestGate,
  logger: ((message: string) => void) | undefined,
): Promise<void> {
  if (includeVideoDetails && detailLimit === undefined) {
    await enrichOfficialVideoBatch(youtube, links, true, gate, logger);
    return;
  }

  await enrichOfficialVideoBatch(youtube, links, false, gate, logger);
  if (includeVideoDetails) {
    await enrichOfficialVideoBatch(youtube, links.slice(0, detailLimit), true, gate, logger);
  }
}

async function enrichOfficialVideoBatch(
  youtube: youtube_v3.Youtube,
  links: ChannelVideoLink[],
  includeVideoDetails: boolean,
  gate: RequestGate,
  logger: ((message: string) => void) | undefined,
): Promise<void> {
  const linksById = new Map(links.map((link) => [link.videoId, link]));

  for (let index = 0; index < links.length; index += 50) {
    const batch = links.slice(index, index + 50);
    const detailLabel = includeVideoDetails
      ? "full video metadata"
      : "video duration/status eligibility";
    logger?.(`Fetching ${detailLabel} ${index + 1}-${index + batch.length}/${links.length}`);
    const requestLabel = includeVideoDetails
      ? "videos.list full metadata batch"
      : "videos.list duration/status eligibility batch";
    await gate(`${requestLabel} ${Math.floor(index / 50) + 1}`);
    const response = await youtube.videos.list({
      part: includeVideoDetails
        ? ["snippet", "contentDetails", "statistics", "status", "liveStreamingDetails"]
        : ["contentDetails", "status"],
      id: batch.map((link) => link.videoId),
      maxResults: 50,
    });

    for (const video of response.data.items ?? []) {
      const videoId = video.id;
      const link = videoId ? linksById.get(videoId) : undefined;
      if (!link) {
        continue;
      }

      applyOfficialVideoDuration(link, video);
      if (includeVideoDetails) {
        applyOfficialVideoMetadata(link, video);
      }
    }
  }
}

export function applyOfficialVideoMetadata(link: ChannelVideoLink, video: youtube_v3.Schema$Video): void {
  applyOfficialVideoDuration(link, video);
  const snippet = video.snippet;
  const statistics = video.statistics;
  const liveStreamingDetails = video.liveStreamingDetails;

  const title = snippet?.title ?? undefined;
  const publishedAt = snippet?.publishedAt ?? undefined;
  const viewCount = statistics?.viewCount ?? undefined;
  const scheduledStartTime = liveStreamingDetails?.scheduledStartTime ?? undefined;
  const actualStartTime = liveStreamingDetails?.actualStartTime ?? undefined;
  const actualEndTime = liveStreamingDetails?.actualEndTime ?? undefined;

  if (title !== undefined) {
    link.title = title;
  }
  if (publishedAt !== undefined) {
    link.publishedAt = publishedAt;
  }
  if (scheduledStartTime !== undefined) {
    link.scheduledStartAt = scheduledStartTime;
  }
  if (viewCount !== undefined) {
    link.viewCountText = `${viewCount} views`;
  }
  if (actualStartTime !== undefined) {
    link.actualStartAt = actualStartTime;
  }
  if (actualEndTime !== undefined) {
    link.actualEndAt = actualEndTime;
  }
  const state = resolveVideoState(videoToResolverRecord(link.videoId, video));
  link.videoKind = state.videoKind;
  if (state.state === "ready") {
    link.videoDateAt = state.videoDateAt;
    link.videoDateKind = state.videoDateKind;
    link.publishDate = state.videoDateAt.slice(0, 10);
    link.publishedText = link.publishDate;
  }
}

export function applyOfficialVideoDuration(link: ChannelVideoLink, video: youtube_v3.Schema$Video): void {
  const durationSeconds = parseYoutubeDurationSeconds(video.contentDetails?.duration ?? undefined);
  if (durationSeconds !== undefined) {
    link.durationSeconds = durationSeconds;
  }
}

export function officialVideoStreamStartTime(video: youtube_v3.Schema$Video): string | undefined {
  const videoId = video.id ?? "metadata-record";
  const state = resolveVideoState(videoToResolverRecord(videoId, video));
  return state.state === "ready" && state.videoKind === "stream" && state.videoDateKind !== "published"
    ? state.videoDateAt
    : undefined;
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
  if (link.publishedAt !== undefined) {
    record.publishedAt = link.publishedAt;
  }
  if (link.publishDate !== undefined) {
    record.publishDate = link.publishDate;
  }
  if (link.scheduledStartAt !== undefined) {
    record.scheduledStartAt = link.scheduledStartAt;
  }
  if (link.actualStartAt !== undefined) {
    record.actualStartAt = link.actualStartAt;
  }
  if (link.actualEndAt !== undefined) {
    record.actualEndAt = link.actualEndAt;
  }
  if (link.videoDateAt !== undefined) {
    record.videoDateAt = link.videoDateAt;
  }
  if (link.videoDateKind !== undefined) {
    record.videoDateKind = link.videoDateKind;
  }
  if (link.videoKind !== undefined) {
    record.videoKind = link.videoKind;
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

function channelIdFromUrl(channelUrl: string): string | undefined {
  const match = /(?:^|\/)channel\/(UC[A-Za-z0-9_-]{22})(?:\/|$)/u.exec(channelUrl);
  return match?.[1];
}

function handleFromChannelUrl(channelUrl: string): string | undefined {
  const match = /(?:^|\/)@([A-Za-z0-9._-]+)(?:\/|$)/u.exec(channelUrl);
  return match ? `@${match[1]}` : undefined;
}

function requestHost(input: Parameters<typeof fetch>[0]): string {
  const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
  return new URL(url).host;
}

function requestDescription(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]): string {
  const label = (init as LabeledFetchInit | undefined)?.[fetchRequestLabel];
  const host = requestHost(input);
  return label ? `${label} (${host})` : host;
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
