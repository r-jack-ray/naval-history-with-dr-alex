export const videoSitemapEntryLimit = 45_000;

export function videoSitemapChunkCount(videoCount) {
  if (!Number.isSafeInteger(videoCount) || videoCount < 0) {
    throw new Error("Video sitemap video count must be a non-negative safe integer.");
  }
  return Math.ceil(videoCount / videoSitemapEntryLimit);
}

export function videoSitemapRoute(chunkIndex) {
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0) {
    throw new Error("Video sitemap chunk index must be a non-negative safe integer.");
  }
  return `video-sitemaps/${chunkIndex}.xml`;
}
