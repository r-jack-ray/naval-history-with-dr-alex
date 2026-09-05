#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve, } from "node:path";
import { type CuratedVideoFileSeed, parseCuratedVideoFile, } from "../content/schemas/index.js";

import { scanCuratedVideoFileMechanicalWording, type SiteContentWordingFinding, siteContentWordingRuleIds, } from "../content/site-content-wording.js";
import { writeTextAtomically } from "../pipeline/atomic-write.js";
import { listVideoSegmentShardFileNames } from "../site/video-segment-files.js";
import { isDirectExecution } from "./console-run-timer.js";

export interface SiteContentWordingCliOptions {
  repoRoot: string;
  segmentsInput: string;
  paths: string[];
  outputDir: string;
  jsonName: string;
  markdownName: string;
  report: boolean;
  review: boolean;
  strict: boolean;
  strictReview: boolean;
  fuzzy: boolean;
  fuzzyThreshold: number;
  rules: string[];
  summaryOnly: boolean;
}

export interface SiteContentWordingRuleCount {
  enforcement: "error" | "strict" | "review";
  confidence: SiteContentWordingFinding["confidence"];
  ruleId: string;
  count: number;
}

export interface SiteContentWordingValueCount {
  value: string;
  count: number;
}

export interface SiteContentWordingReport {
  generatedAt: string;
  completionCriterion: string;
  reviewPolicy: string;
  review: boolean;
  strict: boolean;
  strictReview: boolean;
  fuzzy: boolean;
  fuzzyThreshold: number;
  rules: string[];
  filesScanned: number;
  videosScanned: number;
  segmentsScanned: number;
  publicFieldsScanned: number;
  evidenceNotesScanned: number;
  findingCount: number;
  matchedOccurrenceCount: number;
  errorCount: number;
  highConfidenceCount: number;
  reviewCount: number;
  fuzzyCount: number;
  filesWithErrors: number;
  filesWithHighConfidence: number;
  filesWithReview: number;
  ruleCounts: SiteContentWordingRuleCount[];
  fieldCounts: SiteContentWordingValueCount[];
  segmentKindCounts: SiteContentWordingValueCount[];
  parseErrorCount: number;
  parseErrors: string[];
  findings: SiteContentWordingFinding[];
}

const defaultSegmentsInput = "src/derived/video-segments";
const completionCriterion =
    "Prohibited Unicode dashes and shard parse failures are unconditional errors. Other actionable high-confidence issues require strict mode, including transcript-reporting frames in evidence notes. Review candidates are triage input.";
const reviewPolicy =
    "Review candidates require transcript-grounded judgment. Do not bulk-rewrite them or use a zero review " +
    "count as a general completion target. Preserve technical terms when they carry subject-matter meaning. " +
    "Inspect every transcript-reference finding and retain it only when a speaker is discussing a transcript as subject matter. " +
    "Treat host-attribution as a whole-shard review performed in small segment batches, including evidence notes. Verify each Clark or Clarke match against the transcript " +
    "before editing. Each segment already carries sourcePath and evidence, so remove routine references to the " +
    "host in solo-speaker prose. Preserve other people named Clark or Clarke. In multi-speaker material, also " +
    "retain attribution needed to distinguish speakers or identify a quotation. A passing strict scan does not " +
    "resolve review findings: remove routine reporting frames, preserve source limits, and check coordinated verbs after rewriting.";

