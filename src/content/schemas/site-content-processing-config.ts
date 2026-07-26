import { z } from "zod";

import { segmentKinds } from "../../index.js";
import {
  nonEmptyStringSchema,
  parseSchema,
  topicSlugSchema,
  validateSchema,
  type SchemaValidationResult,
} from "./shared.js";

const segmentKindSchema = z.enum(segmentKinds);
const requiredContentScanSchema = z.enum(["subject-segments", "qa-exchanges"]);
const requiredQaFieldSchema = z.enum(["start", "question", "answerShort"]);

const requiredContentScansSchema = z.array(requiredContentScanSchema).superRefine(
  (values, context) => {
    if (
      values.length !== requiredContentScanSchema.options.length
      || new Set(values).size !== requiredContentScanSchema.options.length
    ) {
      context.addIssue({
        code: "custom",
        message: "must contain subject-segments and qa-exchanges exactly once",
      });
    }
  },
);

const requiredQaFieldsSchema = z.array(requiredQaFieldSchema).superRefine(
  (values, context) => {
    if (
      values.length !== requiredQaFieldSchema.options.length
      || new Set(values).size !== requiredQaFieldSchema.options.length
    ) {
      context.addIssue({
        code: "custom",
        message: "must contain start, question, and answerShort exactly once",
      });
    }
  },
);

const uniqueTopicSlugArraySchema = z.array(topicSlugSchema).superRefine(
  (values, context) => {
    addDuplicateIssues(values, context, (value) => value, "duplicates topic slug");
  },
);

const explicitQaTitleMarkersSchema = z.array(nonEmptyStringSchema).min(1).superRefine(
  (values, context) => {
    addDuplicateIssues(
      values,
      context,
      (value) => value.toLocaleLowerCase("en-US"),
      "duplicates another marker when matched case-insensitively",
    );
  },
);

const followUpStageSchema = z.strictObject({
  slug: topicSlugSchema,
  title: nonEmptyStringSchema,
  description: nonEmptyStringSchema,
});

const videoTypeRuleSchema = z.strictObject({
  matchTitle: nonEmptyStringSchema,
  defaultKind: segmentKindSchema,
  defaultTopics: uniqueTopicSlugArraySchema,
  followUpStage: topicSlugSchema,
});

const topicGroupSchema = z.strictObject({
  slug: topicSlugSchema,
  title: nonEmptyStringSchema,
  topics: uniqueTopicSlugArraySchema,
});

export const siteContentProcessingConfigSchema = z.strictObject({
  firstPass: z.strictObject({
    defaultAction: nonEmptyStringSchema,
    defaultNeedsFurtherProcessing: z.boolean(),
    processingMode: z.literal("full-file-best-effort"),
    minimumEvidenceWindows: z.number().int().positive(),
    preferredSegmentKinds: z.array(segmentKindSchema).min(1),
    requiredContentScans: requiredContentScansSchema,
    guidance: nonEmptyStringSchema,
  }),
  videoLevelTopics: z.strictObject({
    mode: z.literal("curated-summary-subset"),
    requireAllSegmentTopics: z.literal(false),
  }),
  liveStreamExtraction: z.strictObject({
    mode: z.literal("full-duration-mixed-content"),
    explicitQaTitleMarkers: explicitQaTitleMarkersSchema,
    requiredQaFields: requiredQaFieldsSchema,
    guidance: nonEmptyStringSchema,
  }),
  topicLifecycle: z.strictObject({
    mode: z.literal("shard-derived-automatic"),
    contentPass: nonEmptyStringSchema,
    fictionPolicy: nonEmptyStringSchema,
    synchronization: nonEmptyStringSchema,
    exceptionRule: nonEmptyStringSchema,
  }),
  contentExhaustion: z.strictObject({
    mode: z.literal("model-effort-saturation"),
    comparisonScope: nonEmptyStringSchema,
    stopRule: nonEmptyStringSchema,
    reopenRule: nonEmptyStringSchema,
  }),
  followUpStages: z.array(followUpStageSchema),
  videoTypeRules: z.array(videoTypeRuleSchema),
  topicGroups: z.array(topicGroupSchema),
}).superRefine((config, context) => {
  addDuplicateIssues(
    config.followUpStages,
    context,
    (stage) => stage.slug,
    "duplicates follow-up stage",
    ["followUpStages"],
  );
  addDuplicateIssues(
    config.videoTypeRules,
    context,
    (rule) => rule.matchTitle.toLocaleLowerCase("en-US"),
    "duplicates another rule when matched case-insensitively",
    ["videoTypeRules"],
  );
  addDuplicateIssues(
    config.topicGroups,
    context,
    (group) => group.slug,
    "duplicates topic group",
    ["topicGroups"],
  );

  const followUpStageSlugs = new Set(config.followUpStages.map((stage) => stage.slug));
  for (const [index, rule] of config.videoTypeRules.entries()) {
    if (!followUpStageSlugs.has(rule.followUpStage)) {
      context.addIssue({
        code: "custom",
        path: ["videoTypeRules", index, "followUpStage"],
        message: "must reference a configured follow-up stage",
      });
    }
  }
});

export type SiteContentProcessingConfig = z.infer<typeof siteContentProcessingConfigSchema>;

export function parseSiteContentProcessingConfig(
  value: unknown,
  label = "Site content processing config",
): SiteContentProcessingConfig {
  return parseSchema(siteContentProcessingConfigSchema, value, label);
}

export function validateSiteContentProcessingConfig(
  value: unknown,
): SchemaValidationResult<SiteContentProcessingConfig> {
  return validateSchema(siteContentProcessingConfigSchema, value);
}

function addDuplicateIssues<T>(
  values: readonly T[],
  context: z.RefinementCtx,
  keyFor: (value: T) => string,
  message: string,
  pathPrefix: PropertyKey[] = [],
): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    const key = keyFor(value);
    if (seen.has(key)) {
      context.addIssue({
        code: "custom",
        path: [...pathPrefix, index],
        message: `${message} ${key}`,
      });
    }
    seen.add(key);
  }
}
