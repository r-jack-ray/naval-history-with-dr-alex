import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const topicNormalizationPatternHeader = [
  "rule_id",
  "status",
  "scope",
  "match_kind",
  "match",
  "replacement",
  "canonical_title",
  "aliases_json",
  "notes",
] as const;

export const topicNormalizationStatuses = ["active", "review", "disabled"] as const;
export const topicNormalizationScopes = ["creation", "display"] as const;
export const topicNormalizationMatchKinds = ["exact", "regex", "token"] as const;

export type TopicNormalizationStatus = typeof topicNormalizationStatuses[number];
export type TopicNormalizationScope = typeof topicNormalizationScopes[number];
export type TopicNormalizationMatchKind = typeof topicNormalizationMatchKinds[number];

export interface TopicNormalizationRule {
  ruleId: string;
  status: TopicNormalizationStatus;
  scopes: TopicNormalizationScope[];
  matchKind: TopicNormalizationMatchKind;
  match: string;
  replacement: string;
  canonicalTitle: string;
  aliases: string[];
  notes: string;
  lineNumber: number;
}

export interface TopicNormalizationCatalog {
  sourcePath: string;
  canonicalText: string;
  sha256: string;
  sourceSha256: string;
  rules: TopicNormalizationRule[];
}

export interface ParseTopicNormalizationCatalogOptions {
  sourcePath?: string;
}

export interface TopicSlugResolution {
  input: string;
  slug: string;
  changed: boolean;
  matchedRuleIds: string[];
}

export interface TopicDisplayResolution {
  slug: string;
  title: string;
  matchedRuleIds: string[];
  resolution: "exact" | "regex" | "token" | "fallback";
}

export class TopicNormalizationCatalogError extends Error {
  readonly issues: string[];

