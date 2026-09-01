import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { topicNormalizationPatternHeader } from "../site/topic-normalization.js";
import { collectTopicCreationSlugs, prepareParallelTopicNormalizationInputs, } from "./bun-topic-normalization.js";

test("topic creation inputs are unique and sorted across shard video and segment topics", () => {
  assert.deepEqual(
      collectTopicCreationSlugs({
        byVideoId: new Map(),
        shards: [{
          fileName: "video.json",
          filePath: "fixtures/video.json",
          videoId: "video",
          value: {
            videoId: "video",
            topics: ["zulu", "alpha", "charlie"],
            segments: [{
              slug: "segment",
              title: "Segment",
              summary: "Summary",
              body: "Body",
              kind: "chapter",
              start: "0:00",
              topics: ["bravo", "charlie"],
              sourcePath: "src/transcripts/txt/video.txt",
              evidence: [{start: "0:00", note: "Evidence"}],
            }],
          },
        }],
      }),
      ["alpha", "bravo", "charlie", "zulu"],
  );
});

test("single-worker Bun preparation supports a missing topic store for bootstrap commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "bun-topic-preparation-"));
  const segmentsInput = join(root, "segments");
  const patternsInput = join(root, "patterns.tsv");
  try {
    await mkdir(segmentsInput);
    await writeFile(
        patternsInput,
        `${topicNormalizationPatternHeader.join("\t")}\n`,
        "utf8",
    );
    await writeFile(join(segmentsInput, "video.json"), `${JSON.stringify({
      videoId: "video",
      topics: ["destroyers"],
      segments: [],
    }, null, 2)}\n`, "utf8");

    const prepared = await prepareParallelTopicNormalizationInputs(
        segmentsInput,
        patternsInput,
        1,
    );
    assert.equal(prepared.shardIndex.shards.length, 1);
    assert.equal(prepared.creationResolutions.get("destroyers")?.slug, "destroyers");
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
