import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function replaceFileAtomically(
  destination: string,
  writeTemporary: (temporaryPath: string) => Promise<void>,
): Promise<void> {
  const directory = dirname(destination);
  const temporaryPath = join(directory, `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`);

  await mkdir(directory, { recursive: true });
  try {
    await writeTemporary(temporaryPath);
    await renameWithRetry(temporaryPath, destination);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function writeTextAtomically(destination: string, text: string): Promise<void> {
  await replaceFileAtomically(destination, async (temporaryPath) => {
    await writeFile(temporaryPath, text, "utf8");
  });
}

async function renameWithRetry(source: string, destination: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      lastError = error;
      if (errorCode(error) !== "EPERM" && errorCode(error) !== "EBUSY") {
        throw error;
      }
      await sleep((attempt + 1) * 50);
    }
  }

  throw lastError;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
