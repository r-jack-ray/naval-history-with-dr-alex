import type { CuratedSegmentSeed, CuratedTopicSeed, } from "./schemas/index.js";

export interface CuratedVideoSeed {
  videoId: string;
  topics: string[];
}

export interface CuratedArchiveSeed {
  videos: CuratedVideoSeed[];
  topics: CuratedTopicSeed[];
  segments: CuratedSegmentSeed[];
}
