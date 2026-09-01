import { fuzzy } from "fast-fuzzy";

import type { CuratedSegmentSeed, CuratedVideoFileSeed } from "./schemas/index.js";

export type SiteContentWordingField =
  | "title"
  | "summary"
  | "body"
  | "question"
  | "answerShort";
export type SiteContentWordingConfidence = "high" | "review";
export type SiteContentWordingSegmentKind = CuratedSegmentSeed["kind"];

export interface SiteContentWordingFinding {
  file: string;
  videoId: string;
  segmentId: string;
  segmentStart: string;
  segmentIndex: number;
  segmentKind: SiteContentWordingSegmentKind;
  field: SiteContentWordingField;
  ruleId: string;
  confidence: SiteContentWordingConfidence;
  unconditionalError: boolean;
  match: string;
  excerpt: string;
  guidance: string;
  characterStart: number;
  similarity?: number;
  referencePhrase?: string;
  occurrenceCount?: number;
  affectedSegmentCount?: number;
  repeatedSegmentCount?: number;
}

export interface SiteContentWordingOptions {
  includeReview?: boolean;
  includeFuzzy?: boolean;
  fuzzyThreshold?: number;
}

interface SiteContentWordingRule {
  id: string;
  confidence: SiteContentWordingConfidence;
  fields: readonly SiteContentWordingField[];
  pattern: RegExp;
  captureGroup: string | null;
  guidance: string;
  unconditionalError?: boolean;
  segmentKinds?: readonly SiteContentWordingSegmentKind[];
  requiresClauseBoundary?: boolean;
}

interface FuzzyPhrase {
  phrase: string;
  anchor: string;
  fields: readonly SiteContentWordingField[];
}

interface LocatedFinding {
  finding: SiteContentWordingFinding;
  start: number;
  end: number;
}

interface WordToken {
  value: string;
  start: number;
  end: number;
}

interface HostAttributionReference {
  segmentId: string;
  segmentStart: string;
  segmentIndex: number;
  segmentKind: SiteContentWordingSegmentKind;
  field: SiteContentWordingField;
  text: string;
  match: string;
  characterStart: number;
}

const allFields: readonly SiteContentWordingField[] = [
  "title",
  "summary",
  "body",
  "question",
  "answerShort",
];
const answerFields: readonly SiteContentWordingField[] = [
  "title",
  "summary",
  "body",
  "answerShort",
];
const hostAttributionRuleId = "host-attribution";
const hostAttributionPattern = /\b(?:(?:(?:Dr\.?|Doctor|Professor)\s+(?:Alex\s+)?|Alex\s+)Clarke(?:['’]s)?|Clarke(?:['’]s)?)\b/giu;