export async function main(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(args);
  if (options === null) {
    return 0;
  }

  const repoRoot = resolve(options.repoRoot);
  const files = await selectedShardPaths(options, repoRoot);
  const includeReview = options.review || options.strictReview || options.fuzzy;
  const findings: SiteContentWordingFinding[] = [];
  const parseErrors: string[] = [];
  let videosScanned = 0;
  let segmentsScanned = 0;
  let publicFieldsScanned = 0;
  let evidenceNotesScanned = 0;

  for (const path of files) {
    const file = repoDisplayPath(repoRoot, path);
    let video: CuratedVideoFileSeed;
    try {
      video = parseCuratedVideoFile(
          JSON.parse(await readFile(path, "utf8")) as unknown,
          `Curated video shard ${file}`,
      );
    } catch (error: unknown) {
      parseErrors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    videosScanned += 1;
    segmentsScanned += video.segments.length;
    publicFieldsScanned += publicFieldCount(video);
    evidenceNotesScanned += video.segments.reduce((count, segment) => count + segment.evidence.length, 0);
    findings.push(...scanCuratedVideoFileMechanicalWording(file, video, {
      includeReview,
      includeFuzzy: options.fuzzy,
      fuzzyThreshold: options.fuzzyThreshold,
    }));
  }

  const selectedFindings = options.rules.length === 0
      ? findings
      : findings.filter(
          (finding) => finding.unconditionalError || options.rules.includes(finding.ruleId),
      );
  selectedFindings.sort(compareFindings);
  const errorCount = selectedFindings.filter((finding) => finding.unconditionalError).length;
  const highConfidenceCount = selectedFindings.filter(
      (finding) => finding.confidence === "high" && !finding.unconditionalError,
  ).length;
  const reviewCount = selectedFindings.filter((finding) => finding.confidence === "review").length;
  const strictFailure = options.strict && highConfidenceCount > 0;
  const strictReviewFailure = options.strictReview && selectedFindings.length > 0;
  const report: SiteContentWordingReport = {
    generatedAt: new Date().toISOString(),
    completionCriterion,
    reviewPolicy,
    review: includeReview,
    strict: options.strict,
    strictReview: options.strictReview,
    fuzzy: options.fuzzy,
    fuzzyThreshold: options.fuzzyThreshold,
    rules: [...options.rules],
    filesScanned: files.length,
    videosScanned,
    segmentsScanned,
    publicFieldsScanned,
    evidenceNotesScanned,
    findingCount: selectedFindings.length,
    matchedOccurrenceCount: selectedFindings.reduce(
        (count, finding) => count + (finding.occurrenceCount ?? 1),
        0,
    ),
    errorCount,
    highConfidenceCount,
    reviewCount,
    fuzzyCount: selectedFindings.filter(
        (finding) => finding.ruleId === "possible-mechanical-phrase-variant",
    ).length,
    filesWithErrors: new Set(
        selectedFindings.filter((finding) => finding.unconditionalError).map((finding) => finding.file),
    ).size,
    filesWithHighConfidence: new Set(
        selectedFindings.filter(
            (finding) => finding.confidence === "high" && !finding.unconditionalError,
        ).map((finding) => finding.file),
    ).size,
    filesWithReview: new Set(
        selectedFindings.filter((finding) => finding.confidence === "review").map((finding) => finding.file),
    ).size,
    ruleCounts: ruleCounts(selectedFindings),
    fieldCounts: valueCounts(selectedFindings.map((finding) => finding.field)),
    segmentKindCounts: valueCounts(selectedFindings.map((finding) => finding.segmentKind)),
    parseErrorCount: parseErrors.length,
    parseErrors,
    findings: selectedFindings,
  };

  const warningCount = report.highConfidenceCount + report.reviewCount;
  const summary =
      `Site-content wording scan: mode=${includeReview ? "review" : "actionable"} ` +
      `files=${report.filesScanned} videos=${report.videosScanned} segments=${report.segmentsScanned} ` +
      `public-fields=${report.publicFieldsScanned} evidence-notes=${report.evidenceNotesScanned} ` +
      `errors=${report.errorCount} warnings=${warningCount} issues=${report.highConfidenceCount} ` +
      `review-candidates=${report.reviewCount} matched-occurrences=${report.matchedOccurrenceCount} ` +
      `parse-errors=${report.parseErrorCount}.`;
  if (errorCount > 0 || parseErrors.length > 0 || strictFailure || strictReviewFailure) {
    console.error(summary);
  } else if (warningCount > 0) {
    console.warn(summary);
  } else {
    console.log(summary);
  }
  if (parseErrors.length > 0) {
    console.error("Curated-shard parse errors:");
    for (const error of parseErrors) {
      console.error(`  ${error}`);
    }
  }
  if (reviewCount > 0) {
    console.log(reviewPolicy);
  }
  if (!options.summaryOnly) {
    printFindings(
        "Nonnegotiable site-content wording errors:",
        selectedFindings.filter((finding) => finding.unconditionalError),
    );
    printFindings(
        "Actionable site-content wording issues:",
        selectedFindings.filter(
            (finding) => finding.confidence === "high" && !finding.unconditionalError,
        ),
    );
    printFindings(
        "Judgment-required review candidates:",
        selectedFindings.filter((finding) => finding.confidence === "review"),
    );
  }

  if (options.report) {
    const outputPath = resolve(repoRoot, options.outputDir);
    const jsonPath = resolve(outputPath, options.jsonName);
    const markdownPath = resolve(outputPath, options.markdownName);
    await Promise.all([
      writeTextAtomically(jsonPath, `${JSON.stringify(report, null, 2)}\n`),
      writeTextAtomically(markdownPath, reportMarkdown(report)),
    ]);
    if (report.findingCount > 0 || report.parseErrorCount > 0) {
      const reportNotice =
          `Wording report contains errors or warnings: errors=${report.errorCount + report.parseErrorCount} ` +
          `warnings=${warningCount} report=${basename(markdownPath)} json=${basename(jsonPath)}.`;
      if (errorCount > 0 || parseErrors.length > 0 || strictFailure || strictReviewFailure) {
        console.error(reportNotice);
      } else {
        console.warn(reportNotice);
      }
    }
    console.log("Detailed reports:");
    console.log(`  ${jsonPath}`);
    console.log(`  ${markdownPath}`);
  }

  return errorCount > 0 || parseErrors.length > 0 || strictFailure || strictReviewFailure ? 1 : 0;
}

export function parseArgs(args: readonly string[]): SiteContentWordingCliOptions | null {
  const options: SiteContentWordingCliOptions = {
    repoRoot: ".",
    segmentsInput: defaultSegmentsInput,
    paths: [],
    outputDir: "reports",
    jsonName: "site-content-wording-scan.json",
    markdownName: "site-content-wording-scan.md",
    report: false,
    review: false,
    strict: false,
    strictReview: false,
    fuzzy: false,
    fuzzyThreshold: 0.9,
    rules: [],
    summaryOnly: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--repo-root") {
      options.repoRoot = required(args[++index], argument);
    } else if (argument === "--segments-input") {
      options.segmentsInput = required(args[++index], argument);
    } else if (argument === "--path") {
      options.paths.push(required(args[++index], argument));
    } else if (argument === "--output-dir") {
      options.outputDir = required(args[++index], argument);
    } else if (argument === "--json-name") {
      options.jsonName = required(args[++index], argument);
    } else if (argument === "--markdown-name") {
      options.markdownName = required(args[++index], argument);
    } else if (argument === "--report") {
      options.report = true;
    } else if (argument === "--review") {
      options.review = true;
    } else if (argument === "--strict") {
      options.strict = true;
    } else if (argument === "--strict-review") {
      options.strictReview = true;
    } else if (argument === "--fuzzy") {
      options.fuzzy = true;
    } else if (argument === "--fuzzy-threshold") {
      options.fuzzyThreshold = probability(required(args[++index], argument), argument);
    } else if (argument === "--rule") {
      options.rules.push(required(args[++index], argument));
    } else if (argument === "--summary-only") {
      options.summaryOnly = true;
    } else if (argument === "--help" || argument === "-h") {
      printHelp();
      return null;
    } else {
      throw new Error(`Unknown argument: ${argument ?? "(missing)"}`);
    }
  }
  options.rules = [...new Set(options.rules)];
  const knownRuleIds = new Set(siteContentWordingRuleIds);
  const unknownRuleIds = options.rules.filter((ruleId) => !knownRuleIds.has(ruleId));
  if (unknownRuleIds.length > 0) {
    throw new Error(`Unknown site-content wording rule: ${unknownRuleIds.join(", ")}`);
  }
  return options;
}

