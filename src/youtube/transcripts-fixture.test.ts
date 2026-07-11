import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  findStoredTranscriptRecord,
  parseVideoTranscriptJson,
  transcriptToTxt,
  writeTranscriptStorage,
  type VideoTranscript,
} from "./transcripts.js";

test("parses an external structured transcript payload", () => {
  const transcript = parseVideoTranscriptJson({
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
  });

  assert.equal(transcriptToTxt(transcript), "[0:00] Hello\n");
});

test("stores transcript TXT and a version 2 manifest under a local root", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-store-"));

  try {
    const paths = await writeTranscriptStorage(sampleTranscript(), dir);
    assert.equal(await readFile(paths.txtOutput, "utf8"), "[0:00] Hello\n");

    const manifest = JSON.parse(await readFile(paths.manifestOutput, "utf8"));
    assert.equal(manifest.schemaVersion, 2);
    assert.deepEqual(manifest.storage, { txt: "txt/{fileStem}.txt" });
    assert.equal(manifest.transcripts[0].videoId, "abc123");
    assert.equal(manifest.transcripts[0].fileStem, "2026-06-14_T05-29-19_ships-and-strategy-a-test_abc123");
    assert.equal(manifest.transcripts[0].videoTitle, "Ships & Strategy: A Test!");
    assert.deepEqual(manifest.transcripts[0].paths, {
      txt: "txt/2026-06-14_T05-29-19_ships-and-strategy-a-test_abc123.txt",
    });

    const stored = await findStoredTranscriptRecord({ videoId: "abc123", root: dir, language: "en" });
    assert.equal(stored?.paths.txtOutput, paths.txtOutput);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("requires the manifest-owned TXT file to treat a transcript as stored", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-store-"));

  try {
    const paths = await writeTranscriptStorage(sampleTranscript(), dir);
    await rm(paths.txtOutput);

    assert.equal(await findStoredTranscriptRecord({ videoId: "abc123", root: dir }), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("reuses the stored fileStem when an existing transcript is refetched", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-store-"));

  try {
    const firstPaths = await writeTranscriptStorage(sampleTranscript(), dir);
    const secondPaths = await writeTranscriptStorage(
      {
        ...sampleTranscript(),
        videoTitle: "Renamed Video",
        videoPublishedAt: "2026-07-11T00:00:00Z",
        segments: [{ ...sampleTranscript().segments[0]!, text: "Updated" }],
      },
      dir,
    );

    assert.equal(secondPaths.txtOutput, firstPaths.txtOutput);
    assert.equal(await readFile(secondPaths.txtOutput, "utf8"), "[0:00] Updated\n");
    const manifest = JSON.parse(await readFile(secondPaths.manifestOutput, "utf8"));
    assert.equal(manifest.transcripts[0].fileStem, "2026-06-14_T05-29-19_ships-and-strategy-a-test_abc123");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("removes a superseded safe TXT path while preserving the stored fileStem", async () => {
  const dir = await mkdtemp(join(tmpdir(), "naval-transcript-store-"));
  const oldTxt = join(dir, "txt", "old-name_abc123.txt");

  try {
    await mkdir(join(dir, "txt"), { recursive: true });
    await writeFile(oldTxt, "old\n", "utf8");
    await writeFile(
      join(dir, "manifest.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        updatedAt: "2026-07-07T00:00:00.000Z",
        storage: { json: "json/{fileStem}.json", txt: "txt/{fileStem}.txt" },
        transcripts: [{
          videoId: "abc123",
          fileStem: "replacement-name_abc123",
          source: "youtube-transcript-plus",
          fetchedAt: "2026-07-07T00:00:00.000Z",
          availableLanguages: ["en"],
          segmentCount: 1,
          paths: { json: "json/old-name_abc123.json", txt: "txt/old-name_abc123.txt" },
        }],
      }, null, 2)}\n`,
      "utf8",
    );

    const paths = await writeTranscriptStorage(sampleTranscript(), dir);
    await assert.rejects(readFile(oldTxt, "utf8"), { code: "ENOENT" });
    assert.equal(paths.txtOutput, join(dir, "txt", "replacement-name_abc123.txt"));
    assert.equal(await readFile(paths.txtOutput, "utf8"), "[0:00] Hello\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function sampleTranscript(): VideoTranscript {
  return {
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
  };
}
