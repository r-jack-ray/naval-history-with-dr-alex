#!/usr/bin/env node

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const pagefindRoot = resolve("site/dist/pagefind");
const siteBase = "/naval-history-with-dr-alex/";
const representativeQueries = ["HMS Victory", "HMS Victoria", "RN", "Skagerrak", "Radar"] as const;

interface PagefindResultData {
  raw_url?: string;
  url: string;
}

interface PagefindResultHandle {
  data(): Promise<PagefindResultData>;
}

interface PagefindInstance {
  destroy?(): Promise<void>;

  init?(): Promise<void>;

  options?(options: {
    baseUrl: string;
    ranking: { termSimilarity: number; metaWeights: { title: number } };
  }): Promise<void>;

  search(query: string): Promise<{ results?: PagefindResultHandle[] }>;
}

interface PagefindModule {
  createInstance(options: { basePath: string; baseUrl: string }): PagefindInstance;
}

const entry = JSON.parse(
    await readFile(join(pagefindRoot, "pagefind-entry.json"), "utf8"),
) as { languages?: { en?: { page_count?: number } } };
const pageCount = entry.languages?.en?.page_count;
assert.ok(
    typeof pageCount === "number" && Number.isSafeInteger(pageCount),
    "Pagefind entry must report an English page count.",
);
const fragmentCount = (await readdir(join(pagefindRoot, "fragment"), {withFileTypes: true}))
    .filter((entry_) => entry_.isFile() && entry_.name.endsWith(".pf_fragment"))
    .length;
assert.equal(fragmentCount, pageCount, "Pagefind fragment count must match its manifest page count.");

const server = createServer((request, response) => {
  void (async () => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    const filePath = resolve(pagefindRoot, pathname.replace(/^\/+/, ""));
    if (filePath !== pagefindRoot && !filePath.startsWith(`${pagefindRoot}${sep}`)) {
      response.statusCode = 403;
      response.end();
      return;
    }
    try {
      response.statusCode = 200;
      response.setHeader("Content-Type", contentType(filePath));
      response.end(await readFile(filePath));
    } catch {
      response.statusCode = 404;
      response.end();
    }
  })();
});
await new Promise<void>((resolvePromise, rejectPromise) => {
  server.once("error", rejectPromise);
  server.listen(0, "127.0.0.1", () => resolvePromise());
});

try {
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  const basePath = `http://127.0.0.1:${address.port}/`;
  const pagefind = await import(pathToFileURL(join(pagefindRoot, "pagefind.js")).href) as PagefindModule;
  for (const query of representativeQueries) {
    const instance = pagefind.createInstance({basePath, baseUrl: siteBase});
    await instance.options?.({
      baseUrl: siteBase,
      ranking: {termSimilarity: 1, metaWeights: {title: 5}},
    });
    await instance.init?.();
    const response = await instance.search(query);
    const handles = Array.isArray(response.results) ? response.results : [];
    assert.ok(handles.length >= 5, `${query} must return at least five results`);
    const data = await Promise.all(handles.slice(0, 5).map((handle) => handle.data()));
    const urls = data.map((value) => new URL(
        value.raw_url ?? value.url,
        "https://pagefind-contract.invalid",
    ).pathname.replace(siteBase.slice(0, -1), ""));
    await instance.destroy?.();
    assert.equal(new Set(urls).size, urls.length, `${query} top-five routes must be unique`);
    for (const url of urls) {
      assert.match(
          url,
          /^\/(?:segments|topics|videos)\/[^/]+\/$/u,
          `${query} result must expose a canonical detail route`,
      );
    }
  }
} finally {
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
}

console.log(
    `Pagefind contract passed: ${pageCount.toLocaleString("en-US")} pages and ` +
    `${representativeQueries.length} representative searches.`,
);

function contentType(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".js" || extension === ".mjs") {
    return "text/javascript; charset=utf-8";
  }
  if (extension === ".json") {
    return "application/json; charset=utf-8";
  }
  if (extension === ".wasm") {
    return "application/wasm";
  }
  return "application/octet-stream";
}
