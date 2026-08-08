import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseCuratedTopicStore,
  parseCuratedVideoFile,
  parseSiteContentProcessingConfig,
  SITE_CONTENT_PROCESSING_LOG_HEADER,
  validateCuratedVideoFile,
  validateSiteContentProcessingConfig,
  validateSiteContentProcessingLogRow,
} from "./index.js";

test("accepts source shards without custom version metadata", () => {
  const video = parseCuratedVideoFile(sampleVideo(), "sample video");

  assert.equal(video.videoId, "abc123");
  assert.equal(video.segments.length, 1);
});

test("rejects undeclared source-shard metadata", () => {
  const result = validateCuratedVideoFile({
    ...sampleVideo(),
    needsFurtherProcessing: false,
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.issues.join("\n"), /needsFurtherProcessing/u);
  }
});

test("allows Q&A answerShort to serve as the concise result when summary is absent", () => {
  const video = parseCuratedVideoFile({
    ...sampleVideo(),
    segments: [{
      ...sampleVideo().segments[0],
      kind: "qa",
      question: "What changed?",
      answerShort: "The answer identifies the important change.",
      summary: undefined,
    }],
  }, "Q&A sample");

  assert.equal(video.segments[0]?.kind, "qa");
  assert.equal(video.segments[0]?.summary, undefined);
});

test("requires summaries for non-Q&A segments", () => {
  const {summary: _summary, ...segmentWithoutSummary} = sampleVideo().segments[0]!;
  const result = validateCuratedVideoFile({
    ...sampleVideo(),
    segments: [segmentWithoutSummary],
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.issues.join("\n"), /summary/u);
  }
});

test("validates the topic store without custom version metadata", () => {
  const store = parseCuratedTopicStore({
    topics: [{
      slug: "destroyers",
      title: "Destroyers",
      aliases: ["tin cans"],
    }],
  }, "sample topic store");

  assert.equal(store.topics[0]?.slug, "destroyers");
  assert.throws(
      () => parseCuratedTopicStore({
        topics: [
          {slug: "destroyers", title: "Destroyers"},
          {slug: "destroyers", title: "Duplicate"},
        ],
      }, "duplicate topic store"),
      /duplicates topic slug destroyers/u,
  );
});

test("validates the processing config from its canonical schema without version metadata", async () => {
  const configPath = fileURLToPath(
      new URL("../../../src/derived/site-content-processing.config.json", import.meta.url),
  );
  const value = JSON.parse(await readFile(configPath, "utf8")) as unknown;
  const config = parseSiteContentProcessingConfig(value, "production processing config");

  assert.equal(config.firstPass.processingMode, "full-file-best-effort");
  assert.ok(config.topicLifecycle.fictionPolicy.length > 0);
  assert.equal(Object.hasOwn(config, "schemaVersion"), false);

  const versionedResult = validateSiteContentProcessingConfig({
    ...config,
    schemaVersion: 1,
  });
  assert.equal(versionedResult.success, false);
  if (!versionedResult.success) {
    assert.match(versionedResult.issues.join("\n"), /schemaVersion/u);
  }
});

test("validates processing-log rows independently from log parsing", () => {
  assert.equal(
      SITE_CONTENT_PROCESSING_LOG_HEADER,
      "timestamp;shardPath;result;needsFurtherProcessing;notes",
  );
  assert.equal(validateSiteContentProcessingLogRow({
    timestamp: "2026-07-26T12:00:00-05:00",
    shardPath: "src/derived/video-segments/sample-video_abc123.json",
    result: "audited",
    needsFurtherProcessing: "no",
    notes: "full transcript compared",
  }).success, true);
  assert.equal(validateSiteContentProcessingLogRow({
    timestamp: "2026-07-26T12:00:00-05:00",
    shardPath: "src\\derived\\video-segments\\sample-video_abc123.json",
    result: "audited",
    needsFurtherProcessing: "no",
    notes: "full transcript compared",
  }).success, false);
});

test("all production curated-content files match the canonical schemas", async () => {
  const directory = fileURLToPath(
      new URL("../../../src/derived/video-segments", import.meta.url),
  );
  const fileNames = (await readdir(directory))
      .filter((fileName) => fileName.endsWith(".json"))
      .sort();

  for (const fileName of fileNames) {
    const value = JSON.parse(await readFile(join(directory, fileName), "utf8")) as unknown;
    if (fileName === "topics.json") {
      parseCuratedTopicStore(value, fileName);
    } else {
      parseCuratedVideoFile(value, fileName);
    }
  }

  assert.ok(fileNames.length > 2_000);
});

function sampleVideo() {
  return {
    videoId: "abc123",
    topics: ["destroyers"],
    segments: [{
      id: "sample-segment",
      videoId: "abc123",
      slug: "sample-segment",
      title: "Sample segment",
      kind: "chapter" as const,
      start: "1:00",
      end: "2:00",
      topics: ["destroyers"],
      summary: "A concise watch-point summary.",
      body: "A transcript-backed explanation.",
      sourcePath: "src/transcripts/txt/sample-video_abc123.txt",
      evidence: [{
        start: "1:00",
        end: "2:00",
        note: "The transcript supports the segment.",
      }],
    }],
  };
}
