import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const defaultAstroBuildConcurrency = 4;
const themeAssetDirectory = "site/dist/_astro";
const themeAssetNamePattern = /^theme-interaction\.[A-Za-z0-9_-]+\.js$/u;

export function parseAstroBuildConcurrency(value) {
  if (value === undefined) {
    return defaultAstroBuildConcurrency;
  }
  if (!/^[1-4]$/u.test(value)) {
    throw new Error(
      "ASTRO_BUILD_CONCURRENCY must be exactly one of 1, 2, 3, or 4.",
    );
  }
  return Number(value);
}

export async function captureRequiredSiteAssets(repositoryRoot) {
  const directory = resolve(repositoryRoot, themeAssetDirectory);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("Required theme interaction asset directory is missing.");
    }
    throw error;
  }
  const matches = entries
    .filter((entry) => entry.isFile() && themeAssetNamePattern.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one content-hashed theme interaction asset; found ${matches.length}.`,
    );
  }

  const path = `${themeAssetDirectory}/${matches[0]}`;
  const absolutePath = resolve(repositoryRoot, path);
  const bytes = await readFile(absolutePath);
  return [{
    role: "theme-interaction",
    path,
    size: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }];
}

export async function validateRequiredSiteAssets(repositoryRoot, records) {
  if (!Array.isArray(records) || records.length !== 1) {
    return invalid("the site cache has no complete required-asset contract");
  }
  const [record] = records;
  if (
    record === null
    || typeof record !== "object"
    || record.role !== "theme-interaction"
    || typeof record.path !== "string"
    || !/^site\/dist\/_astro\/theme-interaction\.[A-Za-z0-9_-]+\.js$/u.test(record.path)
    || !Number.isSafeInteger(record.size)
    || record.size < 0
    || typeof record.sha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(record.sha256)
  ) {
    return invalid("the site cache required-asset record is invalid");
  }

  const absolutePath = resolve(repositoryRoot, record.path);
  const repositoryPath = relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
  if (repositoryPath !== record.path) {
    return invalid("the site cache required-asset path escapes the repository");
  }

  let metadata;
  let bytes;
  try {
    metadata = await stat(absolutePath);
    bytes = await readFile(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return invalid(`required site asset is missing: ${record.path}`);
    }
    throw error;
  }
  if (!metadata.isFile() || metadata.size !== record.size) {
    return invalid(`required site asset size does not match: ${record.path}`);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== record.sha256) {
    return invalid(`required site asset hash does not match: ${record.path}`);
  }
  return { valid: true };
}

function invalid(reason) {
  return { valid: false, reason };
}
