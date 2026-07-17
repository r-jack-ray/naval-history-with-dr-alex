import { createHash } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { formatTimestamp, segmentKinds, type SegmentKind } from "../index.js";
import { slugifyVideoTitle } from "../naming.js";
import { writeTextAtomically } from "../pipeline/atomic-write.js";
import {
  resolveVideoState,
  type VideoDateKind,
  type VideoKind,
  type VideoMetadataRecord,
  type VideoStateResult,
} from "../youtube/video-metadata.js";
import {
  loadCuratedArchiveSeed,
  type CuratedArchiveSeed,
  type CuratedSegmentSeed,
  type CuratedTopicSeed,
} from "./curated-seed.js";

export const defaultSiteEpisodesInput = "src/channel/episodes.json";
export const defaultSiteMetadataInput = "src/channel/video-metadata.json";
export const defaultSiteTranscriptsInput = "src/transcripts/manifest.json";
export const defaultSiteSegmentsInput = "src/derived/video-segments";
export const defaultSitePatternsInput = "src/derived/topic-normalization-patterns.tsv";
export const defaultSiteArchiveOutputDir = "site/src/data/generated/archive";
export const siteArchiveSchemaVersion = 4 as const;
export const siteArchiveSegmentBucketCount = 64;
export const siteArchiveSegmentShardingAlgorithm = "sha256-video-id-mod" as const;

export interface GenerateSiteArchiveDataOptions {
  episodesInput: string;
  metadataInput: string;
  transcriptsInput: string;
  segmentsInput: string;
  patternsInput: string;
  patternsSha256: string;
  patternsSourceSha256: string;
  legacyRedirects: readonly SiteTopicLegacyRedirect[];
  outputDir: string;
}

export interface SiteArchiveData {
  schemaVersion: 3;
  source: {
    episodesInput: string;
    metadataInput: string;
    transcriptsInput: string;
    segmentsInput: string;
    patternsInput: string;
    patternsSha256: string;
    patternsSourceSha256: string;
  };
  videos: SiteVideo[];
  segments: SiteSegment[];
  topics: SiteTopic[];
}

export interface SiteArchiveFileRecord {
  path: string;
  count: number;
  sha256: string;
}

export interface SiteArchiveSegmentBucketRecord extends SiteArchiveFileRecord {
  id: string;
}

export interface SiteArchiveManifest {
  schemaVersion: typeof siteArchiveSchemaVersion;
  source: SiteArchiveData["source"];
  counts: {
    videos: number;
    segments: number;
    topics: number;
  };
  segmentSharding: {
    algorithm: typeof siteArchiveSegmentShardingAlgorithm;
    bucketCount: typeof siteArchiveSegmentBucketCount;
  };
  files: {
    videos: SiteArchiveFileRecord;
    topics: SiteArchiveFileRecord;
    segmentBuckets: SiteArchiveSegmentBucketRecord[];
  };
}

export interface SiteArchiveSegmentBucket {
  id: string;
  segments: SiteSegment[];
}

export interface SiteArchiveSplitData {
  manifest: SiteArchiveManifest;
  videos: SiteVideo[];
  topics: SiteTopic[];
  segmentBuckets: SiteArchiveSegmentBucket[];
}

export interface SiteVideo {
  title: string;
  slug: string;
  videoId: string;
  youtubeUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
  videoDateAt: string;
  videoDateLabel: string;
  videoDateKind: VideoDateKind;
  videoKind: VideoKind;
  durationLabel: string;
  viewCountLabel: string;
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
  legacySlugs: string[];
  videoCount: number;
  segmentCount: number;
}

export interface SiteTopicLegacyRedirect {
  legacySlug: string;
  canonicalSlug: string;
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
  scheduledStartAt?: string;
  actualStartAt?: string;
  actualEndAt?: string;
  videoDateAt?: string;
  videoDateKind?: VideoDateKind;
  videoKind?: VideoKind;
  viewCountText?: string;
  tabs?: string[];
  transcript?: {
    status?: string;
  };
}

interface VideoMetadataStore {
  videos: VideoMetadataRecord[];
}

interface TranscriptManifestStore {
  transcripts: {
    videoId: string;
    fileStem: string;
    paths: { txt: string };
  }[];
}

