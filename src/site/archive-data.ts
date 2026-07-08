import { dirname } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { formatTimestamp, segmentKinds, type SegmentKind } from "../index.js";
import { slugifyVideoTitle } from "../naming.js";

export const defaultSiteEpisodesInput = "src/channel/episodes.json";
export const defaultSiteMetadataInput = "src/channel/video-metadata.json";
export const defaultSiteSegmentsInput = "src/derived/prototype-segments.json";
export const defaultSiteArchiveOutput = "site/src/data/generated/archive.json";

export interface GenerateSiteArchiveDataOptions {
  episodesInput: string;
  metadataInput: string;
  segmentsInput: string;
  output: string;
}

export interface SiteArchiveData {
  schemaVersion: 1;
  source: {
    episodesInput: string;
    metadataInput: string;
    segmentsInput: string;
  };
  videos: SiteVideo[];
  segments: SiteSegment[];
  topics: SiteTopic[];
}

export interface SiteVideo {
  title: string;
  slug: string;
  videoId: string;
  youtubeUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
  publishedLabel: string;
  durationLabel: string;
  viewCountLabel: string;
  sourceType: string;
  transcriptStatus: string;
  fileStem: string;
  description: string;
  topics: TopicRef[];
  segmentSlugs: string[];
  stats: {
    views?: string;
    likes?: string;
    comments?: string;
  };
}

export interface SiteSegment {
  id: string;
  slug: string;
  title: string;
  kind: SegmentKind;
  kindLabel: string;
  videoId: string;
  videoSlug: string;
  videoTitle: string;
  start: string;
  startSeconds: number;
  end?: string;
  endSeconds?: number;
  youtubeUrl: string;
  summary: string;
  body: string;
  question?: string;
  answerShort?: string;
  sourcePath?: string;
  topics: TopicRef[];
  evidence: SegmentEvidence[];
}

export interface SiteTopic {
  slug: string;
  title: string;
  summary: string;
  aliases: string[];
  videoCount: number;
  segmentCount: number;
}

export interface TopicRef {
  slug: string;
  title: string;
}

export interface SegmentEvidence {
  start: string;
  end?: string;
  note: string;
}

interface EpisodeStore {
  episodes: ChannelEpisode[];
}

interface ChannelEpisode {
  videoId: string;
  title: string;
  slug?: string;
  url?: string;
  fileStem?: string;
  durationText?: string;
  publishedText?: string;
  publishedAt?: string;
  publishDate?: string;
  viewCountText?: string;
  tabs?: string[];
  transcript?: {
    status?: string;
  };
}

interface VideoMetadataStore {
  videos: VideoMetadata[];
}

interface VideoMetadata {
  videoId: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string; width?: number; height?: number }>;
  };
  contentDetails?: {
    duration?: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
}

interface CuratedArchiveSeed {
  schemaVersion: 1;
  videos: CuratedVideoSeed[];
  topics: CuratedTopicSeed[];
  segments: CuratedSegmentSeed[];
}

interface CuratedVideoSeed {
  videoId: string;
  topics: string[];
}

interface CuratedTopicSeed {
  slug: string;
  title: string;
  summary: string;
  aliases?: string[];
}

interface CuratedSegmentSeed {
  id: string;
  videoId: string;
  slug: string;
  title: string;
  kind: SegmentKind;
  start: string;
  end?: string;
  topics: string[];
  summary: string;
  body: string;
  question?: string;
  answerShort?: string;
  sourcePath?: string;
  evidence?: SegmentEvidence[];
}

export async function generateSiteArchiveData(options: GenerateSiteArchiveDataOptions): Promise<SiteArchiveData> {
  const [episodesStore, metadataStore, seed] = await Promise.all([
    readJson<EpisodeStore>(options.episodesInput),
    readJson<VideoMetadataStore>(options.metadataInput),
    readJson<CuratedArchiveSeed>(options.segmentsInput),
  ]);
  const archive = buildSiteArchiveData({
    episodesStore,
    metadataStore,
    seed,
    source: {
      episodesInput: options.episodesInput,
      metadataInput: options.metadataInput,
      segmentsInput: options.segmentsInput,
    },
  });

  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
  return archive;
}

