import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { migrateVideoSegmentShardVideoIds } from "./video-segment-shard-video-id-migration.js";

test("dry run identifies legacy fields without changing shard bytes", async () => {
  const fixture = await createFixture();
  try {
    const shardPath = join(fixture.shards, "legacy.json");
    const sourceText = shardText("video-one", [
      segment("legacy-mediteranean", "legacy-mediterranean", "video-one"),
    ]);
    await writeFile(shardPath, sourceText, "utf8");

    const result = await migrateVideoSegmentShardVideoIds({
      inputDirectory: fixture.shards,
    });

    assert.deepEqual(result, {
      mode: "dry-run",
      shardCount: 1,
      segmentCount: 1,
      changedShardCount: 1,
      alreadyCurrentShardCount: 0,
      removedFieldCount: 1,
    });
    assert.equal(await readFile(shardPath, "utf8"), sourceText);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("write mode backs up legacy shards, preserves retained values, and resumes safely", async () => {
  const fixture = await createFixture();
  try {
    const legacyPath = join(fixture.shards, "legacy.json");
    const currentPath = join(fixture.shards, "current.json");
    const emptyPath = join(fixture.shards, "empty.json");
    const legacyText = shardText(
      "video-one",
      [segment("legacy-id", "public-slug", "video-one")],
    ).replace('      "videoId": "video-one",\n', '  "videoId": "video-one",\n');
    const currentText = shardText("video-two", [segment("current-id", "current-slug")]);
    const emptyText = shardText("video-three", []);
    await Promise.all([
      writeFile(legacyPath, legacyText, "utf8"),
      writeFile(currentPath, currentText, "utf8"),
      writeFile(emptyPath, emptyText, "utf8"),
    ]);

    const result = await migrateVideoSegmentShardVideoIds({
      inputDirectory: fixture.shards,
      mode: "write",
      backupRoot: fixture.backups,
    });

    assert.equal(result.shardCount, 3);
    assert.equal(result.segmentCount, 2);
    assert.equal(result.changedShardCount, 1);
    assert.equal(result.alreadyCurrentShardCount, 2);
    assert.equal(result.removedFieldCount, 1);
    assert.ok(result.backupDirectory);
    const migrated = JSON.parse(await readFile(legacyPath, "utf8")) as {
      segments: Array<Record<string, unknown>>;
    };
    const expectedMigratedText = legacyText.replace(
      '      "id": "legacy-id",\n  "videoId": "video-one",\n',
      '      "id": "legacy-id",\n',
    );
    assert.equal(await readFile(legacyPath, "utf8"), expectedMigratedText);
    const original = JSON.parse(legacyText) as { segments: Array<Record<string, unknown>> };
    const { videoId: _videoId, ...originalSegment } = original.segments[0]!;
    assert.deepEqual(migrated.segments[0], originalSegment);
    assert.equal(migrated.segments[0]?.id, "legacy-id");
    assert.equal(migrated.segments[0]?.slug, "public-slug");
    assert.equal(await readFile(currentPath, "utf8"), currentText);
    assert.equal(await readFile(emptyPath, "utf8"), emptyText);
    assert.equal(
      await readFile(join(result.backupDirectory, "legacy.json"), "utf8"),
      legacyText,
    );
    const backupManifest = JSON.parse(
      await readFile(join(result.backupDirectory, "backup-manifest.json"), "utf8"),
    ) as { files: Array<{ fileName: string; sha256: string }> };
    assert.deepEqual(backupManifest.files.map((entry) => entry.fileName), ["legacy.json"]);
    assert.equal(backupManifest.files[0]?.sha256.length, 64);
    assert.equal(
      (await readdir(fixture.shards)).some((fileName) => fileName.endsWith(".tmp")),
      false,
    );

    const resumed = await migrateVideoSegmentShardVideoIds({
      inputDirectory: fixture.shards,
      mode: "write",
      backupRoot: fixture.backups,
    });
    assert.equal(resumed.changedShardCount, 0);
    assert.equal(resumed.alreadyCurrentShardCount, 3);
    assert.equal(resumed.backupDirectory, undefined);

    const checked = await migrateVideoSegmentShardVideoIds({
      inputDirectory: fixture.shards,
      mode: "check",
    });
    assert.equal(checked.changedShardCount, 0);
    assert.equal(checked.removedFieldCount, 0);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("write mode preserves layout when videoId is the final segment property", async () => {
  const fixture = await createFixture();
  try {
    const shardPath = join(fixture.shards, "trailing-video-id.json");
    const middleVideoId = segment("trailing-id", "trailing-slug", "video-one");
    const { videoId, ...retainedSegment } = middleVideoId;
    const sourceText = shardText("video-one", [{ ...retainedSegment, videoId }]);
    await writeFile(shardPath, sourceText, "utf8");

    const result = await migrateVideoSegmentShardVideoIds({
      inputDirectory: fixture.shards,
      mode: "write",
      backupRoot: fixture.backups,
    });

    assert.equal(result.removedFieldCount, 1);
    const expectedText = sourceText.replace(',\n      "videoId": "video-one"\n', "\n");
    assert.equal(await readFile(shardPath, "utf8"), expectedText);
    assert.deepEqual(JSON.parse(expectedText), {
      videoId: "video-one",
      topics: [],
      segments: [retainedSegment],
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("preflight blocks every write when a segment videoId disagrees with its root", async () => {
  const fixture = await createFixture();
  try {
    const validPath = join(fixture.shards, "valid.json");
    const invalidPath = join(fixture.shards, "invalid.json");
    const validText = shardText("video-one", [segment("valid", "valid", "video-one")]);
    const invalidText = shardText("video-two", [segment("invalid", "invalid", "other-video")]);
    await Promise.all([
      writeFile(validPath, validText, "utf8"),
      writeFile(invalidPath, invalidText, "utf8"),
    ]);

    await assert.rejects(
      migrateVideoSegmentShardVideoIds({
        inputDirectory: fixture.shards,
        mode: "write",
        backupRoot: fixture.backups,
      }),
      /must match root videoId/u,
    );
    assert.equal(await readFile(validPath, "utf8"), validText);
    assert.equal(await readFile(invalidPath, "utf8"), invalidText);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("target checks reject legacy, mixed, and unknown shard shapes", async () => {
  const fixture = await createFixture();
  try {
    const shardPath = join(fixture.shards, "fixture.json");
    await writeFile(
      shardPath,
      shardText("video-one", [segment("legacy", "legacy", "video-one")]),
      "utf8",
    );
    await assert.rejects(
      migrateVideoSegmentShardVideoIds({inputDirectory: fixture.shards, mode: "check"}),
      /legacy segment videoId fields remain/u,
    );

    await writeFile(
      shardPath,
      shardText("video-one", [
        segment("legacy", "legacy", "video-one"),
        segment("current", "current"),
      ]),
      "utf8",
    );
    await assert.rejects(
      migrateVideoSegmentShardVideoIds({inputDirectory: fixture.shards}),
      /mixes legacy and current/u,
    );

    const unknownSegment = {
      ...segment("unknown", "unknown"),
      unexpected: true,
    };
    await writeFile(shardPath, shardText("video-one", [unknownSegment]), "utf8");
    await assert.rejects(
      migrateVideoSegmentShardVideoIds({inputDirectory: fixture.shards}),
      /unexpected/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createFixture(): Promise<{
  root: string;
  shards: string;
  backups: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "video-segment-video-id-migration-test-"));
  const shards = join(root, "shards");
  const backups = join(root, "backups");
  await mkdir(shards);
  await writeFile(join(shards, "topics.json"), "{\n  \"topics\": []\n}\n", "utf8");
  return { root, shards, backups };
}

function segment(
  id: string,
  slug: string,
  videoId?: string,
): Record<string, unknown> {
  const shared = {
    slug,
    title: `Title for ${id}`,
    kind: "chapter",
    start: "0:00",
    topics: [],
    summary: `Summary for ${id}.`,
    body: `Body for ${id}.`,
    sourcePath: `src/transcripts/txt/${id}.txt`,
    evidence: [{ start: "0:00", note: `Evidence for ${id}.` }],
  };
  return videoId === undefined
    ? { id, ...shared }
    : { id, videoId, ...shared };
}

function shardText(
  videoId: string,
  segments: Array<Record<string, unknown>>,
): string {
  return `${JSON.stringify({ videoId, topics: [], segments }, null, 2)}\n`;
}
