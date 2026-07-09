import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildSiteArchiveData } from "./archive-data.js";
import { loadCuratedArchiveSeed } from "./curated-seed.js";

test("builds deterministic site archive data from channel metadata and segment seeds", () => {
  const archive = buildSiteArchiveData(sampleInput());

  assert.equal(archive.videos.length, 1);
  assert.equal(archive.videos[0]?.slug, "sample-video");
  assert.deepEqual(archive.videos[0]?.segmentSlugs, ["intro", "qa-segment"]);
  assert.equal(archive.segments[1]?.kind, "qa");
  assert.equal(archive.segments[1]?.start, "12:01");
  assert.equal(archive.segments[1]?.youtubeUrl, "https://www.youtube.com/watch?v=abc123&t=721s");
  assert.equal(archive.topics.find((topic) => topic.slug === "destroyers")?.segmentCount, 2);
});

test("rejects duplicate segment routes", () => {
  const input = sampleInput();
  input.seed.segments.push({
    ...input.seed.segments[0]!,
    id: "second-id",
  });

  assert.throws(
    () => buildSiteArchiveData(input),
    /Duplicate segment slug: intro/u,
  );
});

test("makes duplicate video title slugs route-unique", () => {
  const input = sampleInput();
  input.episodesStore.episodes.push({
    videoId: "def456",
    title: "Sample Video",
    slug: "sample-video",
    url: "https://www.youtube.com/watch?v=def456",
  });
  input.seed.videos.push({
    videoId: "def456",
    topics: ["destroyers"],
  });

  const archive = buildSiteArchiveData(input);

  assert.equal(archive.videos[0]?.slug, "sample-video");
  assert.equal(archive.videos[1]?.slug, "sample-video-def456");
});

test("rejects segment references to unknown topics", () => {
  const input = sampleInput();
  input.seed.segments[0]!.topics = ["missing-topic"];

  assert.throws(
    () => buildSiteArchiveData(input),
    /Segment intro references missing topic: missing-topic/u,
  );
});

test("loads curated site content from per-video files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "naval-site-content-"));
  try {
    await writeFile(join(directory, "topics.json"), JSON.stringify({
      schemaVersion: 1,
      topics: [
        {
          slug: "destroyers",
          title: "Destroyers",
          summary: "Destroyer discussions.",
        },
      ],
    }));
    await writeFile(join(directory, "video-abc123.json"), JSON.stringify({
      schemaVersion: 1,
      videoId: "abc123",
      topics: ["destroyers"],
      segments: [
        {
          id: "intro",
          slug: "intro",
          videoId: "abc123",
          title: "Intro",
          kind: "chapter",
          start: "0:00",
          topics: ["destroyers"],
          summary: "Intro segment.",
          body: "Intro body.",
        },
      ],
    }));

    const seed = await loadCuratedArchiveSeed(directory);

    assert.equal(seed.videos.length, 1);
    assert.equal(seed.videos[0]?.videoId, "abc123");
    assert.equal(seed.segments[0]?.id, "intro");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function sampleInput(): Parameters<typeof buildSiteArchiveData>[0] {
  return {
    source: {
      episodesInput: "episodes.json",
      metadataInput: "metadata.json",
      segmentsInput: "segments.json",
    },
    episodesStore: {
      episodes: [
        {
          videoId: "abc123",
          title: "Sample Video",
          slug: "sample-video",
          url: "https://www.youtube.com/watch?v=abc123",
          tabs: ["streams"],
          transcript: { status: "stored" },
        },
      ],
    },
    metadataStore: {
      videos: [
        {
          videoId: "abc123",
          snippet: {
            title: "Sample Video",
            publishedAt: "2026-07-08T00:00:00Z",
            thumbnails: { high: { url: "https://example.test/thumb.jpg" } },
          },
          contentDetails: { duration: "PT1H2M3S" },
          statistics: { viewCount: "1234" },
        },
      ],
    },
    seed: {
      schemaVersion: 1,
      videos: [
        {
          videoId: "abc123",
          topics: ["destroyers"],
        },
      ],
      topics: [
        {
          slug: "destroyers",
          title: "Destroyers",
          summary: "Destroyer discussions.",
        },
      ],
      segments: [
        {
          id: "intro",
          slug: "intro",
          videoId: "abc123",
          title: "Intro",
          kind: "chapter",
          start: "0:00",
          topics: ["destroyers"],
          summary: "Intro segment.",
          body: "Intro body.",
        },
        {
          id: "qa",
          slug: "qa-segment",
          videoId: "abc123",
          title: "Question",
          kind: "qa",
          start: "12:01",
          topics: ["destroyers"],
          question: "Question?",
          answerShort: "Answer.",
          summary: "Q&A segment.",
          body: "Q&A body.",
        },
      ],
    },
  };
}
