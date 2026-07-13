import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildSiteArchiveData,
  canonicalSiteArchiveJson,
  reconstructSiteArchiveData,
  siteArchiveSegmentBucketCount,
  siteArchiveSegmentBucketId,
  siteArchiveSha256,
  splitSiteArchiveData,
  validateSiteArchiveDirectory,
  validateSiteArchiveSplitData,
  writeSiteArchiveSplitData,
} from "./archive-data.js";
import {
  findCuratedSegmentDuplicates,
  loadCuratedArchiveSeed,
} from "./curated-seed.js";

test("builds deterministic site archive data from channel metadata and segment seeds", () => {
  const archive = buildSiteArchiveData(sampleInput());

  assert.equal(archive.videos.length, 1);
  assert.equal(archive.videos[0]?.slug, "sample-video");
  assert.equal(archive.videos[0]?.publishedAt, "2026-07-08T00:00:00Z");
  assert.deepEqual(archive.videos[0]?.segmentSlugs, ["intro", "qa-segment"]);
  assert.equal(archive.segments[1]?.kind, "qa");
  assert.equal(archive.segments[1]?.start, "12:01");
  assert.equal(archive.segments[1]?.youtubeUrl, "https://www.youtube.com/watch?v=abc123&t=721s");
  assert.equal(archive.topics.find((topic) => topic.slug === "destroyers")?.segmentCount, 2);
});

test("uses livestream time instead of the advance upload timestamp", () => {
  const input = sampleInput();
  input.episodesStore.episodes[0]!.publishedAt = "2026-06-14T16:44:14Z";
  input.episodesStore.episodes[0]!.streamStartAt = "2026-07-12T18:30:00Z";

  const archive = buildSiteArchiveData(input);

  assert.equal(archive.videos[0]?.publishedAt, "2026-07-12T18:30:00Z");
});

test("splits and reconstructs the logical archive with 64 deterministic segment buckets", () => {
  const archive = buildSiteArchiveData(sampleInput());
  const split = splitSiteArchiveData(archive);

  assert.equal(siteArchiveSegmentBucketId("abc123"), "12");
  assert.equal(split.segmentBuckets.length, siteArchiveSegmentBucketCount);
  assert.deepEqual(
    split.segmentBuckets.map((bucket) => bucket.id),
    Array.from({ length: 64 }, (_, index) => index.toString(16).padStart(2, "0")),
  );
  assert.deepEqual(
    split.segmentBuckets.find((bucket) => bucket.id === "12")?.segments.map((segment) => segment.id),
    ["intro", "qa"],
  );
  assert.equal(split.manifest.files.segmentBuckets[0]?.path, "./segments/00.json");
  assert.equal(split.manifest.files.segmentBuckets[63]?.path, "./segments/3f.json");
  assert.equal(
    split.manifest.files.videos.sha256,
    siteArchiveSha256(canonicalSiteArchiveJson(split.videos)),
  );
  assert.deepEqual(reconstructSiteArchiveData(split), archive);
  assert.deepEqual(splitSiteArchiveData(archive), split);
});

test("keeps existing bucket filenames and assignments stable when records are appended", () => {
  const original = splitSiteArchiveData(buildSiteArchiveData(sampleInput()));
  const input = sampleInput();
  input.episodesStore.episodes.push({
    videoId: "def456",
    title: "Second Video",
    slug: "second-video",
  });
  input.seed.videos.push({ videoId: "def456", topics: ["destroyers"] });
  input.seed.segments.push({
    id: "second-video-intro",
    slug: "second-video-intro",
    videoId: "def456",
    title: "Second intro",
    kind: "chapter",
    start: "0:00",
    topics: ["destroyers"],
    summary: "Second intro segment.",
    body: "Second intro body.",
  });

  const appended = splitSiteArchiveData(buildSiteArchiveData(input));

  assert.deepEqual(
    appended.manifest.files.segmentBuckets.map((record) => record.path),
    original.manifest.files.segmentBuckets.map((record) => record.path),
  );
  assert.equal(siteArchiveSegmentBucketId("abc123"), "12");
  assert.equal(siteArchiveSegmentBucketId("def456"), "1c");
  assert.deepEqual(
    appended.segmentBuckets.find((bucket) => bucket.id === "12")?.segments.map((segment) => segment.id),
    ["intro", "qa"],
  );
});

