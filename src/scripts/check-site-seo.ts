#!/usr/bin/env node

import { parseSiteSeoValidationConcurrency } from "../site/concurrency-settings.js";
import { validateRenderedSeoSite } from "../site/seo-validation.js";
import { measureRunStage, printRunTime } from "./console-run-timer.js";
import { reportSeoValidationResult } from "./site-validation-output.js";

const runStartedAt = Date.now();
try {
  const result = await measureRunStage(
    "rendered HTML loading and SEO validation",
    async () => validateRenderedSeoSite({
      distRoot: "site/dist",
      siteOrigin: "https://r-jack-ray.github.io",
      basePath: "/naval-history-with-dr-alex/",
      concurrency: parseSiteSeoValidationConcurrency(
        process.env.SITE_SEO_VALIDATION_CONCURRENCY,
      ),
    }),
  );
  if (!reportSeoValidationResult(result)) process.exitCode = 1;
} finally {
  printRunTime(runStartedAt);
}