const deterministicRules: readonly SiteContentWordingRule[] = [
  {
    id: "prohibited-unicode-dash",
    confidence: "high",
    fields: allFields,
    pattern: /[\u2013\u2014]/gu,
    captureGroup: null,
    guidance: "Replace this prohibited Unicode dash with punctuation or wording appropriate to the sentence.",
    unconditionalError: true,
  },
  {
    id: "transcript-position-reference",
    confidence: "high",
    fields: allFields,
    pattern: /\b(?:(?:earlier|later|elsewhere|previously|above|below)\s+(?:in|from|within)\s+(?:the|this)\s+transcript|(?:in|from|within)\s+(?:the|this)\s+transcript\s+(?:earlier|later|elsewhere|previously|above|below))\b/giu,
    captureGroup: null,
    guidance: "Remove transcript-position navigation and state the supported historical or technical point directly.",
  },
  {
    id: "transcript-rendering-reference",
    confidence: "high",
    fields: allFields,
    pattern: /\b(?:rendered|recorded|preserved|transcribed)\s+in\s+(?:the|this)\s+transcript\b/giu,
    captureGroup: null,
    guidance: "Use the intended wording when the source supports it; otherwise retain a concise source limitation.",
  },
  {
    id: "conversation-position-reference",
    confidence: "high",
    fields: allFields,
    pattern: /\b(?:earlier|later|elsewhere|previously|above|below)\s+(?:in|from|within)\s+(?:the|this)\s+(?:discussion|exchange|answer|response|reply)\b/giu,
    captureGroup: null,
    guidance: "Remove navigation within the discussion or exchange and state the supported point directly.",
  },
  {
    id: "transcript-authority-frame",
    confidence: "high",
    fields: allFields,
    pattern: /\baccording\s+to\s+(?:the|this)\s+transcript\b/giu,
    captureGroup: null,
    guidance: "State the transcript-grounded subject matter directly instead of presenting the transcript as an authority.",
  },
  {
    id: "transcript-reporting-frame",
    confidence: "high",
    fields: allFields,
    pattern: /\b(?:the|this)\s+transcript\s+(?:says?|states?|notes?|records?|reads?|renders?|describes?|mentions?|shows?|identifies?|explains?|indicates?)\b/giu,
    captureGroup: null,
    guidance: "Rewrite as direct study-guide prose when possible; retain explicit source limits when the transcript leaves a point uncertain.",
  },
  {
    id: "answer-reporting-frame",
    confidence: "high",
    fields: answerFields,
    pattern: /\b(?:the|this)\s+(?:answer|response|reply)\s+(?:says?|states?|notes?|records?|reports?|explains?|describes?|mentions?|shows?|identifies?|indicates?|confirms?)\b/giu,
    captureGroup: null,
    guidance: "Replace commentary about the answer, response, or reply with the direct answer and its transcript-backed reasoning.",
    segmentKinds: ["qa"],
    requiresClauseBoundary: true,
  },
  {
    id: "non-qa-answer-reporting-frame",
    confidence: "review",
    fields: answerFields,
    pattern: /\b(?:the|this)\s+(?:answer|response|reply)\s+(?:says?|states?|notes?|records?|reports?|explains?|describes?|mentions?|shows?|identifies?|indicates?|confirms?)\b/giu,
    captureGroup: null,
    guidance: "Check whether this is commentary about an answer or a genuine historical, operational, or institutional response. Rewrite only the commentary form.",
    segmentKinds: ["chapter", "notable_point", "transcript_excerpt"],
    requiresClauseBoundary: true,
  },
  {
    id: "content-workflow-deferral",
    confidence: "high",
    fields: allFields,
    pattern: /\b(?:(?:later|future|follow-up|subsequent)\s+(?:content\s+)?(?:extraction|curation|processing)|(?:will|should|needs?\s+to|remains?\s+to)\s+(?:be\s+)?(?:expanded|extracted|curated|processed)\s+(?:later|in\s+(?:a|the)\s+(?:later|future|follow-up)\s+pass))\b/giu,
    captureGroup: null,
    guidance: "Move incomplete-work status to the processing log or handoff and keep the public field focused on available content.",
  },
  {
    id: "pipeline-workflow-reference",
    confidence: "high",
    fields: allFields,
    pattern: /\b(?:(?:site|content|curation|transcript|shard)\s+(?:pipeline|workflow)|(?:pipeline|workflow)\s+(?:status|metadata|wording|scaffold))\b/giu,
    captureGroup: null,
    guidance: "Remove internal pipeline or workflow language from the public study-guide field.",
  },
  {
    id: "search-scaffold-reference",
    confidence: "high",
    fields: allFields,
    pattern: /\b(?:search\s+metadata|useful\s+for\s+(?:search|browsing)|search\s+target|searchable\s+(?:seed|prototype|record|entry))\b/giu,
    captureGroup: null,
    guidance: "Describe the historical or technical learning value directly instead of the record's search function.",
  },
  {
    id: "source-evidence-window-reference",
    confidence: "high",
    fields: allFields,
    pattern: /\b(?:source|evidence)\s+window\b/giu,
    captureGroup: null,
    guidance: "Replace internal source-window or evidence-window terminology with the supported subject matter or a plain source limitation.",
  },
  {
    id: "segment-existence-frame",
    confidence: "high",
    fields: allFields,
    pattern: /\b(?:(?:this|the)\s+(?:segment|record|entry|note|chapter)\s+exists\s+to|(?:this|the)\s+(?:segment|record|entry|note)\s+(?:was|is)\s+(?:added|created|included)\s+to)\b/giu,
    captureGroup: null,
    guidance: "Replace record-existence commentary with the subject, takeaway, and reason to open the video moment.",
  },
  {
    id: "scaffold-type-reference",
    confidence: "high",
    fields: allFields,
    pattern: /\b(?:(?:prototype|seed)\s+(?:segment|record|entry|note|content|metadata|shard|page)|(?:segment|record|entry|note|content|metadata|shard|page)\s+(?:prototype|seed))\b/giu,
    captureGroup: null,
    guidance: "Remove content-scaffold labels from the public field; retain prototype or seed terminology only for the historical subject itself.",
  },
  {
    id: "internal-schema-reference",
    confidence: "high",
    fields: allFields,
    pattern: /\b(?:sourcePath|answerShort|videoId|fileStem|topics\.json|JSON\s+shard|segment\s+shard|generated\s+archive)\b/giu,
    captureGroup: null,
    guidance: "Remove internal field names, filenames, and generated-data terminology from public study-guide prose.",
  },
  {
    id: "question-reporting-frame",
    confidence: "review",
    fields: answerFields,
    pattern: /\b(?:the|this)\s+question\s+(?:asks?|is\s+asking|says?|states?|mentions?)\b/giu,
    captureGroup: null,
    guidance: "Prefer the direct answer unless question-reporting language is needed to explain a mismatch or ambiguity in the exchange.",
  },
  {
    id: "meta-content-frame",
    confidence: "review",
    fields: answerFields,
    pattern: /\b(?<phrase>(?:this|the)\s+(?:segment|record|entry|note|chapter|passage|section)\s+(?:shows?|explains?|describes?|covers?|discusses?|introduces?|examines?|uses?|highlights?|connects?|focuses?))\b/giu,
    captureGroup: "phrase",
    guidance: "Check whether the sentence can name the subject and takeaway directly; retain watch-point framing when it genuinely helps the reader navigate the video.",
  },
  {
    id: "context-sensitive-workflow-term",
    confidence: "review",
    fields: allFields,
    pattern: /\b(?<phrase>(?:site|content|transcript|question|answer|segment|shard|metadata|scaffold)\s+(?:processing|curation|extraction|pass|review|status|stage|queue|backlog)|(?:processing|curation|extraction|pass|review)\s+(?:status|stage|queue|backlog|workflow)|(?:first|initial|later|future|follow-up|subsequent)\s+(?:content|curation|processing|extraction)\s+(?:pass|stage|review))\b/giu,
    captureGroup: "phrase",
    guidance: "Check whether this collocation describes site workflow. Move workflow status to the processing log while preserving genuine historical, technical, or operational subject matter.",
  },
];

