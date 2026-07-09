const maxDefaultSlugLength = 96;

export function videoFileStem(videoId: string, title?: string, timestamp?: string): string {
  assertSafeVideoId(videoId);

  const slug = title ? slugifyVideoTitle(title) : undefined;
  const timestampPrefix = timestamp ? archiveTimestampPrefix(timestamp) : undefined;

  if (timestampPrefix && slug) {
    return `${timestampPrefix}_${slug}_${videoId}`;
  }
  if (slug) {
    return `${slug}_${videoId}`;
  }
  if (timestampPrefix) {
    return `${timestampPrefix}_${videoId}`;
  }

  return videoId;
}

export function slugifyVideoTitle(title: string, maxLength = maxDefaultSlugLength): string | undefined {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/&/gu, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");

  const trimmed = slug.slice(0, maxLength).replace(/-+$/gu, "");
  return trimmed || undefined;
}

export function assertSafeVideoId(videoId: string): void {
  if (!/^[A-Za-z0-9_-]+$/u.test(videoId)) {
    throw new Error(`Video ID is not safe for storage paths: ${videoId}`);
  }
}

export function archiveTimestampPrefix(value: string): string | undefined {
  const timestamp = value.trim();
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:\s*(Z|[+-]\d{2}:?\d{2}))?$/u.exec(timestamp);

  if (!match) {
    return undefined;
  }

  const [, date, hour, minute, second, offset] = match;
  const normalizedOffset = offset === undefined
    ? undefined
    : offset === "Z"
      ? ""
      : offset.replace(":", "");

  return normalizedOffset
    ? `${date}_T${hour}-${minute}-${second}${normalizedOffset}`
    : `${date}_T${hour}-${minute}-${second}`;
}
