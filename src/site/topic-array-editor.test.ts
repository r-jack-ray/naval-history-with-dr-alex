import assert from "node:assert/strict";
import test from "node:test";

import {
  editTopicArraysPreservingFormatting,
  inspectTopicArrays,
  topicArrayPathKey,
  type AppliedTopicArrayEdit,
} from "./topic-array-editor.js";

test("finds top-level and segment topic arrays with stable JSON paths", () => {
  const text = JSON.stringify({
    schemaVersion: 1,
    videoId: "abc123",
    topics: ["video-topic"],
    segments: [
      { id: "first", topics: ["first-topic"] },
      { id: "second", topics: ["second-topic", "shared-topic"] },
    ],
  });

  const locations = inspectTopicArrays(text, "fixture.json");
  assert.deepEqual(locations.map((location) => ({
    kind: location.kind,
    segmentIndex: location.segmentIndex,
    segmentId: location.segmentId,
    path: topicArrayPathKey(location.path),
    topics: location.topics,
  })), [
    {
      kind: "video",
      segmentIndex: undefined,
      segmentId: undefined,
      path: "/topics",
      topics: ["video-topic"],
    },
    {
      kind: "segment",
      segmentIndex: 0,
      segmentId: "first",
      path: "/segments/0/topics",
      topics: ["first-topic"],
    },
    {
      kind: "segment",
      segmentIndex: 1,
      segmentId: "second",
      path: "/segments/1/topics",
      topics: ["second-topic", "shared-topic"],
    },
  ]);
});

test("edits only requested inline topic-array spans", () => {
  const before = "{\"schemaVersion\":1,\"videoId\":\"abc\",\"topics\":[\"old-topic\", \"keep-topic\"],\"note\":\"topics [not data]\",\"segments\":[{\"id\":\"one\",\"videoId\":\"abc\",\"topics\": [ \"old-topic\",\"keep-topic\" ],\"body\":\"unchanged\"}]}\n";
  const result = editTopicArraysPreservingFormatting(before, [
    { path: ["topics"], topics: ["canonical-topic", "keep-topic"] },
    { path: ["segments", 0, "topics"], topics: ["canonical-topic"] },
  ], "inline.json");

  assert.equal(result.changed, true);
  assert.equal(result.edits.length, 2);
  assert.match(result.text, /"topics":\["canonical-topic", "keep-topic"\]/u);
  assert.match(result.text, /"topics": \[ "canonical-topic" \]/u);
  assert.match(result.text, /"note":"topics \[not data\]"/u);
  assert.match(result.text, /"body":"unchanged"/u);
  assert.equal(
    textOutsideEdits(before, result.edits, "before"),
    textOutsideEdits(result.text, result.edits, "after"),
  );

  const parsed = JSON.parse(result.text) as {
    topics: string[];
    segments: Array<{ topics: string[] }>;
  };
  assert.deepEqual(parsed.topics, ["canonical-topic", "keep-topic"]);
  assert.deepEqual(parsed.segments[0]?.topics, ["canonical-topic"]);
});

test("preserves CRLF and indentation style inside multiline topic arrays", () => {
  const before = [
    "{",
    "  \"schemaVersion\": 1,",
    "  \"videoId\": \"abc\",",
    "  \"topics\": [",
    "      \"old-topic\",",
    "      \"keep-topic\"",
    "  ],",
    "  \"segments\": [",
    "    {",
    "      \"id\": \"one\",",
    "      \"topics\": [",
    "        \"old-topic\",",
    "        \"keep-topic\"",
    "      ],",
    "      \"body\": \"This exact prose remains untouched.\"",
    "    }",
    "  ]",
    "}",
    "",
  ].join("\r\n");

  const result = editTopicArraysPreservingFormatting(before, [
    { path: ["topics"], topics: ["canonical-topic", "keep-topic"] },
    { path: ["segments", 0, "topics"], topics: ["canonical-topic"] },
  ], "multiline.json");

  assert.equal(result.text.includes("\r\n"), true);
  assert.equal(result.text.replaceAll("\r\n", "").includes("\n"), false);
  assert.match(
    result.text,
    /"topics": \[\r\n      "canonical-topic",\r\n      "keep-topic"\r\n  \]/u,
  );
  assert.match(
    result.text,
    /"topics": \[\r\n        "canonical-topic"\r\n      \]/u,
  );
  assert.match(result.text, /This exact prose remains untouched\./u);
  assert.equal(
    textOutsideEdits(before, result.edits, "before"),
    textOutsideEdits(result.text, result.edits, "after"),
  );
});

test("returns a byte-identical no-op when requested topics are unchanged", () => {
  const before = "{\n  \"topics\": [\"same-topic\"],\n  \"segments\": []\n}\n";
  const result = editTopicArraysPreservingFormatting(before, [
    { path: ["topics"], topics: ["same-topic"] },
  ]);

  assert.deepEqual(result, { text: before, changed: false, edits: [] });
});

test("rejects duplicate, missing, and invalid update requests before editing", () => {
  const before = "{\"topics\":[\"same-topic\"],\"segments\":[]}";

  assert.throws(
    () => editTopicArraysPreservingFormatting(before, [
      { path: ["topics"], topics: ["first-topic"] },
      { path: ["topics"], topics: ["second-topic"] },
    ]),
    /Duplicate topic-array update for \/topics/u,
  );
  assert.throws(
    () => editTopicArraysPreservingFormatting(before, [
      { path: ["segments", 0, "topics"], topics: ["first-topic"] },
    ]),
    /update path does not exist/u,
  );
  assert.throws(
    () => editTopicArraysPreservingFormatting(before, [
      { path: ["topics"], topics: ["Not A Slug"] },
    ]),
    /invalid topic slug/u,
  );
});

test("rejects non-strict JSON and malformed shard topic arrays", () => {
  assert.throws(
    () => inspectTopicArrays("{\"topics\": [], // comment\n\"segments\": []}"),
    /InvalidCommentToken/u,
  );
  assert.throws(
    () => inspectTopicArrays("{\"topics\": []}"),
    /must include a segments array/u,
  );
  assert.throws(
    () => inspectTopicArrays("{\"topics\": \"not-an-array\", \"segments\": []}"),
    /video must include a topics array/u,
  );
  assert.throws(
    () => inspectTopicArrays("{\"topics\": [], \"segments\": [{\"id\":\"one\"}]}"),
    /segment one must include a topics array/u,
  );
  assert.throws(
    () => inspectTopicArrays("{\"topics\": [42], \"segments\": []}"),
    /topics must contain only strings/u,
  );
});

function textOutsideEdits(
  text: string,
  edits: readonly AppliedTopicArrayEdit[],
  image: "before" | "after",
): string {
  const chunks: string[] = [];
  let cursor = 0;
  for (const edit of edits) {
    const offset = image === "before" ? edit.beforeOffset : edit.afterOffset;
    const length = image === "before" ? edit.beforeLength : edit.afterLength;
    chunks.push(text.slice(cursor, offset));
    cursor = offset + length;
  }
  chunks.push(text.slice(cursor));
  return chunks.join("");
}