const fuzzyGuidance =
  "Inspect the transcript and shard before editing this possible variant; remove workflow-shaped wording without deleting legitimate technical language or source uncertainty.";

const fuzzyPhrases: readonly FuzzyPhrase[] = [
  { phrase: "earlier in the transcript", anchor: "transcript", fields: allFields },
  { phrase: "later in the transcript", anchor: "transcript", fields: allFields },
  { phrase: "according to the transcript", anchor: "transcript", fields: allFields },
  { phrase: "source window", anchor: "window", fields: allFields },
  { phrase: "evidence window", anchor: "window", fields: allFields },
  { phrase: "search metadata", anchor: "metadata", fields: allFields },
  { phrase: "useful for search", anchor: "search", fields: allFields },
  { phrase: "this segment exists to", anchor: "exists", fields: allFields },
  { phrase: "later extraction", anchor: "extraction", fields: allFields },
];

export const siteContentWordingRuleIds: readonly string[] = [
  ...new Set([
    ...deterministicRules.map((rule) => rule.id),
    hostAttributionRuleId,
    "possible-mechanical-phrase-variant",
  ]),
].sort();

export function scanCuratedVideoFileMechanicalWording(
  file: string,
  video: CuratedVideoFileSeed,
  options: SiteContentWordingOptions = {},
): SiteContentWordingFinding[] {
  const includeFuzzy = options.includeFuzzy ?? false;
  const includeReview = options.includeReview ?? includeFuzzy;
  const fuzzyThreshold = options.fuzzyThreshold ?? 0.9;
  if (fuzzyThreshold < 0 || fuzzyThreshold > 1) {
    throw new Error("fuzzyThreshold must be between 0 and 1.");
  }

  const findings: SiteContentWordingFinding[] = [];
  const hostAttributions: HostAttributionReference[] = [];
  for (const [segmentIndex, segment] of video.segments.entries()) {
    const fields: Array<[SiteContentWordingField, string]> = [
      ["title", segment.title],
    ];
    if ("summary" in segment && segment.summary !== undefined) {
      fields.push(["summary", segment.summary]);
    }
    fields.push(["body", segment.body]);
    if (segment.kind === "qa") {
      fields.push(["question", segment.question]);
      fields.push(["answerShort", segment.answerShort]);
    }

    for (const [field, value] of fields) {
      const text = visibleFieldText(value);
      if (includeReview) {
        for (const match of text.matchAll(hostAttributionPattern)) {
          hostAttributions.push({
            segmentId: segment.slug,
            segmentStart: segment.start,
            segmentIndex,
            segmentKind: segment.kind,
            field,
            text,
            match: match[0],
            characterStart: match.index,
          });
        }
      }
      findings.push(...scanField(
        file,
        video.videoId,
        segment.slug,
        segment.start,
        segmentIndex,
        segment.kind,
        field,
        text,
        includeReview,
        includeFuzzy,
        fuzzyThreshold,
      ));
    }
  }

  if (includeReview) {
    findings.push(...hostAttributionFindings(file, video, hostAttributions));
  }

  return findings.sort(compareFindings);
}

