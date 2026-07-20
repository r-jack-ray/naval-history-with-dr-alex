import type { APIRoute } from "astro";

import { buildVideoPageMetadata, buildVideoStructuredName } from "../../../../src/site/page-metadata.js";
import { siteUrlForRoute } from "../../../../src/site/site-urls.js";
import { buildVideoSeoMetadata, buildVideoSitemapXml } from "../../../../src/site/video-seo.js";
import { archiveVideos } from "../../data/archive";
import {
  videoSitemapChunkCount,
  videoSitemapEntryLimit,
} from "../../data/video-sitemap-routing.js";

export const prerender = true;

export function getStaticPaths() {
  return Array.from(
    { length: videoSitemapChunkCount(archiveVideos.length) },
    (_, index) => ({ params: { page: String(index) } }),
  );
}

export const GET: APIRoute = ({ params, site }) => {
  if (site === undefined) {
    throw new Error("Astro site configuration is required to generate video sitemaps.");
  }
  const page = Number(params.page);
  if (!Number.isSafeInteger(page) || page < 0) {
    throw new Error(`Invalid video sitemap page: ${String(params.page)}.`);
  }
  const start = page * videoSitemapEntryLimit;
  const videos = archiveVideos.slice(start, start + videoSitemapEntryLimit);
  if (videos.length === 0) {
    throw new Error(`Video sitemap page ${page} has no records.`);
  }
  const baseUrl = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const records = videos.map((video) => {
    const metadata = buildVideoPageMetadata(video);
    return buildVideoSeoMetadata({
      pageUrl: siteUrlForRoute(site, baseUrl, `videos/${video.slug}/`).href,
      name: buildVideoStructuredName(video),
      description: metadata.description,
      thumbnailUrl: video.thumbnailUrl,
      publishedAt: video.publishedAt,
      durationIso: video.durationIso,
      embedUrl: video.embedUrl,
    });
  });

  return new Response(buildVideoSitemapXml(records), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
};
