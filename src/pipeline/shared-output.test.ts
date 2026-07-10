import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { replaceFileAtomically } from "./atomic-write.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "..", "..");
const lockTool = join(repositoryRoot, ".codex", "hooks", "site-content-pipeline-lock.mjs");
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

test("validation hooks generate the archive once before their generated-data checks", async () => {
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const contentHook = await readFile(join(repositoryRoot, ".codex", "hooks", "validate-content-pipeline.ps1"), "utf8");
  const siteHook = await readFile(join(repositoryRoot, ".codex", "hooks", "validate-site.ps1"), "utf8");

  assert.equal((contentHook.match(/dist\/scripts\/generate-site-data\.js/gu) ?? []).length, 1);
  assert.equal((siteHook.match(/dist\/scripts\/generate-site-data\.js/gu) ?? []).length, 1);
  assert.match(contentHook, /site:check:generated/u);
  assert.match(contentHook, /\[switch\]\$RetainCallerLease/u);
  assert.match(contentHook, /\$retainActiveLock = \$RetainCallerLease -and \$callerProvidedLock/u);
  assert.match(siteHook, /site:check:generated/u);
  assert.match(siteHook, /site:build:generated/u);
  assert.doesNotMatch(packageJson.scripts["site:check:generated"] ?? "", /generate:site-data/u);
  assert.doesNotMatch(packageJson.scripts["site:build:generated"] ?? "", /generate:site-data/u);
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

test("schedule claims resume after interruption and complete or reset exactly one row", async () => {
  const directory = await mkdtemp(join(tmpdir(), "site-content-schedule-"));
  const lockPath = join(directory, "writer.lock");
  const schedulePath = join(directory, "schedule.md");
  const logPath = join(directory, "processing.log");
  const videoSegmentsDirectory = join(directory, "video-segments");
  const firstSource = "src/transcripts/txt/first.txt";
  const secondSource = "src/transcripts/txt/second.txt";

  try {
    await writeFile(
      schedulePath,
      `# Schedule\r\n\r\nTimestamp: 2020-01-01T00:00:00Z\r\n\r\n- [ ] ${firstSource} | first | First\r\n- [ ] ${secondSource} | second | Second\r\n`,
      "utf8",
    );
    const firstAcquire = await runNode([
      lockTool,
      "acquire",
      "--lock-path",
      lockPath,
      "--wait-ms",
      "0",
    ]);
    assert.equal(firstAcquire.code, 0, firstAcquire.stderr);
    const firstLease = JSON.parse(firstAcquire.stdout) as { lease: { token: string } };

    const firstClaim = await runNode([
      lockTool,
      "schedule-claim",
      "--lock-path",
      lockPath,
      "--schedule-path",
      schedulePath,
      "--token",
      firstLease.lease.token,
    ]);
    assert.equal(firstClaim.code, 0, firstClaim.stderr);
    const claimed = JSON.parse(firstClaim.stdout) as {
      claimed: boolean;
      resumed: boolean;
      sourcePath: string;
      videoId: string;
      state: string;
    };
    assert.equal(claimed.claimed, true);
    assert.equal(claimed.resumed, false);
    assert.equal(claimed.sourcePath, firstSource);
    assert.equal(claimed.videoId, "first");
    assert.equal(claimed.state, "~");
    assert.match(await readFile(schedulePath, "utf8"), /- \[~\] src\/transcripts\/txt\/first\.txt/u);

    const owner = JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")) as {
      expiresAt: string;
    };
    owner.expiresAt = "2000-01-01T00:00:00.000Z";
    await writeFile(join(lockPath, "owner.json"), `${JSON.stringify(owner, null, 2)}\n`, "utf8");

    const expiredRenew = await runNode([
      lockTool,
      "renew",
      "--lock-path",
      lockPath,
      "--token",
      firstLease.lease.token,
    ]);
    assert.notEqual(expiredRenew.code, 0);
    assert.match(expiredRenew.stderr, /lease has expired/u);

    const expiredAppend = await runNode([
      lockTool,
      "append-log",
      "--lock-path",
      lockPath,
      "--processing-log",
      logPath,
      "--token",
      firstLease.lease.token,
      "--processed-at",
      "2026-07-09T16:05:25-05:00",
      "--source-path",
      firstSource,
      "--video-id",
      "first",
      "--action",
      "curated 1 segment",
      "--needs-further-processing",
      "no",
      "--determination",
      "expired writer",
    ]);
    assert.notEqual(expiredAppend.code, 0);
    assert.match(expiredAppend.stderr, /lease has expired/u);
    assert.equal(existsSync(logPath), false);

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
    const recoveredLease = JSON.parse(recovered.stdout) as { lease: { token: string } };

    const resumedClaim = await runNode([
      lockTool,
      "schedule-claim",
      "--lock-path",
      lockPath,
      "--schedule-path",
      schedulePath,
      "--token",
      recoveredLease.lease.token,
    ]);
    assert.equal(resumedClaim.code, 0, resumedClaim.stderr);
    const resumed = JSON.parse(resumedClaim.stdout) as {
      resumed: boolean;
      sourcePath: string;
      videoId: string;
    };
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.sourcePath, firstSource);
    assert.equal(resumed.videoId, "first");

    const completionArguments = [
      lockTool,
      "schedule-complete",
      "--lock-path",
      lockPath,
      "--schedule-path",
      schedulePath,
      "--processing-log",
      logPath,
      "--video-segments-dir",
      videoSegmentsDirectory,
      "--source-path",
      firstSource,
      "--token",
      recoveredLease.lease.token,
    ];
    const missingShard = await runNode(completionArguments);
    assert.notEqual(missingShard.code, 0);
    assert.match(missingShard.stderr, /shard required for schedule completion is missing/u);
    assert.match(await readFile(schedulePath, "utf8"), /- \[~\] src\/transcripts\/txt\/first\.txt/u);

    await mkdir(videoSegmentsDirectory, { recursive: true });
    await writeFile(join(videoSegmentsDirectory, "video-first.json"), "{}\n", "utf8");
    const missingLog = await runNode(completionArguments);
    assert.notEqual(missingLog.code, 0);
    assert.match(missingLog.stderr, /requires a processing-log row/u);

    const claimMtime = (await stat(schedulePath)).mtimeMs;
    const staleProcessedAt = new Date(claimMtime - 5_000).toISOString();
    await writeFile(
      logPath,
      `${staleProcessedAt}\t${firstSource}\tfirst\tcurated 1 segment\tno\tstale pre-claim row\n`,
      "utf8",
    );
    const staleLog = await runNode(completionArguments);
    assert.notEqual(staleLog.code, 0);
    assert.match(staleLog.stderr, /requires a processing-log row/u);

    const freshProcessedAt = new Date(claimMtime + 1_000).toISOString();
    await writeFile(
      logPath,
      `${staleProcessedAt}\t${firstSource}\tfirst\tcurated 1 segment\tno\tstale pre-claim row\n` +
      `${freshProcessedAt}\t${firstSource}\tfirst\tcurated 1 segment\tno\tfresh claimed-row output\n`,
      "utf8",
    );
    const completed = await runNode(completionArguments);
    assert.equal(completed.code, 0, completed.stderr);
    assert.match(await readFile(schedulePath, "utf8"), /- \[x\] src\/transcripts\/txt\/first\.txt/u);

    const secondClaim = await runNode([
      lockTool,
      "schedule-claim",
      "--lock-path",
      lockPath,
      "--schedule-path",
      schedulePath,
      "--token",
      recoveredLease.lease.token,
    ]);
    assert.equal(secondClaim.code, 0, secondClaim.stderr);
    assert.equal((JSON.parse(secondClaim.stdout) as { sourcePath: string }).sourcePath, secondSource);

    await rm(videoSegmentsDirectory, { recursive: true, force: true });
    await rm(logPath, { force: true });

    const reset = await runNode([
      lockTool,
      "schedule-reset",
      "--lock-path",
      lockPath,
      "--schedule-path",
      schedulePath,
      "--source-path",
      secondSource,
      "--token",
      recoveredLease.lease.token,
    ]);
    assert.equal(reset.code, 0, reset.stderr);
    assert.equal(
      await readFile(schedulePath, "utf8"),
      `# Schedule\r\n\r\nTimestamp: 2020-01-01T00:00:00Z\r\n\r\n- [x] ${firstSource} | first | First\r\n- [ ] ${secondSource} | second | Second\r\n`,
    );

    const released = await runNode([
      lockTool,
      "release",
      "--lock-path",
      lockPath,
      "--token",
      recoveredLease.lease.token,
    ]);
    assert.equal(released.code, 0, released.stderr);
  } finally {
    await rm(directory, { recursive: true, force: true });
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
