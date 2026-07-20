function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim().replace(/^\/+|\/+$/gu, "");
  return trimmed.length === 0 ? "/" : `/${trimmed}/`;
}

function normalizeTrailingSlash(pathname: string): string {
  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function canonicalUrlForPath(site: URL | string, pathname: string): URL {
  const url = new URL(pathname, site);
  url.pathname = normalizeTrailingSlash(url.pathname);
  url.search = "";
  url.hash = "";
  return url;
}

export function siteUrlForRoute(site: URL | string, basePath: string, route: string): URL {
  const normalizedBasePath = normalizeBasePath(basePath);
  const relativeRoute = route.trim().replace(/^\/+|\/+$/gu, "");
  const pathname = relativeRoute.length === 0
    ? normalizedBasePath
    : `${normalizedBasePath}${relativeRoute}/`;
  return canonicalUrlForPath(site, pathname);
}
