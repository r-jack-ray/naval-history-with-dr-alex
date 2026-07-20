import { createReadStream } from "node:fs";
import { opendir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { Parser } from "htmlparser2";
import { SaxesParser } from "saxes";

import { isIndexablePageUrl } from "../../site/src/data/page-indexing.js";

export type SeoDiagnosticSeverity = "error" | "warning";

export interface SeoDiagnostic {
  severity: SeoDiagnosticSeverity;
  rule: string;
  route: string;
  message: string;
}

export interface HtmlSeoSnapshot {
  bytes: number;
  titleCount: number;
  title: string;
  descriptions: string[];
  canonicals: string[];
  robots: Array<{ name: string; content: string }>;
  h1Count: number;
  links: string[];
  jsonLdBlocks: string[];
  visibleBreadcrumbs: Array<{ name: string; href?: string }>;
}

export interface SitemapSnapshot {
  root: "sitemapindex" | "urlset";
  locations: string[];
}

export interface SeoValidationOptions {
  distRoot: string;
  siteOrigin: string;
  basePath: string;
  hubWarningBytes?: number;
  concurrency?: number;
}

export interface SeoValidationResult {
  diagnostics: SeoDiagnostic[];
  htmlPages: number;
  indexablePages: number;
  sitemapUrls: number;
  sitemapFiles: number;
  largestHtmlPage: { route: string; bytes: number } | undefined;
}

interface HtmlParserState {
  titleCount: number;
  inTitle: boolean;
  titleText: string[];
  descriptions: string[];
  canonicals: string[];
  robots: Array<{ name: string; content: string }>;
  h1Count: number;
  links: string[];
  jsonLdBlocks: string[];
  inJsonLd: boolean;
  jsonLdText: string[];
  breadcrumbDepth: number;
  activeBreadcrumbTag: "a" | "span" | undefined;
  activeBreadcrumbText: string[];
  activeBreadcrumbHref: string | undefined;
  visibleBreadcrumbs: Array<{ name: string; href?: string }>;
}

const defaultHubWarningBytes = 1_000_000;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function createHtmlParserState(): HtmlParserState {
  return {
    titleCount: 0,
    inTitle: false,
    titleText: [],
    descriptions: [],
    canonicals: [],
    robots: [],
    h1Count: 0,
    links: [],
    jsonLdBlocks: [],
    inJsonLd: false,
    jsonLdText: [],
    breadcrumbDepth: 0,
    activeBreadcrumbTag: undefined,
    activeBreadcrumbText: [],
    activeBreadcrumbHref: undefined,
    visibleBreadcrumbs: [],
  };
}

function createHtmlParser(state: HtmlParserState): Parser {
  return new Parser({
    onopentag(name, attributes) {
      if (name === "title") {
        state.titleCount += 1;
        state.inTitle = true;
      }
      if (name === "h1") {
        state.h1Count += 1;
      }
      if (name === "meta") {
        const metaName = attributes.name?.toLowerCase();
        if (metaName === "description") {
          state.descriptions.push(attributes.content ?? "");
        }
        if (metaName === "robots" || metaName === "googlebot") {
          state.robots.push({ name: metaName, content: attributes.content ?? "" });
        }
      }
      if (name === "link" && (attributes.rel ?? "").toLowerCase().split(/\s+/u).includes("canonical")) {
        state.canonicals.push(attributes.href ?? "");
      }
      if (name === "a" && attributes.href !== undefined) {
        state.links.push(attributes.href);
      }
      if (name === "script" && (attributes.type ?? "").toLowerCase() === "application/ld+json") {
        state.inJsonLd = true;
        state.jsonLdText = [];
      }

      const isBreadcrumbNav = name === "nav"
        && ((attributes.class ?? "").split(/\s+/u).includes("breadcrumb")
          || (attributes["aria-label"] ?? "").toLowerCase() === "breadcrumb");
      if (isBreadcrumbNav) {
        state.breadcrumbDepth = 1;
      } else if (state.breadcrumbDepth > 0) {
        state.breadcrumbDepth += 1;
      }
      if (
        state.breadcrumbDepth > 0
        && (name === "a" || (name === "span" && attributes["aria-current"] === "page"))
      ) {
        state.activeBreadcrumbTag = name;
        state.activeBreadcrumbText = [];
        state.activeBreadcrumbHref = attributes.href;
      }
    },
    ontext(text) {
      if (state.inTitle) {
        state.titleText.push(text);
      }
      if (state.inJsonLd) {
        state.jsonLdText.push(text);
      }
      if (state.activeBreadcrumbTag !== undefined) {
        state.activeBreadcrumbText.push(text);
      }
    },
    onclosetag(name) {
      if (name === "title") {
        state.inTitle = false;
      }
      if (name === "script" && state.inJsonLd) {
        state.inJsonLd = false;
        state.jsonLdBlocks.push(state.jsonLdText.join(""));
        state.jsonLdText = [];
      }
      if (state.activeBreadcrumbTag === name) {
        const breadcrumb = {
          name: normalizeWhitespace(state.activeBreadcrumbText.join("")),
          ...(state.activeBreadcrumbHref === undefined ? {} : { href: state.activeBreadcrumbHref }),
        };
        state.visibleBreadcrumbs.push(breadcrumb);
        state.activeBreadcrumbTag = undefined;
        state.activeBreadcrumbText = [];
        state.activeBreadcrumbHref = undefined;
      }
      if (state.breadcrumbDepth > 0) {
        state.breadcrumbDepth -= 1;
      }
    },
  }, { decodeEntities: true, lowerCaseAttributeNames: true, lowerCaseTags: true });
}

function snapshotFromState(state: HtmlParserState, bytes: number): HtmlSeoSnapshot {
  return {
    bytes,
    titleCount: state.titleCount,
    title: normalizeWhitespace(state.titleText.join("")),
    descriptions: state.descriptions.map(normalizeWhitespace),
    canonicals: state.canonicals,
    robots: state.robots,
    h1Count: state.h1Count,
    links: state.links,
    jsonLdBlocks: state.jsonLdBlocks,
    visibleBreadcrumbs: state.visibleBreadcrumbs,
  };
}

export function parseHtmlSeoString(html: string): HtmlSeoSnapshot {
  const state = createHtmlParserState();
  const parser = createHtmlParser(state);
  parser.end(html);
  return snapshotFromState(state, Buffer.byteLength(html));
}

export async function parseHtmlSeoFile(path: string): Promise<HtmlSeoSnapshot> {
  const state = createHtmlParserState();
  const parser = createHtmlParser(state);
  let bytes = 0;
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk: string | Buffer) => {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      bytes += buffer.length;
      parser.write(buffer.toString("utf8"));
    });
    stream.once("error", reject);
    stream.once("end", () => {
      try {
        parser.end();
        resolvePromise();
      } catch (error) {
        reject(error);
      }
    });
  });
  return snapshotFromState(state, bytes);
}

