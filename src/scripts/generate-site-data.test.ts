import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { topicNormalizationPatternHeader } from "../site/topic-normalization.js";

const execFileAsync = promisify(execFile);
const generateScriptPath = fileURLToPath(new URL("./generate-site-data.js", import.meta.url));

test("generation rejects pending normalization before changing topic or archive output", async () => {
  const fixture = await makeFixture();
  const topicStorePath = join(fixture.segmentsInput, "topics.json");
  const topicStoreText = `${JSON.stringify({
    schemaVersion: 1,
    topics: [{
      slug: "old-topic",
      title: "Old Topic",
      summary: "Watch points covering Old Topic across Dr. Alex Clarke's videos.",
    }],
  }, null, 2)}\n`;
  try {
    await writeFile(topicStorePath, topicStoreText, "utf8");
    await writeFile(join(fixture.segmentsInput, "fixture_abc123.json"), JSON.stringify({
      schemaVersion: 1,
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
    await rm(fixture.root, { recursive: true, force: true });
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
    await rm(fixture.root, { recursive: true, force: true });
  }
});

interface GeneratorFixture {
  root: string;
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
    segmentsInput,
    patternsInput: join(root, "patterns.tsv"),
    outputDir,
    sentinelPath,
  };
}

async function runGenerator(fixture: GeneratorFixture): Promise<unknown> {
  return execFileAsync(process.execPath, [
    generateScriptPath,
    "--episodes-input", join(fixture.root, "missing-episodes.json"),
    "--metadata-input", join(fixture.root, "missing-metadata.json"),
    "--transcripts-input", join(fixture.root, "missing-transcripts.json"),
    "--segments-input", fixture.segmentsInput,
    "--patterns-input", fixture.patternsInput,
    "--output-dir", fixture.outputDir,
  ]);
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
