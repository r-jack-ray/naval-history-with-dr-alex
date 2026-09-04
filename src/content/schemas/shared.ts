import { z } from "zod";

export const nonEmptyStringSchema = z.string().refine(
    (value) => value.trim().length > 0,
    "must be a non-empty string",
);

export const safeVideoIdSchema = z.string().regex(
    /^[A-Za-z0-9_-]+$/u,
    "must be a safe non-empty video ID",
);

export const topicSlugSchema = z.string().regex(
    /^[0-9a-z]+(?:-[0-9a-z]+)*$/u,
    "must be a lowercase hyphenated topic slug",
);

export const timestampLabelSchema = z.string().regex(
    /^\d+:[0-5]\d(?::[0-5]\d)?$/u,
    "must be a timestamp in m:ss or h:mm:ss form",
);

export interface SchemaValidationSuccess<T> {
  success: true;
  data: T;
}

export interface SchemaValidationFailure {
  success: false;
  issues: string[];
}

export type SchemaValidationResult<T> =
    | SchemaValidationSuccess<T>
    | SchemaValidationFailure;

export function validateSchema<T>(
    schema: z.ZodType<T>,
    value: unknown,
): SchemaValidationResult<T> {
  const result = schema.safeParse(value);
  if (result.success) {
    return {success: true, data: result.data};
  }
  return {
    success: false,
    issues: result.error.issues.map((issue) => {
      const path = issue.path.length === 0
          ? "<root>"
          : issue.path.map(String).join(".");
      return `${path}: ${issue.message}`;
    }),
  };
}

export function parseSchema<T>(
    schema: z.ZodType<T>,
    value: unknown,
    label: string,
): T {
  const result = validateSchema(schema, value);
  if (result.success) {
    return result.data;
  }
  throw new Error([
    `${label} does not match its schema:`,
    ...result.issues.map((issue) => `- ${issue}`),
  ].join("\n"));
}
