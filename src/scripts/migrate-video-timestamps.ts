#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { archiveTimestampPrefix } from "../naming.js";
import { writeTextAtomically } from "../pipeline/atomic-write.js";
import {
  resolveVideoState,
  type VideoMetadataRecord,
} from "../youtube/video-metadata.js";

const manifestPath = "src/transcripts/manifest.json";
const metadataPath = "src/channel/video-metadata.json";
const episodesPath = "src/channel/episodes.json";
const fetchStatusPath = "src/transcripts/fetch-status.json";
const transcriptRoot = "src/transcripts/txt";
const shardRoot = "src/derived/video-segments";
const referenceFiles = [
  "src/derived/site-content-processing.log",
  "task-notes/file-auditing-01.txt",
  "task-notes/file-auditing-02.txt",
  "reports/site-content-backlog.md",
  "reports/video-segment-audit-risk.tsv",
  "reports/transcript-problems.md",
] as const;
const timestampPrefixPattern = /^\d{4}-\d{2}-\d{2}_T\d{2}-\d{2}-\d{2}_/u;

interface MigrationRecord {
  videoId: string;
  oldStem: string;
  newStem: string;
  oldTxtPath: string;
  newTxtPath: string;
  oldShardPath: string;
  newShardPath: string;
  videoDateAt: string;
  videoDateKind: "actual_start" | "scheduled_start" | "published";
}

interface MigrationPlan {
  schemaVersion: 1;
  generatedAt: string;
  inputs: {
    manifest: string;
    metadata: string;
    episodes: string;
  };
  counts: {
    manifestRecords: number;
    physicalMigrations: number;
    manifestDateCorrections: number;
    txtRenames: number;
    shardRenames: number;
    segmentSourcePathReplacements: number;
    referenceReplacements: Record<string, number>;
  };
  records: MigrationRecord[];
}

interface CliOptions {
  output?: string;
  writeReferences: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await readJsonObject(manifestPath);
  const metadataStore = await readJsonObject(metadataPath);
  const episodes = await readJsonObject(episodesPath);
  const metadataRecords = requireArray(metadataStore.videos, `${metadataPath} videos`) as VideoMetadataRecord[];
  const metadataById = new Map(metadataRecords.map((record) => [record.videoId, record]));
  const transcripts = requireArray(manifest.transcripts, `${manifestPath} transcripts`);
  const plan = await buildMigrationPlan(
    transcripts,
    metadataById,
    requireString(metadataStore.generatedAt, `${metadataPath} generatedAt`),
  );

  if (options.output !== undefined) {
    await writeTextAtomically(options.output, `${JSON.stringify(plan, null, 2)}\n`);
  }

  if (options.writeReferences) {
    await applyReferenceMigration(plan, manifest, episodes, metadataById);
  }

  console.error(
    `${options.writeReferences ? "Applied" : "Planned"} timestamp alignment: ` +
    `${plan.counts.physicalMigrations} physical stems, ` +
    `${plan.counts.manifestDateCorrections} manifest date corrections, ` +
    `${plan.counts.segmentSourcePathReplacements} segment source paths.`,
  );
}

