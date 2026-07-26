import { z } from "zod";

import {
  nonEmptyStringSchema,
  parseSchema,
  topicSlugSchema,
} from "./shared.js";

export const curatedTopicSchema = z.strictObject({
  slug: topicSlugSchema,
  title: nonEmptyStringSchema,
  summary: z.string().optional(),
  aliases: z.array(nonEmptyStringSchema).optional(),
});

export const curatedTopicStoreSchema = z.strictObject({
  topics: z.array(curatedTopicSchema),
}).superRefine((store, context) => {
  const seen = new Set<string>();
  for (const [index, topic] of store.topics.entries()) {
    if (seen.has(topic.slug)) {
      context.addIssue({
        code: "custom",
        path: ["topics", index, "slug"],
        message: `duplicates topic slug ${topic.slug}`,
      });
    }
    seen.add(topic.slug);
  }
});

export type CuratedTopicSeed = z.infer<typeof curatedTopicSchema>;
export type CuratedTopicStore = z.infer<typeof curatedTopicStoreSchema>;

export function parseCuratedTopicStore(
  value: unknown,
  label: string,
): CuratedTopicStore {
  return parseSchema(curatedTopicStoreSchema, value, label);
}