export async function generateSiteArchiveData(
  options: GenerateSiteArchiveDataOptions,
): Promise<SiteArchiveSplitData> {
  const [episodesStore, metadataStore, transcriptsStore, seed] = await Promise.all([
    readJson<EpisodeStore>(options.episodesInput),
    readJson<VideoMetadataStore>(options.metadataInput),
    readJson<TranscriptManifestStore>(options.transcriptsInput),
    loadCuratedArchiveSeed(options.segmentsInput),
  ]);
  const archive = buildSiteArchiveData({
    episodesStore,
    metadataStore,
    transcriptsStore,
    seed,
    source: {
      episodesInput: options.episodesInput,
      metadataInput: options.metadataInput,
      transcriptsInput: options.transcriptsInput,
      segmentsInput: options.segmentsInput,
      patternsInput: options.patternsInput,
      patternsSha256: options.patternsSha256,
      patternsSourceSha256: options.patternsSourceSha256,
    },
    legacyRedirects: options.legacyRedirects,
  });

  const splitData = splitSiteArchiveData(archive);
  await writeSiteArchiveSplitData(options.outputDir, splitData);
  return splitData;
}

export function buildSiteArchiveData(input: {
  episodesStore: EpisodeStore;
  metadataStore: VideoMetadataStore;
  transcriptsStore: TranscriptManifestStore;
  seed: CuratedArchiveSeed;
  source: SiteArchiveData["source"];
  legacyRedirects: readonly SiteTopicLegacyRedirect[];
}): SiteArchiveData {
  validateSeed(input.seed);

  const episodesById = new Map(input.episodesStore.episodes.map((episode) => [episode.videoId, episode]));
  const metadataById = new Map(input.metadataStore.videos.map((metadata) => [metadata.videoId, metadata]));
  const transcriptsById = new Map(input.transcriptsStore.transcripts.map((record) => [record.videoId, record]));
  const topicSeedsBySlug = new Map(input.seed.topics.map((topic) => [topic.slug, topic]));
  const legacySlugsByCanonical = buildLegacySlugsByCanonical(
    input.legacyRedirects,
    topicSeedsBySlug,
  );
  const videoSeedsById = new Map(input.seed.videos.map((video) => [video.videoId, video]));
  const videoRecordsById = new Map<string, SiteVideo>();
  const usedVideoSlugs = new Set<string>();
  const deferredVideoIds = new Set<string>();

  for (const videoSeed of input.seed.videos) {
    const episode = episodesById.get(videoSeed.videoId);
    if (episode === undefined) {
      throw new Error(`Site video seed references missing episode: ${videoSeed.videoId}`);
    }
    const metadata = metadataById.get(videoSeed.videoId);
    if (metadata === undefined) {
      throw new Error(`Site video seed references missing metadata: ${videoSeed.videoId}`);
    }
    const state = resolveVideoState(metadata);
    if (state.state === "deferred") {
      deferredVideoIds.add(videoSeed.videoId);
      continue;
    }
    if (state.state === "invalid") {
      throw new Error(
        `Site video ${videoSeed.videoId} has invalid readiness metadata: ${state.reason} (${state.diagnostic})`,
      );
    }
    const transcript = transcriptsById.get(videoSeed.videoId);
    if (transcript === undefined) {
      throw new Error(`Site video seed references missing transcript manifest record: ${videoSeed.videoId}`);
    }
    if (episode.fileStem !== transcript.fileStem) {
      throw new Error(
        `Site video ${videoSeed.videoId} episode fileStem does not match the transcript manifest.`,
      );
    }

    const video = buildSiteVideo({
      episode,
      metadata,
      state,
      topics: topicRefs(videoSeed.topics, topicSeedsBySlug),
      segmentSlugs: [],
    });
    video.slug = uniqueVideoSlug(video.slug, video.videoId, usedVideoSlugs);
    videoRecordsById.set(videoSeed.videoId, video);
  }

  const segments = input.seed.segments.flatMap((segmentSeed) => {
    const video = videoRecordsById.get(segmentSeed.videoId);
    if (video === undefined) {
      if (deferredVideoIds.has(segmentSeed.videoId)) {
        return [];
      }
      throw new Error(`Segment ${segmentSeed.id} references missing site video: ${segmentSeed.videoId}`);
    }

    const segment = buildSiteSegment({
      seed: segmentSeed,
      video,
      topics: topicRefs(segmentSeed.topics, topicSeedsBySlug),
    });
    video.segmentSlugs.push(segment.slug);
    return [segment];
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
      legacySlugs: legacySlugsByCanonical.get(topic.slug) ?? [],
      videoCount: relatedVideos.size,
      segmentCount: relatedSegments.length,
    };
  });

  return {
    schemaVersion: 3,
    source: input.source,
    videos: [...videoRecordsById.values()],
    segments,
    topics,
  };
}

