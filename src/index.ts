export const projectName = "naval-history-with-dr-alex";

export const segmentKinds = [
  "chapter",
  "notable_point",
  "qa",
  "transcript_excerpt",
] as const;

export type SegmentKind = (typeof segmentKinds)[number];

export interface VideoSegment {
  videoId: string;
  title: string;
  startSeconds: number;
  kind: SegmentKind;
  summary: string;
  sourcePath?: string;
}

export function formatTimestamp(totalSeconds: number): string {
  if (!Number.isInteger(totalSeconds) || totalSeconds < 0) {
    throw new RangeError("Timestamp seconds must be a non-negative integer.");
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const secondsText = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${secondsText}`;
  }

  return `${minutes}:${secondsText}`;
}

export function youtubeTimestampUrl(videoId: string, startSeconds: number): string {
  if (!videoId.trim()) {
    throw new RangeError("Video ID is required.");
  }

  if (!Number.isInteger(startSeconds) || startSeconds < 0) {
    throw new RangeError("Timestamp seconds must be a non-negative integer.");
  }

  return `https://youtu.be/${encodeURIComponent(videoId)}?t=${startSeconds}`;
}
