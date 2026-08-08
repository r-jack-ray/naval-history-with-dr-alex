// Start Astro development after generating the archive.
import {spawn} from "node:child_process";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const astroCli = resolve(repositoryRoot, "node_modules/astro/bin/astro.mjs");

const generationExitCode = await runNpmScript("generate:site-data");
if (generationExitCode !== 0) {
  process.exitCode = generationExitCode;
} else {
  process.exitCode = await runCommand(
      process.execPath,
      [astroCli, "dev", ...process.argv.slice(2)],
      {
        // Astro auto-backgrounds inside detected agent environments and abandons
        // large archives after a fixed 30-second readiness window. Presence of
        // this variable keeps the normal foreground server path.
        env: {
          ...process.env,
          ASTRO_DEV_BACKGROUND: "0"
        },
      },
  );
}

async function runNpmScript(scriptName) {
  const npmCommand = process.platform === "win32"
      ? `"${resolve(dirname(process.execPath), "npm.cmd")}"`
      : "npm";
  return await runCommand(`${npmCommand} run ${scriptName}`, [], {shell: true});
}

async function runCommand(command, arguments_, options = {}) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit",
      ...options,
    });
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        console.error(`Site development command ended with signal ${signal}.`);
        resolvePromise(1);
        return;
      }
      resolvePromise(code ?? 1);
    });
  });
}
