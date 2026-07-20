import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import test from "node:test";

interface PageIndexingModule {
  isIndexablePageUrl(pageUrl: string, basePath: string): boolean;
  pageIndexingForPathname(pathname: string, basePath: string): "index" | "noindex";
}

async function loadPageIndexing(): Promise<PageIndexingModule> {
  const moduleUrl = pathToFileURL(
    join(process.cwd(), "site", "src", "data", "page-indexing.js"),
  ).href;
  return import(moduleUrl) as Promise<PageIndexingModule>;
}

test("shares Search noindex policy with sitemap URL filtering", async () => {
  const { isIndexablePageUrl, pageIndexingForPathname } = await loadPageIndexing();
  const base = "/naval-history-with-dr-alex";
  const origin = "https://r-jack-ray.github.io";

  assert.equal(pageIndexingForPathname(`${base}/search/`, base), "noindex");
  assert.equal(pageIndexingForPathname(`${base}/videos/`, base), "index");
  assert.equal(isIndexablePageUrl(`${origin}${base}/search/`, base), false);
  assert.equal(isIndexablePageUrl(`${origin}${base}/videos/example/`, base), true);
  assert.equal(isIndexablePageUrl(`${origin}${base}/search-topic-lookup.json`, base), false);
});
