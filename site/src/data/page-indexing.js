const INDEXABLE = "index";
const NON_INDEXABLE = "noindex";

function normalizeBasePath(basePath) {
  const trimmed = basePath.trim().replace(/^\/+|\/+$/gu, "");
  return trimmed.length === 0 ? "/" : `/${trimmed}/`;
}

function normalizePathname(pathname) {
  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function pageIndexingForPathname(pathname, basePath) {
  const normalizedBasePath = normalizeBasePath(basePath);
  const searchPath = `${normalizedBasePath === "/" ? "/" : normalizedBasePath}search/`;
  const allTopicsPath = `${normalizedBasePath === "/" ? "/" : normalizedBasePath}topics/browse/all/`;
  const normalizedPathname = normalizePathname(pathname);
  return normalizedPathname === searchPath || normalizedPathname === allTopicsPath
    ? NON_INDEXABLE
    : INDEXABLE;
}

export function isIndexablePageUrl(pageUrl, basePath) {
  const pathname = new URL(pageUrl).pathname;
  const finalPathPart = pathname.split("/").filter(Boolean).at(-1) ?? "";
  const isHtmlRoute = !finalPathPart.includes(".");
  return isHtmlRoute && pageIndexingForPathname(pathname, basePath) === INDEXABLE;
}
