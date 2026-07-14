#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";

import { archiveTimestampPrefix } from "../naming.js";
import {
  readVideoMetadataStore,
  resolveVideoState,
  type VideoMetadataRecord,
} from "../youtube/video-metadata.js";

const manifestPath = "src/transcripts/manifest.json";
const episodesPath = "src/channel/episodes.json";
const fetchStatusPath = "src/transcripts/fetch-status.json";
const generatedVideosPath = "site/src/data/generated/archive/videos.json";

async function main(): Promise<void> {
  const metadataStore = await readVideoMetadataStore();
  if (metadataStore === undefined) throw new Error("Video metadata store is missing.");
  const metadataById = new Map(metadataStore.videos.map((record) => [record.videoId, record]));
  const manifest = await readJsonObject(manifestPath);
  const episodeStore = await readJsonObject(episodesPath);
  const fetchStatus = await readJsonObject(fetchStatusPath);
  assertSchema(manifest, 3, manifestPath);
  assertSchema(episodeStore, 2, episodesPath);
  assertSchema(fetchStatus, 2, fetchStatusPath);

  const transcriptRecords = requireArray(manifest.transcripts, `${manifestPath} transcripts`).map((value) => requireRecord(value, "transcript record"));
  const transcriptById = new Map<string, Record<string, unknown>>();
  let segmentCount = 0;
  for (const transcript of transcriptRecords) {
    const videoId = requireString(transcript.videoId, "transcript videoId");
    if (transcriptById.has(videoId)) throw new Error(`Duplicate transcript manifest videoId: ${videoId}`);
    transcriptById.set(videoId, transcript);
    assertNoLegacyFields(transcript, ["videoPublishedAt"], `transcript ${videoId}`);
    const state = readyState(metadataById.get(videoId), `transcript ${videoId}`);
    assertEqual(transcript.videoDateAt, state.videoDateAt, `transcript ${videoId} videoDateAt`);
    assertEqual(transcript.videoDateKind, state.videoDateKind, `transcript ${videoId} videoDateKind`);
    const stem = requireString(transcript.fileStem, `transcript ${videoId} fileStem`);
    const expectedPrefix = `${archiveTimestampPrefix(state.videoDateAt)}_`;
    if (!stem.startsWith(expectedPrefix)) {
      throw new Error(`Transcript ${videoId} fileStem does not start with ${expectedPrefix}`);
    }
    const paths = requireRecord(transcript.paths, `transcript ${videoId} paths`);
    const txtPath = requireString(paths.txt, `transcript ${videoId} paths.txt`);
    assertEqual(txtPath, `txt/${stem}.txt`, `transcript ${videoId} TXT path`);
    const publicSourcePath = `src/transcripts/${txtPath}`;
    const shardPath = `src/derived/video-segments/${stem}.json`;
    await Promise.all([access(publicSourcePath), access(shardPath)]);
    const shard = await readJsonObject(shardPath);
    assertEqual(shard.videoId, videoId, `shard ${stem} videoId`);
    for (const value of requireArray(shard.segments, `${shardPath} segments`)) {
      const segment = requireRecord(value, `${shardPath} segment`);
      assertEqual(segment.sourcePath, publicSourcePath, `shard ${stem} segment sourcePath`);
      segmentCount += 1;
    }
  }

  const episodes = requireArray(episodeStore.episodes, `${episodesPath} episodes`).map((value) => requireRecord(value, "episode record"));
  const episodeIds = new Set<string>();
  for (const episode of episodes) {
    const videoId = requireString(episode.videoId, "episode videoId");
    if (episodeIds.has(videoId)) throw new Error(`Duplicate episode videoId: ${videoId}`);
    episodeIds.add(videoId);
    assertNoLegacyFields(episode, ["publishDate", "uploadDate", "streamStartAt", "streamEndAt"], `episode ${videoId}`);
    const metadata = metadataById.get(videoId);
    const state = resolveVideoState(metadata);
    assertEqual(episode.videoKind, state.videoKind, `episode ${videoId} videoKind`);
    assertRawDates(episode, metadata, videoId);
    if (state.state === "ready") {
      assertEqual(episode.videoDateAt, state.videoDateAt, `episode ${videoId} videoDateAt`);
      assertEqual(episode.videoDateKind, state.videoDateKind, `episode ${videoId} videoDateKind`);
    } else if (episode.videoDateAt !== undefined || episode.videoDateKind !== undefined) {
      throw new Error(`Not-ready episode ${videoId} exposes a canonical video date.`);
    }
    const transcript = transcriptById.get(videoId);
    const transcriptState = requireRecord(episode.transcript, `episode ${videoId} transcript state`);
    if (transcript === undefined) {
      assertEqual(transcriptState.status, "not_checked", `episode ${videoId} transcript status`);
    } else {
      const stem = requireString(transcript.fileStem, `transcript ${videoId} fileStem`);
      const paths = requireRecord(transcript.paths, `transcript ${videoId} paths`);
      assertEqual(episode.fileStem, stem, `episode ${videoId} fileStem`);
      assertEqual(transcriptState.status, "stored", `episode ${videoId} transcript status`);
      assertEqual(transcriptState.txtPath, `src/transcripts/${requireString(paths.txt, `transcript ${videoId} paths.txt`)}`, `episode ${videoId} TXT state`);
    }
  }

  for (const videoId of transcriptById.keys()) {
    if (!episodeIds.has(videoId)) throw new Error(`Transcript manifest video is missing from episodes: ${videoId}`);
  }

  const failures = requireArray(fetchStatus.failures, `${fetchStatusPath} failures`).map((value) => requireRecord(value, "failure record"));
  for (const failure of failures) {
    assertNoLegacyFields(failure, ["publishedAt"], "transcript failure");
    const videoId = typeof failure.videoId === "string" ? failure.videoId : undefined;
    if (videoId !== undefined && resolveVideoState(metadataById.get(videoId)).state === "deferred") {
      throw new Error(`Deferred video remains in previous-failure state: ${videoId}`);
    }
  }

  const notReadyIds = metadataStore.videos
    .filter((record) => resolveVideoState(record).state !== "ready")
    .map((record) => record.videoId);
  const curatedNotReady = notReadyIds.filter((videoId) => transcriptById.has(videoId));
  if (curatedNotReady.length > 0) {
    throw new Error(`Not-ready videos remain in the transcript manifest: ${curatedNotReady.join(", ")}`);
  }
  const generatedVideos = await readOptionalJsonArray(generatedVideosPath);
  if (generatedVideos !== undefined) {
    const generatedIds = new Set(generatedVideos.map((value) => requireString(requireRecord(value, "generated video").videoId, "generated videoId")));
    const exposed = notReadyIds.filter((videoId) => generatedIds.has(videoId));
    if (exposed.length > 0) throw new Error(`Not-ready videos appear in generated site data: ${exposed.join(", ")}`);
  }

  console.log(
    `Timestamp alignment audit passed: ${transcriptRecords.length} transcripts, ${episodes.length} episodes, ` +
    `${segmentCount} segments, ${failures.length} failures, ${notReadyIds.length} not-ready metadata records.`,
  );
}

