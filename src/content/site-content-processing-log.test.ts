import assert from "node:assert/strict";
import test from "node:test";
import { SITE_CONTENT_PROCESSING_LOG_HEADER } from "./schemas/index.js";

import { parseSiteContentProcessingLog, } from "./site-content-processing-log.js";

const manifest = [
  {videoId: "abc123", fileStem: "sample-video_abc123", paths: {txt: "txt/sample-video_abc123.txt"}},
];

test("parses canonical semicolon rows and uses last physical valid occurrence", () => {
  const parsed = parseSiteContentProcessingLog([
    SITE_CONTENT_PROCESSING_LOG_HEADER,
    "2026-07-08T03:45:00-05:00;src/derived/video-segments/sample-video_abc123.json;first;needs work",
    "2026-07-08T02:45:00;src/derived/video-segments/sample-video_abc123.json;second;complete",
    "",
  ].join("\n"), manifest);

  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.latestByFileStem.get("sample-video_abc123")?.result, "second");
  assert.equal(parsed.malformedRowCount, 0);
  assert.equal(parsed.unmappedRowCount, 0);
  assert.equal(parsed.ignoredRowCount, 0);
});

test("preserves semicolons in the final free-text notes field", () => {
  const parsed = parseSiteContentProcessingLog([
    SITE_CONTENT_PROCESSING_LOG_HEADER,
    "2026-07-08T03:45:00;src/derived/video-segments/sample-video_abc123.json;audited;full transcript compared; current pass saturated",
  ].join("\n"), manifest);

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0]?.notes, "full transcript compared; current pass saturated");
  assert.equal(parsed.malformedRowCount, 0);
});

test("counts malformed and unmapped rows without accepting legacy tabs or counting the final newline", () => {
  const parsed = parseSiteContentProcessingLog([
    SITE_CONTENT_PROCESSING_LOG_HEADER,
    "2026-07-08T03:45:00\tsrc/transcripts/txt/sample-video_abc123.txt\tabc123\tcurated\tno\tcomplete",
    "2026-07-08T03:45:00;src/derived/video-segments/sample-video_abc123.json;curated;no;obsolete state-bearing row",
    "2026-02-31T03:45:00;src/derived/video-segments/sample-video_abc123.json;curated;complete",
    "2026-07-08T03:45:00;src/derived/video-segments/missing_def456.json;curated;needs work",
    "",
  ].join("\n"), manifest);

  assert.equal(parsed.malformedRowCount, 3);
  assert.equal(parsed.unmappedRowCount, 1);
  assert.equal(parsed.ignoredRowCount, 0);
  assert.equal(parsed.records.length, 0);
});

test("counts an interior blank line as ignored", () => {
  const parsed = parseSiteContentProcessingLog([
    SITE_CONTENT_PROCESSING_LOG_HEADER,
    "",
    "2026-07-08T03:45:00;src/derived/video-segments/sample-video_abc123.json;audited;complete",
  ].join("\n"), manifest);

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.ignoredRowCount, 1);
});

test("requires the exact canonical header", () => {
  assert.throws(() => parseSiteContentProcessingLog("timestamp\tshardPath\n", manifest), /exact header/u);
});
