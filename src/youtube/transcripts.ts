import { dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { Innertube } from "youtubei.js";

import { formatTimestamp } from "../index.js";
import { createRateLimitedFetch } from "./channel-video-links.js";

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  startSeconds: number;
  endSeconds: number;
  startTimeText: string;
  text: string;
  targetId?: string;
}

export interface VideoTranscript {
  videoId: string;
  source: "youtubei.js";
  fetchedAt: string;
  selectedLanguage?: string;
  availableLanguages: string[];
  segments: TranscriptSegment[];
}

export interface FetchVideoTranscriptOptions {
  videoId: string;
  requestDelayMs: number;
  language?: string;
  logger?: (message: string) => void;
}

export async function fetchVideoTranscript(options: FetchVideoTranscriptOptions): Promise<VideoTranscript> {
  const limitedFetchOptions = {
    delayMs: options.requestDelayMs,
    ...(options.logger ? { logger: options.logger } : {}),
  };
  const youtube = await Innertube.create({
    fetch: createRateLimitedFetch(limitedFetchOptions),
    generate_session_locally: true,
    retrieve_player: false,
  });

  options.logger?.(`Fetching video info for transcript: ${options.videoId}`);
  const info = await youtube.getBasicInfo(options.videoId);
  options.logger?.(`Fetching transcript panel: ${options.videoId}`);
  const transcriptInfo = await info.getTranscript();
  const selectedTranscript = options.language
    ? await transcriptInfo.selectLanguage(options.language)
    : transcriptInfo;

  return {
    videoId: options.videoId,
    source: "youtubei.js",
    fetchedAt: new Date().toISOString(),
    selectedLanguage: selectedTranscript.selectedLanguage,
    availableLanguages: [...selectedTranscript.languages],
    segments: extractTranscriptSegments(selectedTranscript),
  };
}

export function extractTranscriptSegments(transcriptInfo: unknown): TranscriptSegment[] {
  const segments = readPath(transcriptInfo, ["transcript", "content", "body", "initial_segments"]);
  if (!Array.isArray(segments)) {
    return [];
  }

  return segments
    .map((segment) => segmentRecord(segment))
    .filter((segment): segment is TranscriptSegment => segment !== undefined);
}

export async function writeTranscriptOutputs(
  transcript: VideoTranscript,
  outputs: {
    jsonOutput?: string;
    txtOutput?: string;
    tsvOutput?: string;
  },
): Promise<void> {
  const writes: Promise<void>[] = [];

  if (outputs.jsonOutput) {
    writes.push(writeTextFile(outputs.jsonOutput, `${JSON.stringify(transcript, null, 2)}\n`));
  }

  if (outputs.txtOutput) {
    writes.push(writeTextFile(outputs.txtOutput, transcriptToTxt(transcript)));
  }

  if (outputs.tsvOutput) {
    writes.push(writeTextFile(outputs.tsvOutput, transcriptToTsv(transcript)));
  }

  await Promise.all(writes);
}

export function transcriptToTxt(transcript: VideoTranscript): string {
  return `${transcript.segments
    .map((segment) => `[${segment.startTimeText}] ${segment.text}`)
    .join("\n")}\n`;
}

export function transcriptToTsv(transcript: VideoTranscript): string {
  const rows = [
    ["StartSeconds", "EndSeconds", "Start", "Text", "VideoUrl"],
    ...transcript.segments.map((segment) => [
      String(segment.startSeconds),
      String(segment.endSeconds),
      segment.startTimeText,
      segment.text,
      `https://youtu.be/${encodeURIComponent(transcript.videoId)}?t=${segment.startSeconds}`,
    ]),
  ];

  return `${rows.map((row) => row.map(tsvEscape).join("\t")).join("\n")}\n`;
}

function segmentRecord(segment: unknown): TranscriptSegment | undefined {
  const object = asRecord(segment);
  if (!object || object.type === "TranscriptSectionHeader") {
    return undefined;
  }

  const text = textValue(object.snippet);
  const startMs = integerValue(object.start_ms);
  const endMs = integerValue(object.end_ms);

  if (!text || startMs === undefined || endMs === undefined) {
    return undefined;
  }

  const startSeconds = Math.floor(startMs / 1000);
  const endSeconds = Math.ceil(endMs / 1000);
  const record: TranscriptSegment = {
    startMs,
    endMs,
    startSeconds,
    endSeconds,
    startTimeText: textValue(object.start_time_text) ?? formatTimestamp(startSeconds),
    text,
  };

  const targetId = readString(object, "target_id");
  if (targetId !== undefined) {
    record.targetId = targetId;
  }

  return record;
}

function integerValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?\d+$/u.test(value)) {
    return Number(value);
  }

  return undefined;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  const object = asRecord(value);
  if (!object) {
    return undefined;
  }

  const text = readString(object, "text");
  if (text) {
    return text.trim() || undefined;
  }

  const runs = object.runs;
  if (Array.isArray(runs)) {
    const combined = runs.map((run) => textValue(readPath(run, ["text"]))).filter(Boolean).join("");
    return combined.trim() || undefined;
  }

  return undefined;
}

async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function tsvEscape(value: string): string {
  return value.replace(/\r?\n/gu, " ").replace(/\t/gu, " ");
}

function readString(object: Record<string, unknown>, key: string): string | undefined {
  const value = object[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;

  for (const part of path) {
    const object = asRecord(current);
    if (!object) {
      return undefined;
    }

    current = object[part];
  }

  return current;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}
