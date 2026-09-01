import type { CuratedSegmentSeed, CuratedTopicSeed, } from "./schemas/index.js";

export type CuratedArchiveSegmentSeed = CuratedSegmentSeed & {
  id: string;
  videoId: string;
};

export interface CuratedVideoSeed {
  videoId: string;
  topics: string[];
}

export interface CuratedArchiveSeed {
  videos: CuratedVideoSeed[];
  topics: CuratedTopicSeed[];
  segments: CuratedArchiveSegmentSeed[];
}
