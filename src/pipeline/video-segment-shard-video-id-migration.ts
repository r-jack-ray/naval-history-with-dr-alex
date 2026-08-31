import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { validateCuratedVideoFile, type CuratedVideoFileSeed, } from "../content/schemas/index.js";
import { writeTextAtomically } from "./atomic-write.js";
import { listVideoSegmentShardFileNames } from "../site/video-segment-files.js";

export type VideoSegmentShardVideoIdMigrationMode = "dry-run" | "write" | "check";

export interface VideoSegmentShardVideoIdMigrationOptions {
  inputDirectory: string;
  mode?: VideoSegmentShardVideoIdMigrationMode;
  backupRoot?: string;
}

export interface VideoSegmentShardVideoIdMigrationResult {
  mode: VideoSegmentShardVideoIdMigrationMode;
  shardCount: number;
  segmentCount: number;
  changedShardCount: number;
  alreadyCurrentShardCount: number;
  removedFieldCount: number;
  backupDirectory?: string;
}

interface ShardMigrationPlan {
  fileName: string;
  filePath: string;
  state: "legacy" | "current";
  segmentCount: number;
  removedFieldCount: number;
  sourceSha256: string;
  targetSha256: string;
}

interface InspectedShard {
  state: "legacy" | "current";
  segmentCount: number;
  removedFieldCount: number;
  targetText: string;
  target: CuratedVideoFileSeed;
}

interface BackupManifest {
  schemaVersion: 1;
  sourceDirectory: string;
  files: Array<{
    fileName: string;
    sha256: string;
  }>;
}

export async function migrateVideoSegmentShardVideoIds(
  options: VideoSegmentShardVideoIdMigrationOptions,
): Promise<VideoSegmentShardVideoIdMigrationResult> {
  const mode = options.mode ?? "dry-run";
  const inputDirectory = resolve(options.inputDirectory);
  const plans = await preflightShards(inputDirectory, mode === "check");
  const changedPlans = plans.filter((plan) => plan.state === "legacy");
  const result: VideoSegmentShardVideoIdMigrationResult = {
    mode,
    shardCount: plans.length,
    segmentCount: plans.reduce((total, plan) => total + plan.segmentCount, 0),
    changedShardCount: changedPlans.length,
    alreadyCurrentShardCount: plans.length - changedPlans.length,
    removedFieldCount: changedPlans.reduce(
      (total, plan) => total + plan.removedFieldCount,
      0,
    ),
  };

  if (mode === "write" && changedPlans.length > 0) {
    const backupDirectory = await backUpLegacyShards(
      inputDirectory,
      changedPlans,
      options.backupRoot,
    );
    result.backupDirectory = backupDirectory;

    try {
      for (const plan of changedPlans) {
        const sourceText = await readFile(plan.filePath, "utf8");
        requireHash(plan, sourceText, plan.sourceSha256, "changed after preflight");
        const inspected = inspectShard(sourceText, plan.filePath, false);
        if (inspected.state !== "legacy") {
          throw new Error(
            `Shard ${plan.filePath} no longer has the legacy segment videoId shape.`,
          );
        }
        requireHash(plan, inspected.targetText, plan.targetSha256, "target changed after preflight");
        await writeTextAtomically(plan.filePath, inspected.targetText);
      }
    } catch (error) {
      throw new Error(
        `Shard migration write failed. Backup retained at ${backupDirectory}.`,
        { cause: error },
      );
    }

    try {
      await preflightShards(inputDirectory, true);
    } catch (error) {
      throw new Error(
        `Post-write shard validation failed. Backup retained at ${backupDirectory}.`,
        { cause: error },
      );
    }
  }

  return result;
}