export function siteArchiveSegmentBucketId(videoId: string): string {
  if (videoId.length === 0) {
    throw new Error("Cannot assign an empty video ID to a site archive segment bucket.");
  }

  const digest = createHash("sha256").update(videoId, "utf8").digest();
  const bucket = digest.readUInt32BE(0) % siteArchiveSegmentBucketCount;
  return bucket.toString(16).padStart(2, "0");
}

export function canonicalSiteArchiveJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function siteArchiveSha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function splitSiteArchiveData(archive: SiteArchiveData): SiteArchiveSplitData {
  const bucketSegments = new Map<string, SiteSegment[]>(
    expectedSiteArchiveBucketIds().map((id) => [id, []]),
  );

  for (const segment of archive.segments) {
    bucketSegments.get(siteArchiveSegmentBucketId(segment.videoId))?.push(segment);
  }

  const videos = [...archive.videos];
  const topics = [...archive.topics];
  const segmentBuckets = expectedSiteArchiveBucketIds().map((id) => ({
    id,
    segments: bucketSegments.get(id) ?? [],
  }));
  const manifest: SiteArchiveManifest = {
    schemaVersion: siteArchiveSchemaVersion,
    source: archive.source,
    counts: {
      videos: videos.length,
      segments: archive.segments.length,
      topics: topics.length,
    },
    segmentSharding: {
      algorithm: siteArchiveSegmentShardingAlgorithm,
      bucketCount: siteArchiveSegmentBucketCount,
    },
    files: {
      videos: fileRecord("./videos.json", videos),
      topics: fileRecord("./topics.json", topics),
      segmentBuckets: segmentBuckets.map((bucket) => ({
        id: bucket.id,
        ...fileRecord(`./segments/${bucket.id}.json`, bucket.segments),
      })),
    },
  };
  const splitData = { manifest, videos, topics, segmentBuckets };

  validateSiteArchiveSplitData(splitData);
  const reconstructed = reconstructSiteArchiveDataUnchecked(splitData);
  if (canonicalSiteArchiveJson(reconstructed) !== canonicalSiteArchiveJson(archive)) {
    throw new Error(
      "Split site archive reconstruction does not preserve the canonical logical archive order.",
    );
  }

  return splitData;
}

export function validateSiteArchiveManifest(value: unknown): asserts value is SiteArchiveManifest {
  if (!isRecord(value)) {
    throw new Error("Site archive manifest must be an object.");
  }
  if (value.schemaVersion !== siteArchiveSchemaVersion) {
    throw new Error(`Site archive manifest schemaVersion must be ${siteArchiveSchemaVersion}.`);
  }

  const source = requireRecord(value.source, "Site archive manifest source");
  requireString(source.episodesInput, "Site archive manifest source.episodesInput");
  requireString(source.metadataInput, "Site archive manifest source.metadataInput");
  requireString(source.transcriptsInput, "Site archive manifest source.transcriptsInput");
  requireString(source.segmentsInput, "Site archive manifest source.segmentsInput");
  requireString(source.patternsInput, "Site archive manifest source.patternsInput");
  if (typeof source.patternsSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(source.patternsSha256)) {
    throw new Error(
      "Site archive manifest source.patternsSha256 must be a lowercase SHA-256 value.",
    );
  }
  if (
    typeof source.patternsSourceSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(source.patternsSourceSha256)
  ) {
    throw new Error(
      "Site archive manifest source.patternsSourceSha256 must be a lowercase SHA-256 value.",
    );
  }

  const counts = requireRecord(value.counts, "Site archive manifest counts");
  requireCount(counts.videos, "Site archive manifest counts.videos");
  requireCount(counts.segments, "Site archive manifest counts.segments");
  requireCount(counts.topics, "Site archive manifest counts.topics");

  const sharding = requireRecord(value.segmentSharding, "Site archive manifest segmentSharding");
  if (sharding.algorithm !== siteArchiveSegmentShardingAlgorithm) {
    throw new Error(
      `Site archive segment sharding algorithm must be ${siteArchiveSegmentShardingAlgorithm}.`,
    );
  }
  if (sharding.bucketCount !== siteArchiveSegmentBucketCount) {
    throw new Error(
      `Site archive segment bucket count must be ${siteArchiveSegmentBucketCount}.`,
    );
  }

  const files = requireRecord(value.files, "Site archive manifest files");
  validateFileRecord(files.videos, "./videos.json", "videos");
  validateFileRecord(files.topics, "./topics.json", "topics");
  if (!Array.isArray(files.segmentBuckets)) {
    throw new Error("Site archive manifest files.segmentBuckets must be an array.");
  }

  const expectedIds = expectedSiteArchiveBucketIds();
  if (files.segmentBuckets.length !== expectedIds.length) {
    throw new Error(`Site archive manifest must declare all ${expectedIds.length} segment buckets.`);
  }
  for (const [index, expectedId] of expectedIds.entries()) {
    const record = requireRecord(
      files.segmentBuckets[index],
      `Site archive segment bucket record ${expectedId}`,
    );
    if (record.id !== expectedId) {
      throw new Error(
        `Site archive segment bucket records must be in lexical order; expected ${expectedId} at index ${index}.`,
      );
    }
    validateFileRecord(record, `./segments/${expectedId}.json`, `segment bucket ${expectedId}`);
  }
}

