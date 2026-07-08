import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { fetchTranscript as fetchTranscriptPlus } from "youtube-transcript-plus";
import type {
  FetchParams as TranscriptPlusFetchParams,
  TranscriptConfig as TranscriptPlusConfig,
  TranscriptResult as TranscriptPlusResult,
  TranscriptSegment as TranscriptPlusSegment,
} from "youtube-transcript-plus";

import { formatTimestamp } from "../index.js";
import { videoFileStem } from "../naming.js";
import { createRateLimitedFetch, fetchInitWithRequestLabel } from "./channel-video-links.js";

type FetchHeaders = NonNullable<NonNullable<Parameters<typeof fetch>[1]>["headers"]>;
type FetchResponseHeaders = Awaited<ReturnType<typeof fetch>>["headers"];

const youtubeUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
export const defaultTranscriptStorageRoot = "src/transcripts";

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
  videoTitle?: string;
  videoPublishedAt?: string;
  source: "youtube-transcript-plus" | "watch-page-captions";
  fetchedAt: string;
  selectedLanguage?: string;
  availableLanguages: string[];
  segments: TranscriptSegment[];
}

export interface TranscriptStoragePaths {
  root: string;
  jsonOutput: string;
  txtOutput: string;
  tsvOutput: string;
  manifestOutput: string;
}

export interface TranscriptManifest {
  schemaVersion: 1;
  updatedAt: string;
  storage: {
    json: "json/{fileStem}.json";
    txt: "txt/{fileStem}.txt";
    tsv: "tsv/{fileStem}.tsv";
  };
  transcripts: TranscriptManifestRecord[];
}

export interface TranscriptManifestRecord {
  videoId: string;
  videoTitle?: string;
  videoPublishedAt?: string;
  fileStem: string;
  source: VideoTranscript["source"];
  fetchedAt: string;
  selectedLanguage?: string;
  availableLanguages: string[];
  segmentCount: number;
  firstStartSeconds?: number;
  lastEndSeconds?: number;
  paths: {
    json: string;
    txt: string;
    tsv: string;
  };
}

export interface StoredTranscriptRecord {
  record: TranscriptManifestRecord;
  paths: TranscriptStoragePaths;
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
  const limitedFetch = createRateLimitedFetch(limitedFetchOptions);

  try {
    return await fetchVideoTranscriptWithPlus(options, limitedFetch);
  } catch (error) {
    options.logger?.(`youtube-transcript-plus failed: ${errorMessage(error)}. Trying watch-page caption fallback.`);
  }

  const watchPageTranscript = await fetchWatchPageTranscript({
    videoId: options.videoId,
    language: options.language,
    fetch: limitedFetch,
    logger: options.logger,
  });
  if (watchPageTranscript) {
    return watchPageTranscript;
  }

  throw new Error(`No caption tracks found for video: ${options.videoId}.`);
}

async function fetchVideoTranscriptWithPlus(
  options: FetchVideoTranscriptOptions,
  limitedFetch: typeof fetch,
): Promise<VideoTranscript> {
  const config: TranscriptPlusConfig & { videoDetails: true } = {
    retries: 0,
    userAgent: youtubeUserAgent,
    videoDetails: true,
    videoFetch: (params: TranscriptPlusFetchParams) => transcriptPlusFetch(params, limitedFetch, "video page"),
    playerFetch: (params: TranscriptPlusFetchParams) => transcriptPlusFetch(params, limitedFetch, "player metadata"),
    transcriptFetch: (params: TranscriptPlusFetchParams) => transcriptPlusFetch(params, limitedFetch, "transcript data"),
  };

  if (options.language !== undefined) {
    config.lang = options.language;
  }

  options.logger?.(`Fetching transcript with youtube-transcript-plus: ${options.videoId}`);
  const result = await fetchTranscriptPlus(options.videoId, config);

  return transcriptPlusResultToVideoTranscript(options.videoId, result);
}