export function buildSiteArchiveData(input: {
  episodesStore: EpisodeStore;
  metadataStore: VideoMetadataStore;
  seed: CuratedArchiveSeed;
  source: SiteArchiveData["source"];
}): SiteArchiveData {
  validateSeed(input.seed);

  const episodesById = new Map(input.episodesStore.episodes.map((episode) => [episode.videoId, episode]));
  const metadataById = new Map(input.metadataStore.videos.map((metadata) => [metadata.videoId, metadata]));
  const topicSeedsBySlug = new Map(input.seed.topics.map((topic) => [topic.slug, topic]));
  const videoSeedsById = new Map(input.seed.videos.map((video) => [video.videoId, video]));
  const videoRecordsById = new Map<string, SiteVideo>();

  for (const videoSeed of input.seed.videos) {
    const episode = episodesById.get(videoSeed.videoId);
    if (episode === undefined) {
      throw new Error(`Site video seed references missing episode: ${videoSeed.videoId}`);
    }

    videoRecordsById.set(videoSeed.videoId, buildSiteVideo({
      episode,
      metadata: metadataById.get(videoSeed.videoId),
      topics: topicRefs(videoSeed.topics, topicSeedsBySlug),
      segmentSlugs: [],
    }));
  }

  const segments = input.seed.segments.map((segmentSeed) => {
    const video = videoRecordsById.get(segmentSeed.videoId);
    if (video === undefined) {
      throw new Error(`Segment ${segmentSeed.id} references missing site video: ${segmentSeed.videoId}`);
    }

    const segment = buildSiteSegment({
      seed: segmentSeed,
      video,
      topics: topicRefs(segmentSeed.topics, topicSeedsBySlug),
    });
    video.segmentSlugs.push(segment.slug);
    return segment;
  });

  for (const segment of segments) {
    if (!videoSeedsById.has(segment.videoId)) {
      throw new Error(`Segment ${segment.id} references video outside site seed: ${segment.videoId}`);
    }
  }

  const topics = input.seed.topics.map((topic) => {
    const relatedVideos = new Set<string>();
    const relatedSegments = segments.filter((segment) => segment.topics.some((ref) => ref.slug === topic.slug));

    for (const video of videoRecordsById.values()) {
      if (video.topics.some((ref) => ref.slug === topic.slug)) {
        relatedVideos.add(video.videoId);
      }
    }
    for (const segment of relatedSegments) {
      relatedVideos.add(segment.videoId);
    }

    return {
      slug: topic.slug,
      title: topic.title,
      summary: topic.summary,
      aliases: [...(topic.aliases ?? [])],
      videoCount: relatedVideos.size,
      segmentCount: relatedSegments.length,
    };
  });

  return {
    schemaVersion: 1,
    source: input.source,
    videos: [...videoRecordsById.values()],
    segments,
    topics,
  };
}

function buildSiteVideo(input: {
  episode: ChannelEpisode;
  metadata: VideoMetadata | undefined;
  topics: TopicRef[];
  segmentSlugs: string[];
}): SiteVideo {
  const title = input.metadata?.snippet?.title ?? input.episode.title;
  const slug = input.episode.slug ?? slugifyVideoTitle(title) ?? input.episode.videoId;
  const youtubeUrl = input.episode.url ?? `https://www.youtube.com/watch?v=${input.episode.videoId}`;
  const stats = buildStats(input.metadata);

  return {
    title,
    slug,
    videoId: input.episode.videoId,
    youtubeUrl,
    embedUrl: `https://www.youtube-nocookie.com/embed/${input.episode.videoId}`,
    thumbnailUrl: thumbnailUrl(input.episode.videoId, input.metadata),
    publishedLabel: input.episode.publishedText ??
      formatDate(input.episode.publishDate ?? input.episode.publishedAt ?? input.metadata?.snippet?.publishedAt) ??
      "Unknown publication date",
    durationLabel: input.episode.durationText ?? parseYoutubeDuration(input.metadata?.contentDetails?.duration) ?? "Unknown duration",
    viewCountLabel: input.episode.viewCountText ?? stats.views ?? "Unknown views",
    sourceType: input.episode.tabs?.includes("streams") ? "stream" : "video",
    transcriptStatus: input.episode.transcript?.status ?? "unknown",
    fileStem: input.episode.fileStem ?? "",
    description: input.metadata?.snippet?.description ?? "",
    topics: input.topics,
    segmentSlugs: input.segmentSlugs,
    stats,
  };
}

function buildSiteSegment(input: {
  seed: CuratedSegmentSeed;
  video: SiteVideo;
  topics: TopicRef[];
}): SiteSegment {
  const startSeconds = parseTimestamp(input.seed.start);
  const endSeconds = input.seed.end === undefined ? undefined : parseTimestamp(input.seed.end);

  if (endSeconds !== undefined && endSeconds <= startSeconds) {
    throw new Error(`Segment ${input.seed.id} end must be after start.`);
  }

  const segment: SiteSegment = {
    id: input.seed.id,
    slug: input.seed.slug,
    title: input.seed.title,
    kind: input.seed.kind,
    kindLabel: labelSegmentKind(input.seed.kind),
    videoId: input.seed.videoId,
    videoSlug: input.video.slug,
    videoTitle: input.video.title,
    start: formatTimestamp(startSeconds),
    startSeconds,
    youtubeUrl: `${input.video.youtubeUrl}&t=${startSeconds}s`,
    summary: input.seed.summary,
    body: input.seed.body,
    topics: input.topics,
    evidence: input.seed.evidence ?? [],
  };

  if (input.seed.end !== undefined && endSeconds !== undefined) {
    segment.end = formatTimestamp(endSeconds);
    segment.endSeconds = endSeconds;
  }
  if (input.seed.question !== undefined) {
    segment.question = input.seed.question;
  }
  if (input.seed.answerShort !== undefined) {
    segment.answerShort = input.seed.answerShort;
  }
  if (input.seed.sourcePath !== undefined) {
    segment.sourcePath = input.seed.sourcePath;
  }

  return segment;
}