export function validateSiteArchiveSplitData(splitData: SiteArchiveSplitData): void {
  validateSiteArchiveManifest(splitData.manifest);
  if (!Array.isArray(splitData.videos) || !Array.isArray(splitData.topics)) {
    throw new Error("Split site archive videos and topics must be arrays.");
  }
  if (!Array.isArray(splitData.segmentBuckets)) {
    throw new Error("Split site archive segmentBuckets must be an array.");
  }

  const { manifest } = splitData;
  assertFileRecordMatches(
    manifest.files.videos,
    splitData.videos,
    "videos",
  );
  assertFileRecordMatches(
    manifest.files.topics,
    splitData.topics,
    "topics",
  );

  const expectedIds = expectedSiteArchiveBucketIds();
  if (splitData.segmentBuckets.length !== expectedIds.length) {
    throw new Error(`Split site archive must contain all ${expectedIds.length} segment buckets.`);
  }

  const allSegments: SiteSegment[] = [];
  for (const [index, expectedId] of expectedIds.entries()) {
    const bucket = splitData.segmentBuckets[index];
    if (bucket === undefined || bucket.id !== expectedId || !Array.isArray(bucket.segments)) {
      throw new Error(`Split site archive segment bucket ${expectedId} is missing or out of order.`);
    }
    const record = manifest.files.segmentBuckets[index];
    if (record === undefined) {
      throw new Error(`Site archive manifest is missing segment bucket ${expectedId}.`);
    }
    assertFileRecordMatches(record, bucket.segments, `segment bucket ${expectedId}`);
    for (const segment of bucket.segments) {
      const actualBucketId = siteArchiveSegmentBucketId(segment.videoId);
      if (actualBucketId !== expectedId) {
        throw new Error(
          `Segment ${segment.id} is in bucket ${expectedId}, but video ${segment.videoId} belongs in ${actualBucketId}.`,
        );
      }
    }
    allSegments.push(...bucket.segments);
  }

  if (manifest.counts.videos !== splitData.videos.length) {
    throw new Error("Site archive manifest video count does not match videos.json.");
  }
  if (manifest.counts.topics !== splitData.topics.length) {
    throw new Error("Site archive manifest topic count does not match topics.json.");
  }
  if (manifest.counts.segments !== allSegments.length) {
    throw new Error("Site archive manifest segment count does not match the segment buckets.");
  }

  validateSiteArchiveRelationships(splitData.videos, allSegments, splitData.topics);
  const canonicalSegments = reconstructSegments(splitData.videos, allSegments);
  const canonicalSegmentIdsByBucket = new Map<string, string[]>(
    expectedIds.map((id) => [id, []]),
  );
  for (const segment of canonicalSegments) {
    canonicalSegmentIdsByBucket.get(siteArchiveSegmentBucketId(segment.videoId))?.push(segment.id);
  }
  for (const [index, bucket] of splitData.segmentBuckets.entries()) {
    assertSameStringSequence(
      bucket.segments.map((segment) => segment.id),
      canonicalSegmentIdsByBucket.get(bucket.id) ?? [],
      `segment bucket ${bucket.id} ordering`,
    );
    if (manifest.files.segmentBuckets[index]?.count !== bucket.segments.length) {
      throw new Error(`Site archive manifest count for segment bucket ${bucket.id} is incorrect.`);
    }
  }
}

export function reconstructSiteArchiveData(splitData: SiteArchiveSplitData): SiteArchiveData {
  validateSiteArchiveSplitData(splitData);
  return reconstructSiteArchiveDataUnchecked(splitData);
}