async function buildMigrationPlan(
  transcripts: unknown[],
  metadataById: ReadonlyMap<string, VideoMetadataRecord>,
  generatedAt: string,
): Promise<MigrationPlan> {
  const records: MigrationRecord[] = [];
  let manifestDateCorrections = 0;
  let segmentSourcePathReplacements = 0;

  for (const value of transcripts) {
    const transcript = requireRecord(value, "transcript manifest record");
    const videoId = requireString(transcript.videoId, "transcript videoId");
    const oldStem = requireString(transcript.fileStem, `transcript ${videoId} fileStem`);
    const state = resolveVideoState(metadataById.get(videoId));
    if (state.state !== "ready") {
      throw new Error(
        `Cannot migrate curated transcript ${videoId}: ${state.reason} (${state.diagnostic})`,
      );
    }
    const oldDate = optionalString(transcript.videoDateAt) ?? optionalString(transcript.videoPublishedAt);
    if (oldDate !== state.videoDateAt) {
      manifestDateCorrections += 1;
    }
    if (!timestampPrefixPattern.test(oldStem)) {
      throw new Error(`Transcript ${videoId} fileStem has no timestamp prefix: ${oldStem}`);
    }
    const newStem = `${archiveTimestampPrefix(state.videoDateAt)}_${oldStem.replace(timestampPrefixPattern, "")}`;
    if (newStem === oldStem) {
      continue;
    }
    const oldTxtPath = join(transcriptRoot, `${oldStem}.txt`).replaceAll("\\", "/");
    const newTxtPath = join(transcriptRoot, `${newStem}.txt`).replaceAll("\\", "/");
    const oldShardPath = join(shardRoot, `${oldStem}.json`).replaceAll("\\", "/");
    const newShardPath = join(shardRoot, `${newStem}.json`).replaceAll("\\", "/");
    await assertExists(oldTxtPath);
    await assertExists(oldShardPath);
    await assertMissing(newTxtPath, oldTxtPath);
    await assertMissing(newShardPath, oldShardPath);
    const shard = await readJsonObject(oldShardPath);
    segmentSourcePathReplacements += countExactString(
      shard,
      oldTxtPath,
    );
    records.push({
      videoId,
      oldStem,
      newStem,
      oldTxtPath,
      newTxtPath,
      oldShardPath,
      newShardPath,
      videoDateAt: state.videoDateAt,
      videoDateKind: state.videoDateKind,
    });
  }

  records.sort((left, right) => left.videoId.localeCompare(right.videoId));
  assertUnique(records.map((record) => record.oldStem), "old stem");
  assertUnique(records.map((record) => record.newStem), "new stem");
  const referenceReplacements: Record<string, number> = {};
  for (const path of referenceFiles) {
    const text = await readOptionalText(path);
    if (text !== undefined) {
      referenceReplacements[path] = countStemReferences(text, records);
    }
  }

  return {
    schemaVersion: 1,
    generatedAt,
    inputs: { manifest: manifestPath, metadata: metadataPath, episodes: episodesPath },
    counts: {
      manifestRecords: transcripts.length,
      physicalMigrations: records.length,
      manifestDateCorrections,
      txtRenames: records.length,
      shardRenames: records.length,
      segmentSourcePathReplacements,
      referenceReplacements,
    },
    records,
  };
}

