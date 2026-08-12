import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function formatRunTime(milliseconds: number): string {
  const wholeMilliseconds = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(wholeMilliseconds / 3_600_000);
  const minutes = Math.floor((wholeMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((wholeMilliseconds % 60_000) / 1_000);
  const remainder = wholeMilliseconds % 1_000;
  return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${remainder
      .toString()
      .padStart(3, "0")}`;
}

export function printRunTime(startedAt: number): void {
  console.log(`Run Time: ${formatRunTime(Date.now() - startedAt)}`);
}

export async function measureRunStage<T>(
    label: string,
    operation: () => Promise<T>,
    now: () => number = Date.now,
    log: (message: string) => void = console.log,
): Promise<T> {
  const startedAt = now();
  log(`Stage Start: ${label}`);
  try {
    return await operation();
  } finally {
    log(`Stage Time: ${label}: ${formatRunTime(now() - startedAt)}`);
  }
}

export function isDirectExecution(moduleUrl: string): boolean {
  const entryPath = process.argv[1];
  return entryPath !== undefined && pathToFileURL(resolve(entryPath)).href === moduleUrl;
}
