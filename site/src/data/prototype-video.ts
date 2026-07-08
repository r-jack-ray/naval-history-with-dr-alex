import episodesData from "../../../src/channel/episodes.json";
import metadataData from "../../../src/channel/video-metadata.json";

const prototypeVideoId = "uURe69Wnh-Q";

interface ChannelEpisode {
  videoId: string;
  title: string;
  slug: string;
  url: string;
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
  liveStreamingDetails?: {
    actualStartTime?: string;
    actualEndTime?: string;
    scheduledStartTime?: string;
  };
}

export interface PrototypeVideoSegment {
  title: string;
  timestamp: string;
  seconds: number;
  youtubeUrl: string;
}

export interface PrototypeVideo {
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
  topics: string[];
  segments: PrototypeVideoSegment[];
  stats: {
    views?: string;
    likes?: string;
    comments?: string;
  };
}

const episodes = (episodesData as { episodes: ChannelEpisode[] }).episodes;
const metadataVideos = (metadataData as { videos: VideoMetadata[] }).videos;

const episode = episodes.find((entry) => entry.videoId === prototypeVideoId);
const metadata = metadataVideos.find((entry) => entry.videoId === prototypeVideoId);

if (!episode) {
  throw new Error(`Prototype video ${prototypeVideoId} is missing from src/channel/episodes.json`);
}

const description = metadata?.snippet?.description ?? "";
const youtubeUrl = episode.url;
const thumbnailUrl =
  metadata?.snippet?.thumbnails?.maxres?.url ??
  metadata?.snippet?.thumbnails?.standard?.url ??
  metadata?.snippet?.thumbnails?.high?.url ??
  `https://i.ytimg.com/vi/${prototypeVideoId}/hqdefault.jpg`;

export const prototypeVideo: PrototypeVideo = {
  title: metadata?.snippet?.title ?? episode.title,
  slug: episode.slug,
  videoId: episode.videoId,
  youtubeUrl,
  embedUrl: `https://www.youtube-nocookie.com/embed/${episode.videoId}`,
  thumbnailUrl,
  publishedLabel: episode.publishedText ?? episode.publishDate ?? "Unknown publication date",
  durationLabel: episode.durationText ?? metadata?.contentDetails?.duration ?? "Unknown duration",
  viewCountLabel:
    episode.viewCountText ?? formatCount(metadata?.statistics?.viewCount, "views") ?? "Unknown views",
  sourceType: episode.tabs?.includes("streams") ? "stream" : "video",
  transcriptStatus: episode.transcript?.status ?? "unknown",
  fileStem: episode.fileStem ?? "",
  description,
  topics: ["modern navy", "naval history", "Q&A"],
  segments: extractSegments(description, youtubeUrl),
  stats: buildStats(metadata),
};

export const prototypeVideos = [prototypeVideo];

export function getPrototypeVideoPaths() {
  return prototypeVideos.map((video) => ({
    params: { slug: video.slug },
    props: { video },
  }));
}

function extractSegments(descriptionText: string, sourceUrl: string): PrototypeVideoSegment[] {
  const segments: PrototypeVideoSegment[] = [];
  const timestampLinePattern = /^((?:\d{1,2}:)?\d{2}:\d{2})\s+(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = timestampLinePattern.exec(descriptionText)) !== null) {
    const timestamp = match[1] ?? "";
    const title = (match[2] ?? "").trim();
    const seconds = timestampToSeconds(timestamp);

    if (!title || seconds < 0) {
      continue;
    }

    segments.push({
      title,
      timestamp,
      seconds,
      youtubeUrl: `${sourceUrl}&t=${seconds}s`,
    });
  }

  return segments;
}

function timestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(":").map((part) => Number.parseInt(part, 10));

  if (parts.some((part) => Number.isNaN(part))) {
    return -1;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return -1;
}

function buildStats(sourceMetadata: VideoMetadata | undefined): PrototypeVideo["stats"] {
  const stats: PrototypeVideo["stats"] = {};
  const views = formatCount(sourceMetadata?.statistics?.viewCount, "views");
  const likes = formatCount(sourceMetadata?.statistics?.likeCount, "likes");
  const comments = formatCount(sourceMetadata?.statistics?.commentCount, "comments");

  if (views) {
    stats.views = views;
  }

  if (likes) {
    stats.likes = likes;
  }

  if (comments) {
    stats.comments = comments;
  }

  return stats;
}

function formatCount(value: string | undefined, label: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue)) {
    return `${value} ${label}`;
  }

  return `${new Intl.NumberFormat("en-US").format(parsedValue)} ${label}`;
}