async function applyReferenceMigration(
  plan: MigrationPlan,
  manifest: Record<string, unknown>,
  episodesStore: Record<string, unknown>,
  metadataById: ReadonlyMap<string, VideoMetadataRecord>,
): Promise<void> {
  for (const record of plan.records) {
    await assertMissing(record.oldTxtPath, record.newTxtPath);
    await assertMissing(record.oldShardPath, record.newShardPath);
    await assertExists(record.newTxtPath);
    await assertExists(record.newShardPath);
  }

  const migrationByVideoId = new Map(plan.records.map((record) => [record.videoId, record]));
  const manifestRecords = requireArray(manifest.transcripts, `${manifestPath} transcripts`);
  const normalizedManifestRecords = manifestRecords.map((value) => {
    const transcript = requireRecord(value, "transcript manifest record");
    const videoId = requireString(transcript.videoId, "transcript videoId");
    const metadata = metadataById.get(videoId);
    const state = resolveVideoState(metadata);
    if (state.state !== "ready") {
      throw new Error(`Cannot write transcript manifest for ${videoId}: ${state.reason} (${state.diagnostic})`);
    }
    const migration = migrationByVideoId.get(videoId);
    const fileStem = migration?.newStem ?? requireString(transcript.fileStem, `transcript ${videoId} fileStem`);
    const normalized: Record<string, unknown> = { ...transcript };
    delete normalized.videoPublishedAt;
    normalized.videoDateAt = state.videoDateAt;
    normalized.videoDateKind = state.videoDateKind;
    normalized.fileStem = fileStem;
    normalized.paths = { txt: `txt/${fileStem}.txt` };
    return normalized;
  });
  manifest.schemaVersion = 3;
  manifest.updatedAt = new Date().toISOString();
  manifest.transcripts = normalizedManifestRecords;
  await writeJson(manifestPath, manifest);

  for (const record of plan.records) {
    const shard = await readJsonObject(record.newShardPath);
    const result = replaceExactString(shard, record.oldTxtPath, record.newTxtPath);
    if (result.replacements === 0 && requireArray(shard.segments, `${record.newShardPath} segments`).length > 0) {
      throw new Error(`Shard ${record.newShardPath} contains segments but no old sourcePath reference.`);
    }
    await writeJson(record.newShardPath, result.value);
  }

  const manifestById = new Map(normalizedManifestRecords.map((value) => {
    const record = requireRecord(value, "normalized transcript record");
    return [requireString(record.videoId, "normalized transcript videoId"), record] as const;
  }));
  const episodes = requireArray(episodesStore.episodes, `${episodesPath} episodes`);
  episodesStore.schemaVersion = 2;
  episodesStore.episodes = episodes.map((value) => normalizeEpisode(value, metadataById, manifestById));
  await writeJson(episodesPath, episodesStore);

  await migrateFetchStatus(metadataById);
  for (const path of referenceFiles) {
    const text = await readOptionalText(path);
    if (text === undefined) {
      continue;
    }
    let replaced = text;
    for (const record of plan.records) {
      replaced = replaced.replaceAll(record.oldStem, record.newStem);
    }
    if (replaced !== text) {
      await writeTextAtomically(path, replaced);
    }
  }
}

function normalizeEpisode(
  value: unknown,
  metadataById: ReadonlyMap<string, VideoMetadataRecord>,
  manifestById: ReadonlyMap<string, Record<string, unknown>>,
): Record<string, unknown> {
  const episode = requireRecord(value, "episode record");
  const videoId = requireString(episode.videoId, "episode videoId");
  const normalized: Record<string, unknown> = { ...episode };
  for (const field of [
    "publishDate",
    "uploadDate",
    "streamStartAt",
    "streamEndAt",
    "scheduledStartAt",
    "actualStartAt",
    "actualEndAt",
    "videoDateAt",
    "videoDateKind",
    "videoKind",
  ]) {
    delete normalized[field];
  }

  const metadata = metadataById.get(videoId);
  const state = resolveVideoState(metadata);
  const publishedAt = metadata?.snippet?.publishedAt ?? undefined;
  const scheduledStartAt = metadata?.liveStreamingDetails?.scheduledStartTime ?? undefined;
  const actualStartAt = metadata?.liveStreamingDetails?.actualStartTime ?? undefined;
  const actualEndAt = metadata?.liveStreamingDetails?.actualEndTime ?? undefined;
  if (publishedAt !== undefined) normalized.publishedAt = publishedAt;
  if (scheduledStartAt !== undefined) normalized.scheduledStartAt = scheduledStartAt;
  if (actualStartAt !== undefined) normalized.actualStartAt = actualStartAt;
  if (actualEndAt !== undefined) normalized.actualEndAt = actualEndAt;
  normalized.videoKind = state.videoKind;
  if (state.state === "ready") {
    normalized.videoDateAt = state.videoDateAt;
    normalized.videoDateKind = state.videoDateKind;
  }

  const transcript = manifestById.get(videoId);
  if (transcript !== undefined) {
    const fileStem = requireString(transcript.fileStem, `transcript ${videoId} fileStem`);
    const paths = requireRecord(transcript.paths, `transcript ${videoId} paths`);
    normalized.fileStem = fileStem;
    const transcriptState: Record<string, unknown> = {
      status: "stored",
      txtPath: `src/transcripts/${requireString(paths.txt, `transcript ${videoId} TXT path`)}`,
    };
    for (const field of ["segmentCount", "selectedLanguage", "fetchedAt"] as const) {
      if (transcript[field] !== undefined) transcriptState[field] = transcript[field];
    }
    normalized.transcript = transcriptState;
  } else {
    normalized.transcript = { status: "not_checked" };
  }
  return normalized;
}