export function parseSitemapXmlString(xml: string): SitemapSnapshot {
  let root: SitemapSnapshot["root"] | undefined;
  const locations: string[] = [];
  const elementStack: string[] = [];
  let locationText = "";
  const parser = new SaxesParser({ xmlns: true });
  parser.on("opentag", (tag) => {
    const local = tag.local.toLowerCase();
    elementStack.push(local);
    if (elementStack.length === 1) {
      if (local !== "sitemapindex" && local !== "urlset") {
        throw new Error(`Unsupported sitemap root: ${local}.`);
      }
      root = local;
    }
    if (local === "loc") {
      locationText = "";
    }
  });
  parser.on("text", (text) => {
    if (elementStack.at(-1) === "loc") {
      locationText += text;
    }
  });
  parser.on("closetag", (tag) => {
    const local = tag.local.toLowerCase();
    if (local === "loc") {
      const location = locationText.trim();
      if (location.length === 0) {
        throw new Error("Sitemap contains an empty <loc> value.");
      }
      locations.push(location);
    }
    elementStack.pop();
  });
  parser.write(xml).close();
  if (root === undefined) {
    throw new Error("Sitemap has no root element.");
  }
  return { root, locations };
}

export async function parseSitemapXmlFile(path: string): Promise<SitemapSnapshot> {
  const parser = new SaxesParser({ xmlns: true });
  let root: SitemapSnapshot["root"] | undefined;
  const locations: string[] = [];
  const elementStack: string[] = [];
  let locationText = "";
  parser.on("opentag", (tag) => {
    const local = tag.local.toLowerCase();
    elementStack.push(local);
    if (elementStack.length === 1) {
      if (local !== "sitemapindex" && local !== "urlset") {
        throw new Error(`Unsupported sitemap root: ${local}.`);
      }
      root = local;
    }
    if (local === "loc") locationText = "";
  });
  parser.on("text", (text) => {
    if (elementStack.at(-1) === "loc") locationText += text;
  });
  parser.on("closetag", (tag) => {
    if (tag.local.toLowerCase() === "loc") {
      const location = locationText.trim();
      if (location.length === 0) throw new Error("Sitemap contains an empty <loc> value.");
      locations.push(location);
    }
    elementStack.pop();
  });
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path, { encoding: "utf8" });
    stream.on("data", (chunk: string | Buffer) => {
      try {
        parser.write(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      } catch (error) {
        stream.destroy();
        reject(error);
      }
    });
    stream.once("error", reject);
    stream.once("end", () => {
      try {
        parser.close();
        resolvePromise();
      } catch (error) {
        reject(error);
      }
    });
  });
  if (root === undefined) throw new Error("Sitemap has no root element.");
  return { root, locations };
}

