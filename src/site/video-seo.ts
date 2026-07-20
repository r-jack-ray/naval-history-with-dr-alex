export const maxVideoSitemapDurationSeconds = 28_800;

export interface VideoSeoInput {
  pageUrl: string;
  name: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  durationIso: string;
  embedUrl: string;
}

export interface VideoSeoMetadata {
  pageUrl: string;
  name: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  durationIso: string;
  durationSeconds: number;
  embedUrl: string;
}

export interface VideoObjectJsonLd {
  "@context": "https://schema.org";
  "@type": "VideoObject";
  "@id": string;
  url: string;
  name: string;
  description: string;
  thumbnailUrl: string;
  uploadDate: string;
  duration: string;
  embedUrl: string;
}

const canonicalUtcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const youtubeDurationPattern = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/u;

function normalizeText(value: string, label: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length === 0) {
    throw new Error(`Video SEO ${label} must be nonempty.`);
  }
  return normalized;
}

function httpUrl(value: string, label: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Video SEO ${label} must use HTTP or HTTPS.`);
  }
  return url.href;
}

export function parseVideoDurationSeconds(value: string): number | undefined {
  const match = youtubeDurationPattern.exec(value);
  if (match === null || match.slice(1).every((part) => part === undefined)) {
    return undefined;
  }
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const total = (days * 86_400) + (hours * 3_600) + (minutes * 60) + seconds;
  return Number.isFinite(total) && total > 0 ? total : undefined;
}

export function buildVideoSeoMetadata(input: VideoSeoInput): VideoSeoMetadata {
  const pageUrl = httpUrl(input.pageUrl, "pageUrl");
  const embedUrl = httpUrl(input.embedUrl, "embedUrl");
  if (pageUrl === embedUrl) {
    throw new Error("Video SEO embedUrl must differ from the guide page URL.");
  }
  const publishedAt = input.publishedAt.trim();
  if (!canonicalUtcTimestampPattern.test(publishedAt) || !Number.isFinite(Date.parse(publishedAt))) {
    throw new Error("Video SEO publishedAt must be a canonical UTC timestamp.");
  }
  const durationIso = input.durationIso.trim();
  const durationSeconds = parseVideoDurationSeconds(durationIso);
  if (durationSeconds === undefined) {
    throw new Error("Video SEO durationIso must be a positive ISO 8601 duration.");
  }

  return {
    pageUrl,
    name: normalizeText(input.name, "name"),
    description: normalizeText(input.description, "description"),
    thumbnailUrl: httpUrl(input.thumbnailUrl, "thumbnailUrl"),
    publishedAt,
    durationIso,
    durationSeconds,
    embedUrl,
  };
}

export function buildVideoObjectJsonLd(metadata: VideoSeoMetadata): VideoObjectJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "@id": `${metadata.pageUrl}#video`,
    url: metadata.pageUrl,
    name: metadata.name,
    description: metadata.description,
    thumbnailUrl: metadata.thumbnailUrl,
    uploadDate: metadata.publishedAt,
    duration: metadata.durationIso,
    embedUrl: metadata.embedUrl,
  };
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

export function buildVideoSitemapXml(records: readonly VideoSeoMetadata[]): string {
  if (records.length === 0) {
    throw new Error("A video sitemap must contain at least one video record.");
  }

  const entries = records.map((record) => {
    const sitemapDurationSeconds = Math.floor(record.durationSeconds);
    const duration = sitemapDurationSeconds >= 1
      && record.durationSeconds <= maxVideoSitemapDurationSeconds
      ? `\n      <video:duration>${sitemapDurationSeconds}</video:duration>`
      : "";
    return `  <url>\n    <loc>${escapeXml(record.pageUrl)}</loc>\n    <video:video>\n      <video:thumbnail_loc>${escapeXml(record.thumbnailUrl)}</video:thumbnail_loc>\n      <video:title>${escapeXml(record.name)}</video:title>\n      <video:description>${escapeXml(record.description)}</video:description>\n      <video:player_loc>${escapeXml(record.embedUrl)}</video:player_loc>${duration}\n      <video:publication_date>${escapeXml(record.publishedAt)}</video:publication_date>\n    </video:video>\n  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${entries.join("\n")}\n</urlset>\n`;
}