async function migrateFetchStatus(metadataById: ReadonlyMap<string, VideoMetadataRecord>): Promise<void> {
  const status = await readJsonObject(fetchStatusPath);
  const stats = requireRecord(status.stats, `${fetchStatusPath} stats`);
  const oldDeferred = typeof stats.skippedUnstartedCount === "number" ? stats.skippedUnstartedCount : 0;
  delete stats.skippedUnstartedCount;
  stats.skippedDeferredCount = oldDeferred;
  stats.deferredCounts = {
    upcoming: oldDeferred,
    live_in_progress: 0,
    processing: 0,
    metadata_missing: 0,
    invalid_metadata: 0,
  };
  status.schemaVersion = 2;
  status.failures = requireArray(status.failures, `${fetchStatusPath} failures`).map((value) => {
    const failure = requireRecord(value, "transcript failure");
    const normalized = { ...failure };
    delete normalized.publishedAt;
    const videoId = optionalString(failure.videoId);
    const state = resolveVideoState(videoId === undefined ? undefined : metadataById.get(videoId));
    if (state.state === "ready") {
      normalized.videoDateAt = state.videoDateAt;
    }
    return normalized;
  });
  await writeJson(fetchStatusPath, status);
}

function replaceExactString(value: unknown, oldValue: string, newValue: string): { value: unknown; replacements: number } {
  if (value === oldValue) {
    return { value: newValue, replacements: 1 };
  }
  if (Array.isArray(value)) {
    let replacements = 0;
    const items = value.map((item) => {
      const result = replaceExactString(item, oldValue, newValue);
      replacements += result.replacements;
      return result.value;
    });
    return { value: items, replacements };
  }
  if (value !== null && typeof value === "object") {
    let replacements = 0;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const replaced = replaceExactString(item, oldValue, newValue);
      replacements += replaced.replacements;
      result[key] = replaced.value;
    }
    return { value: result, replacements };
  }
  return { value, replacements: 0 };
}

function countExactString(value: unknown, expected: string): number {
  if (value === expected) return 1;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countExactString(item, expected), 0);
  if (value !== null && typeof value === "object") {
    return Object.values(value).reduce((sum, item) => sum + countExactString(item, expected), 0);
  }
  return 0;
}

function countStemReferences(text: string, records: readonly MigrationRecord[]): number {
  return records.reduce((sum, record) => sum + text.split(record.oldStem).length - 1, 0);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeTextAtomically(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  return requireRecord(JSON.parse(await readFile(path, "utf8")) as unknown, path);
}

async function readOptionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    throw error;
  }
}

async function assertExists(path: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(`Required migration source is missing: ${path}`);
  }
}

async function assertMissing(path: string, allowedSamePath: string): Promise<void> {
  if (path === allowedSamePath) return;
  try {
    await access(path);
  } catch {
    return;
  }
  throw new Error(`Migration target already exists: ${path}`);
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    const portable = value.toLowerCase();
    if (seen.has(portable)) throw new Error(`Duplicate portable ${label}: ${value}`);
    seen.add(portable);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
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

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { writeReferences: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--output") {
      const value = args[++index];
      if (value === undefined) throw new Error("Missing value for --output.");
      options.output = value;
    } else if (arg === "--write-references") {
      options.writeReferences = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: npm run migrate:video-timestamps -- [--output <path>] [--write-references]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }
  return options;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