  constructor(sourcePath: string, issues: string[]) {
    super(`Invalid topic normalization catalog ${sourcePath}:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "TopicNormalizationCatalogError";
    this.issues = [...issues];
  }
}

const topicSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ruleIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const tokenPattern = /^[a-z0-9]+$/u;
const regexReplacementPattern = /^(?:[a-z0-9]+|\$[1-9][0-9]*)(?:-(?:[a-z0-9]+|\$[1-9][0-9]*))*$/u;
const romanNumerals = new Set(["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]);

export async function loadTopicNormalizationCatalog(
  path: string,
): Promise<TopicNormalizationCatalog> {
  return parseTopicNormalizationCatalog(await readFile(path, "utf8"), { sourcePath: path });
}

export function parseTopicNormalizationCatalog(
  text: string,
  options: ParseTopicNormalizationCatalogOptions = {},
): TopicNormalizationCatalog {
  const sourcePath = options.sourcePath ?? "<topic-normalization-patterns.tsv>";
  const issues: string[] = [];
  const normalizedInput = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const lines = normalizedInput.split(/\r\n|\n|\r/u);
  if (lines.at(-1) === "") {
    lines.pop();
  }

  const expectedHeader = topicNormalizationPatternHeader.join("\t");
  if (lines[0] !== expectedHeader) {
    issues.push(`line 1 must be the exact nine-column header ${JSON.stringify(expectedHeader)}.`);
  }

  const rules: TopicNormalizationRule[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index] ?? "";
    if (line.length === 0) {
      issues.push(`line ${lineNumber} must not be blank.`);
      continue;
    }
    const fields = line.split("\t");
    if (fields.length !== topicNormalizationPatternHeader.length) {
      issues.push(`line ${lineNumber} must contain exactly nine tab-separated fields; received ${fields.length}.`);
      continue;
    }

    const [
      ruleIdValue,
      statusValue,
      scopeValue,
      matchKindValue,
      matchValue,
      replacementValue,
      canonicalTitleValue,
      aliasesJsonValue,
      notesValue,
    ] = fields as [string, string, string, string, string, string, string, string, string];

    const rowIssues: string[] = [];
    if (!ruleIdPattern.test(ruleIdValue)) {
      rowIssues.push("rule_id must be a lowercase hyphenated identifier");
    }
    const status = enumValue(statusValue, topicNormalizationStatuses);
    if (status === undefined) {
      rowIssues.push(`status must be one of ${topicNormalizationStatuses.join(", ")}`);
    }
    const scopes = parseScopes(scopeValue);
    if (scopes === undefined) {
      rowIssues.push("scope must contain creation and/or display once in canonical order");
    }
    const matchKind = enumValue(matchKindValue, topicNormalizationMatchKinds);
    if (matchKind === undefined) {
      rowIssues.push(`match_kind must be one of ${topicNormalizationMatchKinds.join(", ")}`);
    }
    const aliases = parseAliases(aliasesJsonValue, rowIssues);
    if (notesValue.length === 0) {
      rowIssues.push("notes must not be empty");
    }

    if (matchKind !== undefined && scopes !== undefined) {
      validateRuleFields({
        matchKind,
        scopes,
        match: matchValue,
        replacement: replacementValue,
        canonicalTitle: canonicalTitleValue,
        aliases,
      }, rowIssues);
    }

    if (
      status === undefined
      || scopes === undefined
      || matchKind === undefined
      || aliases === undefined
      || rowIssues.length > 0
    ) {
      issues.push(...rowIssues.map((issue) => `line ${lineNumber}: ${issue}.`));
      continue;
    }

    rules.push({
      ruleId: ruleIdValue,
      status,
      scopes,
      matchKind,
      match: matchValue,
      replacement: replacementValue,
      canonicalTitle: canonicalTitleValue,
      aliases,
      notes: notesValue,
      lineNumber,
    });
  }

  validateCatalogRules(rules, issues);
  if (issues.length > 0) {
    throw new TopicNormalizationCatalogError(sourcePath, issues);
  }

  const canonicalText = serializeTopicNormalizationCatalog(rules);
  return {
    sourcePath,
    canonicalText,
    sha256: createHash("sha256").update(canonicalText, "utf8").digest("hex"),
    sourceSha256: createHash("sha256").update(text, "utf8").digest("hex"),
    rules,
  };
}

export function serializeTopicNormalizationCatalog(
  rules: readonly TopicNormalizationRule[],
): string {
  const rows = rules.map((rule) => [
    rule.ruleId,
    rule.status,
    rule.scopes.join("+"),
    rule.matchKind,
    rule.match,
    rule.replacement,
    rule.canonicalTitle,
    JSON.stringify(rule.aliases),
    rule.notes,
  ].join("\t"));
  return `${[topicNormalizationPatternHeader.join("\t"), ...rows].join("\n")}\n`;
}

export function isTopicSlug(value: string): boolean {
  return topicSlugPattern.test(value);
}

export function resolveTopicCreation(
  catalog: TopicNormalizationCatalog,
  slug: string,
): TopicSlugResolution {
  assertTopicSlug(slug, "creation input");
  const reviewRules = catalog.rules.filter((rule) => (
    rule.status === "review"
    && rule.scopes.includes("creation")
    && rule.matchKind === "exact"
    && rule.match === slug
  ));
  if (reviewRules.length > 0) {
    return {
      input: slug,
      slug,
      changed: false,
      matchedRuleIds: reviewRules.map((rule) => rule.ruleId),
    };
  }
  const match = resolveSlugRule(catalog, slug, "creation");
  if (match === undefined) {
    return { input: slug, slug, changed: false, matchedRuleIds: [] };
  }
  const resolvedSlug = applySlugRule(match.rule, slug, match.expression);
  return {
    input: slug,
    slug: resolvedSlug,
    changed: resolvedSlug !== slug,
    matchedRuleIds: [match.rule.ruleId],
  };
}

export function resolveTopicDisplayTitle(
  catalog: TopicNormalizationCatalog,
  slug: string,
): TopicDisplayResolution {
  assertTopicSlug(slug, "display input");
  const fullRule = resolveSlugRule(catalog, slug, "display");
  const matchedRuleIds: string[] = [];
  let displaySlug = slug;
  let canonicalTitle = "";
  let resolution: TopicDisplayResolution["resolution"] = "fallback";

  if (fullRule !== undefined) {
    matchedRuleIds.push(fullRule.rule.ruleId);
    displaySlug = applySlugRule(fullRule.rule, slug, fullRule.expression);
    canonicalTitle = applyTitleRule(fullRule.rule, slug, fullRule.expression);
    resolution = fullRule.rule.matchKind;
  }

  if (canonicalTitle.length > 0) {
    return { slug, title: canonicalTitle, matchedRuleIds, resolution };
  }

  const tokenRules = new Map(
    activeRulesFor(catalog, "display", "token").map((rule) => [rule.match, rule]),
  );
  const tokens = displaySlug.split("-");
  const title = tokens.map((token) => {
    const tokenRule = tokenRules.get(token);
    if (tokenRule !== undefined) {
      matchedRuleIds.push(tokenRule.ruleId);
      return tokenRule.replacement;
    }
    if (romanNumerals.has(token)) {
      return token.toUpperCase();
    }
    return `${token.slice(0, 1).toUpperCase()}${token.slice(1)}`;
  }).join(" ");

  if (matchedRuleIds.length > 0 && resolution === "fallback") {
    resolution = "token";
  }
  return {
    slug,
    title,
    matchedRuleIds: [...new Set(matchedRuleIds)],
    resolution,
  };
}

export function topicTitleFromSlug(
  slug: string,
  catalog: TopicNormalizationCatalog,
): string {
  return resolveTopicDisplayTitle(catalog, slug).title;
}

export function topicCollisionKey(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function validateRuleFields(
  rule: {
    matchKind: TopicNormalizationMatchKind;
    scopes: TopicNormalizationScope[];
    match: string;
    replacement: string;
    canonicalTitle: string;
    aliases: string[] | undefined;
  },
  issues: string[],
): void {
  const { matchKind, scopes, match, replacement, canonicalTitle } = rule;
  if (match.length === 0) {
    issues.push("match must not be empty");
  }
  if (replacement.length === 0) {
    issues.push("replacement must not be empty");
  }

  if (matchKind === "exact") {
    if (!topicSlugPattern.test(match)) {
      issues.push("an exact match must be a valid lowercase topic slug");
    }
    if (!topicSlugPattern.test(replacement)) {
      issues.push("an exact replacement must be a valid lowercase topic slug");
    }
  }

  if (matchKind === "regex") {
    if (!match.startsWith("^") || !match.endsWith("$")) {
      issues.push("a regex match must be fully anchored with ^ and $");
    }
    let expression: RegExp | undefined;
    try {
      expression = new RegExp(match, "u");
    } catch (error) {
      issues.push(`regex match is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!regexReplacementPattern.test(replacement)) {
      issues.push("a regex replacement must be a lowercase slug template using numeric $1 capture references");
    }
    if (expression !== undefined) {
      const captureCount = countCapturingGroups(match);
      validateCaptureReferences(replacement, captureCount, "replacement", issues);
      validateCaptureReferences(canonicalTitle, captureCount, "canonical_title", issues);
    }
  }

