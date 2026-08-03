import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "..", "..");
const sourcePolicyHook = join(repositoryRoot, ".codex", "hooks", "check-repository-policy.mjs");
const archiveDirectory = join("site", "src", "data", "generated", "archive");
const archiveProbe = join(archiveDirectory, "index.json");
const archiveIgnoreRule = "/site/src/data/generated/archive/";

test("repository policy is clearly not applicable outside a Git checkout", async () => {
  const directory = await makePolicyDirectory();
  try {
    const result = await runNodePolicy(directory);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Repository policy not applicable:.*not a Git checkout root/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("repository policy rejects tracked generated archive files", async () => {
  const directory = await makeGitPolicyDirectory(archiveIgnoreRule, true);
  try {
    const result = await runNodePolicy(directory);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /deterministic archive files must not be tracked/u);
    assert.match(result.stderr, /site\/src\/data\/generated\/archive\/index\.json/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("repository policy requires the exact anchored archive ignore rule", async () => {
  const directory = await makeGitPolicyDirectory("/site/", false);
  try {
    const result = await runNodePolicy(directory);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /must be covered by/u);
    assert.match(result.stderr, /anchored \/site\/src\/data\/generated\/archive\//u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("repository policy accepts staged archive removals while preserving ignored working files", async () => {
  const directory = await makeGitPolicyDirectory(archiveIgnoreRule, true);
  try {
    await runGit(directory, ["rm", "--cached", "--quiet", "--", archiveProbe]);

    const result = await runNodePolicy(directory);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /generated archive is untracked and ignored/u);
    assert.equal(await readText(join(directory, archiveProbe)), "fixture\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function makePolicyDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "repository-policy-"));
  const hookDirectory = join(directory, ".codex", "hooks");
  await mkdir(hookDirectory, { recursive: true });
  await copyFile(sourcePolicyHook, join(hookDirectory, "check-repository-policy.mjs"));
  return directory;
}

async function makeGitPolicyDirectory(ignoreRule: string, trackArchive: boolean): Promise<string> {
  const directory = await makePolicyDirectory();
  await runGit(directory, ["init", "--quiet"]);
  await mkdir(join(directory, archiveDirectory), { recursive: true });
  await writeFile(join(directory, ".gitignore"), `${ignoreRule}\n`, "utf8");
  await writeFile(join(directory, archiveProbe), "fixture\n", "utf8");
  await runGit(directory, ["add", ".gitignore", ".codex/hooks/check-repository-policy.mjs"]);
  if (trackArchive) {
    await runGit(directory, ["add", "--force", archiveProbe]);
  }
  await runGit(directory, [
    "-c", "user.name=Repository Policy Test",
    "-c", "user.email=repository-policy@example.invalid",
    "commit", "--quiet", "-m", "fixture",
  ]);
  return directory;
}

async function readText(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return await readFile(path, "utf8");
}

async function runGit(directory: string, arguments_: readonly string[]): Promise<void> {
  const result = await runCommand(
    "git",
    ["-c", `safe.directory=${directory.replaceAll("\\", "/")}`, ...arguments_],
    directory,
  );
  assert.equal(result.code, 0, result.stderr);
}

async function runNodePolicy(directory: string): Promise<CommandResult> {
  return await runCommand(
    process.execPath,
    [join(directory, ".codex", "hooks", "check-repository-policy.mjs")],
    directory,
  );
}

interface CommandResult {
  code: number;
  stderr: string;
  stdout: string;
}

async function runCommand(
  command: string,
  arguments_: readonly string[],
  cwd: string,
): Promise<CommandResult> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        rejectPromise(new Error(`${command} ended with signal ${signal}.`));
        return;
      }
      resolvePromise({ code: code ?? 1, stderr, stdout });
    });
  });
}
