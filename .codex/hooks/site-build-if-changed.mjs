#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const archiveCachePath = resolve(repositoryRoot, ".tmp/site-archive-cache.json");
const siteCachePath = resolve(repositoryRoot, ".tmp/site-build-cache.json");
const archiveOutputSentinels = ["site/src/data/generated/archive/index.json"];
const defaultTopicNormalizationPatternsPath = "src/derived/topic-normalization-patterns.tsv";
const siteOutputSentinels = [
  "site/dist/index.html",
  "site/dist/pagefind/pagefind-entry.json",
];
const archiveInputPaths = [
  ".codex/hooks/site-build-if-changed.mjs",
  ".codex/hooks/site-content-pipeline-lock.mjs",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "src/channel/episodes.json",
  "src/channel/video-metadata.json",
  "src/transcripts/manifest.json",
  defaultTopicNormalizationPatternsPath,
  "src/derived/video-segments",
];
const siteInputPaths = [
  ".codex/hooks/site-build-if-changed.mjs",
  "astro.config.mjs",
  "package.json",
  "package-lock.json",
  "tsconfig.astro.json",
  "site/public",
  "site/src",
  defaultTopicNormalizationPatternsPath,
];
const archiveCacheVersion = 3;
const siteCacheVersion = 4;
const runStartedAt = new Date();

async function main() {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg !== "--force" && arg !== "--generate") {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const force = args.includes("--force");
  if (args.includes("--generate")) {
    const generationSucceeded = await ensureSiteArchive(force);
    if (!generationSucceeded) {
      return;
    }
  }

  await ensureBuiltSite(force);
}

async function ensureSiteArchive(force) {
  const typescriptSources = await findFiles("src", (path) => path.endsWith(".ts"));
  const fingerprint = await calculateFingerprint(
    "site-archive",
    archiveCacheVersion,
    [...archiveInputPaths, ...typescriptSources],
  );
  const cache = await readCache(archiveCachePath, archiveCacheVersion);
  const archiveValidation = await validateSiteArchive();
  const outputsExist = archiveValidation.valid;

  if (!force && outputsExist && cache?.fingerprint === fingerprint) {
    console.log("Archive inputs are unchanged; skipped site archive generation.");
    return true;
  }

  const reason = buildReason(
    force,
    outputsExist,
    cache,
    "archive inputs changed",
    archiveValidation.reason,
  );
  console.log(`Generating site archive because ${reason}.`);

  const exitCode = await runNpmScript("generate:site-data");
  if (exitCode !== 0) {
    process.exitCode = exitCode;
    return false;
  }

  const completedArchiveValidation = await validateSiteArchive();
  if (!completedArchiveValidation.valid) {
    throw new Error(
      `Generated site archive failed integrity validation: ${completedArchiveValidation.reason}`,
    );
  }

  const completedFingerprint = await calculateFingerprint(
    "site-archive",
    archiveCacheVersion,
    [...archiveInputPaths, ...typescriptSources],
  );
  await writeCache(archiveCachePath, {
    version: archiveCacheVersion,
    fingerprint: completedFingerprint,
    completedAt: new Date().toISOString(),
  });
  return true;
}

async function ensureBuiltSite(force) {
  const archiveValidation = await validateSiteArchive();
  if (!archiveValidation.valid) {
    throw new Error(
      `Generated site archive failed integrity validation: ${archiveValidation.reason}`,
    );
  }

  const environmentFiles = await existingEnvironmentFiles();
  const fingerprint = await calculateFingerprint(
    "site-build",
    siteCacheVersion,
    [...siteInputPaths, ...environmentFiles],
  );
  const cache = await readCache(siteCachePath, siteCacheVersion);
  const outputsExist = await allPathsExist(siteOutputSentinels);

  if (!force && outputsExist && cache?.fingerprint === fingerprint) {
    console.log("Site inputs are unchanged; skipped Astro and Pagefind.");
    return;
  }

  const reason = buildReason(force, outputsExist, cache, "site inputs changed");
  console.log(`Building Astro site because ${reason}.`);

  const prebuildArchiveValidation = await validateSiteArchive();
  if (!prebuildArchiveValidation.valid) {
    throw new Error(
      `Generated site archive became stale before Astro/Pagefind: ${prebuildArchiveValidation.reason}`,
    );
  }

  const exitCode = await runNpmScript("site:build:full");
  if (exitCode !== 0) {
    process.exitCode = exitCode;
    return;
  }

  await writeCache(siteCachePath, {
    version: siteCacheVersion,
    fingerprint,
    completedAt: new Date().toISOString(),
  });
}

