import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runSortVideoSegmentsByStart,
  startTimeToSeconds,
} from "./sort-video-segments-by-start.js";

test("converts m:ss and h:mm:ss timestamps to sortable seconds", () => {
  assert.equal(startTimeToSeconds("24:57"), 1_497);
  assert.equal(startTimeToSeconds("1:02:03"), 3_723);
  assert.equal(startTimeToSeconds("60:00"), startTimeToSeconds("1:00:00"));
});

test("rejects malformed and unsafe timestamp values", () => {
  for (const value of ["", "1:2", "1:60", "1:60:00", "1::02"]) {
    assert.throws(() => startTimeToSeconds(value), /Invalid timestamp/u);
  }
  assert.throws(
      () => startTimeToSeconds("999999999999999999999:00"),
      /Timestamp is too large/u,
  );
});

test("sorts directory shards, preserves ties, skips topics, and rejects malformed timestamps", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sort-video-segments-"));
  try {
    const shardsPath = path.join(root, "shards");
    const validPath = path.join(shardsPath, "valid.json");
    const malformedPath = path.join(shardsPath, "malformed.json");
    const topicsPath = path.join(shardsPath, "topics.json");
    await mkdir(shardsPath);

    const validText = shardText("valid-video", [
      segment("later", "1:02:03"),
      segment("earlier-a", "59:59"),
      segment("earlier-b", "59:59"),
    ]);
    const malformedText = shardText("malformed-video", [
      segment("bad", "1:60", "1:7"),
    ]);
    const topicsText = "{\n  \"mustRemain\": true\n}\n";
    await Promise.all([
      writeFile(validPath, validText, "utf8"),
      writeFile(malformedPath, malformedText, "utf8"),
      writeFile(topicsPath, topicsText, "utf8"),
    ]);

    const stdout: string[] = [];
    const stderr: string[] = [];
    const result = await runSortVideoSegmentsByStart(shardsPath, {
      stdout: (text) => {
        stdout.push(text);
      },
      stderr: (text) => {
        stderr.push(text);
      },
    });

    assert.deepEqual(result, {
      changedFileCount: 1,
      checkedFileCount: 2,
      exitCode: 1,
      failedFileCount: 0,
      malformedFileCount: 1,
      malformedTimestampCount: 2,
    });
    const sorted = JSON.parse(await readFile(validPath, "utf8")) as {
      segments: Array<{ slug: string; start: string }>;
    };
    assert.deepEqual(
        sorted.segments.map((entry) => entry.slug),
        ["earlier-a", "earlier-b", "later"],
    );
    assert.deepEqual(
        sorted.segments.map((entry) => entry.start),
        ["59:59", "59:59", "1:02:03"],
    );
    assert.equal(await readFile(malformedPath, "utf8"), malformedText);
    assert.equal(await readFile(topicsPath, "utf8"), topicsText);

    assert.match(stdout.join("\n"), /Finished\. 2 JSON file\(s\) checked, 1 changed/u);
    assert.match(stderr.join("\n"), /Skipped, 2 malformed timestamp\(s\)/u);
    assert.match(
        stderr.join("\n"),
        /segment 1 \(bad\), segments\[0\]\.start=1:60: Invalid timestamp: 1:60/u,
    );
    assert.match(
        stderr.join("\n"),
        /segment 1 \(bad\), segments\[0\]\.evidence\[0\]\.end=1:7: Invalid timestamp: 1:7/u,
    );
    assert.deepEqual(await readdir(root), ["shards"]);

    const singleResult = await runSortVideoSegmentsByStart(validPath, {
      stdout: (text) => {
        stdout.push(text);
      },
      stderr: (text) => {
        stderr.push(text);
      },
    });
    assert.deepEqual(singleResult, {
      changedFileCount: 0,
      checkedFileCount: 1,
      exitCode: 0,
      failedFileCount: 0,
      malformedFileCount: 0,
      malformedTimestampCount: 0,
    });
    assert.match(stdout.join("\n"), /Already sorted: .*valid\.json/u);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("reports a failed shard without rewriting it", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sort-video-segments-failure-"));
  try {
    const shardPath = path.join(root, "invalid.json");
    const invalidText = "{ invalid JSON\n";
    await writeFile(shardPath, invalidText, "utf8");

    const stderr: string[] = [];
    const result = await runSortVideoSegmentsByStart(shardPath, {
      stdout: () => {
      },
      stderr: (text) => {
        stderr.push(text);
      },
    });

    assert.deepEqual(result, {
      changedFileCount: 0,
      checkedFileCount: 1,
      exitCode: 1,
      failedFileCount: 1,
      malformedFileCount: 0,
      malformedTimestampCount: 0,
    });
    assert.equal(await readFile(shardPath, "utf8"), invalidText);
    assert.deepEqual(await readdir(root), ["invalid.json"]);
    assert.match(stderr.join("\n"), /Could not parse video-segment shard/u);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

function segment(
    slug: string,
    start: string,
    evidenceEnd?: string,
): Record<string, unknown> {
  const evidence: Record<string, unknown> = {
    start: "0:00",
    note: `Evidence for ${slug}.`,
  };
  if (evidenceEnd !== undefined) {
    evidence.end = evidenceEnd;
  }
  return {
    slug,
    title: `Title for ${slug}`,
    start,
    topics: [],
    body: `Body for ${slug}.`,
    sourcePath: "src/transcripts/txt/fixture.txt",
    evidence: [evidence],
    kind: "chapter",
    summary: `Summary for ${slug}.`,
  };
}

function shardText(
    videoId: string,
    segments: Array<Record<string, unknown>>,
): string {
  return `${JSON.stringify({videoId, topics: [], segments}, null, 2)}\n`;
}
