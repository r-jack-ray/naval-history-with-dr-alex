import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const archiveDirectory = "site/src/data/generated/archive";
const archiveProbe = `${archiveDirectory}/index.json`;
const archiveIgnorePattern = `/${archiveDirectory}/`;

async function main() {
  const checkoutResult = await runGit(["rev-parse", "--show-toplevel"], {
    allowFailure: true,
    captureOutput: true,
  });
  if (
    checkoutResult.code !== 0 ||
    normalizeComparisonPath(checkoutResult.stdout.trim()) !== normalizeComparisonPath(repositoryRoot)
  ) {
    console.log("Repository policy not applicable: this source package is not a Git checkout root.");
    return;
  }

  const trackedArchiveResult = await runGit(
    ["ls-files", "--", archiveDirectory],
    { captureOutput: true },
  );
  const trackedArchivePaths = outputLines(trackedArchiveResult.stdout);
  if (trackedArchivePaths.length > 0) {
    throw new Error([
      "Generated archive policy failed: deterministic archive files must not be tracked:",
      ...trackedArchivePaths,
    ].join("\n"));
  }

  const ignoreResult = await runGit(
    ["check-ignore", "-v", "--no-index", "--", archiveProbe],
    { allowFailure: true, captureOutput: true },
  );
  if (!hasExpectedArchiveIgnoreRule(ignoreResult)) {
    const gitDetail = ignoreResult.stdout.trim() || ignoreResult.stderr.trim() || "the probe is not ignored";
    throw new Error([
      `Generated archive policy failed: ${archiveProbe} must be covered by`,
      `the anchored ${archiveIgnorePattern} rule in the root .gitignore.`,
      `Git reported: ${gitDetail}`,
    ].join("\n"));
  }

  await runGit(["diff", "--check"]);
  await runGit(["diff", "--cached", "--check"]);
  const trackedChangesResult = await runGit(
    ["status", "--porcelain=v1", "--untracked-files=no"],
    { captureOutput: true },
  );
  const unexpectedTrackedChanges = outputLines(trackedChangesResult.stdout)
    .filter((line) => !isExpectedArchiveIndexRemoval(line));
  if (unexpectedTrackedChanges.length > 0) {
    throw new Error([
      "Canonical CI commands changed tracked files:",
      ...unexpectedTrackedChanges,
    ].join("\n"));
  }
  console.log(
    "Repository policy passed: the generated archive is untracked and ignored, " +
    "with no whitespace errors or unexpected tracked worktree changes.",
  );
}

async function runGit(arguments_, { allowFailure = false, captureOutput = false } = {}) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      "git",
      ["-c", `safe.directory=${repositoryRoot.replaceAll("\\", "/")}`, ...arguments_],
      {
        cwd: repositoryRoot,
        stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
      },
    );
    let stdout = "";
    let stderr = "";
    if (captureOutput) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => { stderr += chunk; });
    }
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        rejectPromise(new Error(`Git ${arguments_.join(" ")} ended with signal ${signal}.`));
        return;
      }
      const exitCode = code ?? 1;
      if (exitCode !== 0 && !allowFailure) {
        const detail = stderr.trim();
        rejectPromise(new Error(
          `Git ${arguments_.join(" ")} failed with exit code ${exitCode}.` +
          (detail.length > 0 ? `\n${detail}` : ""),
        ));
        return;
      }
      resolvePromise({ code: exitCode, stderr, stdout });
    });
  });
}

function hasExpectedArchiveIgnoreRule(result) {
  if (result.code !== 0) {
    return false;
  }
  const repositoryGitignore = `${repositoryRoot.replaceAll("\\", "/")}/.gitignore`;
  return outputLines(result.stdout).some((line) => {
    const separatorIndex = line.indexOf("\t");
    if (separatorIndex < 0) {
      return false;
    }
    const metadata = line.slice(0, separatorIndex);
    const ignoredPath = line.slice(separatorIndex + 1).replaceAll("\\", "/");
    const metadataMatch = /^(.*):(\d+):([^\t]+)$/u.exec(metadata);
    if (metadataMatch === null) {
      return false;
    }
    const source = metadataMatch[1]?.replaceAll("\\", "/");
    const pattern = metadataMatch[3];
    return (
      (source === ".gitignore" || source === repositoryGitignore) &&
      pattern === archiveIgnorePattern &&
      ignoredPath === archiveProbe
    );
  });
}

function isExpectedArchiveIndexRemoval(line) {
  return line.replaceAll("\\", "/").startsWith(`D  ${archiveDirectory}/`);
}

function normalizeComparisonPath(path) {
  const normalized = resolve(path).replaceAll("\\", "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function outputLines(output) {
  return output.split(/\r?\n/u).filter((line) => line.length > 0);
}

await main();
