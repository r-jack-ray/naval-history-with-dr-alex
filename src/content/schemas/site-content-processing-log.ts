import { z } from "zod";

import { nonEmptyStringSchema, type SchemaValidationResult, validateSchema, } from "./shared.js";

export const SITE_CONTENT_PROCESSING_LOG_HEADER =
    "timestamp;shardPath;result;needsFurtherProcessing;notes";

export const siteContentProcessingLogShardPathPattern =
    /^src\/derived\/video-segments\/([A-Za-z0-9][A-Za-z0-9._-]*)\.json$/u;

export const siteContentProcessingLogRowSchema = z.strictObject({
  timestamp: z.string().refine(validTimestamp, "has an invalid timestamp"),
  shardPath: z.string().regex(
      siteContentProcessingLogShardPathPattern,
      "must use a canonical repo-relative video-segment shard path",
  ),
  result: nonEmptyStringSchema,
  needsFurtherProcessing: z.enum(["yes", "no"]),
  notes: nonEmptyStringSchema,
});

export type SiteContentProcessingLogRow = z.infer<typeof siteContentProcessingLogRowSchema>;

export function validateSiteContentProcessingLogRow(
    value: unknown,
): SchemaValidationResult<SiteContentProcessingLogRow> {
  return validateSchema(siteContentProcessingLogRowSchema, value);
}

function validTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|([+-])(\d{2}):(\d{2}))?$/u.exec(value);
  if (match === null) {
    return false;
  }
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = [
    match[1], match[2], match[3], match[4], match[5], match[6], match[8], match[9],
  ].map(Number);
  if (hour! > 23 || minute! > 59 || second! > 59 || (offsetHour !== 0 && offsetHour! > 23) || (offsetMinute !== 0 && offsetMinute! > 59)) {
    return false;
  }
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day
      && Number.isFinite(Date.parse(value));
}
