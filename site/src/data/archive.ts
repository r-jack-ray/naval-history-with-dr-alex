import { createHash } from "node:crypto";

import archiveManifestJson from "./generated/archive/index.json";
import archiveTopicsJson from "./generated/archive/topics.json";
import archiveVideosJson from "./generated/archive/videos.json";

export interface ArchiveData {
  schemaVersion: 1;
  videos: ArchiveVideo[];
  segments: ArchiveSegment[];
  topics: ArchiveTopic[];
}

export interface ArchiveFileRecord {
  path: string;
  count: number;
  sha256: string;
}

export interface ArchiveSegmentBucketRecord extends ArchiveFileRecord {
  id: string;
}

export interface ArchiveManifest {
  schemaVersion: 2;
  source: {
    episodesInput: string;
    metadataInput: string;
    segmentsInput: string;
  };
  counts: {
    videos: number;
    segments: number;
    topics: number;
  };
  segmentSharding: {
    algorithm: "sha256-video-id-mod";
    bucketCount: 64;
  };
  files: {
    videos: ArchiveFileRecord;
    topics: ArchiveFileRecord;
    segmentBuckets: ArchiveSegmentBucketRecord[];
  };
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

const manifest = archiveManifestJson as unknown as ArchiveManifest;
const loadedVideos = archiveVideosJson as unknown;
const loadedTopics = archiveTopicsJson as unknown;
const loadedSegmentShards = import.meta.glob<ArchiveSegment[]>(
  "./generated/archive/segments/*.json",
  { eager: true, import: "default" },
);

function archiveError(message: string): never {
  throw new Error(`Generated archive validation failed: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    archiveError(`${label} must be a non-negative integer.`);
  }
}

function assertStringField(record: unknown, field: string, label: string): string {
  if (!isRecord(record) || typeof record[field] !== "string" || record[field].length === 0) {
    archiveError(`${label} must have a non-empty ${field}.`);
  }
  return record[field];
}

function canonicalSha256(value: unknown): string {
  return createHash("sha256")
    .update(`${JSON.stringify(value, null, 2)}\n`, "utf8")
    .digest("hex");
}

function validateFileRecord(
  record: ArchiveFileRecord,
  expectedPath: string,
  values: unknown[],
  label: string,
): void {
  if (!isRecord(record)) {
    archiveError(`${label} is missing from the manifest.`);
  }
  if (record.path !== expectedPath) {
    archiveError(`${label} path must be ${expectedPath}; received ${String(record.path)}.`);
  }
  assertNonNegativeInteger(record.count, `${label} count`);
  if (record.count !== values.length) {
    archiveError(`${label} declares ${record.count} records but ${values.length} were loaded.`);
  }
  if (typeof record.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(record.sha256)) {
    archiveError(`${label} has an invalid SHA-256 value.`);
  }
  const actualHash = canonicalSha256(values);
  if (record.sha256 !== actualHash) {
    archiveError(`${label} SHA-256 mismatch: expected ${record.sha256}, received ${actualHash}.`);
  }
}

function expectedBucketId(index: number): string {
  return index.toString(16).padStart(2, "0");
}

function bucketIdForVideo(videoId: string): string {
  const hash = createHash("sha256").update(videoId, "utf8").digest();
  return expectedBucketId(hash.readUInt32BE(0) % 64);
}

function validateManifestShape(): void {
  if (!isRecord(manifest) || manifest.schemaVersion !== 2) {
    archiveError(`manifest schemaVersion must be 2; received ${String(manifest?.schemaVersion)}.`);
  }
  if (!isRecord(manifest.source)) {
    archiveError("manifest source is missing.");
  }
  for (const field of ["episodesInput", "metadataInput", "segmentsInput"] as const) {
    if (typeof manifest.source[field] !== "string" || manifest.source[field].length === 0) {
      archiveError(`manifest source.${field} must be a non-empty string.`);
    }
  }
  if (!isRecord(manifest.counts)) {
    archiveError("manifest counts are missing.");
  }
  for (const field of ["videos", "segments", "topics"] as const) {
    assertNonNegativeInteger(manifest.counts[field], `manifest counts.${field}`);
  }
  if (
    !isRecord(manifest.segmentSharding)
    || manifest.segmentSharding.algorithm !== "sha256-video-id-mod"
    || manifest.segmentSharding.bucketCount !== 64
  ) {
    archiveError("manifest must declare 64 sha256-video-id-mod segment buckets.");
  }
  if (!isRecord(manifest.files) || !Array.isArray(manifest.files.segmentBuckets)) {
    archiveError("manifest files are missing.");
  }
  if (manifest.files.segmentBuckets.length !== 64) {
    archiveError(`manifest must declare 64 segment buckets; received ${manifest.files.segmentBuckets.length}.`);
  }
}

validateManifestShape();

if (!Array.isArray(loadedVideos)) {
  archiveError("videos.json must contain an array.");
}
if (!Array.isArray(loadedTopics)) {
  archiveError("topics.json must contain an array.");
}

validateFileRecord(manifest.files.videos, "./videos.json", loadedVideos, "videos.json");
validateFileRecord(manifest.files.topics, "./topics.json", loadedTopics, "topics.json");

if (manifest.counts.videos !== loadedVideos.length) {
  archiveError(`manifest video total is ${manifest.counts.videos}; loaded ${loadedVideos.length}.`);
}
if (manifest.counts.topics !== loadedTopics.length) {
  archiveError(`manifest topic total is ${manifest.counts.topics}; loaded ${loadedTopics.length}.`);
}

const loadedShardPaths = Object.keys(loadedSegmentShards).sort();
const expectedShardPaths: string[] = [];
const shardedSegments: ArchiveSegment[] = [];

for (let index = 0; index < 64; index += 1) {
  const id = expectedBucketId(index);
  const record = manifest.files.segmentBuckets[index];
  const manifestPath = `./segments/${id}.json`;
  const importPath = `./generated/archive/segments/${id}.json`;

  if (!isRecord(record) || record.id !== id) {
    archiveError(`segment bucket ${index} must have the lexical ID ${id}.`);
  }
  expectedShardPaths.push(importPath);

  const shard = loadedSegmentShards[importPath] as unknown;
  if (!Array.isArray(shard)) {
    archiveError(`${importPath} was not loaded as an array.`);
  }
  validateFileRecord(record, manifestPath, shard, `segment bucket ${id}`);

  for (const segment of shard) {
    const videoId = assertStringField(segment, "videoId", `segment in bucket ${id}`);
    const actualBucketId = bucketIdForVideo(videoId);
    if (actualBucketId !== id) {
      const segmentSlug = isRecord(segment) && typeof segment.slug === "string" ? segment.slug : "unknown";
      archiveError(`segment ${segmentSlug} belongs in bucket ${actualBucketId}, not ${id}.`);
    }
  }
  shardedSegments.push(...(shard as ArchiveSegment[]));
}

if (
  loadedShardPaths.length !== expectedShardPaths.length
  || loadedShardPaths.some((path, index) => path !== expectedShardPaths[index])
) {
  archiveError(
    `loaded segment shard paths do not match the manifest (expected ${expectedShardPaths.join(", ")}; received ${loadedShardPaths.join(", ")}).`,
  );
}

const bucketCountTotal = manifest.files.segmentBuckets.reduce((sum, record) => sum + record.count, 0);
if (bucketCountTotal !== manifest.counts.segments || shardedSegments.length !== manifest.counts.segments) {
  archiveError(
    `manifest declares ${manifest.counts.segments} segments; bucket records total ${bucketCountTotal} and loaded shards contain ${shardedSegments.length}.`,
  );
}

export const archiveManifest = manifest;
export const archiveVideos = loadedVideos as ArchiveVideo[];
export const archiveTopics = loadedTopics as ArchiveTopic[];

function uniqueMap<T>(
  values: T[],
  getKey: (value: T) => string,
  label: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const key = getKey(value);
    if (result.has(key)) {
      archiveError(`duplicate ${label}: ${key}.`);
    }
    result.set(key, value);
  }
  return result;
}

for (const video of archiveVideos) {
  assertStringField(video, "videoId", "video record");
  assertStringField(video, "slug", `video ${video.videoId}`);
  if (!Array.isArray(video.segmentSlugs) || !Array.isArray(video.topics)) {
    archiveError(`video ${video.videoId} must contain segmentSlugs and topics arrays.`);
  }
}
for (const segment of shardedSegments) {
  assertStringField(segment, "id", "segment record");
  assertStringField(segment, "slug", `segment ${segment.id}`);
  assertStringField(segment, "videoId", `segment ${segment.id}`);
  if (!Array.isArray(segment.topics)) {
    archiveError(`segment ${segment.id} must contain a topics array.`);
  }
}
for (const topic of archiveTopics) {
  assertStringField(topic, "slug", "topic record");
}

const videosById = uniqueMap(archiveVideos, (video) => video.videoId, "video ID");
const videosBySlug = uniqueMap(archiveVideos, (video) => video.slug, "video slug");
uniqueMap(shardedSegments, (segment) => segment.id, "segment ID");
const shardedSegmentsBySlug = uniqueMap(shardedSegments, (segment) => segment.slug, "segment slug");
const topicsBySlug = uniqueMap(archiveTopics, (topic) => topic.slug, "topic slug");

const orderedSegments: ArchiveSegment[] = [];
const referencedSegmentSlugs = new Set<string>();
for (const video of archiveVideos) {
  for (const slug of video.segmentSlugs) {
    if (referencedSegmentSlugs.has(slug)) {
      archiveError(`segment slug ${slug} is referenced by more than one video position.`);
    }
    const segment = shardedSegmentsBySlug.get(slug);
    if (segment === undefined) {
      archiveError(`video ${video.videoId} references missing segment slug ${slug}.`);
    }
    if (segment.videoId !== video.videoId) {
      archiveError(`video ${video.videoId} references segment ${slug} owned by ${segment.videoId}.`);
    }
    referencedSegmentSlugs.add(slug);
    orderedSegments.push(segment);
  }
}
if (referencedSegmentSlugs.size !== shardedSegments.length) {
  const unreferenced = shardedSegments.find((segment) => !referencedSegmentSlugs.has(segment.slug));
  archiveError(`segment ${unreferenced?.slug ?? "unknown"} is not referenced by its video.`);
}

export const archiveSegments = orderedSegments;
const segmentsBySlug = new Map(archiveSegments.map((segment) => [segment.slug, segment]));
const segmentsByVideoId = new Map<string, ArchiveSegment[]>();
const segmentsByTopicSlug = new Map<string, ArchiveSegment[]>();
const relatedTopicSlugsByVideoId = new Map<string, Set<string>>();

for (const video of archiveVideos) {
  relatedTopicSlugsByVideoId.set(video.videoId, new Set());
  for (const topic of video.topics) {
    if (!topicsBySlug.has(topic.slug)) {
      archiveError(`video ${video.videoId} references missing topic ${topic.slug}.`);
    }
    relatedTopicSlugsByVideoId.get(video.videoId)?.add(topic.slug);
  }
}

for (const segment of archiveSegments) {
  if (!videosById.has(segment.videoId)) {
    archiveError(`segment ${segment.slug} references missing video ${segment.videoId}.`);
  }
  const videoSegments = segmentsByVideoId.get(segment.videoId) ?? [];
  videoSegments.push(segment);
  segmentsByVideoId.set(segment.videoId, videoSegments);

  for (const topic of segment.topics) {
    if (!topicsBySlug.has(topic.slug)) {
      archiveError(`segment ${segment.slug} references missing topic ${topic.slug}.`);
    }
    const topicSegments = segmentsByTopicSlug.get(topic.slug) ?? [];
    topicSegments.push(segment);
    segmentsByTopicSlug.set(topic.slug, topicSegments);
    relatedTopicSlugsByVideoId.get(segment.videoId)?.add(topic.slug);
  }
}

const videosByTopicSlug = new Map<string, ArchiveVideo[]>();
for (const video of archiveVideos) {
  for (const topicSlug of relatedTopicSlugsByVideoId.get(video.videoId) ?? []) {
    const topicVideos = videosByTopicSlug.get(topicSlug) ?? [];
    topicVideos.push(video);
    videosByTopicSlug.set(topicSlug, topicVideos);
  }
}

for (const topic of archiveTopics) {
  const actualSegmentCount = segmentsByTopicSlug.get(topic.slug)?.length ?? 0;
  const actualVideoCount = videosByTopicSlug.get(topic.slug)?.length ?? 0;
  if (topic.segmentCount !== actualSegmentCount || topic.videoCount !== actualVideoCount) {
    archiveError(
      `topic ${topic.slug} declares ${topic.videoCount} videos and ${topic.segmentCount} segments; reconstructed ${actualVideoCount} videos and ${actualSegmentCount} segments.`,
    );
  }
}

export const archive: ArchiveData = {
  schemaVersion: 1,
  videos: archiveVideos,
  segments: archiveSegments,
  topics: archiveTopics,
};

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
  return videosById.get(videoId);
}

export function findVideoBySlug(slug: string): ArchiveVideo | undefined {
  return videosBySlug.get(slug);
}

export function findSegmentBySlug(slug: string): ArchiveSegment | undefined {
  return segmentsBySlug.get(slug);
}

export function segmentsForVideo(video: ArchiveVideo): ArchiveSegment[] {
  return [...(segmentsByVideoId.get(video.videoId) ?? [])];
}

export function segmentsForTopic(topic: ArchiveTopic): ArchiveSegment[] {
  return [...(segmentsByTopicSlug.get(topic.slug) ?? [])];
}

export function videosForTopic(topic: ArchiveTopic): ArchiveVideo[] {
  return [...(videosByTopicSlug.get(topic.slug) ?? [])];
}