function transcriptPlusResultToVideoTranscript(
  videoId: string,
  result: TranscriptPlusResult,
): VideoTranscript {
  const segments: TranscriptPlusSegment[] = result.segments;
  if (segments.length === 0) {
    throw new Error(`Transcript contained no segments: ${videoId}.`);
  }

  const languages = [
    ...new Set(segments.map((segment) => segment.lang).filter((lang): lang is string => Boolean(lang))),
  ];

  return {
    videoId: result.videoDetails.videoId || videoId,
    videoTitle: result.videoDetails.title,
    source: "youtube-transcript-plus",
    fetchedAt: new Date().toISOString(),
    selectedLanguage: languages[0] ?? "unknown",
    availableLanguages: languages,
    segments: segments
      .map((segment) => transcriptPlusSegmentToTranscriptSegment(segment))
      .filter((segment): segment is TranscriptSegment => segment !== undefined),
  };
}

function transcriptPlusSegmentToTranscriptSegment(segment: TranscriptPlusSegment): TranscriptSegment | undefined {
  const text = cleanCaptionText(segment.text);
  if (!text) {
    return undefined;
  }

  const startMs = Math.round(segment.offset * 1000);
  const endMs = Math.round((segment.offset + segment.duration) * 1000);
  const startSeconds = Math.floor(segment.offset);

  return {
    startMs,
    endMs,
    startSeconds,
    endSeconds: Math.ceil(segment.offset + segment.duration),
    startTimeText: formatTimestamp(startSeconds),
    text,
  };
}

async function transcriptPlusFetch(
  params: TranscriptPlusFetchParams,
  limitedFetch: typeof fetch,
  requestLabel: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(params.headers ?? {}),
  };

  if (params.lang) {
    headers["accept-language"] = params.lang;
  }
  if (params.userAgent) {
    headers["user-agent"] = params.userAgent;
  }

  const init: NonNullable<Parameters<typeof fetch>[1]> = {
    headers,
  };

  if (params.method !== undefined) {
    init.method = params.method;
  }
  if (params.body !== undefined) {
    init.body = params.body;
  }
  if (params.signal !== undefined) {
    init.signal = params.signal;
  }

  return limitedFetch(params.url, fetchInitWithRequestLabel(init, requestLabel));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

export function extractJson3TranscriptSegments(value: unknown): TranscriptSegment[] {
  const object = asRecord(value);
  const events = object?.events;
  if (!Array.isArray(events)) {
    return [];
  }

  return events
    .map((event) => json3EventSegment(event))
    .filter((segment): segment is TranscriptSegment => segment !== undefined);
}

export function extractVttTranscriptSegments(value: string): TranscriptSegment[] {
  const normalized = value.replace(/\r\n?/gu, "\n");
  const lines = normalized.split("\n");
  const segments: TranscriptSegment[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line.includes("-->")) {
      continue;
    }

    const [startText, endAndSettings] = line.split("-->", 2);
    const endText = endAndSettings?.trim().split(/\s+/u)[0];
    const startMs = startText ? parseVttTimestampMs(startText.trim()) : undefined;
    const endMs = endText ? parseVttTimestampMs(endText) : undefined;
    if (startMs === undefined || endMs === undefined) {
      continue;
    }

    const textLines: string[] = [];
    for (index += 1; index < lines.length; index += 1) {
      const textLine = lines[index];
      if (textLine === undefined || !textLine.trim()) {
        break;
      }
      textLines.push(textLine);
    }

    const text = cleanCaptionText(textLines.join(" "));
    if (!text) {
      continue;
    }

    const startSeconds = Math.floor(startMs / 1000);
    segments.push({
      startMs,
      endMs,
      startSeconds,
      endSeconds: Math.ceil(endMs / 1000),
      startTimeText: formatTimestamp(startSeconds),
      text,
    });
  }

  return segments;
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

export async function writeTranscriptStorage(
  transcript: VideoTranscript,
  root = defaultTranscriptStorageRoot,
): Promise<TranscriptStoragePaths> {
  const paths = transcriptStoragePaths(transcript.videoId, root, transcript.videoTitle, transcript.videoPublishedAt);

  await writeTranscriptOutputs(transcript, {
    jsonOutput: paths.jsonOutput,
    txtOutput: paths.txtOutput,
    tsvOutput: paths.tsvOutput,
  });
  const previousRecord = await upsertTranscriptManifest(transcript, paths);
  if (previousRecord !== undefined) {
    await removeSupersededTranscriptOutputs(root, previousRecord, paths);
  }

  return paths;
}