async function selectedShardPaths(
    options: SiteContentWordingCliOptions,
    repoRoot: string,
): Promise<string[]> {
  const paths = options.paths.length > 0
      ? options.paths.map((path) => resolve(repoRoot, path))
      : (await listVideoSegmentShardFileNames(resolve(repoRoot, options.segmentsInput)))
          .map((fileName) => resolve(repoRoot, options.segmentsInput, fileName));

  const unique = new Map<string, string>();
  for (const path of paths) {
    validateShardPath(path);
    const key = process.platform === "win32" ? path.toLocaleLowerCase() : path;
    unique.set(key, path);
  }
  return [...unique.values()].sort((left, right) => left.localeCompare(right));
}

function validateShardPath(path: string): void {
  if (extname(path).toLocaleLowerCase() !== ".json") {
    throw new Error(`Site-content wording paths must be JSON shards: ${path}`);
  }
  if (basename(path).toLocaleLowerCase() === "topics.json") {
    throw new Error("The shared topics.json registry is not a per-video site-content shard.");
  }
}

function publicFieldCount(video: CuratedVideoFileSeed): number {
  return video.segments.reduce((count, segment) => {
    const summaryCount = "summary" in segment && segment.summary !== undefined ? 1 : 0;
    const qaCount = segment.kind === "qa" ? 2 : 0;
    return count + 2 + summaryCount + qaCount;
  }, 0);
}

