import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { siteArchiveSchemaVersion } from "../site/archive-data.js";
import { replaceFileAtomically } from "./atomic-write.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "..", "..");
const lockTool = join(repositoryRoot, "src", "scripts", "site-content-pipeline-lock.mjs");
const worker = join(currentDirectory, "test-support", "shared-output-worker.js");

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
    await rm(directory, { recursive: true, force: true });
  }
});

test("Phase 2 commands keep topic writes explicit and avoid duplicate site pipelines", async () => {
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const contentValidator = await readFile(join(repositoryRoot, "src", "scripts", "validate-content-pipeline.ts"), "utf8");
  const siteValidator = await readFile(join(repositoryRoot, "src", "scripts", "validate-site.ts"), "utf8");
  const validationWorkflow = await readFile(join(repositoryRoot, "src", "scripts", "validation-workflow.ts"), "utf8");
  const siteBuildWrapper = await readFile(join(repositoryRoot, "src", "scripts", "site-build-if-changed.mjs"), "utf8");
  const archiveAdapter = await readFile(join(repositoryRoot, "site", "src", "data", "archive.ts"), "utf8");
  const generateSiteDataSource = await readFile(join(repositoryRoot, "src", "scripts", "generate-site-data.ts"), "utf8");
  const checkVideoTopicsSource = await readFile(join(repositoryRoot, "src", "scripts", "check-video-topics-bun.ts"), "utf8");
  const workflow = await readFile(join(repositoryRoot, ".github", "workflows", "deploy-site.yml"), "utf8");
  const workspacePagefindRunner = await readFile(join(repositoryRoot, "src", "scripts", "run-workspace-pagefind.mjs"), "utf8");
  const siteDevWrapper = await readFile(join(repositoryRoot, "src", "scripts", "site-dev.mjs"), "utf8");

  assert.match(
    contentValidator,
    /args:\s*\["run", "audit:topic-normalization", "--", "--patterns-input", topicPatternsPath\]/u,
  );
  assert.match(
    contentValidator,
    /args:\s*\["run", "generate:site-data", "--", "--patterns-input", topicPatternsPath\]/u,
  );
  assert.match(siteValidator, /args: \["run", "generate:site-data"\]/u);
  assert.doesNotMatch(contentValidator, /dist\/scripts\/(audit-topic-normalization|generate-site-data)\.js/u);
  assert.doesNotMatch(siteValidator, /dist\/scripts\/generate-site-data\.js/u);
  assert.match(contentValidator, /dist\/scripts\/audit-site-content\.js/u);
  assert.match(contentValidator, /site:check:generated/u);
  assert.match(contentValidator, /src\/derived\/topic-normalization-patterns\.tsv/u);
  assert.match(contentValidator, /retainCallerLease: true/u);
  assert.match(validationWorkflow, /config\.options\.retainCallerLease && callerProvidedLock/u);
  assert.match(validationWorkflow, /CONTENT_PIPELINE_LOCK_TOKEN/u);
  assert.match(siteValidator, /site:check:generated/u);
  assert.match(siteValidator, /site:build:generated/u);
  const generateSiteDataScript = packageJson.scripts["generate:site-data"] ?? "";
  assert.equal(
    generateSiteDataScript,
    "node --env-file=site-build.properties src/scripts/site-content-pipeline-lock.mjs run --purpose site-archive-generation --recover-stale -- bun run src/scripts/generate-site-data-bun.ts",
  );
  assert.equal(packageJson.scripts["generate:site-data:bun"], undefined);
  const syncVideoTopicsScript = packageJson.scripts["sync:video-topics"] ?? "";
  assert.equal(
    syncVideoTopicsScript,
    "node src/scripts/site-content-pipeline-lock.mjs run --purpose video-topic-sync --recover-stale -- bun run src/scripts/sync-video-topics-bun.ts",
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
  assert.equal(packageJson.scripts["check:quick"], undefined);
  assert.equal(packageJson.scripts["check:functional"], undefined);
  assert.equal(packageJson.scripts["check:generated"], undefined);
  const productionCheckScript = packageJson.scripts["check:production"] ?? "";
  const productionStages = [
    "npm run check:site-seo:built",
    "npm run check:search-ranking",
    "npm run check:rendered-video-dates",
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
    "npm run build && npm run check:site-seo:built",
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

test("two overlapping writer processes serialize complete archive, report, and log output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "site-content-writer-"));
  const lockPath = join(directory, "writer.lock");
  const releaseFirst = join(directory, "release-first.txt");

  try {
    const first = runNode([
      lockTool,
      "run",
      "--lock-path",
      lockPath,
      "--wait-ms",
      "5000",
      "--purpose",
      "parallel-writer-test",
      "--",
      "node",
      worker,
      "--root",
      directory,
      "--id",
      "first",
      "--wait-for",
      releaseFirst,
    ]);
    await waitForFile(join(directory, "entered-first.txt"));

    const second = runNode([
      lockTool,
      "run",
      "--lock-path",
      lockPath,
      "--wait-ms",
      "5000",
      "--purpose",
      "parallel-writer-test",
      "--",
      "node",
      worker,
      "--root",
      directory,
      "--id",
      "second",
    ]);

    await writeFile(releaseFirst, "release", "utf8");
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(firstResult.code, 0, firstResult.stderr);
    assert.equal(secondResult.code, 0, secondResult.stderr);

    const archive = JSON.parse(await readFile(join(directory, "archive.json"), "utf8")) as { writer: string; payload: string };
    assert.equal(archive.writer, "second");
    assert.equal(archive.payload, "second".repeat(4096));
    assert.equal(await readFile(join(directory, "report.md"), "utf8"), `# report second\n${"second".repeat(4096)}\n`);

    const rows = (await readFile(join(directory, "processing.log"), "utf8"))
      .trim()
      .split("\n");
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.split("\t").length), [6, 6]);
    assert.match(rows[0] ?? "", /\tfirst\t/u);
    assert.match(rows[1] ?? "", /\tsecond\t/u);
    assert.equal(existsSync(lockPath), false);
    assert.equal(existsSync(join(directory, "active-writer.txt")), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("lock-aware log appends and stale recovery preserve diagnostics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "site-content-lease-"));
  const lockPath = join(directory, "writer.lock");
  const logPath = join(directory, "processing.log");

  try {
    const firstAppend = runNode([
      lockTool,
      "append-log",
      "--lock-path",
      lockPath,
      "--processing-log",
      logPath,
      "--wait-ms",
      "5000",
      "--processed-at",
      "2026-07-09T16:05:25-05:00",
      "--source-path",
      "src/transcripts/txt/first.txt",
      "--video-id",
      "first",
      "--action",
      "curated 1 segment",
      "--needs-further-processing",
      "yes",
      "--determination",
      "first writer",
    ]);
    const secondAppend = runNode([
      lockTool,
      "append-log",
      "--lock-path",
      lockPath,
      "--processing-log",
      logPath,
      "--wait-ms",
      "5000",
      "--processed-at",
      "2026-07-09T16:05:26-05:00",
      "--source-path",
      "src/transcripts/txt/second.txt",
      "--video-id",
      "second",
      "--action",
      "curated 1 segment",
      "--needs-further-processing",
      "yes",
      "--determination",
      "second writer",
    ]);
    const [firstResult, secondResult] = await Promise.all([firstAppend, secondAppend]);
    assert.equal(firstResult.code, 0, firstResult.stderr);
    assert.equal(secondResult.code, 0, secondResult.stderr);

    const rows = (await readFile(logPath, "utf8")).trim().split("\n");
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.split("\t").length), [6, 6]);

    await mkdir(lockPath, { recursive: true });
    await writeFile(join(lockPath, "owner.json"), JSON.stringify({
      schemaVersion: 1,
      token: "stale-token",
      owner: "interrupted-worker",
      purpose: "test",
      acquiredAt: "2026-07-09T00:00:00.000Z",
      renewedAt: "2026-07-09T00:00:00.000Z",
      expiresAt: "2026-07-09T00:01:00.000Z",
    }), "utf8");

    const recovered = await runNode([
      lockTool,
      "acquire",
      "--lock-path",
      lockPath,
      "--wait-ms",
      "0",
      "--recover-stale",
    ]);
    assert.equal(recovered.code, 0, recovered.stderr);
    const acquired = JSON.parse(recovered.stdout) as { lease: { token: string }; recoveredStaleLock?: { quarantinePath: string } };
    assert.ok(acquired.recoveredStaleLock?.quarantinePath);
    assert.equal(existsSync(acquired.recoveredStaleLock?.quarantinePath ?? ""), true);

    const released = await runNode([
      lockTool,
      "release",
      "--lock-path",
      lockPath,
      "--token",
      acquired.lease.token,
    ]);
    assert.equal(released.code, 0, released.stderr);
    assert.equal(existsSync(lockPath), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("one-shot writer commands recover a stale lease and preserve its diagnostics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "site-content-stale-run-"));
  const lockPath = join(directory, "writer.lock");
  const markerPath = join(directory, "ran.txt");

  try {
    await mkdir(lockPath, { recursive: true });
    await writeFile(join(lockPath, "owner.json"), JSON.stringify({
      schemaVersion: 1,
      token: "stale-run-token",
      owner: "interrupted-worker",
      purpose: "test",
      acquiredAt: "2026-07-09T00:00:00.000Z",
      renewedAt: "2026-07-09T00:00:00.000Z",
      expiresAt: "2026-07-09T00:01:00.000Z",
    }), "utf8");

    const recovered = await runNode([
      lockTool,
      "run",
      "--lock-path",
      lockPath,
      "--wait-ms",
      "0",
      "--recover-stale",
      "--",
      "node",
      "-e",
      `require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'ran')`,
    ]);
    assert.equal(recovered.code, 0, recovered.stderr);
    assert.equal(await readFile(markerPath, "utf8"), "ran");
    assert.equal(existsSync(lockPath), false);

    const quarantined = (await readdir(directory)).filter((entry) => entry.startsWith("writer.lock.stale-"));
    assert.equal(quarantined.length, 1);
    const previousLease = JSON.parse(
      await readFile(join(directory, quarantined[0] ?? "", "owner.json"), "utf8"),
    ) as { token: string };
    assert.equal(previousLease.token, "stale-run-token");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("schedule queue commands are not part of the writer lease utility", async () => {
  for (const command of ["schedule-claim", "schedule-complete", "schedule-reset"]) {
    const result = await runNode([lockTool, command]);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, new RegExp(`Unknown content-pipeline lock command: ${command}`, "u"));
  }
});

test("nested pipeline commands join an exported lease token without releasing it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "site-content-nested-"));
  const lockPath = join(directory, "writer.lock");
  const markerPath = join(directory, "nested-ran.txt");

  try {
    const acquiredResult = await runNode([
      lockTool,
      "acquire",
      "--lock-path",
      lockPath,
      "--wait-ms",
      "0",
    ]);
    assert.equal(acquiredResult.code, 0, acquiredResult.stderr);
    const acquired = JSON.parse(acquiredResult.stdout) as { lease: { token: string } };

    const nested = await runNode(
      [
        lockTool,
        "run",
        "--lock-path",
        lockPath,
        "--",
        "node",
        "-e",
        `require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'joined')`,
      ],
      { CONTENT_PIPELINE_LOCK_TOKEN: acquired.lease.token },
    );
    assert.equal(nested.code, 0, nested.stderr);
    assert.equal(await readFile(markerPath, "utf8"), "joined");

    const statusResult = await runNode([lockTool, "status", "--lock-path", lockPath]);
    assert.equal(statusResult.code, 0, statusResult.stderr);
    const status = JSON.parse(statusResult.stdout) as { status: string; lease?: { token: string } };
    assert.equal(status.status, "active");
    assert.equal(status.lease?.token, acquired.lease.token);

    const released = await runNode([
      lockTool,
      "release",
      "--lock-path",
      lockPath,
      "--token",
      acquired.lease.token,
    ]);
    assert.equal(released.code, 0, released.stderr);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function runNode(
  args: string[],
  environment?: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("node", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: environment === undefined ? process.env : { ...process.env, ...environment },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${path}.`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void } {
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}