export function transcriptStoragePaths(
  videoId: string,
  root = defaultTranscriptStorageRoot,
  title?: string,
  timestamp?: string,
): TranscriptStoragePaths {
  const stem = videoFileStem(videoId, title, timestamp);

  return {
    root,
    jsonOutput: join(root, "json", `${stem}.json`),
    txtOutput: join(root, "txt", `${stem}.txt`),
    tsvOutput: join(root, "tsv", `${stem}.tsv`),
    manifestOutput: join(root, "manifest.json"),
  };
}

export function transcriptStoragePathsFromRecord(
  record: TranscriptManifestRecord,
  root = defaultTranscriptStorageRoot,
): TranscriptStoragePaths {
  return {
    root,
    jsonOutput: join(root, record.paths.json),
    txtOutput: join(root, record.paths.txt),
    tsvOutput: join(root, record.paths.tsv),
    manifestOutput: join(root, "manifest.json"),
  };
}

export async function findStoredTranscriptRecord(options: {
  videoId: string;
  root?: string;
  language?: string;
}): Promise<StoredTranscriptRecord | undefined> {
  const root = options.root ?? defaultTranscriptStorageRoot;
  const manifest = await readTranscriptManifest(join(root, "manifest.json"));
  const record = manifest.transcripts.find((candidate) =>
    candidate.videoId === options.videoId && transcriptLanguageMatches(candidate, options.language),
  );
  if (record === undefined) {
    return undefined;
  }

  const paths = transcriptStoragePathsFromRecord(record, root);
  try {
    await readFile(paths.jsonOutput, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  return { record, paths };
}

async function upsertTranscriptManifest(
  transcript: VideoTranscript,
  paths: TranscriptStoragePaths,
): Promise<TranscriptManifestRecord | undefined> {
  const manifest = await readTranscriptManifest(paths.manifestOutput);
  const record = transcriptManifestRecord(transcript);
  const index = manifest.transcripts.findIndex((existing) => existing.videoId === transcript.videoId);
  const previousRecord = index >= 0 ? manifest.transcripts[index] : undefined;

  if (index >= 0) {
    manifest.transcripts[index] = record;
  } else {
    manifest.transcripts.push(record);
    manifest.transcripts.sort((left, right) => left.videoId.localeCompare(right.videoId));
  }

  manifest.updatedAt = new Date().toISOString();
  await writeTextFile(paths.manifestOutput, `${JSON.stringify(manifest, null, 2)}\n`);
  return previousRecord;
}

async function removeSupersededTranscriptOutputs(
  root: string,
  previousRecord: TranscriptManifestRecord,
  currentPaths: TranscriptStoragePaths,
): Promise<void> {
  const previousPaths = transcriptStoragePathsFromRecord(previousRecord, root);
  const obsoletePaths = [previousPaths.jsonOutput, previousPaths.txtOutput, previousPaths.tsvOutput].filter(
    (path) => !samePath(path, currentPaths.jsonOutput) &&
      !samePath(path, currentPaths.txtOutput) &&
      !samePath(path, currentPaths.tsvOutput),
  );

  for (const path of obsoletePaths) {
    await rm(resolveTranscriptStorePath(root, path), { force: true });
  }
}

function samePath(left: string, right: string): boolean {
  return resolve(left) === resolve(right);
}

function resolveTranscriptStorePath(root: string, path: string): string {
  const rootPath = resolve(root);
  const resolvedPath = resolve(path);
  const relativePath = relative(rootPath, resolvedPath);

  if (relativePath && (relativePath.startsWith("..") || isAbsolute(relativePath))) {
    throw new Error(`Refusing to remove transcript path outside ${root}: ${path}`);
  }

  return resolvedPath;
}

function transcriptLanguageMatches(record: TranscriptManifestRecord, language: string | undefined): boolean {
  if (language === undefined) {
    return true;
  }

  const normalized = language.toLowerCase();
  return [record.selectedLanguage, ...record.availableLanguages].some((value) => value?.toLowerCase() === normalized);
}

async function readTranscriptManifest(path: string): Promise<TranscriptManifest> {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return normalizeTranscriptManifest(value);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return emptyTranscriptManifest();
    }
    throw error;
  }
}

function normalizeTranscriptManifest(value: unknown): TranscriptManifest {
  const object = asRecord(value);
  if (!object || !Array.isArray(object.transcripts)) {
    return emptyTranscriptManifest();
  }

  return {
    ...emptyTranscriptManifest(),
    updatedAt: readString(object, "updatedAt") ?? new Date(0).toISOString(),
    transcripts: object.transcripts
      .map((record) => transcriptManifestRecordFromJson(record))
      .filter((record): record is TranscriptManifestRecord => record !== undefined),
  };
}

