export type PageIndexing = "index" | "noindex";

export function pageIndexingForPathname(pathname: string, basePath: string): PageIndexing;
export function isIndexablePageUrl(pageUrl: string, basePath: string): boolean;