export async function validateSiteArchiveDirectory(
  outputDir: string,
  options: { allowExtraJsonFiles?: boolean } = {},
): Promise<SiteArchiveSplitData> {
  const manifestPath = join(outputDir, "index.json");
  const manifestText = await readRequiredText(manifestPath);
  const manifestValue = parseJson(manifestText, manifestPath);
  validateSiteArchiveManifest(manifestValue);
  if (manifestText !== canonicalSiteArchiveJson(manifestValue)) {
    throw new Error(`Site archive manifest is not canonically serialized: ${manifestPath}`);
  }
  const manifest = manifestValue;

  const [videos, topics] = await Promise.all([
    readAndValidateArchiveArray<SiteVideo>(outputDir, manifest.files.videos, "videos"),
    readAndValidateArchiveArray<SiteTopic>(outputDir, manifest.files.topics, "topics"),
  ]);
  const segmentBuckets: SiteArchiveSegmentBucket[] = [];
  for (const record of manifest.files.segmentBuckets) {
    segmentBuckets.push({
      id: record.id,
      segments: await readAndValidateArchiveArray<SiteSegment>(
        outputDir,
        record,
        `segment bucket ${record.id}`,
      ),
    });
  }

  const splitData = { manifest, videos, topics, segmentBuckets };
  validateSiteArchiveSplitData(splitData);
  if (options.allowExtraJsonFiles !== true) {
    await assertNoExtraArchiveJsonFiles(outputDir);
  }
  return splitData;
}

export async function writeSiteArchiveSplitData(
  outputDir: string,
  splitData: SiteArchiveSplitData,
): Promise<void> {
  validateSiteArchiveSplitData(splitData);

  const dataFiles: Array<{ path: string; text: string; record: SiteArchiveFileRecord }> = [
    {
      path: join(outputDir, "videos.json"),
      text: canonicalSiteArchiveJson(splitData.videos),
      record: splitData.manifest.files.videos,
    },
    {
      path: join(outputDir, "topics.json"),
      text: canonicalSiteArchiveJson(splitData.topics),
      record: splitData.manifest.files.topics,
    },
    ...splitData.segmentBuckets.map((bucket, index) => {
      const record = splitData.manifest.files.segmentBuckets[index];
      if (record === undefined) {
        throw new Error(`Site archive manifest is missing segment bucket ${bucket.id}.`);
      }
      return {
        path: join(outputDir, "segments", `${bucket.id}.json`),
        text: canonicalSiteArchiveJson(bucket.segments),
        record,
      };
    }),
  ];

  for (const file of dataFiles) {
    await writeTextAtomically(file.path, file.text);
  }
  for (const file of dataFiles) {
    const writtenBytes = await readFile(file.path);
    const writtenHash = siteArchiveSha256(writtenBytes);
    if (writtenHash !== file.record.sha256) {
      throw new Error(`Written site archive file failed SHA-256 verification: ${file.path}`);
    }
  }

  await writeTextAtomically(
    join(outputDir, "index.json"),
    canonicalSiteArchiveJson(splitData.manifest),
  );
  await validateSiteArchiveDirectory(outputDir, { allowExtraJsonFiles: true });
  await removeExtraArchiveJsonFiles(outputDir);
  await validateSiteArchiveDirectory(outputDir);
}

function fileRecord(path: string, value: unknown[]): SiteArchiveFileRecord {
  return {
    path,
    count: value.length,
    sha256: siteArchiveSha256(canonicalSiteArchiveJson(value)),
  };
}

function reconstructSiteArchiveDataUnchecked(splitData: SiteArchiveSplitData): SiteArchiveData {
  const allSegments = splitData.segmentBuckets.flatMap((bucket) => bucket.segments);
  return {
    schemaVersion: 3,
    source: splitData.manifest.source,
    videos: splitData.videos,
    segments: reconstructSegments(splitData.videos, allSegments),
    topics: splitData.topics,
  };
}

