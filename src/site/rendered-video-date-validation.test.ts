import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  type GeneratedVideoDateRecord,
  validateRenderedVideoDateHtml,
} from "./rendered-video-date-validation.js";
import { readRenderedHtmlSiteSnapshot } from "./seo-validation.js";

const origin = "https://r-jack-ray.github.io";
const basePath = "/naval-history-with-dr-alex/";
const video: GeneratedVideoDateRecord = {
  videoId: "example",
  slug: "example-video",
  videoDateAt: "2026-08-09T12:34:56Z",
  videoDateLabel: "9 Aug 2026",
  durationLabel: "12:34",
  videoKind: "upload",
  segmentSlugs: ["example-segment"],
};

async function writeRoute(root: string, route: string, html: string): Promise<void> {
  const directory = route.length === 0 ? root : join(root, ...route.split("/").filter(Boolean));
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "index.html"), html, "utf8");
}

async function writeValidFixture(
    root: string,
    videoRecord: GeneratedVideoDateRecord = video,
): Promise<void> {
  const time = `<time datetime="${videoRecord.videoDateAt}">${videoRecord.videoDateLabel}</time>`;
  await writeRoute(root, "", `Latest video guide · ${time}`);
  await writeRoute(
    root,
    `videos/${videoRecord.slug}/`,
    `<span class="label">Date</span><strong>${time}</strong>`,
  );
  await writeRoute(
    root,
    `segments/${videoRecord.segmentSlugs[0]}/`,
    `<dl><dt>Date</dt><dd>${time}</dd></dl>`,
  );
  await writeRoute(
    root,
    "segments/browse/",
    `<article data-segment-slug="${videoRecord.segmentSlugs[0]}">${time}</article>`,
  );
}

test("validates all rendered HTML date surfaces from one parsed snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "naval-rendered-dates-"));
  try {
    await writeValidFixture(root);
    const rendered = await readRenderedHtmlSiteSnapshot({
      distRoot: root,
      siteOrigin: origin,
      basePath,
      concurrency: 2,
    });
    assert.deepEqual(validateRenderedVideoDateHtml([video], rendered), {
      htmlFiles: 4,
      timeElements: 4,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts a generated date label without prescribing its regional format", async () => {
  const root = await mkdtemp(join(tmpdir(), "naval-rendered-dates-locale-"));
  const alternateDateLabelVideo = {...video, videoDateLabel: "Aug 9, 2026"};
  try {
    await writeValidFixture(root, alternateDateLabelVideo);
    const rendered = await readRenderedHtmlSiteSnapshot({
      distRoot: root,
      siteOrigin: origin,
      basePath,
      concurrency: 2,
    });
    assert.deepEqual(validateRenderedVideoDateHtml([alternateDateLabelVideo], rendered), {
      htmlFiles: 4,
      timeElements: 4,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preserves the forbidden public date-wording diagnostic", async () => {
  const root = await mkdtemp(join(tmpdir(), "naval-rendered-dates-invalid-"));
  try {
    await writeValidFixture(root);
    await writeRoute(root, "legacy/", '<span class="label">Published</span>');
    const rendered = await readRenderedHtmlSiteSnapshot({
      distRoot: root,
      siteOrigin: origin,
      basePath,
      concurrency: 2,
    });
    assert.throws(
      () => validateRenderedVideoDateHtml([video], rendered),
      /forbidden public date\/runtime text "<span class=\\"label\\">Published<\/span>"/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