test("writes, validates, and rewrites a byte-deterministic split archive directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "naval-split-archive-"));
  try {
    const archive = buildSiteArchiveData(sampleInput());
    const split = splitSiteArchiveData(archive);
    await writeSiteArchiveSplitData(directory, split);

    const firstManifest = await readFile(join(directory, "index.json"), "utf8");
    const firstBucket = await readFile(join(directory, "segments", "12.json"), "utf8");
    const loaded = await validateSiteArchiveDirectory(directory);
    assert.deepEqual(reconstructSiteArchiveData(loaded), archive);

    await writeSiteArchiveSplitData(directory, split);
    assert.equal(await readFile(join(directory, "index.json"), "utf8"), firstManifest);
    assert.equal(await readFile(join(directory, "segments", "12.json"), "utf8"), firstBucket);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects schema mismatch, misbucketed records, and damaged shard sets", async () => {
  const split = splitSiteArchiveData(buildSiteArchiveData(sampleInput()));
  const wrongSchema = structuredClone(split);
  (wrongSchema.manifest as { schemaVersion: number }).schemaVersion = 99;
  assert.throws(
    () => validateSiteArchiveSplitData(wrongSchema),
    /schemaVersion must be 2/u,
  );

  const misbucketed = structuredClone(split);
  const sourceBucket = misbucketed.segmentBuckets.find((bucket) => bucket.id === "12")!;
  const targetBucket = misbucketed.segmentBuckets.find((bucket) => bucket.id === "00")!;
  targetBucket.segments.push(sourceBucket.segments[0]!);
  sourceBucket.segments.splice(0, 1);
  for (const bucket of [sourceBucket, targetBucket]) {
    const record = misbucketed.manifest.files.segmentBuckets.find((candidate) => candidate.id === bucket.id)!;
    record.count = bucket.segments.length;
    record.sha256 = siteArchiveSha256(canonicalSiteArchiveJson(bucket.segments));
  }
  assert.throws(
    () => validateSiteArchiveSplitData(misbucketed),
    /belongs in 12/u,
  );

  const directory = await mkdtemp(join(tmpdir(), "naval-damaged-split-archive-"));
  try {
    await writeSiteArchiveSplitData(directory, split);
    await writeFile(join(directory, "segments", "12.json"), "[]\n", "utf8");
    await assert.rejects(
      () => validateSiteArchiveDirectory(directory),
      /SHA-256 mismatch/u,
    );

    await writeSiteArchiveSplitData(directory, split);
    await writeFile(join(directory, "segments", "extra.json"), "[]\n", "utf8");
    await assert.rejects(
      () => validateSiteArchiveDirectory(directory),
      /Unexpected site archive JSON file/u,
    );

    await writeSiteArchiveSplitData(directory, split);
    await rm(join(directory, "segments", "12.json"));
    await assert.rejects(
      () => validateSiteArchiveDirectory(directory),
      /Could not read generated site archive file/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
    await writeFile(join(directory, "2026-07-08_T00-00-00_sample-video_abc123.json"), JSON.stringify({
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

test("reports every source shard for duplicate segment IDs and slugs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "naval-site-content-duplicates-"));
  try {
    await writeFile(join(directory, "topics.json"), JSON.stringify({
      schemaVersion: 1,
      topics: [],
    }));
    await writeFile(join(directory, "2026-07-08_T00-00-00_first-video_abc123.json"), JSON.stringify({
      schemaVersion: 1,
      videoId: "abc123",
      topics: [],
      segments: [sampleCuratedSegment("abc123", "First title")],
    }));
    await writeFile(join(directory, "2026-07-07_T00-00-00_second-video_def456.json"), JSON.stringify({
      schemaVersion: 1,
      videoId: "def456",
      topics: [],
      segments: [sampleCuratedSegment("def456", "Second title")],
    }));

    const duplicates = await findCuratedSegmentDuplicates(directory);
    assert.deepEqual(
      duplicates.map((duplicate) => [duplicate.field, duplicate.value, duplicate.occurrences.length]),
      [
        ["id", "duplicate-segment", 2],
        ["slug", "duplicate-segment", 2],
      ],
    );

    await assert.rejects(
      () => loadCuratedArchiveSeed(directory),
      (error: Error) => {
        assert.match(error.message, /Duplicate segment ID: duplicate-segment/u);
        assert.match(error.message, /first-video_abc123\.json/u);
        assert.match(error.message, /second-video_def456\.json/u);
        assert.match(error.message, /First title/u);
        assert.match(error.message, /Second title/u);
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("loads readable shard filenames in video-ID order rather than filename order", async () => {
  const directory = await mkdtemp(join(tmpdir(), "naval-site-content-order-"));
  try {
    await writeFile(join(directory, "topics.json"), JSON.stringify({ schemaVersion: 1, topics: [] }));
    await writeFile(join(directory, "z-readable-name_abc123.json"), JSON.stringify({
      schemaVersion: 1,
      videoId: "abc123",
      topics: [],
      segments: [sampleCuratedSegment("abc123", "First")],
    }));
    await writeFile(join(directory, "a-readable-name_def456.json"), JSON.stringify({
      schemaVersion: 1,
      videoId: "def456",
      topics: [],
      segments: [{
        ...sampleCuratedSegment("def456", "Second"),
        id: "second-segment",
        slug: "second-segment",
      }],
    }));

    const seed = await loadCuratedArchiveSeed(directory);
    assert.deepEqual(seed.videos.map((video) => video.videoId), ["abc123", "def456"]);
    assert.deepEqual(seed.segments.map((segment) => segment.videoId), ["abc123", "def456"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects duplicate video identities across readable shard filenames", async () => {
  const directory = await mkdtemp(join(tmpdir(), "naval-site-content-duplicate-video-"));
  try {
    await writeFile(join(directory, "topics.json"), JSON.stringify({ schemaVersion: 1, topics: [] }));
    await writeFile(join(directory, "first-readable-name_abc123.json"), JSON.stringify({
      schemaVersion: 1,
      videoId: "abc123",
      topics: [],
      segments: [],
    }));
    await writeFile(join(directory, "second-readable-name_abc123.json"), JSON.stringify({
      schemaVersion: 1,
      videoId: "abc123",
      topics: [],
      segments: [],
    }));

    await assert.rejects(
      () => loadCuratedArchiveSeed(directory),
      /Video abc123 appears in both/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function sampleCuratedSegment(videoId: string, title: string) {
  return {
    id: "duplicate-segment",
    slug: "duplicate-segment",
    videoId,
    title,
    kind: "chapter",
    start: "1:23",
    topics: [],
    summary: "Summary.",
    body: "Body.",
  };
}

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