  if (matchKind === "token") {
    if (scopes.length !== 1 || scopes[0] !== "display") {
      issues.push("a token rule must use display scope only");
    }
    if (!tokenPattern.test(match)) {
      issues.push("a token match must be one lowercase slug token");
    }
    if (replacement.length === 0 || /\s/u.test(replacement)) {
      issues.push("a token replacement must be one non-whitespace display token");
    }
    if (canonicalTitle.length > 0) {
      issues.push("a token rule cannot own a full canonical_title");
    }
  }

}

function validateCatalogRules(rules: TopicNormalizationRule[], issues: string[]): void {
  const ruleIds = new Map<string, TopicNormalizationRule>();
  for (const rule of rules) {
    const previous = ruleIds.get(rule.ruleId);
    if (previous !== undefined) {
      issues.push(`line ${rule.lineNumber}: duplicate rule_id ${rule.ruleId}; first declared on line ${previous.lineNumber}.`);
    } else {
      ruleIds.set(rule.ruleId, rule);
    }
  }

  const activeMatchKeys = new Map<string, TopicNormalizationRule>();
  for (const rule of rules.filter((candidate) => candidate.status === "active")) {
    for (const scope of rule.scopes) {
      const key = `${scope}\u0000${rule.matchKind}\u0000${rule.match}`;
      const previous = activeMatchKeys.get(key);
      if (previous !== undefined) {
        issues.push(
          `line ${rule.lineNumber}: active ${scope} ${rule.matchKind} match ${JSON.stringify(rule.match)} conflicts with line ${previous.lineNumber}.`,
        );
      } else {
        activeMatchKeys.set(key, rule);
      }
    }
  }

  const exactCreationBySource = new Map<string, TopicNormalizationRule>();
  for (const rule of activeRulesFor({ rules }, "creation", "exact")) {
    const previous = exactCreationBySource.get(rule.match);
    if (previous !== undefined && previous.replacement !== rule.replacement) {
      issues.push(
        `line ${rule.lineNumber}: exact creation input ${rule.match} has outputs ${previous.replacement} and ${rule.replacement}.`,
      );
    } else {
      exactCreationBySource.set(rule.match, rule);
    }
  }
  for (const rule of exactCreationBySource.values()) {
    const next = exactCreationBySource.get(rule.replacement);
    if (next !== undefined) {
      issues.push(
        `line ${rule.lineNumber}: exact creation mapping ${rule.match} -> ${rule.replacement} forms a chain or cycle through line ${next.lineNumber}.`,
      );
    }
  }

  const titlesByTarget = new Map<string, { title: string; rule: TopicNormalizationRule }>();
  for (const rule of rules.filter((candidate) => (
    candidate.status === "active"
    && candidate.matchKind !== "token"
    && candidate.canonicalTitle.length > 0
  ))) {
    const previous = titlesByTarget.get(rule.replacement);
    if (previous !== undefined && previous.title !== rule.canonicalTitle) {
      issues.push(
        `line ${rule.lineNumber}: canonical target ${rule.replacement} has conflicting titles ${JSON.stringify(previous.title)} and ${JSON.stringify(rule.canonicalTitle)} (line ${previous.rule.lineNumber}).`,
      );
    } else {
      titlesByTarget.set(rule.replacement, { title: rule.canonicalTitle, rule });
    }
  }
}