export function visibleFieldText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function scanField(
  file: string,
  videoId: string,
  segmentId: string,
  segmentStart: string,
  segmentIndex: number,
  segmentKind: SiteContentWordingSegmentKind,
  field: SiteContentWordingField,
  text: string,
  includeReview: boolean,
  includeFuzzy: boolean,
  fuzzyThreshold: number,
): SiteContentWordingFinding[] {
  const located: LocatedFinding[] = [];
  for (const rule of deterministicRules) {
    if (
      !rule.fields.includes(field)
      || (rule.segmentKinds !== undefined && !rule.segmentKinds.includes(segmentKind))
      || (!includeReview && rule.confidence === "review")
    ) {
      continue;
    }
    for (const match of text.matchAll(rule.pattern)) {
      const phrase = rule.captureGroup === null
        ? match[0]
        : match.groups?.[rule.captureGroup];
      if (phrase === undefined) {
        continue;
      }
      const phraseOffset = match[0].lastIndexOf(phrase);
      const start = match.index + Math.max(phraseOffset, 0);
      const end = start + phrase.length;
      if (rule.requiresClauseBoundary === true && !isClauseBoundary(text, start)) {
        continue;
      }
      if (rule.confidence === "review" && overlaps(start, end, located)) {
        continue;
      }
      located.push({
        finding: baseFinding(
          file,
          videoId,
          segmentId,
          segmentStart,
          segmentIndex,
          segmentKind,
          field,
          rule.id,
          rule.confidence,
          phrase,
          text,
          start,
          rule.guidance,
          rule.unconditionalError ?? false,
        ),
        start,
        end,
      });
    }
  }

  if (includeReview && includeFuzzy) {
    located.push(...fuzzyFindings(
      file,
      videoId,
      segmentId,
      segmentStart,
      segmentIndex,
      segmentKind,
      field,
      text,
      fuzzyThreshold,
      located,
    ));
  }
  return located.map((item) => item.finding);
}