function emptyTranscriptManifest(): TranscriptManifest {
  return {
    schemaVersion: 1,
    updatedAt: new Date(0).toISOString(),
    storage: {
      json: "json/{fileStem}.json",
      txt: "txt/{fileStem}.txt",
      tsv: "tsv/{fileStem}.tsv",
    },
    transcripts: [],
  };
}

function transcriptManifestRecord(transcript: VideoTranscript): TranscriptManifestRecord {
  const first = transcript.segments[0];
  const last = transcript.segments.at(-1);
  const stem = videoFileStem(transcript.videoId, transcript.videoTitle, transcript.videoPublishedAt);
  const record: TranscriptManifestRecord = {
    videoId: transcript.videoId,
    fileStem: stem,
    source: transcript.source,
    fetchedAt: transcript.fetchedAt,
    availableLanguages: transcript.availableLanguages,
    segmentCount: transcript.segments.length,
    paths: {
      json: `json/${stem}.json`,
      txt: `txt/${stem}.txt`,
      tsv: `tsv/${stem}.tsv`,
    },
  };

  if (transcript.selectedLanguage !== undefined) {
    record.selectedLanguage = transcript.selectedLanguage;
  }
  if (transcript.videoTitle !== undefined) {
    record.videoTitle = transcript.videoTitle;
  }
  if (transcript.videoPublishedAt !== undefined) {
    record.videoPublishedAt = transcript.videoPublishedAt;
  }
  if (first !== undefined) {
    record.firstStartSeconds = first.startSeconds;
  }
  if (last !== undefined) {
    record.lastEndSeconds = last.endSeconds;
  }

  return record;
}

function transcriptManifestRecordFromJson(value: unknown): TranscriptManifestRecord | undefined {
  const object = asRecord(value);
  const paths = asRecord(object?.paths);
  const videoId = object ? readString(object, "videoId") : undefined;
  const videoTitle = object ? readString(object, "videoTitle") : undefined;
  const videoPublishedAt = object ? readString(object, "videoPublishedAt") : undefined;
  const source = object ? readTranscriptSource(object) : undefined;
  const fetchedAt = object ? readString(object, "fetchedAt") : undefined;
  const segmentCount = integerValue(object?.segmentCount);
  const fileStem = object ? readString(object, "fileStem") : undefined;
  const json = paths ? readString(paths, "json") : undefined;
  const txt = paths ? readString(paths, "txt") : undefined;
  const tsv = paths ? readString(paths, "tsv") : undefined;

  if (!object || !videoId || !source || !fetchedAt || segmentCount === undefined || !json || !txt || !tsv) {
    return undefined;
  }

  const record: TranscriptManifestRecord = {
    videoId,
    fileStem: fileStem ?? videoFileStem(videoId, videoTitle, videoPublishedAt),
    source,
    fetchedAt,
    availableLanguages: readStringArray(object?.availableLanguages),
    segmentCount,
    paths: { json, txt, tsv },
  };
  const selectedLanguage = readString(object, "selectedLanguage");
  const firstStartSeconds = integerValue(object.firstStartSeconds);
  const lastEndSeconds = integerValue(object.lastEndSeconds);

  if (selectedLanguage !== undefined) {
    record.selectedLanguage = selectedLanguage;
  }
  if (videoTitle !== undefined) {
    record.videoTitle = videoTitle;
  }
  if (videoPublishedAt !== undefined) {
    record.videoPublishedAt = videoPublishedAt;
  }
  if (firstStartSeconds !== undefined) {
    record.firstStartSeconds = firstStartSeconds;
  }
  if (lastEndSeconds !== undefined) {
    record.lastEndSeconds = lastEndSeconds;
  }

  return record;
}

async function fetchCaptionTrackTranscript(options: {
  videoId: string;
  info: unknown;
  language: string | undefined;
  fetch: typeof fetch;
  logger: ((message: string) => void) | undefined;
  headers: FetchHeaders;
}): Promise<VideoTranscript | undefined> {
  const basicInfo = asRecord(readPath(options.info, ["basic_info"]));
  return fetchTranscriptFromCaptionTracks({
    videoId: options.videoId,
    videoTitle: basicInfo ? readString(basicInfo, "title") : undefined,
    captionTracks: captionTracksFromInfo(options.info),
    language: options.language,
    fetch: options.fetch,
    logger: options.logger,
    headers: options.headers,
  });
}

