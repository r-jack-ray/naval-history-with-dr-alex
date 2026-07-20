import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  htmlPathToPageUrl,
  parseHtmlSeoString,
  parseSitemapXmlString,
  validateRenderedSeoSite,
} from "./seo-validation.js";
import { buildBreadcrumbListJsonLd, serializeJsonLd } from "./structured-data.js";

const origin = "https://r-jack-ray.github.io";
const base = "/naval-history-with-dr-alex/";

function breadcrumbMarkup(items: Array<{ name: string; route: string }>): string {
  const structuredItems = items.map((item) => ({ name: item.name, url: new URL(`${base}${item.route}`, origin).href }));
  const visible = items.map((item, index) => index < items.length - 1
    ? `<li><a href="${structuredItems[index]?.url}">${item.name}</a></li>`
    : `<li><span aria-current="page">${item.name}</span></li>`).join("");
  return `<nav class="breadcrumb" aria-label="Breadcrumb"><ol>${visible}</ol></nav>`
    + `<script type="application/ld+json">${serializeJsonLd(buildBreadcrumbListJsonLd(structuredItems))}</script>`;
}

function htmlPage(
  route: string,
  title: string,
  options: { noindex?: boolean; breadcrumbs?: Array<{ name: string; route: string }>; links?: string[] } = {},
): string {
  const canonical = new URL(`${base}${route}`, origin).href;
  const links = (options.links ?? []).map((href) => `<a href="${href}">Link</a>`).join("");
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="Description for ${title}.">`
    + `${options.noindex ? '<meta name="robots" content="noindex">' : ""}<link rel="canonical" href="${canonical}"></head>`
    + `<body>${options.breadcrumbs ? breadcrumbMarkup(options.breadcrumbs) : ""}<h1>${title}</h1>${links}</body></html>`;
}

async function writeRoute(root: string, route: string, html: string): Promise<void> {
  const directory = route.length === 0 ? root : join(root, ...route.split("/").filter(Boolean));
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "index.html"), html, "utf8");
}

test("streams HTML metadata and parses strict sitemap XML", () => {
  const html = htmlPage("videos/example/", "Example video", {
    breadcrumbs: [
      { name: "Video Guides", route: "videos/" },
      { name: "Example video", route: "videos/example/" },
    ],
  });
  const snapshot = parseHtmlSeoString(html);
  assert.equal(snapshot.title, "Example video");
  assert.equal(snapshot.h1Count, 1);
  assert.deepEqual(snapshot.visibleBreadcrumbs.map((item) => item.name), ["Video Guides", "Example video"]);

  const sitemap = parseSitemapXmlString(
    `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}${base}</loc></url></urlset>`,
  );
  assert.equal(sitemap.root, "urlset");
  assert.deepEqual(sitemap.locations, [`${origin}${base}`]);
  assert.throws(() => parseSitemapXmlString("<urlset><url></urlset>"));
});

test("maps generated index files to production trailing-slash routes", () => {
  const root = join("C:\\work", "site", "dist");
  assert.equal(
    htmlPathToPageUrl(join(root, "videos", "example", "index.html"), root, origin, base),
    `${origin}${base}videos/example/`,
  );
  assert.equal(htmlPathToPageUrl(join(root, "google-token.html"), root, origin, base), undefined);
});

test("validates a rendered fixture and reports actionable hard failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "naval-seo-validation-"));
  try {
    const pages = [
      { route: "", title: "Home" },
      { route: "videos/", title: "Videos" },
      {
        route: "videos/example/",
        title: "Example video",
        breadcrumbs: [
          { name: "Video Guides", route: "videos/" },
          { name: "Example video", route: "videos/example/" },
        ],
      },
      { route: "segments/", title: "Time Notes" },
      {
        route: "segments/example-note/",
        title: "Example note",
        breadcrumbs: [
          { name: "Time Notes", route: "segments/" },
          { name: "Example video", route: "videos/example/" },
          { name: "Example note", route: "segments/example-note/" },
        ],
      },
      { route: "topics/", title: "Topics" },
      {
        route: "topics/example/",
        title: "Example topic",
        breadcrumbs: [
          { name: "Topics", route: "topics/" },
          { name: "Example topic", route: "topics/example/" },
        ],
      },
      { route: "search/", title: "Search", noindex: true },
    ];
    for (const page of pages) {
      await writeRoute(root, page.route, htmlPage(page.route, page.title, {
        ...(page.noindex === undefined ? {} : { noindex: page.noindex }),
        ...(page.breadcrumbs === undefined ? {} : { breadcrumbs: page.breadcrumbs }),
      }));
    }
    const indexableUrls = pages
      .filter((page) => !page.noindex)
      .map((page) => new URL(`${base}${page.route}`, origin).href);
    await writeFile(
      join(root, "sitemap-index.xml"),
      `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${origin}${base}sitemap-0.xml</loc></sitemap></sitemapindex>`,
      "utf8",
    );
    await writeFile(
      join(root, "sitemap-0.xml"),
      `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexableUrls.map((url) => `<url><loc>${url}</loc></url>`).join("")}</urlset>`,
      "utf8",
    );

    const valid = await validateRenderedSeoSite({ distRoot: root, siteOrigin: origin, basePath: base, concurrency: 2 });
    assert.deepEqual(valid.diagnostics.filter((item) => item.severity === "error"), []);
    assert.equal(valid.indexablePages, indexableUrls.length);

    await writeRoute(root, "videos/example/", htmlPage("videos/wrong/", "Example video", {
      breadcrumbs: [
        { name: "Video Guides", route: "videos/" },
        { name: "Example video", route: "videos/example/" },
      ],
      links: [`${base}missing/`],
    }));
    const invalid = await validateRenderedSeoSite({ distRoot: root, siteOrigin: origin, basePath: base, concurrency: 2 });
    assert.ok(invalid.diagnostics.some((item) => item.rule === "canonical-shape" && item.severity === "error"));
    assert.ok(invalid.diagnostics.some((item) => item.rule === "broken-internal-link" && item.severity === "error"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