function reconstructSegments(videos: SiteVideo[], segments: SiteSegment[]): SiteSegment[] {
  const segmentsBySlug = new Map(segments.map((segment) => [segment.slug, segment]));
  const reconstructed: SiteSegment[] = [];
  const usedSlugs = new Set<string>();

  for (const video of videos) {
    for (const slug of video.segmentSlugs) {
      if (usedSlugs.has(slug)) {
        throw new Error(`Segment slug is referenced more than once by site videos: ${slug}`);
      }
      const segment = segmentsBySlug.get(slug);
      if (segment === undefined) {
        throw new Error(`Site video ${video.videoId} references missing segment slug: ${slug}`);
      }
      if (segment.videoId !== video.videoId) {
        throw new Error(
          `Site video ${video.videoId} references segment ${slug} from video ${segment.videoId}.`,
        );
      }
      reconstructed.push(segment);
      usedSlugs.add(slug);
    }
  }

  if (usedSlugs.size !== segments.length) {
    const unreferenced = segments.find((segment) => !usedSlugs.has(segment.slug));
    throw new Error(`Site segment is not referenced by its video: ${unreferenced?.slug ?? "unknown"}`);
  }
  return reconstructed;
}

function validateSiteArchiveRelationships(
  videos: SiteVideo[],
  segments: SiteSegment[],
  topics: SiteTopic[],
): void {
  assertUnique(videos.map((video) => video.videoId), "video ID");
  assertUnique(videos.map((video) => video.slug), "video route slug");
  assertUnique(segments.map((segment) => segment.id), "segment ID");
  assertUnique(segments.map((segment) => segment.slug), "segment slug");
  assertUnique(topics.map((topic) => topic.slug), "topic slug");
  assertLegacyTopicRoutes(topics);

  const videosById = new Map(videos.map((video) => [video.videoId, video]));
  const topicSlugs = new Set(topics.map((topic) => topic.slug));
  for (const video of videos) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(video.videoDateAt)) {
      throw new Error(`Video ${video.videoId} has a noncanonical videoDateAt.`);
    }
    if (video.videoDateLabel !== formatDate(video.videoDateAt)) {
      throw new Error(`Video ${video.videoId} has a date label not derived from videoDateAt.`);
    }
    if (
      video.videoDateKind !== "actual_start" &&
      video.videoDateKind !== "scheduled_start" &&
      video.videoDateKind !== "published"
    ) {
      throw new Error(`Video ${video.videoId} has an invalid videoDateKind.`);
    }
    if (video.videoKind !== "upload" && video.videoKind !== "stream") {
      throw new Error(`Video ${video.videoId} has an invalid videoKind.`);
    }
    if (video.durationLabel === "0:00" || video.durationLabel === "P0D") {
      throw new Error(`Video ${video.videoId} has a non-positive public runtime.`);
    }
    assertTopicRefsExist(video.topics, topicSlugs, `Video ${video.videoId}`);
  }
  for (const segment of segments) {
    const video = videosById.get(segment.videoId);
    if (video === undefined) {
      throw new Error(`Segment ${segment.id} references missing site video: ${segment.videoId}`);
    }
    if (segment.videoSlug !== video.slug) {
      throw new Error(`Segment ${segment.id} has an incorrect video route slug.`);
    }
    assertTopicRefsExist(segment.topics, topicSlugs, `Segment ${segment.id}`);
  }

  reconstructSegments(videos, segments);
  const segmentCountByTopic = new Map<string, number>();
  const videoIdsByTopic = new Map<string, Set<string>>();
  for (const video of videos) {
    for (const reference of video.topics) {
      const videoIds = videoIdsByTopic.get(reference.slug) ?? new Set<string>();
      videoIds.add(video.videoId);
      videoIdsByTopic.set(reference.slug, videoIds);
    }
  }
  for (const segment of segments) {
    for (const reference of segment.topics) {
      segmentCountByTopic.set(reference.slug, (segmentCountByTopic.get(reference.slug) ?? 0) + 1);
      const videoIds = videoIdsByTopic.get(reference.slug) ?? new Set<string>();
      videoIds.add(segment.videoId);
      videoIdsByTopic.set(reference.slug, videoIds);
    }
  }
  for (const topic of topics) {
    const segmentCount = segmentCountByTopic.get(topic.slug) ?? 0;
    const videoCount = videoIdsByTopic.get(topic.slug)?.size ?? 0;
    if (topic.segmentCount !== segmentCount || topic.videoCount !== videoCount) {
      throw new Error(`Site topic ${topic.slug} has incorrect relationship counts.`);
    }
  }
}

function assertTopicRefsExist(
  references: TopicRef[],
  topicSlugs: ReadonlySet<string>,
  owner: string,
): void {
  for (const reference of references) {
    if (!topicSlugs.has(reference.slug)) {
      throw new Error(`${owner} references missing topic: ${reference.slug}`);
    }
  }
}

