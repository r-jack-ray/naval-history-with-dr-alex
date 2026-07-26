import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { parseSiteSeoValidationConcurrency } from "./concurrency-settings.js";

interface SiteBuildSupportModule {
  parseAstroBuildConcurrency(value: string | undefined): number;
}

const repositoryRoot = process.cwd();

test("site build properties expose the supported concurrency settings", async () => {
  const properties = await readFile(join(repositoryRoot, "site-build.properties"), "utf8");
  assert.match(properties, /^ASTRO_BUILD_CONCURRENCY=4$/mu);
  assert.match(properties, /^SITE_SEO_VALIDATION_CONCURRENCY=8$/mu);
});

test("all direct site commands load the shared properties file", async () => {
  const packageJson = JSON.parse(
    await readFile(join(repositoryRoot, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  for (const scriptName of [
    "generate:site-data",
    "site:dev",
    "site:preview",
    "site:check:generated",
    "site:build",
    "site:build:generated",
    "site:build:astro",
    "site:build:pagefind",
    "check:site-seo",
  ]) {
    assert.match(
      packageJson.scripts[scriptName] ?? "",
      /node --env-file=site-build\.properties/u,
      `${scriptName} must load site-build.properties`,
    );
  }
  assert.equal(
    packageJson.scripts["site:build:full"],
    "npm run site:build:astro && npm run site:build:pagefind",
  );
});

test("site concurrency values are bounded and validated", async () => {
  const supportUrl = pathToFileURL(
    join(repositoryRoot, ".codex", "hooks", "site-build-support.mjs"),
  ).href;
  const support = await import(supportUrl) as SiteBuildSupportModule;

  assert.equal(support.parseAstroBuildConcurrency("1"), 1);
  assert.equal(support.parseAstroBuildConcurrency("4"), 4);
  for (const invalid of [undefined, "", "0", "5", "1.5", "four"]) {
    assert.throws(() => support.parseAstroBuildConcurrency(invalid));
  }

  assert.equal(parseSiteSeoValidationConcurrency("1"), 1);
  assert.equal(parseSiteSeoValidationConcurrency("32"), 32);
  for (const invalid of [undefined, "", "0", "33", "1.5", "eight"]) {
    assert.throws(() => parseSiteSeoValidationConcurrency(invalid));
  }
});
