import type { ChannelInventoryCompleteness } from "../youtube/channel-video-links.js";

export function readValue(args: string[], index: number, name: string): string {
  const value = args[index];
  if (!value) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

export function readPositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

export function readInventoryCompleteness(value: string): ChannelInventoryCompleteness {
  if (value === "complete" || value === "partial" || value === "unknown") {
    return value;
  }

  throw new Error("--inventory-completeness must be complete, partial, or unknown.");
}