async function fetchWatchPageTranscript(options: {
  videoId: string;
  language: string | undefined;
  fetch: typeof fetch;
  logger: ((message: string) => void) | undefined;
}): Promise<VideoTranscript | undefined> {
  options.logger?.(`Fetching watch page captions: ${options.videoId}`);
  const response = await options.fetch(
    `https://www.youtube.com/watch?v=${encodeURIComponent(options.videoId)}`,
    fetchInitWithRequestLabel({ headers: youtubeRequestHeaders() }, "watch page"),
  );
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Watch page request failed with status ${response.status}: ${body.slice(0, 160)}`);
  }

  const playerResponse = extractInitialPlayerResponse(body);
  if (!playerResponse) {
    return undefined;
  }

  const videoDetails = asRecord(readPath(playerResponse, ["videoDetails"]));
  return fetchTranscriptFromCaptionTracks({
    videoId: options.videoId,
    videoTitle: videoDetails ? readString(videoDetails, "title") : undefined,
    captionTracks: captionTracksFromPlayerResponse(playerResponse),
    language: options.language,
    fetch: options.fetch,
    logger: options.logger,
    headers: youtubeRequestHeaders(cookieHeader(response.headers)),
  });
}

async function fetchTranscriptFromCaptionTracks(options: {
  videoId: string;
  videoTitle: string | undefined;
  captionTracks: Record<string, unknown>[];
  language: string | undefined;
  fetch: typeof fetch;
  logger: ((message: string) => void) | undefined;
  headers: FetchHeaders;
}): Promise<VideoTranscript | undefined> {
  const captionTracks = options.captionTracks;
  if (captionTracks.length === 0) {
    return undefined;
  }

  const track = selectCaptionTrack(captionTracks, options.language);
  if (!track) {
    throw new Error(`No caption track matched language: ${options.language ?? ""}.`);
  }

  options.logger?.(`Fetching caption track: ${captionTrackLanguage(track)}`);
  const segments = await fetchCaptionTrackSegments(track, options.fetch, options.headers);
  if (segments.length === 0) {
    throw new Error(`Caption track contained no transcript segments: ${captionTrackLanguage(track)}.`);
  }

  return {
    videoId: options.videoId,
    ...(options.videoTitle ? { videoTitle: options.videoTitle } : {}),
    source: "watch-page-captions",
    fetchedAt: new Date().toISOString(),
    selectedLanguage: captionTrackLanguage(track),
    availableLanguages: captionTracks.map(captionTrackLanguage),
    segments,
  };
}

async function fetchCaptionTrackSegments(
  track: Record<string, unknown>,
  fetcher: typeof fetch,
  headers: FetchHeaders,
): Promise<TranscriptSegment[]> {
  const vttResponse = await fetchCaptionTrackFormat(track, fetcher, "vtt", headers);
  const vttSegments = extractVttTranscriptSegments(vttResponse);
  if (vttSegments.length > 0) {
    return vttSegments;
  }

  const jsonResponse = await fetchCaptionTrackFormat(track, fetcher, "json3", headers);
  if (!jsonResponse.trim()) {
    return [];
  }

  return extractJson3TranscriptSegments(JSON.parse(jsonResponse));
}

function captionTracksFromInfo(info: unknown): Record<string, unknown>[] {
  return [
    ...recordArray(readPath(info, ["captions", "caption_tracks"])),
    ...recordArray(readPath(info, ["captions", "captionTracks"])),
    ...recordArray(readPath(info, ["page", "0", "captions", "caption_tracks"])),
    ...recordArray(readPath(info, ["page", "0", "captions", "captionTracks"])),
  ];
}

function captionTracksFromPlayerResponse(playerResponse: unknown): Record<string, unknown>[] {
  return recordArray(readPath(playerResponse, ["captions", "playerCaptionsTracklistRenderer", "captionTracks"]));
}

function selectCaptionTrack(
  tracks: Record<string, unknown>[],
  language: string | undefined,
): Record<string, unknown> | undefined {
  if (language) {
    const normalizedLanguage = language.toLowerCase();
    return tracks.find((track) =>
      [
        readString(track, "language_code"),
        readString(track, "languageCode"),
        readString(track, "vss_id"),
        readString(track, "vssId"),
        captionTrackLanguage(track),
      ].some((value) => value?.toLowerCase() === normalizedLanguage),
    );
  }

  return (
    tracks.find((track) => captionTrackCode(track) === "en" && readString(track, "kind") !== "asr") ??
    tracks.find((track) => captionTrackCode(track) === "en") ??
    tracks[0]
  );
}

async function fetchCaptionTrackFormat(
  track: Record<string, unknown>,
  fetcher: typeof fetch,
  format: "json3" | "vtt",
  headers: FetchHeaders,
): Promise<string> {
  const response = await fetcher(
    captionTrackFormatUrl(track, format),
    fetchInitWithRequestLabel({ headers }, `${format} caption track`),
  );
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Caption track request failed with status ${response.status}: ${body.slice(0, 160)}`);
  }

  return body;
}

