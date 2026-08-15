import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { siteArchiveSchemaVersion } from "../site/archive-data.js";
import { replaceFileAtomically } from "./atomic-write.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "..", "..");

test("atomic replacement preserves a complete previous file until replacement succeeds", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atomic-write-"));
  const target = join(directory, "archive.json");
  const ready = deferred<void>();
  const release = deferred<void>();

  try {
    await writeFile(target, "{\"version\":\"old\"}\n", "utf8");
    const replacement = replaceFileAtomically(target, async (temporaryPath) => {
      await writeFile(temporaryPath, "{\"version\":\"new\"}\n", "utf8");
      ready.resolve();
      await release.promise;
    });

    await ready.promise;
    assert.equal(await readFile(target, "utf8"), "{\"version\":\"old\"}\n");
    release.resolve();
    await replacement;
    assert.equal(await readFile(target, "utf8"), "{\"version\":\"new\"}\n");

    await assert.rejects(
        replaceFileAtomically(target, async (temporaryPath) => {
          await writeFile(temporaryPath, "{\"version\":\"partial\"", "utf8");
          throw new Error("interrupted before replacement");
        }),
        /interrupted before replacement/u,
    );
    assert.equal(await readFile(target, "utf8"), "{\"version\":\"new\"}\n");
    assert.equal((await readdir(directory)).filter((entry) => entry.endsWith(".tmp")).length, 0);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test("Phase 2 commands keep topic writes explicit and avoid duplicate site pipelines", async () => {
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const siteBuildWrapper = await readFile(join(repositoryRoot, "src", "scripts", "site-build-if-changed.mjs"), "utf8");
  const archiveAdapter = await readFile(join(repositoryRoot, "site", "src", "data", "archive.ts"), "utf8");
  const generateSiteDataSource = await readFile(join(repositoryRoot, "src", "scripts", "generate-site-data.ts"), "utf8");
  const checkVideoTopicsSource = await readFile(join(repositoryRoot, "src", "scripts", "check-video-topics-bun.ts"), "utf8");
  const workflow = await readFile(join(repositoryRoot, ".github", "workflows", "deploy-site.yml"), "utf8");
  const workspacePagefindRunner = await readFile(join(repositoryRoot, "src", "scripts", "run-workspace-pagefind.mjs"), "utf8");
  const siteDevWrapper = await readFile(join(repositoryRoot, "src", "scripts", "site-dev.mjs"), "utf8");
  const renderedSiteCoordinator = await readFile(join(repositoryRoot, "src", "scripts", "check-rendered-site.ts"), "utf8");
  const focusedSeoValidator = await readFile(join(repositoryRoot, "src", "scripts", "check-site-seo.ts"), "utf8");
  const focusedDateValidator = await readFile(join(repositoryRoot, "src", "scripts", "check-rendered-video-dates.ts"), "utf8");

  assert.equal(
      packageJson.scripts["audit:site-content"],
      "node --import tsx src/scripts/audit-site-content.ts",
  );
  const generateSiteDataScript = packageJson.scripts["generate:site-data"] ?? "";
  assert.equal(
      generateSiteDataScript,
      "bun --env-file=site-build.properties run src/scripts/generate-site-data-bun.ts",
  );
  assert.equal(packageJson.scripts["generate:site-data:bun"], undefined);
  const syncVideoTopicsScript = packageJson.scripts["sync:video-topics"] ?? "";
  assert.equal(
      syncVideoTopicsScript,
      "bun run src/scripts/sync-video-topics-bun.ts",
  );
  assert.equal(packageJson.scripts["sync:video-topics:bun"], undefined);
  assert.equal(
      packageJson.scripts["check:video-topics"],
      "bun run src/scripts/check-video-topics-bun.ts",
  );
  assert.match(checkVideoTopicsSource, /runCheckVideoTopics/u);
  assert.match(checkVideoTopicsSource, /prepareParallelTopicNormalizationInputs/u);
  assert.match(generateSiteDataSource, /assertTopicStoreSynchronized/u);
  assert.doesNotMatch(generateSiteDataSource, /writeTopicStoreSynchronization/u);
  assert.match(generateSiteDataSource, /patternsSha256: topicPlan\.catalog\.sha256/u);
  assert.match(generateSiteDataSource, /patternsSourceSha256: topicPlan\.catalog\.sourceSha256/u);
  assert.ok(
      siteBuildWrapper.includes(`manifest?.schemaVersion !== ${siteArchiveSchemaVersion}`),
      "site build wrapper must validate the current split-archive manifest schema",
  );
  assert.ok(
      archiveAdapter.includes(`schemaVersion: ${siteArchiveSchemaVersion};`),
      "Astro archive adapter type must use the current split-archive manifest schema",
  );
  assert.ok(
      archiveAdapter.includes(`manifest.schemaVersion !== ${siteArchiveSchemaVersion}`),
      "Astro archive adapter validator must use the current split-archive manifest schema",
  );
  assert.match(siteBuildWrapper, /"src\/transcripts\/manifest\.json"/u);
  assert.match(siteBuildWrapper, /"src\/derived\/topic-normalization-patterns\.tsv"/u);
  assert.match(siteBuildWrapper, /"\.bun-version"/u);
  assert.match(siteBuildWrapper, /manifest\.source\.patternsSha256/u);
  assert.match(siteBuildWrapper, /manifest\.source\.patternsSourceSha256/u);
  const sourceValidationIndex = siteBuildWrapper.indexOf('runNpmScript("check:source")');
  const archiveGenerationIndex = siteBuildWrapper.indexOf("ensureSiteArchive(force)");
  assert.ok(sourceValidationIndex >= 0, "generated production builds must run check:source");
  assert.ok(
      sourceValidationIndex < archiveGenerationIndex,
      "source validation must run before archive generation and cache decisions",
  );
  assert.equal(
      siteBuildWrapper.match(/runNpmScript\("check:source"\)/gu)?.length,
      1,
      "the shared build wrapper must own one source-validation gate",
  );
  assert.match(siteBuildWrapper, /if \(sourceValidationExitCode !== 0\)/u);
  assert.match(
      siteBuildWrapper,
      /async function ensureBuiltSite\(\s*force,\s*buildConcurrency,\s*pagefindScript,\s*pagefindInputPaths,\s*\)\s*\{\s*const archiveValidation = await measureStage\(\s*"archive integrity validation \(site\)",\s*validateSiteArchive,\s*\);/u,
  );
  assert.match(siteBuildWrapper, /became stale before Astro\/Pagefind/u);
  assert.match(archiveAdapter, /readFileSync\(expectedPatternsInput\)/u);
  assert.match(archiveAdapter, /manifest\.source\.patternsSourceSha256 !== currentPatternsSourceSha256/u);
  assert.doesNotMatch(packageJson.scripts["site:check:generated"] ?? "", /generate:site-data/u);
  assert.doesNotMatch(packageJson.scripts["site:build:generated"] ?? "", /generate:site-data/u);
  assert.equal(
      packageJson.scripts["site:dev"],
      "node --env-file=site-build.properties src/scripts/site-dev.mjs",
  );
  assert.match(siteDevWrapper, /runNpmScript\("generate:site-data"\)/u);
  assert.match(siteDevWrapper, /\[astroCli, "dev", \.\.\.process\.argv\.slice\(2\)\]/u);
  assert.match(siteDevWrapper, /ASTRO_DEV_BACKGROUND: "0"/u);
  assert.equal(
      packageJson.scripts["check"],
      "npm test && npm run check:source && npm run site:check",
  );
  assert.equal(
      packageJson.scripts["check:source"],
      "npm run audit:topic-normalization && npm run check:video-topics && npm run audit:site-content && npm run check:site-content-wording -- --strict --summary-only",
  );
  assert.match(
      packageJson.scripts["check:source"] ?? "",
      /check:site-content-wording -- --strict --summary-only/u,
      "check:source must retain the actionable public-wording gate",
  );
  assert.doesNotMatch(
      packageJson.scripts["check:source"] ?? "",
      /report:video-topic-usage/u,
      "check:source must retain gates without generating the on-demand topic reports",
  );
  assert.equal(packageJson.scripts["check:quick"], undefined);
  assert.equal(packageJson.scripts["check:functional"], undefined);
  assert.equal(packageJson.scripts["check:generated"], undefined);
  const productionCheckScript = packageJson.scripts["check:production"] ?? "";
  const productionStages = [
    "npm run check:rendered-site",
    "npm run check:search-ranking",
  ];
  for (const stage of productionStages) {
    assert.equal(
        productionCheckScript.split(stage).length - 1,
        1,
        `check:production must run ${stage} exactly once`,
    );
  }
  for (let index = 1; index < productionStages.length; index += 1) {
    assert.ok(
        productionCheckScript.indexOf(productionStages[index - 1] ?? "")
        < productionCheckScript.indexOf(productionStages[index] ?? ""),
        "check:production stages must remain ordered",
    );
  }
  assert.doesNotMatch(
      productionCheckScript,
      /npm run (?:build|site:(?:check|build)(?::[^ ]+)?)\b/u,
      "check:production must validate existing output without compiling, generating, or building",
  );

  const ciCheckScript = packageJson.scripts["check:ci"] ?? "";
  const ciTestIndex = ciCheckScript.indexOf("npm test");
  const ciBuildIndex = ciCheckScript.indexOf("npm run site:build");
  const ciProductionIndex = ciCheckScript.indexOf("npm run check:production");
  assert.ok(
      ciTestIndex >= 0 && ciTestIndex < ciBuildIndex && ciBuildIndex < ciProductionIndex,
      "check:ci must test, build once, then validate the built production output",
  );
  assert.equal(
      ciCheckScript.match(/npm run site:build(?=\s|$)/gu)?.length,
      1,
      "check:ci must start exactly one site build",
  );
  assert.doesNotMatch(
      ciCheckScript,
      /npm run check(?=\s|$)/u,
      "check:ci must not run the site:check graph before its production build",
  );
  assert.equal(
      packageJson.scripts["site:build"],
      "node --env-file=site-build.properties src/scripts/site-build-if-changed.mjs --generate",
  );
  assert.equal(
      packageJson.scripts["site:build:workspace-pagefind"],
      "node --env-file=site-build.properties src/scripts/site-build-if-changed.mjs --generate --workspace-pagefind",
  );
  assert.equal(
      packageJson.scripts["check:site-seo"],
      "node --env-file=site-build.properties --import tsx src/scripts/check-site-seo.ts",
  );
  assert.equal(
      packageJson.scripts["check:rendered-site"],
      "node --env-file=site-build.properties --import tsx src/scripts/check-rendered-site.ts",
  );
  assert.equal(
      renderedSiteCoordinator.match(/readRenderedHtmlSiteSnapshot\(/gu)?.length,
      1,
      "the production coordinator must create one rendered HTML snapshot",
  );
  assert.match(renderedSiteCoordinator, /validateRenderedSeoSite\(siteValidationOptions, renderedHtml\)/u);
  assert.match(renderedSiteCoordinator, /validateRenderedVideoDates\([\s\S]+renderedHtml\)/u);
  for (const timedValidator of [renderedSiteCoordinator, focusedSeoValidator, focusedDateValidator]) {
    assert.match(timedValidator, /measureRunStage/u);
    assert.match(timedValidator, /printRunTime\(runStartedAt\)/u);
  }
  assert.match(renderedSiteCoordinator, /"rendered HTML snapshot"/u);
  assert.match(renderedSiteCoordinator, /"rendered SEO validation"/u);
  assert.match(renderedSiteCoordinator, /"rendered date and Pagefind validation"/u);
  assert.match(focusedSeoValidator, /"rendered HTML loading and SEO validation"/u);
  assert.match(focusedDateValidator, /"rendered HTML and Pagefind date validation"/u);
  assert.equal(
      packageJson.scripts["test"],
      "npm run check:types && node --import tsx --test \"src/**/*.test.ts\"",
  );
  assert.doesNotMatch(packageJson.scripts["test"] ?? "", /npm run (?:clean|build)\b/u);
  assert.equal(
      Object.keys(packageJson.scripts).filter((scriptName) => scriptName.endsWith(":built")).length,
      0,
      "source-owned package commands must not expose generated-output entry points",
  );
  assert.doesNotMatch(
      Object.values(packageJson.scripts).join("\n"),
      /\bdist\/scripts\//u,
      "package commands must reference canonical scripts under src rather than generated dist copies",
  );
  assert.equal(
      packageJson.scripts["check:workspace-pagefind"],
      "npm run site:build:workspace-pagefind && npm run check:pagefind-contract && npm run check:search-ranking && npm run check:rendered-video-dates",
  );
  assert.match(workspacePagefindRunner, /Workspace Pagefind prerequisite is unavailable/u);
  assert.match(workspacePagefindRunner, /portable official package/u);
  assert.match(workflow, /rmSync\('site\/src\/data\/generated\/archive'/u);
  assert.match(workflow, /run: npm run check:ci/u);
  assert.doesNotMatch(workflow, /run: npm run site:check\s*$/mu);
  assert.doesNotMatch(workflow, /run: npm run site:build\s*$/mu);
  assert.doesNotMatch(workflow, /run: npm run check:site-seo\s*$/mu);
});

test("canonical Bun maintenance commands reuse runtime-neutral implementations and report run time", async () => {
  const [
    packageJsonText,
    auditNode,
    auditBun,
    generateNode,
    generateBun,
    reportNode,
    reportBun,
    syncNode,
    syncBun,
    parallelPreparation,
  ] = await Promise.all([
    readFile(join(repositoryRoot, "package.json"), "utf8"),
    readFile(join(repositoryRoot, "src", "scripts", "audit-topic-normalization.ts"), "utf8"),
    readFile(join(repositoryRoot, "src", "scripts", "audit-topic-normalization-bun.ts"), "utf8"),
    readFile(join(repositoryRoot, "src", "scripts", "generate-site-data.ts"), "utf8"),
    readFile(join(repositoryRoot, "src", "scripts", "generate-site-data-bun.ts"), "utf8"),
    readFile(join(repositoryRoot, "src", "scripts", "report-video-topic-usage.ts"), "utf8"),
    readFile(join(repositoryRoot, "src", "scripts", "report-video-topic-usage-bun.ts"), "utf8"),
    readFile(join(repositoryRoot, "src", "scripts", "sync-video-topics.ts"), "utf8"),
    readFile(join(repositoryRoot, "src", "scripts", "sync-video-topics-bun.ts"), "utf8"),
    readFile(join(repositoryRoot, "src", "scripts", "bun-topic-normalization.ts"), "utf8"),
  ]);
  const packageJson = JSON.parse(packageJsonText) as {
    scripts: Record<string, string>;
  };

  assert.equal(packageJson.scripts["audit:topic-normalization"], "bun run src/scripts/audit-topic-normalization-bun.ts");
  assert.equal(packageJson.scripts["report:video-topic-usage"], "bun run src/scripts/report-video-topic-usage-bun.ts");
  for (const alias of [
    "audit:topic-normalization:bun",
    "report:video-topic-usage:bun",
    "sync:video-topics:bun",
    "generate:site-data:bun",
  ]) {
    assert.equal(packageJson.scripts[alias], undefined, `${alias} must be retired after Bun promotion`);
  }
  for (const source of [auditBun, generateBun, reportBun, syncBun]) {
    assert.match(source, /printRunTime\(runStartedAt\)/u);
    assert.doesNotMatch(source, /:bun/u);
  }
  for (const source of [auditNode, generateNode, reportNode, syncNode]) {
    assert.doesNotMatch(source, /isDirectExecution|process\.argv\.slice\(2\)/u);
  }
  for (const source of [auditBun, generateBun, syncBun]) {
    assert.match(source, /prepareParallelTopicNormalizationInputs/u);
    assert.match(source, /runtime=bun/u);
  }
  assert.match(parallelPreparation, /discoverVideoSegmentShardsWithBunWorkers/u);
  assert.match(parallelPreparation, /bun-topic-normalization-worker\.ts/u);
  assert.match(generateBun, /runGenerateSiteData/u);
  assert.match(syncBun, /runSyncVideoTopics/u);
  assert.match(auditBun, /executeTopicNormalizationAudit/u);
  assert.match(reportBun, /npm run report:video-topic-usage/u);
});

test("topic curation reports consume exact normalization audit findings outside the site build", async () => {
  const [packageJsonText, reportScript, bunReportScript] = await Promise.all([
    readFile(join(repositoryRoot, "package.json"), "utf8"),
    readFile(
        join(repositoryRoot, "src", "scripts", "report-video-topic-usage.ts"),
        "utf8",
    ),
    readFile(
        join(repositoryRoot, "src", "scripts", "report-video-topic-usage-bun.ts"),
        "utf8",
    ),
  ]);
  const packageJson = JSON.parse(packageJsonText) as {
    scripts: Record<string, string>;
  };

  assert.match(
      reportScript,
      /renderTopicNormalizationReviewReport\(normalizationAudit\.reviewFindings\)/u,
  );
  assert.match(reportScript, /reports\/topic-normalization-review\.tsv/u);
  assert.match(reportScript, /normalization_reviews=/u);
  assert.equal(
      packageJson.scripts["report:video-topic-usage"],
      "bun run src/scripts/report-video-topic-usage-bun.ts",
  );
  assert.equal(packageJson.scripts["report:video-topic-usage:bun"], undefined);
  assert.match(bunReportScript, /new Worker\(new URL\(import\.meta\.url\)/u);
  assert.match(bunReportScript, /Math\.min\(8, availableParallelism\(\)\)/u);
  assert.match(bunReportScript, /preloadedShardIndex: shardIndex/u);
  assert.match(bunReportScript, /buildParallelNameAnalysis\(topics, workerCount\)/u);
  assert.match(bunReportScript, /isDirectExecution\(import\.meta\.url\)/u);
  assert.match(bunReportScript, /printRunTime\(runStartedAt\)/u);
});

test("Astro dev does not watch generated production output", async () => {
  const astroConfig = await readFile(join(repositoryRoot, "astro.config.mjs"), "utf8");

  assert.match(astroConfig, /ignored:\s*\["\*\*\/site\/dist\/\*\*"\]/u);
});

test("GitHub Pages configures Chrome and Bun before running the one-pass CI graph", async () => {
  const [workflow, bunVersion] = await Promise.all([
    readFile(join(repositoryRoot, ".github", "workflows", "deploy-site.yml"), "utf8"),
    readFile(join(repositoryRoot, ".bun-version"), "utf8"),
  ]);

  assert.equal(bunVersion.trim(), "1.3.14");
  assert.match(workflow, /CHROME_PATH:\s*\/usr\/bin\/google-chrome/u);
  assert.match(workflow, /uses: oven-sh\/setup-bun@v2/u);
  assert.match(workflow, /bun-version: 1\.3\.14/u);
  assert.ok(
      workflow.indexOf("oven-sh/setup-bun@v2") < workflow.indexOf("npm run check:ci"),
      "GitHub Pages must install Bun before the canonical Bun-backed CI graph.",
  );
  assert.ok(
      workflow.indexOf("rmSync('site/src/data/generated/archive'") < workflow.indexOf("npm run check:ci"),
      "GitHub Pages must prove the absent-archive bootstrap before CI.",
  );
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void } {
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {promise, resolve: resolvePromise};
}