function reportMarkdown(report: SiteContentWordingReport): string {
  const lines = [
    "# Site Content Wording Scan",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Metric | Count |",
    "|---|---:|",
    `| Files scanned | ${report.filesScanned} |`,
    `| Valid videos scanned | ${report.videosScanned} |`,
    `| Segments scanned | ${report.segmentsScanned} |`,
    `| Public fields scanned | ${report.publicFieldsScanned} |`,
    `| Evidence notes scanned | ${report.evidenceNotesScanned} |`,
    `| Matched occurrences | ${report.matchedOccurrenceCount} |`,
    `| Unconditional errors | ${report.errorCount} |`,
    `| Files with unconditional errors | ${report.filesWithErrors} |`,
    `| High-confidence issues | ${report.highConfidenceCount} |`,
    `| Files with high-confidence issues | ${report.filesWithHighConfidence} |`,
    `| Review candidates | ${report.reviewCount} |`,
    `| Files with review candidates | ${report.filesWithReview} |`,
    `| Fuzzy review candidates | ${report.fuzzyCount} |`,
    `| Curated-shard parse errors | ${report.parseErrorCount} |`,
    "",
    report.completionCriterion,
    "",
    report.reviewPolicy,
    "",
  ];
  appendRuleCountTable(lines, report.ruleCounts);
  appendValueCountTable(lines, "Findings by Text Field", "Field", report.fieldCounts);
  appendValueCountTable(lines, "Findings by Segment Kind", "Segment kind", report.segmentKindCounts);
  if (report.parseErrors.length > 0) {
    lines.push(
        "## Curated-Shard Parse Errors",
        "",
        ...report.parseErrors.map((error) => `- ${escapeMarkdown(error)}`),
        "",
    );
  }
  appendReportFindings(
      lines,
      "Nonnegotiable Errors",
      report.findings.filter((finding) => finding.unconditionalError),
  );
  appendReportFindings(
      lines,
      "Actionable Issues",
      report.findings.filter(
          (finding) => finding.confidence === "high" && !finding.unconditionalError,
      ),
  );
  appendReportFindings(
      lines,
      "Judgment-Required Review Candidates",
      report.findings.filter((finding) => finding.confidence === "review"),
  );
  return `${lines.join("\n")}\n`;
}

