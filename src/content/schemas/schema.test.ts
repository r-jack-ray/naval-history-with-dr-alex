import assert from "node:assert/strict";
import test from "node:test";

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

test("validates a processing-config fixture without version metadata", () => {
  const config = parseSiteContentProcessingConfig(
      sampleProcessingConfig(),
      "fixture processing config",
  );

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

function sampleProcessingConfig() {
  return {
    firstPass: {
      defaultAction: "Create useful fixture watch points.",
      defaultNeedsFurtherProcessing: true,
      processingMode: "full-file-best-effort",
      minimumEvidenceWindows: 1,
      preferredSegmentKinds: ["chapter", "qa"],
      requiredContentScans: ["subject-segments", "qa-exchanges"],
      guidance: "Inspect the complete fixture transcript.",
    },
    videoLevelTopics: {
      mode: "curated-summary-subset",
      requireAllSegmentTopics: false,
    },
    liveStreamExtraction: {
      mode: "full-duration-mixed-content",
      explicitQaTitleMarkers: ["Fixture Q&A"],
      requiredQaFields: ["start", "question", "answerShort"],
      guidance: "Separate fixture lecture and question segments.",
    },
    topicLifecycle: {
      mode: "shard-derived-automatic",
      contentPass: "Add fixture topic slugs.",
      fictionPolicy: "Keep fictional fixture referents distinct.",
      synchronization: "Synchronize the fixture registry.",
      exceptionRule: "Review ambiguous fixture topics.",
    },
    contentExhaustion: {
      mode: "model-effort-saturation",
      comparisonScope: "Compare the fixture transcript and shard.",
      stopRule: "Stop after fixture coverage is complete.",
      reopenRule: "Reopen when fixture evidence changes.",
    },
    followUpStages: [{
      slug: "fixture-follow-up",
      title: "Fixture Follow-up",
      description: "Review the fixture content.",
    }],
    videoTypeRules: [{
      matchTitle: "Fixture Stream",
      defaultKind: "chapter",
      defaultTopics: ["fixture-topic"],
      followUpStage: "fixture-follow-up",
    }],
    topicGroups: [{
      slug: "fixture-group",
      title: "Fixture Group",
      topics: ["fixture-topic"],
    }],
  };
}