function readyState(metadata: VideoMetadataRecord | undefined, label: string) {
  const state = resolveVideoState(metadata);
  if (state.state !== "ready") throw new Error(`${label} is not ready: ${state.reason} (${state.diagnostic})`);
  return state;
}

function assertRawDates(episode: Record<string, unknown>, metadata: VideoMetadataRecord | undefined, videoId: string): void {
  const expected = {
    publishedAt: metadata?.snippet?.publishedAt,
    scheduledStartAt: metadata?.liveStreamingDetails?.scheduledStartTime,
    actualStartAt: metadata?.liveStreamingDetails?.actualStartTime,
    actualEndAt: metadata?.liveStreamingDetails?.actualEndTime,
  };
  for (const [field, value] of Object.entries(expected)) {
    assertEqual(episode[field], value, `episode ${videoId} raw ${field}`);
  }
}

function assertSchema(value: Record<string, unknown>, expected: number, path: string): void {
  assertEqual(value.schemaVersion, expected, `${path} schemaVersion`);
}

function assertNoLegacyFields(value: Record<string, unknown>, fields: readonly string[], label: string): void {
  for (const field of fields) {
    if (field in value) throw new Error(`${label} contains legacy field ${field}.`);
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  return requireRecord(JSON.parse(await readFile(path, "utf8")) as unknown, path);
}

async function readOptionalJsonArray(path: string): Promise<unknown[] | undefined> {
  try {
    return requireArray(JSON.parse(await readFile(path, "utf8")) as unknown, path);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
