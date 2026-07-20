import type { SiteSegment, SiteTopic, SiteVideo } from "./archive-data.js";

export interface PageMetadata {
  title: string;
  description: string;
}

export const MAX_METADATA_TITLE_LENGTH = 180;
export const MAX_METADATA_DESCRIPTION_LENGTH = 220;

const siteName = "Naval History with Dr. Alex Study Guide";

export const staticPageMetadata = {
  home: {
    title: siteName,
    description: "Find Dr. Alex Clarke video guides and precise time notes about ships, battles, navies, doctrine, technology, and naval strategy.",
  },
  search: {
    title: `Search Naval History Videos and Time Notes | ${siteName}`,
    description: "Search Dr. Alex Clarke video guides, naval-history topics, and specific video moments by ship, navy, battle, weapon, doctrine, or strategy.",
  },
  videos: {
    title: `Dr. Alex Clarke Video Guides | ${siteName}`,
    description: "Browse Dr. Alex Clarke video guides by publication date, subject, format, and available time notes, then choose the moment you want to watch.",
  },
  segments: {
    title: `Find Naval History Time Notes | ${siteName}`,
    description: "Find focused explanations and audience questions in Dr. Alex Clarke videos by naval subject, topic, and type of time note.",
  },
  topics: {
    title: `Naval History Topics | ${siteName}`,
    description: "Explore ships, navies, battles, weapons, doctrine, policy, and strategy across related Dr. Alex Clarke video guides and time notes.",
  },
} as const satisfies Record<string, PageMetadata>;

export function normalizeMetadataText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function boundText(value: string, maximumLength: number): string {
  const normalized = normalizeMetadataText(value);
  if (normalized.length <= maximumLength) {
    return normalized;
  }

  const candidate = normalized.slice(0, maximumLength - 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const breakpoint = lastSpace >= Math.floor(maximumLength * 0.65) ? lastSpace : candidate.length;
  return `${candidate.slice(0, breakpoint).replace(/[\s,;:.!?-]+$/gu, "")}…`;
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

function meaningfulTopics(video: Pick<SiteVideo, "topics">): string {
  const topicNames = video.topics
    .map((topic) => normalizeMetadataText(topic.title))
    .filter((title) => title.length > 0)
    .slice(0, 3);
  return topicNames.length === 0 ? "" : ` Topics include ${topicNames.join(", ")}.`;
}

export function buildVideoPageMetadata(
  video: Pick<SiteVideo, "title" | "videoDateLabel" | "videoKind" | "topics" | "segmentSlugs">,
): PageMetadata {
  const title = boundText(video.title, 105);
  const date = boundText(video.videoDateLabel, 35);
  const format = video.videoKind === "stream" ? "stream" : "video";
  const timeNotes = countLabel(video.segmentSlugs.length, "time note");
  return {
    title: `${title} (${date}; ${timeNotes}) | Dr. Alex Clarke Video Guide`,
    description: boundText(
      `Study ${title}, a Dr. Alex Clarke ${format} from ${date}, with ${timeNotes}.${meaningfulTopics(video)}`,
      MAX_METADATA_DESCRIPTION_LENGTH,
    ),
  };
}

export function segmentDescriptionSource(
  segment: Pick<SiteSegment, "summary" | "answerShort" | "body">,
): string {
  for (const candidate of [segment.summary, segment.answerShort, segment.body]) {
    if (typeof candidate === "string") {
      const normalized = normalizeMetadataText(candidate);
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }
  return "Open this time note for a transcript-backed explanation of the subject.";
}

export function buildSegmentPageMetadata(
  segment: Pick<SiteSegment, "title" | "videoTitle" | "start" | "summary" | "answerShort" | "body">,
): PageMetadata {
  const title = boundText(segment.title, 72);
  const videoTitle = boundText(segment.videoTitle, 62);
  const start = boundText(segment.start, 16);
  return {
    title: `${title} — ${videoTitle} at ${start} | Time Note`,
    description: boundText(
      `At ${start} in ${videoTitle}: ${segmentDescriptionSource(segment)}`,
      MAX_METADATA_DESCRIPTION_LENGTH,
    ),
  };
}

export function buildTopicPageMetadata(
  topic: Pick<SiteTopic, "title" | "summary" | "videoCount" | "segmentCount">,
): PageMetadata {
  const title = boundText(topic.title, 125);
  const summary = normalizeMetadataText(topic.summary)
    || `Explore ${title} across the Dr. Alex Clarke study guide.`;
  return {
    title: `${title} | Naval History Topic Guide`,
    description: boundText(
      `${summary} Includes ${countLabel(topic.videoCount, "video guide")} and ${countLabel(topic.segmentCount, "time note")}.`,
      MAX_METADATA_DESCRIPTION_LENGTH,
    ),
  };
}

export function buildTimeNoteBrowseMetadata(currentPage: number, lastPage: number): PageMetadata {
  return {
    title: `Browse Naval History Time Notes, Page ${currentPage} | ${siteName}`,
    description: `Browse page ${currentPage} of ${lastPage} in the chronological directory of Dr. Alex Clarke video time notes and transcript-backed watch points.`,
  };
}
