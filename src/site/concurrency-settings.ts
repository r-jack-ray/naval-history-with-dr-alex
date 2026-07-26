export function parseSiteSeoValidationConcurrency(value: string | undefined): number {
  if (value === undefined) {
    throw new Error(
      "SITE_SEO_VALIDATION_CONCURRENCY must be set through site-build.properties or the calling environment.",
    );
  }
  if (!/^(?:[1-9]|[12][0-9]|3[0-2])$/u.test(value)) {
    throw new Error("SITE_SEO_VALIDATION_CONCURRENCY must be an integer from 1 through 32.");
  }
  return Number(value);
}
