import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { CuratedVideoFileSeed } from "../content/schemas/index.js";
import {
  main as searchSiteContentWording,
  parseArgs,
  searchCuratedVideoFileWording,
} from "./search-site-content-wording.js";

test("shard wording search covers every segment text field with word boundaries", () => {
  const video = sampleVideo();
  const hits = searchCuratedVideoFileWording("example.json", video, {
    phrases: ["the transcript"],
    caseSensitive: false,
    substring: false,
  });

  assert.deepEqual(hits.map(({ field, evidenceIndex, occurrenceCount }) => ({
    field, evidenceIndex, occurrenceCount,
  })), [
    { field: "title", evidenceIndex: undefined, occurrenceCount: 1 },
    { field: "summary", evidenceIndex: undefined, occurrenceCount: 1 },
    { field: "body", evidenceIndex: undefined, occurrenceCount: 1 },
    { field: "question", evidenceIndex: undefined, occurrenceCount: 1 },
    { field: "answerShort", evidenceIndex: undefined, occurrenceCount: 1 },
    { field: "evidence.note", evidenceIndex: 0, occurrenceCount: 2 },
  ]);
  assert.equal(hits.reduce((count, hit) => count + hit.occurrenceCount, 0), 7);
  assert.equal(
    searchCuratedVideoFileWording("example.json", video, {
      phrases: ["the transcript"],
      caseSensitive: true,
      substring: false,
    }).length,
    2,
  );
  assert.equal(
    searchCuratedVideoFileWording("example.json", video, {
      phrases: ["the transcript"],
      caseSensitive: false,
      substring: true,
    }).find(({ field }) => field === "body")?.occurrenceCount,
    2,
  );

  const excerptVideo = sampleVideo();
  const excerptSegment = excerptVideo.segments[0]!;
  excerptSegment.title = "Neutral title";
  excerptSegment.summary = "Neutral summary.";
  excerptSegment.body = `THE TRANSCRIPT ${"x".repeat(240)} The transcript matches here.`;
  if (excerptSegment.kind === "qa") {
    excerptSegment.question = "Neutral question?";
    excerptSegment.answerShort = "Neutral answer.";
  }
  excerptSegment.evidence[0]!.note = "Neutral evidence note.";
  const caseSensitiveHit = searchCuratedVideoFileWording("example.json", excerptVideo, {
    phrases: ["The transcript"],
    caseSensitive: true,
    substring: false,
  })[0]!;
  assert.match(caseSensitiveHit.excerpt, /The transcript matches here\./u);
  assert.doesNotMatch(caseSensitiveHit.excerpt, /THE TRANSCRIPT/u);

  excerptSegment.body = "\u0130 The transcript remains discoverable after an expanding lowercase character.";
  const unicodeOffsetHit = searchCuratedVideoFileWording("example.json", excerptVideo, {
    phrases: ["the transcript"],
    caseSensitive: false,
    substring: false,
  })[0]!;
  assert.equal(unicodeOffsetHit.occurrenceCount, 1);
  assert.match(unicodeOffsetHit.excerpt, /The transcript remains discoverable/u);
});

test("shard wording search CLI prints scoped locations and treats matches as discovery", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "search-site-content-wording-"));
  const shardDirectory = join(repoRoot, "src/derived/video-segments");
  const shardRelativePath = "src/derived/video-segments/example.json";
  try {
    await mkdir(shardDirectory, { recursive: true });
    await writeFile(
      join(repoRoot, shardRelativePath),
      `${JSON.stringify(sampleVideo(), null, 2)}\n`,
      "utf8",
    );

    const output = await captureConsole(() => searchSiteContentWording([
      "--repo-root",
      repoRoot,
      "--path",
      shardRelativePath,
      "--phrase",
      "the transcript",
    ]));

    assert.equal(output.result, 0);
    assert.equal(output.errors.length, 0);
    assert.match(
      output.logs[0] ?? "",
      /matching-files=1 matching-segments=1 matching-fields=6 matched-occurrences=7 parse-errors=0/u,
    );
    assert.match(output.logs.join("\n"), /example\.json#wording-search@1:00 \[qa\/title\]/u);
    assert.match(output.logs.join("\n"), /\[qa\/evidence\[0\]\.note\] occurrences=2/u);

    await writeFile(join(repoRoot, shardRelativePath), "{", "utf8");
    const failed = await captureConsole(() => searchSiteContentWording([
      "--repo-root",
      repoRoot,
      "--path",
      shardRelativePath,
      "--phrase",
      "the transcript",
      "--summary-only",
    ]));
    assert.equal(failed.result, 1);
    assert.match(failed.errors.join("\n"), /parse-errors=1/u);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("shard wording search CLI requires a phrase and parses search controls", () => {
  assert.throws(() => parseArgs([]), /Provide at least one --phrase/u);
  assert.deepEqual(
    parseArgs([
      "--phrase", "the transcript",
      "--phrase", "the transcript",
      "--case-sensitive",
      "--substring",
      "--summary-only",
      "--path", "one.json",
    ]),
    {
      repoRoot: ".",
      segmentsInput: "src/derived/video-segments",
      paths: ["one.json"],
      phrases: ["the transcript"],
      caseSensitive: true,
      substring: true,
      summaryOnly: true,
    },
  );
  assert.deepEqual(
    parseArgs(["--phrase", "The Transcript", "--phrase", "the transcript"])?.phrases,
    ["The Transcript"],
  );
  assert.deepEqual(
    parseArgs([
      "--phrase", "The Transcript",
      "--phrase", "the transcript",
      "--case-sensitive",
    ])?.phrases,
    ["The Transcript", "the transcript"],
  );
});

function sampleVideo(): CuratedVideoFileSeed {
  return {
    videoId: "abcdefghijk",
    topics: [],
    segments: [
      {
        slug: "wording-search",
        title: "The transcript titles the subject",
        kind: "qa",
        start: "1:00",
        end: "2:00",
        topics: [],
        summary: "THE TRANSCRIPT summarizes the subject.",
        body: "The transcript explains the detail. The transcription remains a valid separate word.",
        question: "What does the transcript ask?",
        answerShort: "The transcript gives the answer.",
        sourcePath: "src/transcripts/txt/example_abcdefghijk.txt",
        evidence: [
          {
            start: "1:00",
            end: "2:00",
            note: "The transcript identifies one point; the transcript identifies another.",
          },
        ],
      },
    ],
  };
}

async function captureConsole<T>(operation: () => Promise<T>): Promise<{
  result: T;
  logs: string[];
  errors: string[];
}> {
  const originalLog = console.log;
  const originalError = console.error;
  const logs: string[] = [];
  const errors: string[] = [];
  try {
    console.log = (...values: unknown[]) => logs.push(values.map(String).join(" "));
    console.error = (...values: unknown[]) => errors.push(values.map(String).join(" "));
    return { result: await operation(), logs, errors };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
