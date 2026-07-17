import {
  findNodeAtLocation,
  parseTree,
  printParseErrorCode,
  type Node as JsonNode,
  type ParseError,
} from "jsonc-parser";

import { isTopicSlug } from "./topic-normalization.js";

export type TopicArrayPath = readonly ["topics"] | readonly ["segments", number, "topics"];

export interface TopicArrayLocation {
  kind: "video" | "segment";
  segmentIndex: number | undefined;
  segmentId: string | undefined;
  path: TopicArrayPath;
  offset: number;
  length: number;
  topics: string[];
}

export interface TopicArrayUpdate {
  path: TopicArrayPath;
  topics: readonly string[];
}

export interface AppliedTopicArrayEdit {
  path: TopicArrayPath;
  beforeOffset: number;
  beforeLength: number;
  afterOffset: number;
  afterLength: number;
  beforeTopics: string[];
  afterTopics: string[];
}

export interface TopicArrayEditResult {
  text: string;
  changed: boolean;
  edits: AppliedTopicArrayEdit[];
}

interface ParsedTopicDocument {
  root: JsonNode;
  value: Record<string, unknown>;
  locations: TopicArrayLocation[];
}

interface PendingEdit {
  location: TopicArrayLocation;
  replacement: string;
  topics: string[];
}

export function inspectTopicArrays(
  text: string,
  sourcePath = "<curated-video-shard.json>",
): TopicArrayLocation[] {
  return parseTopicDocument(text, sourcePath).locations.map(cloneLocation);
}

export function editTopicArraysPreservingFormatting(
  text: string,
  updates: readonly TopicArrayUpdate[],
  sourcePath = "<curated-video-shard.json>",
): TopicArrayEditResult {
  const parsed = parseTopicDocument(text, sourcePath);
  const locationsByPath = new Map(parsed.locations.map((location) => [
    topicArrayPathKey(location.path),
    location,
  ]));
  const seenUpdates = new Set<string>();
  const pending: PendingEdit[] = [];

  for (const update of updates) {
    validateTopicArrayPath(update.path, sourcePath);
    const key = topicArrayPathKey(update.path);
    if (seenUpdates.has(key)) {
      throw new Error(`Duplicate topic-array update for ${key}: ${sourcePath}.`);
    }
    seenUpdates.add(key);

    const location = locationsByPath.get(key);
    if (location === undefined) {
      throw new Error(`Topic-array update path does not exist: ${key} in ${sourcePath}.`);
    }
    const topics = [...update.topics];
    validateTopics(topics, `${sourcePath} ${key}`);
    if (arraysEqual(location.topics, topics)) {
      continue;
    }

    const node = findNodeAtLocation(parsed.root, [...location.path]);
    if (node === undefined || node.type !== "array") {
      throw new Error(`Could not relocate topic array ${key} in ${sourcePath}.`);
    }
    pending.push({
      location,
      replacement: renderTopicArray(text, node, topics),
      topics,
    });
  }

  if (pending.length === 0) {
    return { text, changed: false, edits: [] };
  }

  pending.sort((left, right) => left.location.offset - right.location.offset);
  assertNonOverlapping(pending, sourcePath);

  const chunks: string[] = [];
  const edits: AppliedTopicArrayEdit[] = [];
  let sourceCursor = 0;
  let outputLength = 0;
  for (const edit of pending) {
    const prefix = text.slice(sourceCursor, edit.location.offset);
    chunks.push(prefix);
    outputLength += prefix.length;
    const afterOffset = outputLength;
    chunks.push(edit.replacement);
    outputLength += edit.replacement.length;
    edits.push({
      path: edit.location.path,
      beforeOffset: edit.location.offset,
      beforeLength: edit.location.length,
      afterOffset,
      afterLength: edit.replacement.length,
      beforeTopics: [...edit.location.topics],
      afterTopics: [...edit.topics],
    });
    sourceCursor = edit.location.offset + edit.location.length;
  }
  chunks.push(text.slice(sourceCursor));
  const postimage = chunks.join("");

  const reparsed = parseTopicDocument(postimage, sourcePath);
  assertRequestedPostimage(reparsed.locations, edits, sourcePath);
  assertNonTopicValuesUnchanged(parsed.value, reparsed.value, sourcePath);
  assertOutsideRangesUnchanged(text, postimage, edits, sourcePath);

  return { text: postimage, changed: true, edits };
}

export function topicArrayPathKey(path: TopicArrayPath): string {
  return path.length === 1 ? "/topics" : `/segments/${path[1]}/topics`;
}

