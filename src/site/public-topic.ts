export interface TopicCoverage {
  videoCount: number;
  segmentCount: number;
}

export function isPublicTopic(topic: TopicCoverage): boolean {
  return topic.videoCount > 0 || topic.segmentCount > 0;
}
