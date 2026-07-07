import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { readVideoTranscriptJson, transcriptToTxt } from "./transcripts.js";

test("reads structured transcript JSON for conversion", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-"));
  const input = join(dir, "sample.json");

  try {
    await writeFile(
      input,
      JSON.stringify({
        videoId: "abc123",
        source: "youtubei.js",
        fetchedAt: "2026-07-07T00:00:00.000Z",
        availableLanguages: ["English"],
        segments: [
          {
            startMs: 0,
            endMs: 1000,
            startSeconds: 0,
            endSeconds: 1,
            startTimeText: "0:00",
            text: "Hello",
          },
        ],
      }),
      "utf8",
    );

    const transcript = await readVideoTranscriptJson(input);
    assert.equal(transcriptToTxt(transcript), "[0:00] Hello\n");
    assert.equal(await readFile(input, "utf8").then((content) => JSON.parse(content).videoId), "abc123");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
