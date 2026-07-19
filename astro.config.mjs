import { defineConfig } from "astro/config";
import { parseAstroBuildConcurrency } from "./.codex/hooks/site-build-support.mjs";

const buildConcurrency = parseAstroBuildConcurrency(process.env.ASTRO_BUILD_CONCURRENCY);

export default defineConfig({
  site: "https://r-jack-ray.github.io",
  base: "/naval-history-with-dr-alex",
  output: "static",
  srcDir: "./site/src",
  publicDir: "./site/public",
  outDir: "./site/dist",
  build: {
    concurrency: buildConcurrency,
  },
  vite: {
    server: {
      watch: {
        ignored: ["**/site/dist/**"],
      },
    },
  },
});
