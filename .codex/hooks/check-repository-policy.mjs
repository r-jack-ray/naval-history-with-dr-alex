import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function runGit(arguments_, captureOutput = false) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      "git",
      ["-c", `safe.directory=${repositoryRoot.replaceAll("\\", "/")}`, ...arguments_],
      {
        cwd: repositoryRoot,
        stdio: captureOutput ? ["ignore", "pipe", "inherit"] : "inherit",
      },
    );
    let stdout = "";
    if (captureOutput) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
    }
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        rejectPromise(new Error(`Git ${arguments_.join(" ")} ended with signal ${signal}.`));
        return;
      }
      if (code !== 0) {
        rejectPromise(new Error(`Git ${arguments_.join(" ")} failed with exit code ${code ?? 1}.`));
        return;
      }
      resolvePromise(stdout);
    });
  });
}

await runGit(["diff", "--check"]);
await runGit(["diff", "--cached", "--check"]);
const trackedChanges = await runGit(
  ["status", "--porcelain=v1", "--untracked-files=no"],
  true,
);
if (trackedChanges.trim().length > 0) {
  throw new Error([
    "Canonical CI commands changed tracked files:",
    trackedChanges.trimEnd(),
  ].join("\n"));
}
console.log("Repository policy passed: no whitespace errors or tracked worktree changes.");
