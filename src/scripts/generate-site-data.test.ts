import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { topicNormalizationPatternHeader } from "../site/topic-normalization.js";

const execFileAsync = promisify(execFile);
const generateScriptPath = fileURLToPath(
    new URL("../../src/scripts/generate-site-data-bun.ts", import.meta.url),
);
const syncScriptPath = fileURLToPath(
    new URL("../../src/scripts/sync-video-topics-bun.ts", import.meta.url),
);

test("generation rejects pending normalization before changing topic or archive output", async () => {
  const fixture = await makeFixture();
  const topicStorePath = join(fixture.segmentsInput, "topics.json");
  const topicStoreText = `${JSON.stringify({
    topics: [{
      slug: "old-topic",
      title: "Old Topic",
      summary: "Manually curated fixture description.",
    }],
  }, null, 2)}\n`;
  try {
    await writeFile(topicStorePath, topicStoreText, "utf8");
    await writeFile(join(fixture.segmentsInput, "fixture_abc123.json"), JSON.stringify({
      videoId: "abc123",
      topics: ["old-topic"],
      segments: [{
        id: "segment-one",
        slug: "segment-one",
        videoId: "abc123",
        title: "Segment one",
        kind: "chapter",
        start: "0:00",
        topics: ["old-topic"],
        summary: "Summary.",
        body: "Body.",
        sourcePath: "src/transcripts/txt/fixture_abc123.txt",
        evidence: [{
          start: "0:00",
          note: "Fixture evidence.",
        }],
      }],
    }), "utf8");
    await writeFile(fixture.patternsInput, normalizationCatalogText(), "utf8");

    await assert.rejects(
        runGenerator(fixture),
        (error: unknown) => {
          const stderr = commandStderr(error);
          assert.match(stderr, /Topic normalization preflight failed/u);
          assert.match(stderr, /old-topic/u);
          return true;
        },
    );
    assert.equal(await readFile(topicStorePath, "utf8"), topicStoreText);
    assert.equal(await readFile(fixture.sentinelPath, "utf8"), "existing archive bytes\n");
  } finally {
    await rm(fixture.root, {recursive: true, force: true});
  }
});

test("generation rejects an invalid catalog before changing archive output", async () => {
  const fixture = await makeFixture();
  try {
    await writeFile(fixture.patternsInput, "not\ta\tvalid\tcatalog\n", "utf8");
    await assert.rejects(
        runGenerator(fixture),
        (error: unknown) => {
          assert.match(commandStderr(error), /Invalid topic normalization catalog/u);
          return true;
        },
    );
    assert.equal(await readFile(fixture.sentinelPath, "utf8"), "existing archive bytes\n");
  } finally {
    await rm(fixture.root, {recursive: true, force: true});
  }
});

test("missing topics require explicit synchronization while generation remains source-read-only", async () => {
  const fixture = await makeFixture();
  try {
    const canonicalPaths = await writeCompleteArchiveInputs(fixture);
    const topicStorePath = join(fixture.segmentsInput, "topics.json");
    const beforeGeneration = await readTextSnapshot(canonicalPaths);

    await assert.rejects(
        runGenerator(fixture),
        (error: unknown) => {
          const stderr = commandStderr(error);
          assert.match(stderr, /Topic registry synchronization is required/u);
          assert.match(stderr, /missing topics: royal-navy/u);
          assert.match(stderr, /npm run sync:video-topics/u);
          return true;
        },
    );
    assert.deepEqual(await readTextSnapshot(canonicalPaths), beforeGeneration);
    assert.equal(await readFile(fixture.sentinelPath, "utf8"), "existing archive bytes\n");

    await runSynchronizer(fixture);
    const synchronizedStoreText = await readFile(topicStorePath, "utf8");
    const synchronizedStore = JSON.parse(synchronizedStoreText) as {
      topics: Array<{ slug: string; title: string; summary?: string }>;
    };
    assert.deepEqual(synchronizedStore.topics, [
      {
        slug: "destroyers",
        title: "Destroyers",
        summary: "Manually curated fixture description.",
      },
      {
        slug: "royal-navy",
        title: "Royal Navy",
        summary: "",
      },
    ]);
    const afterSynchronization = await readTextSnapshot(canonicalPaths);
    for (const path of canonicalPaths) {
      if (path !== topicStorePath) {
        assert.equal(afterSynchronization[path], beforeGeneration[path], path);
      }
    }

    await runSynchronizer(fixture);
    assert.equal(await readFile(topicStorePath, "utf8"), synchronizedStoreText);

    await runGenerator(fixture);
    assert.deepEqual(await readTextSnapshot(canonicalPaths), afterSynchronization);
    const firstArchive = await readArchiveSnapshot(fixture.outputDir);
    assert.ok(firstArchive["index.json"]);
    assert.ok(firstArchive["topics.json"]);

    await runGenerator(fixture);
    assert.deepEqual(await readTextSnapshot(canonicalPaths), afterSynchronization);
    assert.deepEqual(await readArchiveSnapshot(fixture.outputDir), firstArchive);
  } finally {
    await rm(fixture.root, {recursive: true, force: true});
  }
});

interface GeneratorFixture {
  root: string;
  episodesInput: string;
  metadataInput: string;
  transcriptsInput: string;
  segmentsInput: string;
  patternsInput: string;
  outputDir: string;
  sentinelPath: string;
}