function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim().replace(/^\/+|\/+$/gu, "");
  return trimmed.length === 0 ? "/" : `/${trimmed}/`;
}

export function htmlPathToPageUrl(
  htmlPath: string,
  distRoot: string,
  siteOrigin: string,
  basePath: string,
): string | undefined {
  const relativePath = relative(resolve(distRoot), resolve(htmlPath)).split(sep).join("/");
  if (relativePath === "index.html") {
    return new URL(normalizeBasePath(basePath), siteOrigin).href;
  }
  if (!relativePath.endsWith("/index.html")) {
    return undefined;
  }
  const route = relativePath.slice(0, -"index.html".length);
  return new URL(`${normalizeBasePath(basePath)}${route}`, siteOrigin).href;
}

function outputRelativePathForUrl(urlValue: string, siteOrigin: string, basePath: string): string {
  const url = new URL(urlValue);
  const origin = new URL(siteOrigin).origin;
  if (url.origin !== origin) {
    throw new Error(`URL uses unexpected origin ${url.origin}.`);
  }
  const normalizedBasePath = normalizeBasePath(basePath);
  if (!url.pathname.startsWith(normalizedBasePath)) {
    throw new Error(`URL escapes the configured base path: ${url.pathname}.`);
  }
  const remainder = decodeURIComponent(url.pathname.slice(normalizedBasePath.length));
  if (remainder.includes("..")) {
    throw new Error(`URL contains an unsafe path: ${url.pathname}.`);
  }
  return remainder.length === 0
    ? "index.html"
    : remainder.endsWith("/")
      ? `${remainder}index.html`
      : remainder;
}

async function listOutputFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await opendir(directory);
    for await (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}

function detailRouteKind(urlValue: string, basePath: string): "video" | "segment" | "topic" | undefined {
  const pathname = new URL(urlValue).pathname;
  const relativePath = pathname.slice(normalizeBasePath(basePath).length);
  if (/^videos\/[^/]+\/$/u.test(relativePath)) return "video";
  if (/^segments\/(?!browse\/)[^/]+\/$/u.test(relativePath)) return "segment";
  if (/^topics\/[^/]+\/$/u.test(relativePath)) return "topic";
  return undefined;
}

function jsonLdObjectsWithType(value: unknown, type: string): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap((item) => jsonLdObjectsWithType(item, type));
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const own = record["@type"] === type ? [record] : [];
  return [...own, ...jsonLdObjectsWithType(record["@graph"], type)];
}