async function preflightShards(
  inputDirectory: string,
  targetOnly: boolean,
): Promise<ShardMigrationPlan[]> {
  const fileNames = await listVideoSegmentShardFileNames(inputDirectory);
  const plans: ShardMigrationPlan[] = [];
  const failures: string[] = [];
  const idLocations = new Map<string, string>();
  const slugLocations = new Map<string, string>();

  for (const fileName of fileNames) {
    const filePath = join(inputDirectory, fileName);
    try {
      const sourceText = await readFile(filePath, "utf8");
      const inspected = inspectShard(sourceText, filePath, targetOnly);
      plans.push({
        fileName,
        filePath,
        state: inspected.state,
        segmentCount: inspected.segmentCount,
        removedFieldCount: inspected.removedFieldCount,
        sourceSha256: sha256(sourceText),
        targetSha256: sha256(inspected.targetText),
      });
      for (const segment of inspected.target.segments) {
        registerUniqueValue(idLocations, segment.id, filePath, "ID");
        registerUniqueValue(slugLocations, segment.slug, filePath, "slug");
      }
    } catch (error) {
      failures.push(`${filePath}: ${errorMessage(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Video-segment shard videoId migration preflight failed for ` +
      `${failures.length} shard(s):\n- ${failures.join("\n- ")}`,
    );
  }

  return plans;
}

function inspectShard(
  sourceText: string,
  filePath: string,
  targetOnly: boolean,
): InspectedShard {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceText) as unknown;
  } catch (error) {
    throw new Error("invalid JSON", { cause: error });
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.segments)) {
    throw new Error("root must be an object with a segments array");
  }
  const shard = parsed as Record<string, unknown> & { segments: unknown[] };

  const rootVideoId = shard.videoId;
  const hasLegacyVideoId = shard.segments.map((segment, index) => {
    if (!isRecord(segment)) {
      throw new Error(`segments[${index}] must be an object`);
    }
    return Object.hasOwn(segment, "videoId");
  });
  const legacySegmentCount = hasLegacyVideoId.filter(Boolean).length;
  if (legacySegmentCount > 0 && legacySegmentCount !== shard.segments.length) {
    throw new Error("shard mixes legacy and current segment videoId shapes");
  }
  if (targetOnly && legacySegmentCount > 0) {
    throw new Error("legacy segment videoId fields remain");
  }

  const transformedSegments = shard.segments.map((segment, index) => {
    const record = segment as Record<string, unknown>;
    let transformed = record;
    if (hasLegacyVideoId[index]) {
      if (typeof rootVideoId !== "string" || record.videoId !== rootVideoId) {
        throw new Error(
          `segments[${index}].videoId ${JSON.stringify(record.videoId)} ` +
          `must match root videoId ${JSON.stringify(rootVideoId)}`,
        );
      }
      transformed = {};
      for (const [key, value] of Object.entries(record)) {
        if (key !== "videoId") {
          transformed[key] = value;
        }
      }
      const expectedKeys = Object.keys(record).filter((key) => key !== "videoId");
      if (!isDeepStrictEqual(Object.keys(transformed), expectedKeys)) {
        throw new Error(`segments[${index}] key order changed during migration planning`);
      }
    }
    return transformed;
  });

  const targetValue: Record<string, unknown> = {
    ...shard,
    segments: transformedSegments,
  };
  const validation = validateCuratedVideoFile(targetValue);
  if (!validation.success) {
    throw new Error(validation.issues.join("; "));
  }
  const projectedSource = removeLegacySegmentVideoIds(shard);
  if (!isDeepStrictEqual(projectedSource, targetValue)) {
    throw new Error("migration changes retained shard values or key order");
  }
  const targetText = legacySegmentCount === 0
    ? sourceText
    : removeLegacySegmentVideoIdProperties(
        sourceText,
        String(rootVideoId),
        legacySegmentCount,
      );
  let parsedTargetText: unknown;
  try {
    parsedTargetText = JSON.parse(targetText) as unknown;
  } catch (error) {
    throw new Error("source formatting could not be preserved as valid JSON", { cause: error });
  }
  if (!isDeepStrictEqual(parsedTargetText, targetValue)) {
    throw new Error("source-preserving edit changes retained shard bytes or values");
  }

  return {
    state: legacySegmentCount === 0 ? "current" : "legacy",
    segmentCount: validation.data.segments.length,
    removedFieldCount: legacySegmentCount,
    targetText,
    target: validation.data,
  };
}

