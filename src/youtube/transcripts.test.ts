import assert from "node:assert/strict";
import test from "node:test";

import {
  extractJson3TranscriptSegments,
  extractTranscriptSegments,
  extractVttTranscriptSegments,
  transcriptToTsv,
  transcriptToTxt,
} from "./transcripts.js";

test("extracts transcript segments from legacy transcript shape", () => {
  const segments = extractTranscriptSegments({
    transcript: {
      content: {
        body: {
          initial_segments: [
            {
              type: "TranscriptSegment",
              start_ms: "1230",
              end_ms: "4560",
              snippet: { text: "Opening line" },
              start_time_text: { text: "0:01" },
              target_id: "abc.transcript.0",
            },
            {
              type: "TranscriptSectionHeader",
              title: { text: "Chapter" },
            },
          ],
        },
      },
    },
  });

  assert.deepEqual(segments, [
    {
      startMs: 1230,
      endMs: 4560,
      startSeconds: 1,
      endSeconds: 5,
      startTimeText: "0:01",
      text: "Opening line",
      targetId: "abc.transcript.0",
    },
  ]);
});

test("extracts transcript segments from YouTube json3 caption events", () => {
  const segments = extractJson3TranscriptSegments({
    events: [
      {
        tStartMs: 1234,
        dDurationMs: 2200,
        segs: [{ utf8: "Opening" }, { utf8: " line" }],
      },
      {
        tStartMs: 4000,
      },
    ],
  });

  assert.deepEqual(segments, [
    {
      startMs: 1234,
      endMs: 3434,
      startSeconds: 1,
      endSeconds: 4,
      startTimeText: "0:01",
      text: "Opening line",
    },
  ]);
});

test("extracts transcript segments from WebVTT captions", () => {
  const segments = extractVttTranscriptSegments(`WEBVTT

00:00:01.234 --> 00:00:03.434 align:start
<c>Opening</c> &amp; line

00:00:04.000 --> 00:00:04.500

`);

  assert.deepEqual(segments, [
    {
      startMs: 1234,
      endMs: 3434,
      startSeconds: 1,
      endSeconds: 4,
      startTimeText: "0:01",
      text: "Opening & line",
    },
  ]);
});

test("formats transcript text and TSV outputs", () => {
  const transcript = {
    videoId: "abc123",
    source: "watch-page-captions" as const,
    fetchedAt: "2026-07-07T00:00:00.000Z",
    selectedLanguage: "English",
    availableLanguages: ["English"],
    segments: [
      {
        startMs: 1000,
        endMs: 2500,
        startSeconds: 1,
        endSeconds: 3,
        startTimeText: "0:01",
        text: "First\tline",
      },
    ],
  };

  assert.equal(transcriptToTxt(transcript), "[0:01] First\tline\n");
  assert.equal(
    transcriptToTsv(transcript),
    "StartSeconds\tEndSeconds\tStart\tText\tVideoUrl\n1\t3\t0:01\tFirst line\thttps://youtu.be/abc123?t=1\n",
  );
});