function hostAttributionFindings(
  file: string,
  video: CuratedVideoFileSeed,
  references: readonly HostAttributionReference[],
): SiteContentWordingFinding[] {
  if (references.length === 0) {
    return [];
  }

  const countsBySegment = new Map<number, number>();
  for (const reference of references) {
    countsBySegment.set(
      reference.segmentIndex,
      (countsBySegment.get(reference.segmentIndex) ?? 0) + 1,
    );
  }
  const affectedSegmentCount = countsBySegment.size;
  const repeatedSegmentCount = [...countsBySegment.values()]
    .filter((count) => count > 1)
    .length;
  const first = references[0]!;
  const segmentLabel = affectedSegmentCount === 1 ? "segment" : "segments";
  const guidance =
    `This shard uses host attribution ${references.length} times across ${affectedSegmentCount} ${segmentLabel}. `
    + "Review every public-field occurrence and confirm that the matched Clark or Clarke refers to the host before changing it. Each segment already has sourcePath and evidence, so the public prose does not need the host's name for provenance. In a solo-speaker episode, remove routine host reidentification and write the subject naturally. In a multi-speaker episode, retain attribution that distinguishes the speakers or identifies a quotation. Preserve other people named Clark or Clarke.";
  return [
    {
      ...baseFinding(
        file,
        video.videoId,
        first.segmentId,
        first.segmentStart,
        first.segmentIndex,
        first.segmentKind,
        first.field,
        hostAttributionRuleId,
        "review",
        first.match,
        first.text,
        first.characterStart,
        guidance,
        false,
      ),
      occurrenceCount: references.length,
      affectedSegmentCount,
      repeatedSegmentCount,
    },
  ];
}

function fuzzyFindings(
  file: string,
  videoId: string,
  segmentId: string,
  segmentStart: string,
  segmentIndex: number,
  segmentKind: SiteContentWordingSegmentKind,
  field: SiteContentWordingField,
  text: string,
  threshold: number,
  deterministic: readonly LocatedFinding[],
): LocatedFinding[] {
  const words = wordTokens(text);
  const candidates: LocatedFinding[] = [];
  for (const reference of fuzzyPhrases) {
    if (!reference.fields.includes(field)) {
      continue;
    }
    const referenceWords = wordTokens(reference.phrase);
    const anchorIndex = referenceWords.findIndex(
      (word) => word.value.toLocaleLowerCase() === reference.anchor.toLocaleLowerCase(),
    );
    if (anchorIndex < 0) {
      continue;
    }
    for (const [wordIndex, word] of words.entries()) {
      if (!resemblesAnchor(word.value, reference.anchor)) {
        continue;
      }
      const startWordIndex = wordIndex - anchorIndex;
      const endWordIndex = startWordIndex + referenceWords.length - 1;
      const first = words[startWordIndex];
      const last = words[endWordIndex];
      if (first === undefined || last === undefined) {
        continue;
      }
      const candidate = text.slice(first.start, last.end);
      if (candidate.toLocaleLowerCase() === reference.phrase.toLocaleLowerCase()) {
        continue;
      }
      const score = fuzzy(reference.phrase, candidate, {
        ignoreCase: true,
        ignoreSymbols: true,
        normalizeWhitespace: true,
        useSellers: false,
      });
      if (score < threshold || overlaps(first.start, last.end, deterministic)) {
        continue;
      }
      candidates.push({
        finding: {
          ...baseFinding(
            file,
            videoId,
            segmentId,
            segmentStart,
            segmentIndex,
            segmentKind,
            field,
            "possible-mechanical-phrase-variant",
            "review",
            candidate,
            text,
            first.start,
            fuzzyGuidance,
            false,
          ),
          similarity: roundedScore(score),
          referencePhrase: reference.phrase,
        },
        start: first.start,
        end: last.end,
      });
    }
  }

  candidates.sort((left, right) =>
    (right.finding.similarity ?? 0) - (left.finding.similarity ?? 0)
    || left.start - right.start
  );
  const selected: LocatedFinding[] = [];
  for (const candidate of candidates) {
    if (!overlaps(candidate.start, candidate.end, selected)) {
      selected.push(candidate);
    }
  }
  return selected;
}

