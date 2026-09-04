import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  defaultSortVideoSegmentTopicsWorkerCount,
  parseSortVideoSegmentTopicsArgs,
  runSortVideoSegmentTopics,
} from "./sort-video-segment-topics.js";

test("parses a bounded worker count and optional shard directory", () => {
  assert.deepEqual(parseSortVideoSegmentTopicsArgs(["fixtures", "--workers", "1"]), {
    help: false,
    inputDirectory: "fixtures",
    workers: 1,
  });
  assert.equal(defaultSortVideoSegmentTopicsWorkerCount() >= 1, true);
  assert.equal(defaultSortVideoSegmentTopicsWorkerCount() <= 8, true);
  assert.throws(
      () => parseSortVideoSegmentTopicsArgs(["--workers", "0"]),
      /--workers must be an integer/u,
  );
  assert.throws(
      () => parseSortVideoSegmentTopicsArgs(["--workers", "1", "--workers", "1"]),
      /only once/u,
  );
});

test("sorts every topic array in each shard and skips the shared topic store", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sort-video-segment-topics-"));
  try {
    const shardsPath = path.join(root, "shards");
    const unsortedPath = path.join(shardsPath, "unsorted.json");
    const sortedPath = path.join(shardsPath, "sorted.json");
    const topicsPath = path.join(shardsPath, "topics.json");
    await mkdir(shardsPath);

    const unsortedText = shardText("unsorted-video", ["royal-navy", "aircraft-carriers"], [
      segment("first", "0:00", ["fleet-air-arm", "aircraft-carriers"]),
      segment("second", "1:00", ["destroyers"]),
    ]);
    const sortedText = shardText("sorted-video", ["cruisers", "royal-navy"], [
      segment("third", "0:00", ["cruisers", "royal-navy"]),
    ]);
    const topicsText = "{\n  \"mustRemain\": true\n}\n";
    await Promise.all([
      writeFile(unsortedPath, unsortedText, "utf8"),
      writeFile(sortedPath, sortedText, "utf8"),
      writeFile(topicsPath, topicsText, "utf8"),
    ]);

    const stdout: string[] = [];
    const stderr: string[] = [];
    const workers = Math.min(2, defaultSortVideoSegmentTopicsWorkerCount());
    const result = await runSortVideoSegmentTopics(shardsPath, {
      stdout: (text) => {
        stdout.push(text);
      },
      stderr: (text) => {
        stderr.push(text);
      },
      workers,
    });

    assert.deepEqual(result, {
      changedFileCount: 1,
      checkedFileCount: 2,
      exitCode: 0,
      failedFileCount: 0,
      sortedTopicArrayCount: 2,
      workerCount: workers,
    });
    const sorted = JSON.parse(await readFile(unsortedPath, "utf8")) as {
      topics: string[];
      segments: Array<{ slug: string; topics: string[] }>;
    };
    assert.deepEqual(sorted.topics, ["aircraft-carriers", "royal-navy"]);
    assert.deepEqual(sorted.segments.map((entry) => entry.slug), ["first", "second"]);
    assert.deepEqual(sorted.segments[0]?.topics, ["aircraft-carriers", "fleet-air-arm"]);
    assert.deepEqual(sorted.segments[1]?.topics, ["destroyers"]);
    assert.equal(await readFile(sortedPath, "utf8"), sortedText);
    assert.equal(await readFile(topicsPath, "utf8"), topicsText);
    assert.equal(stderr.length, 0);
    assert.match(stdout.join("\n"), /Finished\. 2 JSON file\(s\) checked, 1 changed/u);

    const secondResult = await runSortVideoSegmentTopics(shardsPath, {
      stdout: () => {
      },
      stderr: (text) => {
        stderr.push(text);
      },
      workers,
    });
    assert.deepEqual(secondResult, {
      changedFileCount: 0,
      checkedFileCount: 2,
      exitCode: 0,
      failedFileCount: 0,
      sortedTopicArrayCount: 0,
      workerCount: workers,
    });
    assert.deepEqual(await readdir(root), ["shards"]);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("reports an invalid shard without rewriting it", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sort-video-segment-topics-failure-"));
  try {
    const invalidPath = path.join(root, "invalid.json");
    const invalidText = "{ invalid JSON\n";
    await writeFile(invalidPath, invalidText, "utf8");

    const stderr: string[] = [];
    const result = await runSortVideoSegmentTopics(root, {
      stdout: () => {
      },
      stderr: (text) => {
        stderr.push(text);
      },
      workers: 1,
    });

    assert.deepEqual(result, {
      changedFileCount: 0,
      checkedFileCount: 1,
      exitCode: 1,
      failedFileCount: 1,
      sortedTopicArrayCount: 0,
      workerCount: 1,
    });
    assert.equal(await readFile(invalidPath, "utf8"), invalidText);
    assert.match(stderr.join("\n"), /Could not parse video-segment shard/u);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

function segment(slug: string, start: string, topics: string[]): Record<string, unknown> {
  return {
    slug,
    title: `Title for ${slug}`,
    kind: "chapter",
    start,
    topics,
    summary: `Summary for ${slug}.`,
    body: `Body for ${slug}.`,
    sourcePath: "src/transcripts/txt/fixture.txt",
    evidence: [{start, note: `Evidence for ${slug}.`}],
  };
}

function shardText(
    videoId: string,
    topics: string[],
    segments: Array<Record<string, unknown>>,
): string {
  return `${JSON.stringify({videoId, topics, segments}, null, 2)}\n`;
}
