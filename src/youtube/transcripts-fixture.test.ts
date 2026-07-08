import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  findStoredTranscriptRecord,
  readVideoTranscriptJson,
  transcriptToTxt,
  writeTranscriptStorage,
} from "./transcripts.js";

test("reads structured transcript JSON for conversion", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-"));
  const input = join(dir, "sample.json");

  try {
    await writeFile(
      input,
      JSON.stringify({
        videoId: "abc123",
        source: "watch-page-captions",
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

test("stores transcript JSON, TXT, TSV, and manifest under a local root", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-store-"));

  try {
    const paths = await writeTranscriptStorage(
      {
        videoId: "abc123",
        videoTitle: "Ships & Strategy: A Test!",
        videoPublishedAt: "2026-06-14T05:29:19-05:00",
        source: "youtube-transcript-plus",
        fetchedAt: "2026-07-07T00:00:00.000Z",
        selectedLanguage: "en",
        availableLanguages: ["en"],
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
      },
      dir,
    );

    assert.equal(await readFile(paths.txtOutput, "utf8"), "[0:00] Hello\n");
    assert.equal(await readFile(paths.tsvOutput, "utf8"), "StartSeconds\tEndSeconds\tStart\tText\tVideoUrl\n0\t1\t0:00\tHello\thttps://youtu.be/abc123?t=0\n");

    const manifest = JSON.parse(await readFile(paths.manifestOutput, "utf8"));
    assert.equal(manifest.transcripts[0].videoId, "abc123");
    assert.equal(manifest.transcripts[0].fileStem, "2026-06-14_T05-29-19-0500_ships-and-strategy-a-test_abc123");
    assert.equal(manifest.transcripts[0].videoTitle, "Ships & Strategy: A Test!");
    assert.equal(manifest.transcripts[0].paths.json, "json/2026-06-14_T05-29-19-0500_ships-and-strategy-a-test_abc123.json");
    assert.equal((await readVideoTranscriptJson(paths.jsonOutput)).source, "youtube-transcript-plus");

    const stored = await findStoredTranscriptRecord({ videoId: "abc123", root: dir, language: "en" });
    assert.equal(stored?.paths.jsonOutput, paths.jsonOutput);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("removes superseded transcript outputs when the stored stem changes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-store-"));

  try {
    const baseTranscript = {
      videoId: "abc123",
      source: "youtube-transcript-plus" as const,
      fetchedAt: "2026-07-07T00:00:00.000Z",
      selectedLanguage: "en",
      availableLanguages: ["en"],
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
    };

    const firstPaths = await writeTranscriptStorage(baseTranscript, dir);
    const secondPaths = await writeTranscriptStorage(
      {
        ...baseTranscript,
        videoTitle: "Ships & Strategy",
        videoPublishedAt: "2026-06-14T05:29:19-05:00",
      },
      dir,
    );

    await assert.rejects(readFile(firstPaths.jsonOutput, "utf8"), { code: "ENOENT" });
    assert.equal((await readVideoTranscriptJson(secondPaths.jsonOutput)).videoTitle, "Ships & Strategy");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
