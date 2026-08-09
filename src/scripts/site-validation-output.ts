import type { RenderedVideoDateValidationResult } from "../site/rendered-video-date-validation.js";
import type { SeoValidationResult } from "../site/seo-validation.js";

export function reportSeoValidationResult(result: SeoValidationResult): boolean {
  const errors = result.diagnostics.filter((item) => item.severity === "error");
  const warnings = result.diagnostics.filter((item) => item.severity === "warning");

  for (const item of result.diagnostics.slice(0, 200)) {
    const label = item.severity === "error" ? "ERROR" : "WARN";
    const message = `${label} [${item.rule}] ${item.route}: ${item.message}`;
    if (item.severity === "error") console.error(message);
    else console.warn(message);
  }
  if (result.diagnostics.length > 200) {
    console.warn(`... ${result.diagnostics.length - 200} additional diagnostics omitted.`);
  }

  console.log(
    `SEO validation checked ${result.htmlPages.toLocaleString("en-US")} HTML pages, `
    + `${result.indexablePages.toLocaleString("en-US")} indexable routes, `
    + `${result.sitemapUrls.toLocaleString("en-US")} sitemap URLs, `
    + `${result.videoSitemapEntries.toLocaleString("en-US")} video records, `
    + `and ${result.sitemapFiles} child sitemaps (${result.videoSitemapFiles} video).`,
  );
  if (result.largestHtmlPage !== undefined) {
    console.log(
      `Largest HTML page: ${result.largestHtmlPage.route} `
      + `(${result.largestHtmlPage.bytes.toLocaleString("en-US")} bytes).`,
    );
  }
  console.log(`SEO diagnostics: ${errors.length} errors, ${warnings.length} warnings.`);
  return errors.length === 0;
}

export function reportRenderedVideoDateValidationResult(
  result: RenderedVideoDateValidationResult,
): void {
  console.log(
    `Rendered video-date regression passed: ${result.videos} videos, ${result.htmlFiles} HTML files, `
    + `${result.timeElements} semantic dates, ${result.pagefindFragments} Pagefind fragments.`,
  );
}
