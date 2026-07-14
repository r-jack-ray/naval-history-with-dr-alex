import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://r-jack-ray.github.io",
  base: "/naval-history-with-dr-alex",
  output: "static",
  srcDir: "./site/src",
  publicDir: "./site/public",
  outDir: "./site/dist",
  vite: {
    server: {
      watch: {
        ignored: ["**/site/dist/**"],
      },
    },
  },
});