function appendRuleCountTable(
    lines: string[],
    counts: readonly SiteContentWordingRuleCount[],
): void {
  if (counts.length === 0) {
    return;
  }
  lines.push(
      "## Findings by Rule",
      "",
      "| Enforcement | Confidence | Rule | Count |",
      "|---|---|---|---:|",
      ...counts.map(
          (item) => `| ${item.enforcement} | ${item.confidence} | \`${escapeInlineCode(item.ruleId)}\` | ${item.count} |`,
      ),
      "",
  );
}

function appendValueCountTable(
    lines: string[],
    heading: string,
    label: string,
    counts: readonly SiteContentWordingValueCount[],
): void {
  if (counts.length === 0) {
    return;
  }
  lines.push(
      `## ${heading}`,
      "",
      `| ${label} | Count |`,
      "|---|---:|",
      ...counts.map((item) => `| \`${escapeInlineCode(item.value)}\` | ${item.count} |`),
      "",
  );
}

function appendReportFindings(
    lines: string[],
    heading: string,
    findings: readonly SiteContentWordingFinding[],
): void {
  if (findings.length === 0) {
    return;
  }
  lines.push(`## ${heading}`, "");
  for (const finding of findings) {
    const fuzzyDetail = finding.similarity === undefined
        ? ""
        : `; near \`${escapeInlineCode(finding.referencePhrase ?? "")}\` at ${finding.similarity.toFixed(3)}`;
    lines.push(
        `- \`${escapeInlineCode(finding.file)}\` segment \`${escapeInlineCode(finding.segmentId)}\` ` +
        `at \`${finding.segmentStart}\` [${finding.segmentKind}/${findingFieldPath(finding)}] \`${finding.ruleId}\`: ` +
        `\`${escapeInlineCode(finding.match)}\`${fuzzyDetail}`,
        `  - ${escapeMarkdown(finding.excerpt)}`,
        `  - Guidance: ${escapeMarkdown(finding.guidance)}`,
    );
  }
  lines.push("");
}

function printFindings(
    title: string,
    findings: readonly SiteContentWordingFinding[],
): void {
  if (findings.length === 0) {
    return;
  }
  console.log(title);
  for (const finding of findings) {
    const fuzzyDetail = finding.similarity === undefined
        ? ""
        : ` -> ${JSON.stringify(finding.referencePhrase)} (${finding.similarity.toFixed(3)})`;
    console.log(
        `  ${finding.file}#${finding.segmentId}@${finding.segmentStart} ` +
        `[${finding.segmentKind}/${findingFieldPath(finding)}] ${finding.ruleId}: ` +
        `${JSON.stringify(finding.match)}${fuzzyDetail}`,
    );
    console.log(`    Guidance: ${finding.guidance}`);
  }
}

function findingFieldPath(finding: SiteContentWordingFinding): string {
  return finding.evidenceIndex === undefined ? finding.field : `evidence[${finding.evidenceIndex}].note`;
}

function compareFindings(
    left: SiteContentWordingFinding,
    right: SiteContentWordingFinding,
): number {
  return left.file.localeCompare(right.file)
      || left.segmentIndex - right.segmentIndex
      || left.field.localeCompare(right.field)
      || (left.evidenceIndex ?? -1) - (right.evidenceIndex ?? -1)
      || left.characterStart - right.characterStart
      || left.ruleId.localeCompare(right.ruleId);
}

