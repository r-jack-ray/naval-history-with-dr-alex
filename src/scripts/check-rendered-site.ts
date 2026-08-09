#!/usr/bin/env node

import { parseSiteSeoValidationConcurrency } from "../site/concurrency-settings.js";
import { validateRenderedVideoDates } from "../site/rendered-video-date-validation.js";
import {
  readRenderedHtmlSiteSnapshot,
  validateRenderedSeoSite,
} from "../site/seo-validation.js";
import {
  reportRenderedVideoDateValidationResult,
  reportSeoValidationResult,
} from "./site-validation-output.js";
import { measureRunStage, printRunTime } from "./console-run-timer.js";

const siteValidationOptions = {
  distRoot: "site/dist",
  siteOrigin: "https://r-jack-ray.github.io",
  basePath: "/naval-history-with-dr-alex/",
  concurrency: parseSiteSeoValidationConcurrency(
    process.env.SITE_SEO_VALIDATION_CONCURRENCY,
  ),
};

const runStartedAt = Date.now();
try {
  const renderedHtml = await measureRunStage(
    "rendered HTML snapshot",
    async () => readRenderedHtmlSiteSnapshot(siteValidationOptions),
  );
  const seoResult = await measureRunStage(
    "rendered SEO validation",
    async () => validateRenderedSeoSite(siteValidationOptions, renderedHtml),
  );
  const seoPassed = reportSeoValidationResult(seoResult);
  let datesPassed = true;
  try {
    const dateResult = await measureRunStage(
      "rendered date and Pagefind validation",
      async () => validateRenderedVideoDates({
        siteDist: siteValidationOptions.distRoot,
        generatedVideosPath: "site/src/data/generated/archive/videos.json",
        siteOrigin: siteValidationOptions.siteOrigin,
        basePath: siteValidationOptions.basePath,
        concurrency: siteValidationOptions.concurrency,
      }, renderedHtml),
    );
    reportRenderedVideoDateValidationResult(dateResult);
  } catch (error) {
    datesPassed = false;
    console.error(error instanceof Error ? error.message : String(error));
  }
  if (!seoPassed || !datesPassed) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  printRunTime(runStartedAt);
}