function buildReason(force, outputsExist, cache, changedReason, missingReason) {
  return force
    ? "a forced build was requested"
    : !outputsExist
      ? (missingReason ?? "required output is missing")
      : cache === undefined
        ? "no successful cache exists"
        : changedReason;
}

async function validateSiteArchive() {
  const manifestPath = resolve(repositoryRoot, archiveOutputSentinels[0]);
  const archiveDirectory = dirname(manifestPath);

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return invalidArchive("the archive manifest is missing");
    }
    if (error instanceof SyntaxError) {
      return invalidArchive("the archive manifest is not valid JSON");
    }
    throw error;
  }

  if (manifest?.schemaVersion !== 5) {
    return invalidArchive("the archive manifest schema version is unsupported");
  }
  if (manifest?.source?.patternsInput !== defaultTopicNormalizationPatternsPath) {
    return invalidArchive("the archive manifest has an unsupported topic-normalization catalog path");
  }
  if (
    typeof manifest.source.patternsSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(manifest.source.patternsSha256)
  ) {
    return invalidArchive("the archive manifest topic-normalization catalog hash is invalid");
  }
  if (
    typeof manifest.source.patternsSourceSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(manifest.source.patternsSourceSha256)
  ) {
    return invalidArchive("the archive manifest topic-normalization source hash is invalid");
  }

  let patternsBytes;
  try {
    patternsBytes = await readFile(resolve(repositoryRoot, defaultTopicNormalizationPatternsPath));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return invalidArchive("the topic-normalization catalog is missing");
    }
    throw error;
  }
  const patternsSourceSha256 = createHash("sha256").update(patternsBytes).digest("hex");
  if (patternsSourceSha256 !== manifest.source.patternsSourceSha256) {
    return invalidArchive("the generated archive topic-normalization provenance is stale");
  }
  if (
    manifest?.segmentSharding?.algorithm !== "sha256-video-id-mod" ||
    manifest.segmentSharding.bucketCount !== 64
  ) {
    return invalidArchive("the archive manifest has an unsupported segment-sharding contract");
  }

  const videos = manifest?.files?.videos;
  const topics = manifest?.files?.topics;
  const segmentBuckets = manifest?.files?.segmentBuckets;
  if (!isArchiveFileRecord(videos) || videos.path !== "./videos.json") {
    return invalidArchive("the archive videos file record is invalid");
  }
  if (!isArchiveFileRecord(topics) || topics.path !== "./topics.json") {
    return invalidArchive("the archive topics file record is invalid");
  }
  if (!Array.isArray(segmentBuckets) || segmentBuckets.length !== 64) {
    return invalidArchive("the archive manifest does not declare all 64 segment buckets");
  }

  for (let bucketIndex = 0; bucketIndex < segmentBuckets.length; bucketIndex += 1) {
    const expectedId = bucketIndex.toString(16).padStart(2, "0");
    const bucket = segmentBuckets[bucketIndex];
    if (
      !isArchiveFileRecord(bucket) ||
      bucket.id !== expectedId ||
      bucket.path !== `./segments/${expectedId}.json`
    ) {
      return invalidArchive(`the archive segment bucket ${expectedId} record is invalid`);
    }
  }

  if (
    !isNonnegativeInteger(manifest?.counts?.videos) ||
    !isNonnegativeInteger(manifest?.counts?.segments) ||
    !isNonnegativeInteger(manifest?.counts?.topics) ||
    videos.count !== manifest.counts.videos ||
    topics.count !== manifest.counts.topics ||
    segmentBuckets.reduce((sum, bucket) => sum + bucket.count, 0) !==
      manifest.counts.segments
  ) {
    return invalidArchive("the archive manifest counts are inconsistent");
  }

  const fileRecords = [videos, topics, ...segmentBuckets];
  const seenPaths = new Set();
  let generatedTopics;
  for (const fileRecord of fileRecords) {
    if (seenPaths.has(fileRecord.path)) {
      return invalidArchive(`the archive manifest repeats ${fileRecord.path}`);
    }
    seenPaths.add(fileRecord.path);

    const filePath = resolve(archiveDirectory, fileRecord.path);
    const archiveRelativePath = relative(archiveDirectory, filePath);
    if (
      archiveRelativePath.length === 0 ||
      archiveRelativePath === ".." ||
      archiveRelativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
      isAbsolute(archiveRelativePath)
    ) {
      return invalidArchive(`the archive file path escapes its generated directory: ${fileRecord.path}`);
    }

    let bytes;
    try {
      bytes = await readFile(filePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return invalidArchive(`the archive file is missing: ${fileRecord.path}`);
      }
      throw error;
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== fileRecord.sha256) {
      return invalidArchive(`the archive file hash does not match: ${fileRecord.path}`);
    }
    if (fileRecord === topics) {
      try {
        generatedTopics = JSON.parse(bytes.toString("utf8"));
      } catch (error) {
        if (error instanceof SyntaxError) {
          return invalidArchive("the archive topics file is not valid JSON");
        }
        throw error;
      }
    }
  }

  if (!Array.isArray(generatedTopics) || generatedTopics.length !== topics.count) {
    return invalidArchive("the archive topics file count is inconsistent");
  }
  const topicSlugs = new Set();
  for (const topic of generatedTopics) {
    if (!isTopicRouteSlug(topic?.slug) || topicSlugs.has(topic.slug)) {
      return invalidArchive("the archive topics file contains an invalid or duplicate canonical slug");
    }
    topicSlugs.add(topic.slug);
  }

  return { valid: true };
}

function isArchiveFileRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.path === "string" &&
    isNonnegativeInteger(value.count) &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.sha256)
  );
}

function isNonnegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isTopicRouteSlug(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function invalidArchive(reason) {
  return { valid: false, reason };
}

async function calculateFingerprint(name, version, paths) {
  const hash = createHash("sha256");
  hash.update(`${name}-cache-v${version}\0`);
  hash.update(`${process.platform}\0${process.arch}\0${process.versions.node}\0`);

  for (const path of paths) {
    await hashPath(hash, resolve(repositoryRoot, path));
  }

  return hash.digest("hex");
}

async function findFiles(rootPath, predicate) {
  const matches = [];
  await visit(resolve(repositoryRoot, rootPath));
  return matches.sort();

  async function visit(absolutePath) {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      const childPath = resolve(absolutePath, entry.name);
      if (entry.isDirectory()) {
        await visit(childPath);
      } else if (entry.isFile()) {
        const repositoryPath = relative(repositoryRoot, childPath).replaceAll("\\", "/");
        if (predicate(repositoryPath)) {
          matches.push(repositoryPath);
        }
      }
    }
  }
}

async function existingEnvironmentFiles() {
  const entries = await readdir(repositoryRoot);
  return entries
    .filter((entry) => entry === ".env" || entry.startsWith(".env."))
    .sort();
}

async function hashPath(hash, absolutePath) {
  const metadata = await lstat(absolutePath);
  const repositoryPath = relative(repositoryRoot, absolutePath).replaceAll("\\", "/");

  if (metadata.isSymbolicLink()) {
    hash.update(`link\0${repositoryPath}\0${await readlink(absolutePath)}\0`);
    return;
  }

  if (metadata.isDirectory()) {
    hash.update(`directory\0${repositoryPath}\0`);
    const entries = (await readdir(absolutePath)).sort();
    for (const entry of entries) {
      await hashPath(hash, resolve(absolutePath, entry));
    }
    return;
  }

  if (metadata.isFile()) {
    hash.update(`file\0${repositoryPath}\0${metadata.size}\0`);
    hash.update(await readFile(absolutePath));
    hash.update("\0");
  }
}

async function allPathsExist(paths) {
  const results = await Promise.all(
    paths.map(async (path) => {
      try {
        return (await stat(resolve(repositoryRoot, path))).isFile();
      } catch (error) {
        if (error?.code === "ENOENT") {
          return false;
        }
        throw error;
      }
    }),
  );
  return results.every(Boolean);
}

async function readCache(cachePath, expectedVersion) {
  try {
    const cache = JSON.parse(await readFile(cachePath, "utf8"));
    if (cache?.version !== expectedVersion || typeof cache.fingerprint !== "string") {
      return undefined;
    }
    return cache;
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

async function runNpmScript(scriptName) {
  const npmCommand =
    process.platform === "win32"
      ? `"${resolve(dirname(process.execPath), "npm.cmd")}"`
      : "npm";
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(`${npmCommand} run ${scriptName}`, {
      cwd: repositoryRoot,
      shell: true,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        console.error(`Full site build terminated by signal ${signal}.`);
        resolvePromise(1);
        return;
      }
      resolvePromise(code ?? 1);
    });
  });
}

async function writeCache(cachePath, cache) {
  await mkdir(dirname(cachePath), { recursive: true });
  const temporaryPath = `${cachePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    await rename(temporaryPath, cachePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  const runEndedAt = new Date();
  console.log(`Run Time: ${formatRunTime(runEndedAt - runStartedAt)}`);
  console.log(`Start Time: ${runStartedAt.toISOString()}`);
  console.log(`End Time: ${runEndedAt.toISOString()}`);
}

function formatRunTime(milliseconds) {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainder = milliseconds % 1_000;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${remainder
    .toString()
    .padStart(3, "0")}`;
}
