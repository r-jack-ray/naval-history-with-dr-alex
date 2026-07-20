#!/usr/bin/env node

import { validateRenderedSeoSite } from "../site/seo-validation.js";

const result = await validateRenderedSeoSite({
  distRoot: "site/dist",
  siteOrigin: "https://r-jack-ray.github.io",
  basePath: "/naval-history-with-dr-alex/",
});
const errors = result.diagnostics.filter((item) => item.severity === "error");
const warnings = result.diagnostics.filter((item) => item.severity === "warning");

for (const item of result.diagnostics.slice(0, 200)) {
  const label = item.severity === "error" ? "ERROR" : "WARN";
  console.error(`${label} [${item.rule}] ${item.route}: ${item.message}`);
}
if (result.diagnostics.length > 200) {
  console.error(`... ${result.diagnostics.length - 200} additional diagnostics omitted.`);
}

console.log(
  `SEO validation checked ${result.htmlPages.toLocaleString("en-US")} HTML pages, `
  + `${result.indexablePages.toLocaleString("en-US")} indexable routes, `
  + `${result.sitemapUrls.toLocaleString("en-US")} sitemap URLs, and ${result.sitemapFiles} child sitemaps.`,
);
if (result.largestHtmlPage !== undefined) {
  console.log(`Largest HTML page: ${result.largestHtmlPage.route} (${result.largestHtmlPage.bytes.toLocaleString("en-US")} bytes).`);
}
console.log(`SEO diagnostics: ${errors.length} errors, ${warnings.length} warnings.`);
if (errors.length > 0) process.exitCode = 1;