function resemblesAnchor(value: string, reference: string): boolean {
  const normalized = value.toLocaleLowerCase();
  const normalizedReference = reference.toLocaleLowerCase();
  if (
    normalized[0] !== normalizedReference[0]
    || Math.abs(normalized.length - normalizedReference.length) > 3
  ) {
    return false;
  }
  return fuzzy(normalizedReference, normalized, {
    ignoreCase: true,
    ignoreSymbols: true,
    normalizeWhitespace: true,
    useSellers: false,
  }) >= 0.7;
}

function baseFinding(
  file: string,
  videoId: string,
  segmentId: string,
  segmentStart: string,
  segmentIndex: number,
  segmentKind: SiteContentWordingSegmentKind,
  field: SiteContentWordingField,
  ruleId: string,
  confidence: SiteContentWordingConfidence,
  match: string,
  text: string,
  characterStart: number,
  guidance: string,
  unconditionalError: boolean,
): SiteContentWordingFinding {
  const excerpt = excerptAround(text, characterStart, match.length);
  return {
    file,
    videoId,
    segmentId,
    segmentStart,
    segmentIndex,
    segmentKind,
    field,
    ruleId,
    confidence,
    unconditionalError,
    match: safeDiagnosticText(match),
    excerpt: safeDiagnosticText(excerpt),
    guidance,
    characterStart,
  };
}

function safeDiagnosticText(value: string): string {
  return value
    .replace(/\u2013/gu, "\\u2013")
    .replace(/\u2014/gu, "\\u2014");
}

function wordTokens(text: string): WordToken[] {
  const result: WordToken[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)) {
    result.push({ value: match[0], start: match.index, end: match.index + match[0].length });
  }
  return result;
}

function overlaps(start: number, end: number, findings: readonly LocatedFinding[]): boolean {
  return findings.some((finding) => start < finding.end && end > finding.start);
}

function isClauseBoundary(text: string, start: number): boolean {
  if (start === 0) {
    return true;
  }
  return /(?:[.!?;:]\s+|,\s+|\b(?:and|although|because|but|so|while|yet)\s+)$/iu.test(
    text.slice(0, start),
  );
}

function excerptAround(text: string, start: number, length: number): string {
  const radius = 90;
  const from = Math.max(0, start - radius);
  const to = Math.min(text.length, start + length + radius);
  const prefix = from > 0 ? "..." : "";
  const suffix = to < text.length ? "..." : "";
  return `${prefix}${text.slice(from, to).trim()}${suffix}`;
}

function roundedScore(score: number): number {
  return Math.round(score * 1_000) / 1_000;
}

function compareFindings(
  left: SiteContentWordingFinding,
  right: SiteContentWordingFinding,
): number {
  const fieldOrder: Record<SiteContentWordingField, number> = {
    title: 0,
    summary: 1,
    body: 2,
    question: 3,
    answerShort: 4,
  };
  return left.file.localeCompare(right.file)
    || left.segmentIndex - right.segmentIndex
    || fieldOrder[left.field] - fieldOrder[right.field]
    || left.characterStart - right.characterStart
    || left.ruleId.localeCompare(right.ruleId);
}
