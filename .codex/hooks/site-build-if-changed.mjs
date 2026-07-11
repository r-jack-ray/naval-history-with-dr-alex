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
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const archiveCachePath = resolve(repositoryRoot, ".tmp/site-archive-cache.json");
const siteCachePath = resolve(repositoryRoot, ".tmp/site-build-cache.json");
const archiveOutputSentinels = ["site/src/data/generated/archive.json"];
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
];
const archiveCacheVersion = 1;
const siteCacheVersion = 2;

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
  const outputsExist = await allPathsExist(archiveOutputSentinels);

  if (!force && outputsExist && cache?.fingerprint === fingerprint) {
    console.log("Archive inputs are unchanged; skipped site archive generation.");
    return true;
  }

  const reason = buildReason(force, outputsExist, cache, "archive inputs changed");
  console.log(`Generating site archive because ${reason}.`);

  const exitCode = await runNpmScript("generate:site-data");
  if (exitCode !== 0) {
    process.exitCode = exitCode;
    return false;
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

function buildReason(force, outputsExist, cache, changedReason) {
  return force
    ? "a forced build was requested"
    : !outputsExist
      ? "required output is missing"
      : cache === undefined
        ? "no successful cache exists"
        : changedReason;
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

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