function youtubeRequestHeaders(cookie?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "accept-language": "en-US,en;q=0.9",
    "user-agent": youtubeUserAgent,
  };

  if (cookie) {
    headers.cookie = cookie;
  }

  return headers;
}

function cookieHeader(headers: FetchResponseHeaders): string | undefined {
  const getSetCookie = (headers as FetchResponseHeaders & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = getSetCookie ? getSetCookie.call(headers) : splitSetCookieHeader(headers.get("set-cookie"));
  const cookie = cookies
    .map((value) => value.split(";", 1)[0]?.trim())
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join("; ");

  return cookie || undefined;
}

function splitSetCookieHeader(value: string | null): string[] {
  return value ? value.split(/,(?=\s*[^;,\s]+=)/u) : [];
}

function captionTrackFormatUrl(track: Record<string, unknown>, format: "json3" | "vtt"): URL {
  const baseUrl = readString(track, "base_url") ?? readString(track, "baseUrl");
  if (!baseUrl) {
    throw new Error("Caption track is missing base_url.");
  }

  const url = new URL(baseUrl);
  url.searchParams.set("fmt", format);
  return url;
}

function captionTrackLanguage(track: Record<string, unknown>): string {
  const name = textValue(track.name);
  const code = captionTrackCode(track);

  if (name && code) {
    return `${name} (${code})`;
  }

  return name ?? code ?? "unknown";
}

function captionTrackCode(track: Record<string, unknown>): string | undefined {
  return readString(track, "language_code") ?? readString(track, "languageCode");
}

function readTranscriptSource(object: Record<string, unknown>): VideoTranscript["source"] {
  const source = readString(object, "source");
  return source === "youtube-transcript-plus" ? "youtube-transcript-plus" : "watch-page-captions";
}

function extractInitialPlayerResponse(html: string): unknown | undefined {
  const marker = "ytInitialPlayerResponse";
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }

  const objectStart = html.indexOf("{", markerIndex);
  if (objectStart < 0) {
    return undefined;
  }

  const json = extractBalancedJsonObject(html, objectStart);
  return json ? JSON.parse(json) : undefined;
}

function extractBalancedJsonObject(text: string, startIndex: number): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return undefined;
}

export async function readVideoTranscriptJson(path: string): Promise<VideoTranscript> {
  return parseVideoTranscriptJson(JSON.parse(await readFile(path, "utf8")), path);
}

export function parseVideoTranscriptJson(value: unknown, sourceName = "transcript JSON"): VideoTranscript {
  const object = asRecord(value);
  if (!object) {
    throw new Error(`${sourceName} must contain a JSON object.`);
  }

  const videoId = readString(object, "videoId");
  if (!videoId) {
    throw new Error(`${sourceName} is missing string field videoId.`);
  }

  const segments = readTranscriptSegmentsArray(object.segments, sourceName);
  const transcript: VideoTranscript = {
    videoId,
    source: readTranscriptSource(object),
    fetchedAt: readString(object, "fetchedAt") ?? new Date(0).toISOString(),
    availableLanguages: readStringArray(object.availableLanguages),
    segments,
  };

  const videoTitle = readString(object, "videoTitle");
  if (videoTitle !== undefined) {
    transcript.videoTitle = videoTitle;
  }
  const videoPublishedAt = readString(object, "videoPublishedAt");
  if (videoPublishedAt !== undefined) {
    transcript.videoPublishedAt = videoPublishedAt;
  }

  const selectedLanguage = readString(object, "selectedLanguage");
  if (selectedLanguage !== undefined) {
    transcript.selectedLanguage = selectedLanguage;
  }

  return transcript;
}