function assertLegacyTopicRoutes(topics: SiteTopic[]): void {
  const routeSlugs = new Set(topics.map((topic) => topic.slug));
  for (const topic of topics) {
    if (!Array.isArray(topic.legacySlugs)) {
      throw new Error(`Site topic ${topic.slug} must include a legacySlugs array.`);
    }
    for (const legacySlug of topic.legacySlugs) {
      if (!isTopicSlug(legacySlug)) {
        throw new Error(`Site topic ${topic.slug} has an invalid legacy slug: ${String(legacySlug)}`);
      }
      if (routeSlugs.has(legacySlug)) {
        throw new Error(`Duplicate or colliding site topic route slug: ${legacySlug}`);
      }
      routeSlugs.add(legacySlug);
    }
  }
}

function assertFileRecordMatches(
  record: SiteArchiveFileRecord,
  values: unknown[],
  label: string,
): void {
  if (record.count !== values.length) {
    throw new Error(`Site archive ${label} count does not match its manifest record.`);
  }
  const actualHash = siteArchiveSha256(canonicalSiteArchiveJson(values));
  if (record.sha256 !== actualHash) {
    throw new Error(`Site archive ${label} SHA-256 does not match its manifest record.`);
  }
}

function validateFileRecord(value: unknown, expectedPath: string, label: string): void {
  const record = requireRecord(value, `Site archive ${label} file record`);
  if (record.path !== expectedPath) {
    throw new Error(`Site archive ${label} path must be ${expectedPath}.`);
  }
  requireCount(record.count, `Site archive ${label} count`);
  if (typeof record.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(record.sha256)) {
    throw new Error(`Site archive ${label} must include a lowercase SHA-256 hash.`);
  }
}

