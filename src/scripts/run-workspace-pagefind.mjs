// Run the optional sibling Pagefind binary for workspace-parity builds.
import {spawn} from "node:child_process";
import {access, constants} from "node:fs/promises";
import {dirname, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const binaryPath = resolve(
    repositoryRoot,
    "..",
    "pagefind",
    "target",
    "release",
    process.platform === "win32" ? "pagefind.exe" : "pagefind",
);

try {
  await access(binaryPath, process.platform === "win32" ? constants.F_OK : constants.X_OK);
} catch (error) {
  if (error?.code === "ENOENT") {
    throw new Error(
        `Workspace Pagefind prerequisite is unavailable at ${binaryPath}. ` +
        "Build the sibling Pagefind release binary, or use npm run site:build with the portable official package.",
    );
  }
  throw error;
}

const exitCode = await new Promise((resolvePromise, rejectPromise) => {
  const child = spawn(
      binaryPath,
      ["--site", "site/dist", "--glob", "**/index.html", ...process.argv.slice(2)],
      {
        cwd: repositoryRoot,
        stdio: "inherit"
      },
  );
  child.once("error", rejectPromise);
  child.once("exit", (code, signal) => {
    if (signal !== null) {
      rejectPromise(new Error(`Workspace Pagefind ended with signal ${signal}.`));
      return;
    }
    resolvePromise(code ?? 1);
  });
});

if (exitCode !== 0) {
  throw new Error(
      `Workspace Pagefind ${relative(repositoryRoot, binaryPath)} failed with exit code ${exitCode}.`,
  );
}
