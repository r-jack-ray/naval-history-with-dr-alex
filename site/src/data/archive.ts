import archiveJson from "./generated/archive.json";

export interface ArchiveData {
  schemaVersion: 1;
  videos: ArchiveVideo[];
  segments: ArchiveSegment[];
  topics: ArchiveTopic[];
}

export interface ArchiveVideo {
  title: string;
  slug: string;
  videoId: string;
  youtubeUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
  publishedAt?: string | null;
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

export interface ArchiveSegment {
  id: string;
  slug: string;
  title: string;
  kind: "chapter" | "notable_point" | "qa" | "transcript_excerpt";
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

export interface ArchiveTopic {
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

export const archive = archiveJson as ArchiveData;
export const archiveVideos = archive.videos;
export const archiveSegments = archive.segments;
export const archiveTopics = archive.topics;

export function getVideoPaths() {
  return archiveVideos.map((video) => ({
    params: { slug: video.slug },
    props: { video },
  }));
}

export function getSegmentPaths() {
  return archiveSegments.map((segment) => ({
    params: { slug: segment.slug },
    props: { segment },
  }));
}

export function getTopicPaths() {
  return archiveTopics.map((topic) => ({
    params: { slug: topic.slug },
    props: { topic },
  }));
}

export function findVideoById(videoId: string): ArchiveVideo | undefined {
  return archiveVideos.find((video) => video.videoId === videoId);
}

export function findVideoBySlug(slug: string): ArchiveVideo | undefined {
  return archiveVideos.find((video) => video.slug === slug);
}

export function findSegmentBySlug(slug: string): ArchiveSegment | undefined {
  return archiveSegments.find((segment) => segment.slug === slug);
}

export function segmentsForVideo(video: ArchiveVideo): ArchiveSegment[] {
  const segmentSlugs = new Set(video.segmentSlugs);
  return archiveSegments.filter((segment) => segmentSlugs.has(segment.slug));
}

export function segmentsForTopic(topic: ArchiveTopic): ArchiveSegment[] {
  return archiveSegments.filter((segment) => segment.topics.some((entry) => entry.slug === topic.slug));
}

export function videosForTopic(topic: ArchiveTopic): ArchiveVideo[] {
  const videoIds = new Set<string>();
  for (const video of archiveVideos) {
    if (video.topics.some((entry) => entry.slug === topic.slug)) {
      videoIds.add(video.videoId);
    }
  }
  for (const segment of segmentsForTopic(topic)) {
    videoIds.add(segment.videoId);
  }
  return archiveVideos.filter((video) => videoIds.has(video.videoId));
}