export function transcriptToTxt(transcript: VideoTranscript): string {
  return `${transcript.segments
    .map((segment) => `[${segment.startTimeText}] ${segment.text}`)
    .join("\n")}\n`;
}

function readTranscriptSegmentsArray(value: unknown, sourceName: string): TranscriptSegment[] {
  if (!Array.isArray(value)) {
    throw new Error(`${sourceName} is missing array field segments.`);
  }

  return value.map((segment, index) => readTranscriptSegment(segment, `${sourceName} segment ${index + 1}`));
}

function readTranscriptSegment(value: unknown, sourceName: string): TranscriptSegment {
  const object = asRecord(value);
  if (!object) {
    throw new Error(`${sourceName} must be an object.`);
  }

  const text = readString(object, "text");
  if (!text) {
    throw new Error(`${sourceName} is missing string field text.`);
  }

  const startMs = integerValue(object.startMs) ?? secondsToMs(numberValue(object.startSeconds));
  const endMs = integerValue(object.endMs) ?? secondsToMs(numberValue(object.endSeconds));
  const startSeconds = integerValue(object.startSeconds) ?? (startMs === undefined ? undefined : Math.floor(startMs / 1000));
  const endSeconds = integerValue(object.endSeconds) ?? (endMs === undefined ? undefined : Math.ceil(endMs / 1000));

  if (
    startMs === undefined ||
    endMs === undefined ||
    startSeconds === undefined ||
    endSeconds === undefined
  ) {
    throw new Error(`${sourceName} is missing usable timestamp fields.`);
  }

  const segment: TranscriptSegment = {
    startMs,
    endMs,
    startSeconds,
    endSeconds,
    startTimeText: readString(object, "startTimeText") ?? formatTimestamp(startSeconds),
    text,
  };

  const targetId = readString(object, "targetId");
  if (targetId !== undefined) {
    segment.targetId = targetId;
  }

  return segment;
}

function secondsToMs(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value * 1000);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => item !== undefined)
    : [];
}

function json3EventSegment(event: unknown): TranscriptSegment | undefined {
  const object = asRecord(event);
  if (!object) {
    return undefined;
  }

  const startMs = integerValue(object.tStartMs);
  if (startMs === undefined) {
    return undefined;
  }

  const text = json3EventText(object.segs);
  if (!text) {
    return undefined;
  }

  const durationMs = integerValue(object.dDurationMs) ?? 0;
  const endMs = startMs + durationMs;
  const startSeconds = Math.floor(startMs / 1000);
  const endSeconds = Math.ceil(endMs / 1000);

  return {
    startMs,
    endMs,
    startSeconds,
    endSeconds,
    startTimeText: formatTimestamp(startSeconds),
    text,
  };
}

function json3EventText(segs: unknown): string | undefined {
  if (!Array.isArray(segs)) {
    return undefined;
  }

  const text = segs
    .map((seg) => {
      const object = asRecord(seg);
      return object ? readString(object, "utf8") : undefined;
    })
    .filter((value): value is string => value !== undefined)
    .join("");

  return text.replace(/\s+/gu, " ").trim() || undefined;
}

function parseVttTimestampMs(value: string): number | undefined {
  const parts = value.split(":");
  const secondsPart = parts.pop();
  if (!secondsPart || parts.length > 2) {
    return undefined;
  }

  const seconds = Number(secondsPart);
  if (!Number.isFinite(seconds)) {
    return undefined;
  }

  let totalSeconds = seconds;
  let multiplier = 60;
  while (parts.length > 0) {
    const part = parts.pop();
    if (part === undefined || !/^\d+$/u.test(part)) {
      return undefined;
    }
    totalSeconds += Number(part) * multiplier;
    multiplier *= 60;
  }

  return Math.round(totalSeconds * 1000);
}

function cleanCaptionText(value: string): string | undefined {
  const text = decodeCaptionEntities(value.replace(/<[^>]*>/gu, " "))
    .replace(/\s+/gu, " ")
    .trim();

  return text || undefined;
}

function decodeCaptionEntities(value: string): string {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&#39;/gu, "'");
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

  const simpleText = readString(object, "simpleText");
  if (simpleText) {
    return simpleText.trim() || undefined;
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