function activeRulesFor(
  catalog: Pick<TopicNormalizationCatalog, "rules">,
  scope: TopicNormalizationScope,
  matchKind?: TopicNormalizationMatchKind,
): TopicNormalizationRule[] {
  return catalog.rules.filter((rule) => (
    rule.status === "active"
    && rule.scopes.includes(scope)
    && (matchKind === undefined || rule.matchKind === matchKind)
  ));
}

function resolveSlugRule(
  catalog: TopicNormalizationCatalog,
  slug: string,
  scope: "creation" | "display",
): { rule: TopicNormalizationRule; expression?: RegExp } | undefined {
  const exact = activeRulesFor(catalog, scope, "exact").find((rule) => rule.match === slug);
  if (exact !== undefined) {
    return { rule: exact };
  }

  const regexMatches = activeRulesFor(catalog, scope, "regex").flatMap((rule) => {
    const expression = new RegExp(rule.match, "u");
    return expression.test(slug) ? [{ rule, expression }] : [];
  });
  if (regexMatches.length > 1) {
    throw new Error(
      `Topic ${slug} ambiguously matches active ${scope} rules: ${regexMatches.map(({ rule }) => rule.ruleId).join(", ")}.`,
    );
  }
  return regexMatches[0];
}

function applySlugRule(rule: TopicNormalizationRule, slug: string, expression?: RegExp): string {
  const result = rule.matchKind === "regex"
    ? slug.replace(expression ?? new RegExp(rule.match, "u"), rule.replacement)
    : rule.replacement;
  assertTopicSlug(result, `replacement from rule ${rule.ruleId}`);
  return result;
}

function applyTitleRule(rule: TopicNormalizationRule, slug: string, expression?: RegExp): string {
  if (rule.canonicalTitle.length === 0) {
    return "";
  }
  return rule.matchKind === "regex"
    ? slug.replace(expression ?? new RegExp(rule.match, "u"), rule.canonicalTitle)
    : rule.canonicalTitle;
}

function parseScopes(value: string): TopicNormalizationScope[] | undefined {
  const parts = value.split("+");
  if (parts.length === 0 || parts.some((part) => !topicNormalizationScopes.includes(part as TopicNormalizationScope))) {
    return undefined;
  }
  const scopes = parts as TopicNormalizationScope[];
  if (new Set(scopes).size !== scopes.length) {
    return undefined;
  }
  const canonical = topicNormalizationScopes.filter((scope) => scopes.includes(scope));
  return canonical.join("+") === value ? [...canonical] : undefined;
}

function parseAliases(value: string, issues: string[]): string[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    issues.push(`aliases_json must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
  if (!Array.isArray(parsed) || parsed.some((alias) => typeof alias !== "string")) {
    issues.push("aliases_json must be a JSON array of strings");
    return undefined;
  }
  const aliases = parsed as string[];
  if (aliases.some((alias) => alias.trim().length === 0 || /[\t\r\n]/u.test(alias))) {
    issues.push("aliases_json entries must be non-empty and contain no tabs or line breaks");
  }
  if (new Set(aliases).size !== aliases.length) {
    issues.push("aliases_json must not contain duplicate entries");
  }
  return [...aliases];
}

function enumValue<const T extends readonly string[]>(
  value: string,
  allowed: T,
): T[number] | undefined {
  return allowed.includes(value) ? value as T[number] : undefined;
}

function validateCaptureReferences(
  template: string,
  captureCount: number,
  field: string,
  issues: string[],
): void {
  for (const match of template.matchAll(/\$([0-9]+)/gu)) {
    const capture = Number.parseInt(match[1] ?? "0", 10);
    if (capture < 1 || capture > captureCount) {
      issues.push(`${field} references missing regex capture $${capture}`);
    }
  }
  if (/\$(?![0-9])/u.test(template)) {
    issues.push(`${field} contains an unsupported $ replacement sequence`);
  }
}

function countCapturingGroups(pattern: string): number {
  let count = 0;
  let escaped = false;
  let inCharacterClass = false;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "[") {
      inCharacterClass = true;
      continue;
    }
    if (character === "]") {
      inCharacterClass = false;
      continue;
    }
    if (character !== "(" || inCharacterClass) {
      continue;
    }
    if (pattern[index + 1] !== "?") {
      count += 1;
      continue;
    }
    if (
      pattern[index + 2] === "<"
      && pattern[index + 3] !== "="
      && pattern[index + 3] !== "!"
    ) {
      count += 1;
    }
  }
  return count;
}

function assertTopicSlug(value: string, label: string): void {
  if (!topicSlugPattern.test(value)) {
    throw new Error(`Invalid topic slug for ${label}: ${JSON.stringify(value)}.`);
  }
}