function validateBreadcrumbs(
  snapshot: HtmlSeoSnapshot,
  canonical: string,
  route: string,
  diagnostic: (severity: SeoDiagnosticSeverity, rule: string, route: string, message: string) => void,
): void {
  const parsedJsonLd: unknown[] = [];
  for (const block of snapshot.jsonLdBlocks) {
    try {
      parsedJsonLd.push(JSON.parse(block) as unknown);
    } catch (error) {
      diagnostic("error", "json-ld-parse", route, `JSON-LD does not parse: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const breadcrumbs = parsedJsonLd.flatMap((value) => jsonLdObjectsWithType(value, "BreadcrumbList"));
  if (breadcrumbs.length !== 1) {
    diagnostic("error", "breadcrumb-count", route, `Expected one BreadcrumbList; found ${breadcrumbs.length}.`);
    return;
  }
  const items = breadcrumbs[0]?.itemListElement;
  if (!Array.isArray(items) || items.length < 2) {
    diagnostic("error", "breadcrumb-items", route, "BreadcrumbList must contain at least two ListItem records.");
    return;
  }
  if (snapshot.visibleBreadcrumbs.length !== items.length) {
    diagnostic("error", "breadcrumb-visible-match", route, `Visible breadcrumb has ${snapshot.visibleBreadcrumbs.length} items; structured data has ${items.length}.`);
  }
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] as Record<string, unknown>;
    const expectedPosition = index + 1;
    if (item?.["@type"] !== "ListItem" || item.position !== expectedPosition) {
      diagnostic("error", "breadcrumb-position", route, `Breadcrumb item ${expectedPosition} has an invalid type or position.`);
    }
    if (typeof item?.name !== "string" || normalizeWhitespace(item.name).length === 0) {
      diagnostic("error", "breadcrumb-name", route, `Breadcrumb item ${expectedPosition} has no name.`);
    }
    if (typeof item?.item !== "string") {
      diagnostic("error", "breadcrumb-url", route, `Breadcrumb item ${expectedPosition} has no absolute item URL.`);
    } else {
      try {
        const itemUrl = new URL(item.item).href;
        if (index === items.length - 1 && itemUrl !== canonical) {
          diagnostic("error", "breadcrumb-canonical", route, `Final breadcrumb URL ${itemUrl} does not match canonical ${canonical}.`);
        }
        const visible = snapshot.visibleBreadcrumbs[index];
        if (visible !== undefined && normalizeWhitespace(String(item.name ?? "")) !== visible.name) {
          diagnostic("error", "breadcrumb-visible-match", route, `Breadcrumb item ${expectedPosition} name does not match visible text.`);
        }
        if (visible?.href !== undefined && new URL(visible.href, canonical).href !== itemUrl) {
          diagnostic("error", "breadcrumb-visible-match", route, `Breadcrumb item ${expectedPosition} URL does not match its visible link.`);
        }
      } catch {
        diagnostic("error", "breadcrumb-url", route, `Breadcrumb item ${expectedPosition} has an invalid absolute URL.`);
      }
    }
  }
}

export async function validateRenderedSeoSite(options: SeoValidationOptions): Promise<SeoValidationResult> {
  const distRoot = resolve(options.distRoot);
  const basePath = normalizeBasePath(options.basePath);
  const siteOrigin = new URL(options.siteOrigin).origin;
  const diagnostics: SeoDiagnostic[] = [];
  const diagnostic = (severity: SeoDiagnosticSeverity, rule: string, route: string, message: string): void => {
    diagnostics.push({ severity, rule, route, message });
  };
  const outputFiles = await listOutputFiles(distRoot);
  const outputRelativePaths = new Set(outputFiles.map((path) => relative(distRoot, path).split(sep).join("/")));
  const htmlPages = outputFiles
    .filter((path) => path.endsWith(`${sep}index.html`) || basename(path) === "index.html")
    .map((path) => ({ path, url: htmlPathToPageUrl(path, distRoot, siteOrigin, basePath) }))
    .filter((page): page is { path: string; url: string } => page.url !== undefined);
  const routeUrls = new Set(htmlPages.map((page) => page.url));
  const indexableRouteUrls = new Set(htmlPages.filter((page) => isIndexablePageUrl(page.url, basePath)).map((page) => page.url));
  const titles = new Map<string, string>();
  const canonicals = new Map<string, string>();
  let largestHtmlPage: SeoValidationResult["largestHtmlPage"];

  let cursor = 0;
  const workerCount = Math.max(1, Math.min(options.concurrency ?? 8, 32));
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < htmlPages.length) {
      const page = htmlPages[cursor];
      cursor += 1;
      if (page === undefined) continue;
      let snapshot: HtmlSeoSnapshot;
      try {
        snapshot = await parseHtmlSeoFile(page.path);
      } catch (error) {
        diagnostic("error", "html-parse", page.url, error instanceof Error ? error.message : String(error));
        continue;
      }
      if (largestHtmlPage === undefined || snapshot.bytes > largestHtmlPage.bytes) {
        largestHtmlPage = { route: page.url, bytes: snapshot.bytes };
      }
      if (snapshot.titleCount !== 1 || snapshot.title.length === 0) {
        diagnostic("error", "title", page.url, `Expected one nonempty title; found ${snapshot.titleCount}.`);
      } else {
        const prior = titles.get(snapshot.title);
        if (prior !== undefined) {
          const severity: SeoDiagnosticSeverity = detailRouteKind(page.url, basePath) !== undefined
            && detailRouteKind(prior, basePath) !== undefined ? "error" : "warning";
          diagnostic(severity, "duplicate-title", page.url, `SEO title duplicates ${prior}: ${snapshot.title}`);
        } else {
          titles.set(snapshot.title, page.url);
        }
      }
      if (snapshot.descriptions.length !== 1 || snapshot.descriptions[0]?.length === 0) {
        diagnostic("error", "description", page.url, `Expected one nonempty meta description; found ${snapshot.descriptions.length}.`);
      }
      if (snapshot.canonicals.length !== 1) {
        diagnostic("error", "canonical-count", page.url, `Expected one canonical; found ${snapshot.canonicals.length}.`);
      } else {
        const canonical = snapshot.canonicals[0] ?? "";
        if (canonical !== page.url) {
          diagnostic("error", "canonical-shape", page.url, `Canonical ${canonical || "(empty)"} does not match the production route.`);
        }
        const prior = canonicals.get(canonical);
        if (prior !== undefined) diagnostic("error", "canonical-duplicate", page.url, `Canonical duplicates ${prior}.`);
        else canonicals.set(canonical, page.url);
      }
      if (snapshot.h1Count !== 1) {
        diagnostic("error", "h1-count", page.url, `Expected one H1; found ${snapshot.h1Count}.`);
      }
      const isSearch = page.url === new URL(`${basePath}search/`, siteOrigin).href;
      if (isSearch) {
        const tokens = snapshot.robots.flatMap((item) => item.content.toLowerCase().split(/[\s,]+/u).filter(Boolean));
        if (snapshot.robots.length !== 1 || snapshot.robots[0]?.name !== "robots" || tokens.length !== 1 || tokens[0] !== "noindex") {
          diagnostic("error", "robots-search", page.url, "Search must contain exactly one robots meta element with only noindex.");
        }
      } else if (snapshot.robots.length > 0) {
        diagnostic("error", "robots-indexable", page.url, "Indexable pages must not emit restrictive robots metadata.");
      }
      if (detailRouteKind(page.url, basePath) !== undefined && snapshot.canonicals.length === 1) {
        validateBreadcrumbs(snapshot, snapshot.canonicals[0] ?? "", page.url, diagnostic);
      } else {
        for (const block of snapshot.jsonLdBlocks) {
          try { JSON.parse(block); } catch (error) {
            diagnostic("error", "json-ld-parse", page.url, `JSON-LD does not parse: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      for (const href of snapshot.links) {
        let target: URL;
        try { target = new URL(href, page.url); } catch {
          diagnostic("error", "internal-link-url", page.url, `Invalid link URL: ${href}`);
          continue;
        }
        if (target.origin !== siteOrigin) continue;
        target.search = "";
        target.hash = "";
        if (!target.pathname.startsWith(basePath)) {
          diagnostic("error", "internal-link-base", page.url, `Internal link escapes the project base path: ${href}`);
          continue;
        }
        let outputPath: string;
        try { outputPath = outputRelativePathForUrl(target.href, siteOrigin, basePath); }
        catch (error) {
          diagnostic("error", "internal-link-url", page.url, error instanceof Error ? error.message : String(error));
          continue;
        }
        if (!outputRelativePaths.has(outputPath)) {
          diagnostic("error", "broken-internal-link", page.url, `Internal link has no generated target: ${target.href}`);
        }
      }
      const relativeRoute = new URL(page.url).pathname.slice(basePath.length);
      if (["videos/", "topics/", "segments/", "segments/browse/"].includes(relativeRoute)
        && snapshot.bytes > (options.hubWarningBytes ?? defaultHubWarningBytes)) {
        diagnostic("warning", "oversized-hub", page.url, `Hub HTML is ${snapshot.bytes.toLocaleString("en-US")} bytes.`);
      }
    }
  });
  await Promise.all(workers);

  const sitemapIndexPath = join(distRoot, "sitemap-index.xml");
  const sitemapUrls = new Set<string>();
  let sitemapFiles = 0;
  try {
    const index = await parseSitemapXmlFile(sitemapIndexPath);
    if (index.root !== "sitemapindex") {
      diagnostic("error", "sitemap-index-root", "sitemap-index.xml", `Expected sitemapindex root; found ${index.root}.`);
    }
    const childLocations = new Set<string>();
    for (const childLocation of index.locations) {
      if (childLocations.has(childLocation)) {
        diagnostic("error", "sitemap-child-duplicate", "sitemap-index.xml", `Duplicate child sitemap: ${childLocation}`);
        continue;
      }
      childLocations.add(childLocation);
      let childRelativePath: string;
      try { childRelativePath = outputRelativePathForUrl(childLocation, siteOrigin, basePath); }
      catch (error) {
        diagnostic("error", "sitemap-child-url", "sitemap-index.xml", error instanceof Error ? error.message : String(error));
        continue;
      }
      const childPath = join(distRoot, childRelativePath);
      if (!outputRelativePaths.has(childRelativePath)) {
        diagnostic("error", "sitemap-child-missing", "sitemap-index.xml", `Referenced child sitemap is missing: ${childLocation}`);
        continue;
      }
      try {
        const child = await parseSitemapXmlFile(childPath);
        sitemapFiles += 1;
        if (child.root !== "urlset") diagnostic("error", "sitemap-child-root", childLocation, `Expected urlset root; found ${child.root}.`);
        if (child.locations.length >= 50_000) diagnostic("error", "sitemap-child-size", childLocation, `Child sitemap contains ${child.locations.length} URLs.`);
        for (const location of child.locations) {
          if (sitemapUrls.has(location)) {
            diagnostic("error", "sitemap-url-duplicate", childLocation, `Duplicate sitemap URL: ${location}`);
            continue;
          }
          sitemapUrls.add(location);
          if (!routeUrls.has(location)) diagnostic("error", "sitemap-extra-url", childLocation, `Sitemap URL has no generated HTML page: ${location}`);
        }
      } catch (error) {
        diagnostic("error", "sitemap-child-parse", childLocation, error instanceof Error ? error.message : String(error));
      }
    }
  } catch (error) {
    diagnostic("error", "sitemap-index-parse", "sitemap-index.xml", error instanceof Error ? error.message : String(error));
  }
  for (const route of indexableRouteUrls) {
    if (!sitemapUrls.has(route)) diagnostic("error", "sitemap-missing-url", route, "Indexable route is missing from the sitemap.");
  }
  for (const route of sitemapUrls) {
    if (!indexableRouteUrls.has(route)) diagnostic("error", "sitemap-nonindexable-url", route, "Sitemap contains a non-indexable route.");
  }

  try {
    const topics = JSON.parse(await readFile(join(process.cwd(), "site", "src", "data", "generated", "archive", "topics.json"), "utf8")) as unknown;
    if (Array.isArray(topics)) {
      for (const topic of topics) {
        if (typeof topic === "object" && topic !== null) {
          const record = topic as Record<string, unknown>;
          if (record.videoCount === 0 && record.segmentCount === 0 && typeof record.slug === "string") {
            const orphanUrl = new URL(`${basePath}topics/${record.slug}/`, siteOrigin).href;
            if (routeUrls.has(orphanUrl) || sitemapUrls.has(orphanUrl)) {
              diagnostic("error", "orphan-topic-route", orphanUrl, "Unreferenced topic was rendered or included in the sitemap.");
            }
          }
        }
      }
    }
  } catch (error) {
    diagnostic("error", "orphan-topic-source", "topics.json", error instanceof Error ? error.message : String(error));
  }

  return {
    diagnostics: diagnostics.sort((left, right) => left.severity.localeCompare(right.severity)
      || left.rule.localeCompare(right.rule) || left.route.localeCompare(right.route)),
    htmlPages: htmlPages.length,
    indexablePages: indexableRouteUrls.size,
    sitemapUrls: sitemapUrls.size,
    sitemapFiles,
    largestHtmlPage,
  };
}
