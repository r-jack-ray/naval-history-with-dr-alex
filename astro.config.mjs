import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { parseAstroBuildConcurrency } from "./.codex/hooks/site-build-support.mjs";
import { isIndexablePageUrl } from "./site/src/data/page-indexing.js";

const buildConcurrency = parseAstroBuildConcurrency(process.env.ASTRO_BUILD_CONCURRENCY);
const site = "https://r-jack-ray.github.io";
const base = "/naval-history-with-dr-alex";

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
