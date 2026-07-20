import { readFileSync } from "node:fs";

import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { parseAstroBuildConcurrency } from "./.codex/hooks/site-build-support.mjs";
import { isIndexablePageUrl } from "./site/src/data/page-indexing.js";
import {
  videoSitemapChunkCount,
  videoSitemapRoute,
} from "./site/src/data/video-sitemap-routing.js";

const buildConcurrency = parseAstroBuildConcurrency(process.env.ASTRO_BUILD_CONCURRENCY);
const site = "https://r-jack-ray.github.io";
const base = "/naval-history-with-dr-alex";
const archiveManifest = JSON.parse(readFileSync(
  new URL("./site/src/data/generated/archive/index.json", import.meta.url),
  "utf8",
));
if (!Number.isSafeInteger(archiveManifest?.counts?.videos) || archiveManifest.counts.videos < 0) {
  throw new Error("Generated site archive manifest must declare a non-negative video count.");
}
const videoSitemaps = Array.from(
  { length: videoSitemapChunkCount(archiveManifest.counts.videos) },
  (_, index) => new URL(`${base}/${videoSitemapRoute(index)}`, site).href,
);

export default defineConfig({
  site,
  base,
  output: "static",
  srcDir: "./site/src",
  publicDir: "./site/public",
  outDir: "./site/dist",
  build: {
    concurrency: buildConcurrency,
  },
  integrations: [
    sitemap({
      filter: (page) => isIndexablePageUrl(page, base),
      customSitemaps: videoSitemaps,
    }),
  ],
  vite: {
    server: {
      watch: {
        ignored: ["**/site/dist/**"],
      },
    },
  },
});