function validateSeed(seed: CuratedArchiveSeed): void {
  if (seed.schemaVersion !== 1) {
    throw new Error("Curated archive seed schemaVersion must be 1.");
  }

  assertUnique(seed.videos.map((video) => video.videoId), "video ID");
  assertUnique(seed.topics.map((topic) => topic.slug), "topic slug");
  assertUnique(seed.segments.map((segment) => segment.id), "segment ID");
  assertUnique(seed.segments.map((segment) => segment.slug), "segment slug");

  const videoIds = new Set(seed.videos.map((video) => video.videoId));
  const topicSlugs = new Set(seed.topics.map((topic) => topic.slug));
  const allowedKinds = new Set<string>(segmentKinds);

  for (const video of seed.videos) {
    for (const topic of video.topics) {
      if (!topicSlugs.has(topic)) {
        throw new Error(`Video ${video.videoId} references missing topic: ${topic}`);
      }
    }
  }

  for (const segment of seed.segments) {
    if (!videoIds.has(segment.videoId)) {
      throw new Error(`Segment ${segment.id} references missing seeded video: ${segment.videoId}`);
    }
    if (!allowedKinds.has(segment.kind)) {
      throw new Error(`Segment ${segment.id} has unsupported kind: ${segment.kind}`);
    }
    parseTimestamp(segment.start);
    if (segment.end !== undefined) {
      parseTimestamp(segment.end);
    }
    for (const topic of segment.topics) {
      if (!topicSlugs.has(topic)) {
        throw new Error(`Segment ${segment.id} references missing topic: ${topic}`);
      }
    }
  }
}

function topicRefs(slugs: string[], topicSeedsBySlug: ReadonlyMap<string, CuratedTopicSeed>): TopicRef[] {
  return slugs.map((slug) => {
    const topic = topicSeedsBySlug.get(slug);
    if (topic === undefined) {
      throw new Error(`Missing topic: ${slug}`);
    }
    return {
      slug,
      title: topic.title,
    };
  });
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label}: ${value}`);
    }
    seen.add(value);
  }
}

function thumbnailUrl(videoId: string, metadata: VideoMetadata | undefined): string {
  return metadata?.snippet?.thumbnails?.maxres?.url ??
    metadata?.snippet?.thumbnails?.standard?.url ??
    metadata?.snippet?.thumbnails?.high?.url ??
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function buildStats(metadata: VideoMetadata | undefined): SiteVideo["stats"] {
  const stats: SiteVideo["stats"] = {};
  const views = formatCount(metadata?.statistics?.viewCount, "views");
  const likes = formatCount(metadata?.statistics?.likeCount, "likes");
  const comments = formatCount(metadata?.statistics?.commentCount, "comments");

  if (views !== undefined) {
    stats.views = views;
  }
  if (likes !== undefined) {
    stats.likes = likes;
  }
  if (comments !== undefined) {
    stats.comments = comments;
  }

  return stats;
}

function formatCount(value: string | undefined, label: string): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue)) {
    return `${value} ${label}`;
  }

  return `${new Intl.NumberFormat("en-US").format(parsedValue)} ${label}`;
}

function formatDate(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function parseYoutubeDuration(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/u.exec(value);
  if (!match) {
    return value;
  }

  const hours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  const seconds = Number.parseInt(match[3] ?? "0", 10);
  return formatTimestamp((hours * 3600) + (minutes * 60) + seconds);
}

function parseTimestamp(value: string): number {
  const parts = value.split(":").map((part) => Number.parseInt(part, 10));
  if ((parts.length !== 2 && parts.length !== 3) || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Invalid timestamp: ${value}`);
  }

  if (parts.length === 2) {
    const minutes = parts[0];
    const seconds = parts[1];
    if (minutes === undefined || seconds === undefined) {
      throw new Error(`Invalid timestamp: ${value}`);
    }
    if (seconds > 59) {
      throw new Error(`Invalid timestamp seconds: ${value}`);
    }
    return (minutes * 60) + seconds;
  }

  const hours = parts[0];
  const minutes = parts[1];
  const seconds = parts[2];
  if (hours === undefined || minutes === undefined || seconds === undefined) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  if (minutes > 59 || seconds > 59) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return (hours * 3600) + (minutes * 60) + seconds;
}

function labelSegmentKind(kind: SegmentKind): string {
  if (kind === "qa") {
    return "Q&A";
  }

  return kind
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}
