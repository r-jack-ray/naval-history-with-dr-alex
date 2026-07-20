export interface LighthouseVideoCandidate {
  slug: string;
  segmentSlugs: string[];
  topics: Array<{ slug: string }>;
}

export interface LighthouseTarget {
  name: "home" | "video" | "time-note" | "topic" | "largest-directory";
  route: string;
}

export function buildRepresentativeLighthouseTargets(
  videos: readonly LighthouseVideoCandidate[],
): LighthouseTarget[] {
  const representative = videos.find((video) => video.segmentSlugs.length > 0 && video.topics.length > 0);
  if (representative === undefined) {
    throw new Error("A video with at least one time note and topic is required for the SEO Lighthouse baseline.");
  }
  const segmentSlug = representative.segmentSlugs[0];
  const topicSlug = representative.topics[0]?.slug;
  if (segmentSlug === undefined || topicSlug === undefined) {
    throw new Error("Representative Lighthouse routes could not be selected.");
  }
  return [
    { name: "home", route: "" },
    { name: "video", route: `videos/${representative.slug}/` },
    { name: "time-note", route: `segments/${segmentSlug}/` },
    { name: "topic", route: `topics/${topicSlug}/` },
    { name: "largest-directory", route: "topics/browse/" },
  ];
}