function parseTopicDocument(text: string, sourcePath: string): ParsedTopicDocument {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, {
    allowTrailingComma: false,
    disallowComments: true,
    allowEmptyContent: false,
  });
  if (root === undefined || errors.length > 0) {
    const first = errors[0];
    const detail = first === undefined
      ? "empty document"
      : `${printParseErrorCode(first.error)} at ${formatOffset(text, first.offset)}`;
    throw new Error(`Could not parse curated video shard ${sourcePath}: ${detail}.`);
  }
  if (root.type !== "object") {
    throw new Error(`Curated video shard ${sourcePath} must contain a JSON object.`);
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Could not strictly parse curated video shard ${sourcePath}.`, { cause: error });
  }
  if (!isRecord(value)) {
    throw new Error(`Curated video shard ${sourcePath} must contain a JSON object.`);
  }

  const locations: TopicArrayLocation[] = [];
  const videoTopics = requireTopicArrayNode(root, ["topics"], `${sourcePath} video`);
  locations.push({
    kind: "video",
    segmentIndex: undefined,
    segmentId: undefined,
    path: ["topics"],
    offset: videoTopics.offset,
    length: videoTopics.length,
    topics: topicValues(videoTopics, `${sourcePath} video`),
  });

  const segmentsNode = findNodeAtLocation(root, ["segments"]);
  if (segmentsNode === undefined || segmentsNode.type !== "array") {
    throw new Error(`Curated video shard ${sourcePath} must include a segments array.`);
  }
  for (const [segmentIndex, segmentNode] of (segmentsNode.children ?? []).entries()) {
    if (segmentNode.type !== "object") {
      throw new Error(`Curated video shard ${sourcePath} segment ${segmentIndex} must be an object.`);
    }
    const idNode = findNodeAtLocation(segmentNode, ["id"]);
    const segmentId = idNode?.type === "string" && typeof idNode.value === "string"
      ? idNode.value
      : undefined;
    const label = `${sourcePath} segment ${segmentId ?? segmentIndex}`;
    const path = ["segments", segmentIndex, "topics"] as const;
    const topicsNode = requireTopicArrayNode(root, path, label);
    locations.push({
      kind: "segment",
      segmentIndex,
      segmentId,
      path,
      offset: topicsNode.offset,
      length: topicsNode.length,
      topics: topicValues(topicsNode, label),
    });
  }

  return { root, value, locations };
}

function requireTopicArrayNode(
  root: JsonNode,
  path: TopicArrayPath,
  label: string,
): JsonNode {
  const node = findNodeAtLocation(root, [...path]);
  if (node === undefined || node.type !== "array") {
    throw new Error(`${label} must include a topics array.`);
  }
  return node;
}

function topicValues(node: JsonNode, label: string): string[] {
  const topics = (node.children ?? []).map((child) => child.value as unknown);
  if (topics.some((topic) => typeof topic !== "string")) {
    throw new Error(`${label} topics must contain only strings.`);
  }
  const strings = topics as string[];
  validateTopics(strings, `${label} topics`);
  return [...strings];
}

function validateTopics(topics: readonly string[], label: string): void {
  for (const topic of topics) {
    if (!isTopicSlug(topic)) {
      throw new Error(`${label} contains invalid topic slug ${JSON.stringify(topic)}.`);
    }
  }
}

function validateTopicArrayPath(path: TopicArrayPath, sourcePath: string): void {
  const valid = path.length === 1
    ? path[0] === "topics"
    : path.length === 3
      && path[0] === "segments"
      && Number.isSafeInteger(path[1])
      && path[1] >= 0
      && path[2] === "topics";
  if (!valid) {
    throw new Error(`Invalid topic-array path ${JSON.stringify(path)} for ${sourcePath}.`);
  }
}

function renderTopicArray(text: string, node: JsonNode, topics: readonly string[]): string {
  const original = text.slice(node.offset, node.offset + node.length);
  if (topics.length === 0) {
    return "[]";
  }
  const serialized = topics.map((topic) => JSON.stringify(topic));
  if (/\r|\n/u.test(original)) {
    const eol = original.includes("\r\n") ? "\r\n" : "\n";
    const closingOffset = node.offset + node.length - 1;
    const closingIndent = lineIndentAt(text, closingOffset);
    const firstChild = node.children?.[0];
    const elementIndent = firstChild === undefined
      ? `${closingIndent}  `
      : lineIndentAt(text, firstChild.offset);
    return `[${eol}${elementIndent}${serialized.join(`,${eol}${elementIndent}`)}${eol}${closingIndent}]`;
  }

  const children = node.children ?? [];
  if (children.length === 0) {
    return `[${serialized.join(", ")}]`;
  }
  const first = children[0];
  const last = children.at(-1);
  if (first === undefined || last === undefined) {
    return `[${serialized.join(", ")}]`;
  }
  const leading = text.slice(node.offset + 1, first.offset);
  const trailing = text.slice(last.offset + last.length, node.offset + node.length - 1);
  let separator = ", ";
  if (children.length > 1) {
    const second = children[1];
    if (second !== undefined) {
      const candidate = text.slice(first.offset + first.length, second.offset);
      if (candidate.includes(",") && !/[\r\n]/u.test(candidate)) {
        separator = candidate;
      }
    }
  }
  return `[${leading}${serialized.join(separator)}${trailing}]`;
}

function assertRequestedPostimage(
  locations: TopicArrayLocation[],
  edits: AppliedTopicArrayEdit[],
  sourcePath: string,
): void {
  const byPath = new Map(locations.map((location) => [topicArrayPathKey(location.path), location]));
  for (const edit of edits) {
    const location = byPath.get(topicArrayPathKey(edit.path));
    if (location === undefined || !arraysEqual(location.topics, edit.afterTopics)) {
      throw new Error(`Topic-array postimage verification failed for ${topicArrayPathKey(edit.path)} in ${sourcePath}.`);
    }
  }
}

function assertNonTopicValuesUnchanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  sourcePath: string,
): void {
  const beforeWithoutTopics = omitTopicArrays(before);
  const afterWithoutTopics = omitTopicArrays(after);
  if (JSON.stringify(beforeWithoutTopics) !== JSON.stringify(afterWithoutTopics)) {
    throw new Error(`A non-topic JSON value changed while editing ${sourcePath}.`);
  }
}

function omitTopicArrays(value: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(value);
  delete clone.topics;
  if (Array.isArray(clone.segments)) {
    for (const segment of clone.segments) {
      if (isRecord(segment)) {
        delete segment.topics;
      }
    }
  }
  return clone;
}

function assertOutsideRangesUnchanged(
  before: string,
  after: string,
  edits: AppliedTopicArrayEdit[],
  sourcePath: string,
): void {
  const beforeOutside = textOutsideRanges(before, edits.map((edit) => ({
    offset: edit.beforeOffset,
    length: edit.beforeLength,
  })));
  const afterOutside = textOutsideRanges(after, edits.map((edit) => ({
    offset: edit.afterOffset,
    length: edit.afterLength,
  })));
  if (beforeOutside !== afterOutside) {
    throw new Error(`Bytes outside edited topic arrays changed in ${sourcePath}.`);
  }
}

function textOutsideRanges(
  text: string,
  ranges: readonly { offset: number; length: number }[],
): string {
  const chunks: string[] = [];
  let cursor = 0;
  for (const range of ranges) {
    chunks.push(text.slice(cursor, range.offset));
    cursor = range.offset + range.length;
  }
  chunks.push(text.slice(cursor));
  return chunks.join("");
}

function assertNonOverlapping(edits: PendingEdit[], sourcePath: string): void {
  for (let index = 1; index < edits.length; index += 1) {
    const previous = edits[index - 1];
    const current = edits[index];
    if (
      previous !== undefined
      && current !== undefined
      && previous.location.offset + previous.location.length > current.location.offset
    ) {
      throw new Error(`Overlapping topic arrays cannot be edited in ${sourcePath}.`);
    }
  }
}

function lineIndentAt(text: string, offset: number): string {
  const lineBreak = text.lastIndexOf("\n", Math.max(0, offset - 1));
  const lineStart = lineBreak < 0 ? 0 : lineBreak + 1;
  const prefix = text.slice(lineStart, offset);
  const match = prefix.match(/^[\t ]*/u);
  return match?.[0] ?? "";
}

function formatOffset(text: string, offset: number): string {
  const prefix = text.slice(0, offset);
  const lines = prefix.split(/\r\n|\n|\r/u);
  return `line ${lines.length}, column ${(lines.at(-1)?.length ?? 0) + 1}`;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function cloneLocation(location: TopicArrayLocation): TopicArrayLocation {
  return {
    kind: location.kind,
    segmentIndex: location.segmentIndex,
    segmentId: location.segmentId,
    path: location.path.length === 1
      ? ["topics"]
      : ["segments", location.path[1], "topics"],
    offset: location.offset,
    length: location.length,
    topics: [...location.topics],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