function ruleCounts(findings: readonly SiteContentWordingFinding[]): SiteContentWordingRuleCount[] {
  const counts = new Map<string, SiteContentWordingRuleCount>();
  for (const finding of findings) {
    const enforcement = findingEnforcement(finding);
    const key = `${enforcement}\u0000${finding.ruleId}`;
    const current = counts.get(key);
    if (current === undefined) {
      counts.set(key, {
        enforcement,
        confidence: finding.confidence,
        ruleId: finding.ruleId,
        count: 1,
      });
    } else {
      current.count += 1;
    }
  }
  return [...counts.values()].sort((left, right) =>
      enforcementOrder(left.enforcement) - enforcementOrder(right.enforcement)
      || right.count - left.count
      || left.ruleId.localeCompare(right.ruleId)
  );
}

function findingEnforcement(
    finding: SiteContentWordingFinding,
): SiteContentWordingRuleCount["enforcement"] {
  if (finding.unconditionalError) {
    return "error";
  }
  return finding.confidence === "high" ? "strict" : "review";
}

function valueCounts(values: readonly string[]): SiteContentWordingValueCount[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({value, count})).sort((left, right) =>
      right.count - left.count || left.value.localeCompare(right.value)
  );
}

function enforcementOrder(enforcement: SiteContentWordingRuleCount["enforcement"]): number {
  return enforcement === "error" ? 0 : enforcement === "strict" ? 1 : 2;
}

function repoDisplayPath(repoRoot: string, path: string): string {
  const relativePath = relative(repoRoot, path);
  const display = relativePath.startsWith("..") || isAbsolute(relativePath)
      ? path
      : relativePath;
  return display.replaceAll("\\", "/");
}

function probability(value: string, option: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error(`${option} must be a number between 0 and 1.`);
  }
  return number;
}

function required(value: string | undefined, option: string): string {
  if (value === undefined || !value.trim()) {
    throw new Error(`Missing value for ${option}.`);
  }
  return value;
}

function escapeInlineCode(value: string): string {
  return value.replace(/`/gu, "\\`");
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\*_[\]|])/gu, "\\$1");
}

function printHelp(): void {
  console.log(`Usage: npm run check:site-content-wording -- [options]

Scans public prose and every evidence.note in current-schema per-video JSON shards
for mechanical, report-shaped, or workflow-shaped wording. Topic metadata and
evidence timestamps are outside the scan. Prohibited Unicode dashes always produce errors and exit 1.
The default mode also reports other actionable high-confidence issues.
The one-line summary uses the error or warning stream when findings require attention.
With --report, the console notice names the Markdown and JSON report files.

Review candidates require transcript-grounded judgment. Broad subject terms such
as prototype, processing, extraction, and seed are retained unless they appear in
workflow-shaped collocations. A zero review count is not a completion target.
Inspect every transcript-reference finding. Retain the phrase only when a speaker
is discussing a transcript as subject matter.
Host-attribution findings identify each affected field and evidence-note index;
review the full shard in small segment batches and preserve necessary speaker ownership.

Options:
  --repo-root <path>
  --segments-input <path>          Defaults to ${defaultSegmentsInput}
  --path <json-shard>              Scan one file; repeat for multiple files
  --report                         Write JSON and Markdown reports under reports/
  --output-dir <path>
  --json-name <name>
  --markdown-name <name>
  --review                         Include judgment-required wording candidates
  --strict                         Exit 1 on high-confidence issues
  --strict-review                  Exit 1 on high-confidence issues or review candidates
  --fuzzy                          Enable review mode and add typo-tolerant variants
  --fuzzy-threshold <0..1>         Defaults to 0.9
  --rule <rule-id>                 Include one rule; unconditional errors remain included
  --summary-only                   Suppress individual console findings
  --help

Examples:
  npm run check:site-content-wording -- --summary-only
  npm run check:site-content-wording -- --review --fuzzy --report
  npm run check:site-content-wording -- --review --rule meta-content-frame --report
  npm run check:site-content-wording -- --path src/derived/video-segments/FILE.json --strict --review
`);
}

if (isDirectExecution(import.meta.url)) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
