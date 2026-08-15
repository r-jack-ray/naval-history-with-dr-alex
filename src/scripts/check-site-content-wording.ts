#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";

import {
  scanCuratedVideoFileMechanicalWording,
  type SiteContentWordingFinding,
} from "../content/site-content-wording.js";
import { parseCuratedVideoFile, type CuratedVideoFileSeed, } from "../content/schemas/index.js";
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
  summaryOnly: boolean;
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
  filesScanned: number;
  videosScanned: number;
  segmentsScanned: number;
  publicFieldsScanned: number;
  findingCount: number;
  highConfidenceCount: number;
  reviewCount: number;
  parseErrorCount: number;
  parseErrors: string[];
  findings: SiteContentWordingFinding[];
}

const defaultSegmentsInput = "src/derived/video-segments";
const completionCriterion =
  "Completion is based on shard parse errors and actionable high-confidence issues; review candidates are triage input.";
const reviewPolicy =
  "Review candidates require transcript-grounded judgment. Do not bulk-rewrite them or use a zero review " +
  "count as a completion target. Preserve technical terms and attribution when they carry subject-matter " +
  "meaning, interpretation, uncertainty, disagreement, opinion, preference, or personal experience.";

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
    findings.push(...scanCuratedVideoFileMechanicalWording(file, video, {
      includeReview,
      includeFuzzy: options.fuzzy,
      fuzzyThreshold: options.fuzzyThreshold,
    }));
  }

  findings.sort(compareFindings);
  const highConfidenceCount = findings.filter((finding) => finding.confidence === "high").length;
  const reviewCount = findings.length - highConfidenceCount;
  const report: SiteContentWordingReport = {
    generatedAt: new Date().toISOString(),
    completionCriterion,
    reviewPolicy,
    review: includeReview,
    strict: options.strict,
    strictReview: options.strictReview,
    fuzzy: options.fuzzy,
    fuzzyThreshold: options.fuzzyThreshold,
    filesScanned: files.length,
    videosScanned,
    segmentsScanned,
    publicFieldsScanned,
    findingCount: findings.length,
    highConfidenceCount,
    reviewCount,
    parseErrorCount: parseErrors.length,
    parseErrors,
    findings,
  };

  console.log(
    `Site-content wording scan: mode=${includeReview ? "review" : "actionable"} ` +
    `files=${report.filesScanned} videos=${report.videosScanned} segments=${report.segmentsScanned} ` +
    `fields=${report.publicFieldsScanned} issues=${report.highConfidenceCount} ` +
    `review-candidates=${report.reviewCount} parse-errors=${report.parseErrorCount}.`,
  );
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
      "Actionable site-content wording issues:",
      findings.filter((finding) => finding.confidence === "high"),
    );
    printFindings(
      "Judgment-required review candidates:",
      findings.filter((finding) => finding.confidence === "review"),
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
    console.log("Detailed reports:");
    console.log(`  ${jsonPath}`);
    console.log(`  ${markdownPath}`);
  }

  const strictFailure = options.strict && highConfidenceCount > 0;
  const strictReviewFailure = options.strictReview && findings.length > 0;
  return parseErrors.length > 0 || strictFailure || strictReviewFailure ? 1 : 0;
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
    } else if (argument === "--summary-only") {
      options.summaryOnly = true;
    } else if (argument === "--help" || argument === "-h") {
      printHelp();
      return null;
    } else {
      throw new Error(`Unknown argument: ${argument ?? "(missing)"}`);
    }
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
    `| High-confidence issues | ${report.highConfidenceCount} |`,
    `| Review candidates | ${report.reviewCount} |`,
    `| Curated-shard parse errors | ${report.parseErrorCount} |`,
    "",
    report.completionCriterion,
    "",
    report.reviewPolicy,
    "",
  ];
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
    "Actionable Issues",
    report.findings.filter((finding) => finding.confidence === "high"),
  );
  appendReportFindings(
    lines,
    "Judgment-Required Review Candidates",
    report.findings.filter((finding) => finding.confidence === "review"),
  );
  return `${lines.join("\n")}\n`;
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
      `at \`${finding.segmentStart}\` [${finding.field}] \`${finding.ruleId}\`: ` +
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
      `  ${finding.file}#${finding.segmentId}@${finding.segmentStart} [${finding.field}] ` +
      `${finding.ruleId}: ${JSON.stringify(finding.match)}${fuzzyDetail}`,
    );
    console.log(`    Guidance: ${finding.guidance}`);
  }
}

function compareFindings(
  left: SiteContentWordingFinding,
  right: SiteContentWordingFinding,
): number {
  return left.file.localeCompare(right.file)
    || left.segmentIndex - right.segmentIndex
    || left.characterStart - right.characterStart
    || left.ruleId.localeCompare(right.ruleId);
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

Scans public fields in current-schema per-video JSON shards for mechanical,
report-shaped, or workflow-shaped wording. Evidence notes and topic metadata are
outside the scan. The default mode reports actionable high-confidence issues.

Review candidates require transcript-grounded judgment. Keep context-sensitive
terms such as prototype, processing, and seed when they describe the historical,
technical, or operational subject. A zero review count is not a completion target.

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
  --summary-only                   Suppress individual console findings
  --help

Examples:
  npm run check:site-content-wording -- --summary-only
  npm run check:site-content-wording -- --review --fuzzy --report
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
