import { z } from "zod";

import { nonEmptyStringSchema, parseSchema, safeVideoIdSchema, type SchemaValidationResult, timestampLabelSchema, topicSlugSchema, validateSchema, } from "./shared.js";

export const curatedSegmentEvidenceSchema = z.strictObject({
  start: timestampLabelSchema,
  end: timestampLabelSchema.optional(),
  note: nonEmptyStringSchema,
});

const commonSegmentShape = {
  id: nonEmptyStringSchema,
  slug: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  start: timestampLabelSchema,
  end: timestampLabelSchema.optional(),
  topics: z.array(topicSlugSchema),
  body: nonEmptyStringSchema,
  sourcePath: nonEmptyStringSchema,
  evidence: z.array(curatedSegmentEvidenceSchema).min(1),
};

const curatedQaSegmentSchema = z.strictObject({
  ...commonSegmentShape,
  kind: z.literal("qa"),
  summary: nonEmptyStringSchema.optional(),
  question: nonEmptyStringSchema,
  answerShort: nonEmptyStringSchema,
});

const curatedSubjectSegmentSchema = z.strictObject({
  ...commonSegmentShape,
  kind: z.enum(["chapter", "notable_point", "transcript_excerpt"]),
  summary: nonEmptyStringSchema,
});

export const curatedSegmentSchema = z.discriminatedUnion("kind", [
  curatedQaSegmentSchema,
  curatedSubjectSegmentSchema,
]);

export const curatedVideoFileSchema = z.strictObject({
  videoId: safeVideoIdSchema,
  topics: z.array(topicSlugSchema),
  segments: z.array(curatedSegmentSchema),
});

export type CuratedSegmentEvidenceSeed = z.infer<typeof curatedSegmentEvidenceSchema>;
export type CuratedSegmentSeed = z.infer<typeof curatedSegmentSchema>;
export type CuratedVideoFileSeed = z.infer<typeof curatedVideoFileSchema>;

export function parseCuratedVideoFile(
    value: unknown,
    label: string,
): CuratedVideoFileSeed {
  return parseSchema(curatedVideoFileSchema, value, label);
}

export function validateCuratedVideoFile(
    value: unknown,
): SchemaValidationResult<CuratedVideoFileSeed> {
  return validateSchema(curatedVideoFileSchema, value);
}