async function makeFixture(): Promise<GeneratorFixture> {
  const root = await mkdtemp(join(tmpdir(), "generate-site-normalization-"));
  const segmentsInput = join(root, "segments");
  const outputDir = join(root, "archive");
  await mkdir(segmentsInput);
  await mkdir(outputDir);
  const sentinelPath = join(outputDir, "sentinel.txt");
  await writeFile(sentinelPath, "existing archive bytes\n", "utf8");
  return {
    root,
    episodesInput: join(root, "episodes.json"),
    metadataInput: join(root, "metadata.json"),
    transcriptsInput: join(root, "transcripts.json"),
    segmentsInput,
    patternsInput: join(root, "patterns.tsv"),
    outputDir,
    sentinelPath,
  };
}

async function runGenerator(fixture: GeneratorFixture): Promise<unknown> {
  return execFileAsync("bun", [
    "run",
    generateScriptPath,
    "--episodes-input", fixture.episodesInput,
    "--metadata-input", fixture.metadataInput,
    "--transcripts-input", fixture.transcriptsInput,
    "--segments-input", fixture.segmentsInput,
    "--patterns-input", fixture.patternsInput,
    "--output-dir", fixture.outputDir,
  ]);
}

async function runSynchronizer(fixture: GeneratorFixture): Promise<unknown> {
  return execFileAsync("bun", [
    "run",
    syncScriptPath,
    "--segments-input", fixture.segmentsInput,
    "--patterns-input", fixture.patternsInput,
  ]);
}

async function writeCompleteArchiveInputs(fixture: GeneratorFixture): Promise<string[]> {
  const fileStem = "2026-07-08_T00-00-00_sample-video_abc123";
  const episodesPath = fixture.episodesInput;
  const metadataPath = fixture.metadataInput;
  const transcriptsPath = fixture.transcriptsInput;
  const shardPath = join(fixture.segmentsInput, `${fileStem}.json`);
  const topicStorePath = join(fixture.segmentsInput, "topics.json");
  await Promise.all([
    writeFile(fixture.patternsInput, `${topicNormalizationPatternHeader.join("\t")}\n`, "utf8"),
    writeFile(episodesPath, `${JSON.stringify({
      episodes: [{
        videoId: "abc123",
        title: "Sample Video",
        slug: "sample-video",
        url: "https://www.youtube.com/watch?v=abc123",
        fileStem,
        tabs: ["streams"],
        transcript: {status: "stored"},
      }],
    }, null, 2)}\n`, "utf8"),
    writeFile(metadataPath, `${JSON.stringify({
      videos: [{
        videoId: "abc123",
        fetchedAt: "2026-07-08T01:00:00Z",
        snippet: {
          title: "Sample Video",
          publishedAt: "2026-07-08T00:00:00Z",
          liveBroadcastContent: "none",
          thumbnails: {high: {url: "https://example.test/thumb.jpg"}},
        },
        contentDetails: {duration: "PT1H2M3S"},
        status: {uploadStatus: "processed"},
      }],
    }, null, 2)}\n`, "utf8"),
    writeFile(transcriptsPath, `${JSON.stringify({
      transcripts: [{
        videoId: "abc123",
        fileStem,
        paths: {txt: `txt/${fileStem}.txt`},
      }],
    }, null, 2)}\n`, "utf8"),
    writeFile(shardPath, `${JSON.stringify({
      videoId: "abc123",
      topics: ["destroyers", "royal-navy"],
      segments: [{
        id: "intro",
        slug: "intro",
        videoId: "abc123",
        title: "Introduction",
        kind: "chapter",
        start: "0:00",
        topics: ["destroyers", "royal-navy"],
        summary: "Intro segment.",
        body: "Intro body.",
        sourcePath: `src/transcripts/txt/${fileStem}.txt`,
        evidence: [{start: "0:00", note: "Fixture evidence."}],
      }],
    }, null, 2)}\n`, "utf8"),
    writeFile(topicStorePath, `${JSON.stringify({
      topics: [{
        slug: "destroyers",
        title: "Destroyers",
        summary: "Manually curated fixture description.",
      }],
    }, null, 2)}\n`, "utf8"),
  ]);
  return [
    episodesPath,
    metadataPath,
    transcriptsPath,
    fixture.patternsInput,
    shardPath,
    topicStorePath,
  ];
}

async function readTextSnapshot(paths: readonly string[]): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(paths.map(async (path) => (
      [path, await readFile(path, "utf8")] as const
  ))));
}

async function readArchiveSnapshot(root: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  await visit(root, "");
  return snapshot;

  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const path = join(directory, entry.name);
      const relativePath = relativeDirectory.length === 0
          ? entry.name
          : `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(path, relativePath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        snapshot[relativePath] = await readFile(path, "utf8");
      }
    }
  }
}

function normalizationCatalogText(): string {
  const row = [
    "normalize-old-topic",
    "active",
    "creation",
    "exact",
    "old-topic",
    "canonical-topic",
    "Canonical Topic",
    "[\"Old Topic\"]",
    "Confirmed test duplicate",
  ].join("\t");
  return `${topicNormalizationPatternHeader.join("\t")}\n${row}\n`;
}

function commandStderr(error: unknown): string {
  if (typeof error === "object" && error !== null && "stderr" in error) {
    return String((error as { stderr?: unknown }).stderr ?? "");
  }
  return "";
}
