import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

interface VideoSitemapRoutingModule {
  videoSitemapEntryLimit: number;
  videoSitemapChunkCount(videoCount: number): number;
  videoSitemapRoute(chunkIndex: number): string;
}

async function loadRouting(): Promise<VideoSitemapRoutingModule> {
  return import(pathToFileURL(join(
    process.cwd(),
    "site",
    "src",
    "data",
    "video-sitemap-routing.js",
  )).href) as Promise<VideoSitemapRoutingModule>;
}

test("keeps video sitemap chunks below the protocol ceiling", async () => {
  const routing = await loadRouting();

  assert.equal(routing.videoSitemapEntryLimit, 45_000);
  assert.equal(routing.videoSitemapChunkCount(0), 0);
  assert.equal(routing.videoSitemapChunkCount(2_138), 1);
  assert.equal(routing.videoSitemapChunkCount(45_001), 2);
  assert.equal(routing.videoSitemapRoute(1), "video-sitemaps/1.xml");
  assert.throws(() => routing.videoSitemapChunkCount(-1));
});