async function readAndValidateArchiveArray<T>(
  outputDir: string,
  record: SiteArchiveFileRecord,
  label: string,
): Promise<T[]> {
  const filePath = join(outputDir, ...record.path.replace(/^\.\//u, "").split("/"));
  const text = await readRequiredText(filePath);
  if (siteArchiveSha256(text) !== record.sha256) {
    throw new Error(`Site archive ${label} SHA-256 mismatch: ${filePath}`);
  }
  const value = parseJson(text, filePath);
  if (!Array.isArray(value)) {
    throw new Error(`Site archive ${label} must contain a JSON array: ${filePath}`);
  }
  if (value.length !== record.count) {
    throw new Error(`Site archive ${label} count mismatch: ${filePath}`);
  }
  if (text !== canonicalSiteArchiveJson(value)) {
    throw new Error(`Site archive ${label} is not canonically serialized: ${filePath}`);
  }
  return value as T[];
}

async function assertNoExtraArchiveJsonFiles(outputDir: string): Promise<void> {
  const extraFiles = await findExtraArchiveJsonFiles(outputDir);
  if (extraFiles.length > 0) {
    throw new Error(`Unexpected site archive JSON file: ${extraFiles[0]}`);
  }
}

async function removeExtraArchiveJsonFiles(outputDir: string): Promise<void> {
  for (const filePath of await findExtraArchiveJsonFiles(outputDir)) {
    await rm(filePath);
  }
}

async function findExtraArchiveJsonFiles(outputDir: string): Promise<string[]> {
  const expectedRootFiles = new Set(["index.json", "topics.json", "videos.json"]);
  const expectedSegmentFiles = new Set(
    expectedSiteArchiveBucketIds().map((id) => `${id}.json`),
  );
  const extras: string[] = [];
  const rootEntries = await readdir(outputDir, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (entry.isFile() && entry.name.endsWith(".json") && !expectedRootFiles.has(entry.name)) {
      extras.push(join(outputDir, entry.name));
    }
  }
  const segmentDir = join(outputDir, "segments");
  const segmentEntries = await readdir(segmentDir, { withFileTypes: true });
  for (const entry of segmentEntries) {
    if (entry.isFile() && entry.name.endsWith(".json") && !expectedSegmentFiles.has(entry.name)) {
      extras.push(join(segmentDir, entry.name));
    }
  }
  return extras.sort((left, right) => left.localeCompare(right));
}

function expectedSiteArchiveBucketIds(): string[] {
  return Array.from({ length: siteArchiveSegmentBucketCount }, (_, index) => (
    index.toString(16).padStart(2, "0")
  ));
}

function assertSameStringSequence(actual: string[], expected: string[], label: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`Site archive ${label} is not deterministic.`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireString(value: unknown, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function requireCount(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Could not parse generated site archive JSON: ${path}`, { cause: error });
  }
}

async function readRequiredText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Could not read generated site archive file: ${path}`, { cause: error });
  }
}

function buildSiteVideo(input: {
  episode: ChannelEpisode;
  metadata: VideoMetadataRecord;
  state: Extract<VideoStateResult, { state: "ready" }>;
  topics: TopicRef[];
  segmentSlugs: string[];
}): SiteVideo {
  const title = input.metadata?.snippet?.title ?? input.episode.title;
  const slug = input.episode.slug ?? slugifyVideoTitle(title) ?? input.episode.videoId;
  const youtubeUrl = input.episode.url ?? `https://www.youtube.com/watch?v=${input.episode.videoId}`;
  const stats = buildStats(input.metadata);
  if (input.episode.fileStem === undefined || input.episode.fileStem.length === 0) {
    throw new Error(`Site video ${input.episode.videoId} is missing its manifest-owned fileStem.`);
  }

  return {
    title,
    slug,
    videoId: input.episode.videoId,
    youtubeUrl,
    embedUrl: `https://www.youtube-nocookie.com/embed/${input.episode.videoId}`,
    thumbnailUrl: thumbnailUrl(input.episode.videoId, input.metadata),
    videoDateAt: input.state.videoDateAt,
    videoDateLabel: formatDate(input.state.videoDateAt),
    videoDateKind: input.state.videoDateKind,
    videoKind: input.state.videoKind,
    durationLabel: formatTimestamp(Math.floor(input.state.durationSeconds)),
    viewCountLabel: input.episode.viewCountText ?? stats.views ?? "Unknown views",
    transcriptStatus: input.episode.transcript?.status ?? "unknown",
    fileStem: input.episode.fileStem,
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

function buildLegacySlugsByCanonical(
  redirects: readonly SiteTopicLegacyRedirect[],
  topicSeedsBySlug: ReadonlyMap<string, CuratedTopicSeed>,
): Map<string, string[]> {
  const routeSlugs = new Set(topicSeedsBySlug.keys());
  const result = new Map<string, string[]>();

  for (const redirect of redirects) {
    if (!isTopicSlug(redirect.legacySlug)) {
      throw new Error(`Invalid legacy topic slug: ${String(redirect.legacySlug)}`);
    }
    if (!isTopicSlug(redirect.canonicalSlug) || !topicSeedsBySlug.has(redirect.canonicalSlug)) {
      throw new Error(
        `Legacy topic slug ${redirect.legacySlug} references missing canonical topic: ${String(redirect.canonicalSlug)}`,
      );
    }
    if (routeSlugs.has(redirect.legacySlug)) {
      throw new Error(`Duplicate or colliding site topic route slug: ${redirect.legacySlug}`);
    }
    routeSlugs.add(redirect.legacySlug);
    const legacySlugs = result.get(redirect.canonicalSlug) ?? [];
    legacySlugs.push(redirect.legacySlug);
    result.set(redirect.canonicalSlug, legacySlugs);
  }

  for (const legacySlugs of result.values()) {
    legacySlugs.sort();
  }
  return result;
}

function isTopicSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
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

function uniqueVideoSlug(candidate: string, videoId: string, usedSlugs: Set<string>): string {
  if (!usedSlugs.has(candidate)) {
    usedSlugs.add(candidate);
    return candidate;
  }

  const idSuffix = slugifyVideoTitle(videoId) ?? videoId.toLowerCase();
  const baseCandidate = `${candidate}-${idSuffix}`;
  let routeSlug = baseCandidate;
  let index = 2;

  while (usedSlugs.has(routeSlug)) {
    routeSlug = `${baseCandidate}-${index}`;
    index += 1;
  }

  usedSlugs.add(routeSlug);
  return routeSlug;
}

function thumbnailUrl(videoId: string, metadata: VideoMetadataRecord | undefined): string {
  return metadata?.snippet?.thumbnails?.maxres?.url ??
    metadata?.snippet?.thumbnails?.standard?.url ??
    metadata?.snippet?.thumbnails?.high?.url ??
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function buildStats(metadata: VideoMetadataRecord | undefined): SiteVideo["stats"] {
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

function formatCount(value: string | null | undefined, label: string): string | undefined {
  if (value === undefined || value === null || value.trim() === "") {
    return undefined;
  }

  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue)) {
    return `${value} ${label}`;
  }

  return `${new Intl.NumberFormat("en-US").format(parsedValue)} ${label}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid canonical video date: ${value}`);
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
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
