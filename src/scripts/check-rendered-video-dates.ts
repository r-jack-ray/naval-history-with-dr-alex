#!/usr/bin/env node

import { parseSiteSeoValidationConcurrency } from "../site/concurrency-settings.js";
import { validateRenderedVideoDates } from "../site/rendered-video-date-validation.js";
import { measureRunStage, printRunTime } from "./console-run-timer.js";
import { reportRenderedVideoDateValidationResult } from "./site-validation-output.js";

const runStartedAt = Date.now();
try {
  const result = await measureRunStage(
      "rendered HTML and Pagefind date validation",
      async () => validateRenderedVideoDates({
        siteDist: "site/dist",
        generatedVideosPath: "site/src/data/generated/archive/videos.json",
        siteOrigin: "https://r-jack-ray.github.io",
        basePath: "/naval-history-with-dr-alex/",
        ...(process.env.SITE_SEO_VALIDATION_CONCURRENCY === undefined ? {} : {
          concurrency: parseSiteSeoValidationConcurrency(
              process.env.SITE_SEO_VALIDATION_CONCURRENCY,
          ),
        }),
      }),
  );
  reportRenderedVideoDateValidationResult(result);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  printRunTime(runStartedAt);
}