function removeLegacySegmentVideoIdProperties(
  sourceText: string,
  rootVideoId: string,
  expectedCount: number,
): string {
  const encodedVideoId = escapeRegExp(JSON.stringify(rootVideoId));
  const segmentsProperty = /^[ \t]{2}"segments"[ \t]*:[ \t]*\[[ \t]*\r?\n/mu.exec(sourceText);
  if (segmentsProperty === null) {
    throw new Error("could not locate the root segments array in the supported shard layout");
  }
  const segmentsOffset = segmentsProperty.index + segmentsProperty[0].length;
  const sourcePrefix = sourceText.slice(0, segmentsOffset);
  let targetSegmentsText = sourceText.slice(segmentsOffset);
  const propertyWithFollowingSibling = new RegExp(
    `^[ \\t]{2,}"videoId"[ \\t]*:[ \\t]*${encodedVideoId}[ \\t]*,[ \\t]*\\r?\\n`,
    "gmu",
  );
  let removedCount = 0;
  targetSegmentsText = targetSegmentsText.replace(propertyWithFollowingSibling, () => {
    removedCount += 1;
    return "";
  });
  const finalProperty = new RegExp(
    `,\\r?\\n[ \\t]{2,}"videoId"[ \\t]*:[ \\t]*${encodedVideoId}[ \\t]*(\\r?\\n)(?=[ \\t]*\\})`,
    "gmu",
  );
  targetSegmentsText = targetSegmentsText.replace(finalProperty, (_match, followingNewline: string) => {
    removedCount += 1;
    return followingNewline;
  });
  if (removedCount !== expectedCount) {
    throw new Error(
      `expected ${expectedCount} removable segment videoId line(s), found ${removedCount}; ` +
      "source formatting is outside the supported two-space shard layout",
    );
  }
  return `${sourcePrefix}${targetSegmentsText}`;
}

function removeLegacySegmentVideoIds(
  value: Record<string, unknown> & { segments: unknown[] },
): Record<string, unknown> {
  return {
    ...value,
    segments: value.segments.map((segment) => {
      const transformed: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(segment as Record<string, unknown>)) {
        if (key !== "videoId") {
          transformed[key] = item;
        }
      }
      return transformed;
    }),
  };
}

async function backUpLegacyShards(
  inputDirectory: string,
  plans: readonly ShardMigrationPlan[],
  requestedBackupRoot?: string,
): Promise<string> {
  const backupRoot = resolve(requestedBackupRoot ?? tmpdir());
  await mkdir(backupRoot, { recursive: true });
  const backupDirectory = await mkdtemp(join(backupRoot, "video-segment-shard-video-id-"));
  const manifest: BackupManifest = {
    schemaVersion: 1,
    sourceDirectory: inputDirectory,
    files: [],
  };

  for (const plan of plans) {
    const sourceText = await readFile(plan.filePath, "utf8");
    requireHash(plan, sourceText, plan.sourceSha256, "changed before backup");
    const backupPath = join(backupDirectory, plan.fileName);
    await writeFile(backupPath, sourceText, "utf8");
    const backupText = await readFile(backupPath, "utf8");
    requireHash(plan, backupText, plan.sourceSha256, "backup verification failed");
    manifest.files.push({ fileName: plan.fileName, sha256: plan.sourceSha256 });
  }

  await writeTextAtomically(
    join(backupDirectory, "backup-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return backupDirectory;
}

function registerUniqueValue(
  locations: Map<string, string>,
  value: string,
  filePath: string,
  label: string,
): void {
  const existing = locations.get(value);
  if (existing !== undefined) {
    throw new Error(`duplicate segment ${label} ${value} in ${existing} and ${filePath}`);
  }
  locations.set(value, filePath);
}

function requireHash(
  plan: ShardMigrationPlan,
  text: string,
  expected: string,
  reason: string,
): void {
  const actual = sha256(text);
  if (actual !== expected) {
    throw new Error(`Shard ${plan.filePath} ${reason}: expected ${expected}, found ${actual}.`);
  }
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
