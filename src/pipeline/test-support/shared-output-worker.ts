import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { writeTextAtomically } from "../atomic-write.js";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const activePath = join(options.root, "active-writer.txt");
  const enteredPath = join(options.root, `entered-${options.id}.txt`);

  if (existsSync(activePath)) {
    throw new Error(`Writer ${options.id} entered an already-active critical section.`);
  }

  await writeFile(activePath, options.id, "utf8");
  try {
    await writeFile(enteredPath, options.id, "utf8");
    if (options.waitFor !== undefined) {
      await waitForFile(options.waitFor);
    }

    const payload = options.id.repeat(4096);
    await writeTextAtomically(join(options.root, "report.md"), `# report ${options.id}\n${payload}\n`);
    await writeTextAtomically(join(options.root, "archive.json"), `${JSON.stringify({ writer: options.id, payload })}\n`);

    const logPath = join(options.root, "processing.log");
    const existing = await readOptionalText(logPath);
    await writeTextAtomically(
      logPath,
      `${existing}2026-07-09T16:05:25-05:00\tsrc/transcripts/txt/${options.id}.txt\t${options.id}\tcurated 1 segment\tyes\tworker ${options.id}\n`,
    );
  } finally {
    await rm(activePath, { force: true });
  }
}

function parseArgs(args: string[]): { root: string; id: string; waitFor?: string } {
  let root: string | undefined;
  let id: string | undefined;
  let waitFor: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case "--root":
        root = readValue(args, ++index, argument);
        break;
      case "--id":
        id = readValue(args, ++index, argument);
        break;
      case "--wait-for":
        waitFor = readValue(args, ++index, argument);
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (root === undefined || id === undefined) {
    throw new Error("--root and --id are required.");
  }

  return { root, id, ...(waitFor === undefined ? {} : { waitFor }) };
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (value === undefined) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

async function readOptionalText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return "";
    }
    throw error;
  }
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

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
