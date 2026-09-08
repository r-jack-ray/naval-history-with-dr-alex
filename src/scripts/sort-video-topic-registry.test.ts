import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runSortVideoTopicRegistry } from "./sort-video-topic-registry.js";

test("sorts topic records by slug and each alias list in natural order", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sort-video-topic-registry-"));
  try {
    const registryPath = path.join(root, "topics.json");
    await writeFile(registryPath, `${JSON.stringify({
      topics: [{
        slug: "series-54",
        title: "Series 54",
        summary: "",
        aliases: ["series 100", "series 9", "series 54"],
      }, {
        slug: "series-9",
        title: "Series 9",
        summary: "Alpha summary.",
      }, {
        slug: "series-100",
        title: "Series 100",
        summary: "   ",
        aliases: ["series 54", "series 9"],
      }],
    }, null, 2)}\n`, "utf8");

    const stdout: string[] = [];
    const result = await runSortVideoTopicRegistry(registryPath, {
      stdout: (text) => {
        stdout.push(text);
      },
    });

    assert.deepEqual(result, {
      changed: true,
      removedBlankSummaryCount: 2,
      sortedAliasListCount: 2,
      topicCount: 3,
    });
    const sorted = JSON.parse(await readFile(registryPath, "utf8")) as {
      topics: Array<{ aliases?: string[]; slug: string; summary?: string }>;
    };
    assert.deepEqual(sorted.topics.map((topic) => topic.slug), ["series-9", "series-54", "series-100"]);
    assert.equal(sorted.topics[0]?.summary, "Alpha summary.");
    assert.equal(sorted.topics[1]?.summary, undefined);
    assert.equal(sorted.topics[2]?.summary, undefined);
    assert.deepEqual(sorted.topics[1]?.aliases, ["series 9", "series 54", "series 100"]);
    assert.deepEqual(sorted.topics[2]?.aliases, ["series 9", "series 54"]);
    assert.match(
        stdout.join("\n"),
        /Sorted 3 topics by slug and 2 alias list\(s\); removed 2 blank summary field\(s\)/u,
    );

    const secondResult = await runSortVideoTopicRegistry(registryPath, {
      stdout: () => {
      },
    });
    assert.deepEqual(secondResult, {
      changed: false,
      removedBlankSummaryCount: 0,
      sortedAliasListCount: 0,
      topicCount: 3,
    });
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("does not rewrite an invalid topic registry", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sort-video-topic-registry-invalid-"));
  try {
    const registryPath = path.join(root, "topics.json");
    const invalidText = `${JSON.stringify({
      topics: [
        {slug: "duplicate", title: "First"},
        {slug: "duplicate", title: "Second"},
      ],
    }, null, 2)}\n`;
    await writeFile(registryPath, invalidText, "utf8");

    await assert.rejects(
        runSortVideoTopicRegistry(registryPath, {
          stdout: () => {
          }
        }),
        /duplicates topic slug duplicate/u,
    );
    assert.equal(await readFile(registryPath, "utf8"), invalidText);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
