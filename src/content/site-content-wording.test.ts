import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { main as checkSiteContentWording, parseArgs, } from "../scripts/check-site-content-wording.js";
import type { CuratedVideoFileSeed } from "./schemas/index.js";
import { scanCuratedVideoFileMechanicalWording } from "./site-content-wording.js";

test("site-content wording rules separate actionable and review findings", () => {
  const video = sampleVideo(
    "The answer explains that destroyer range constrained the operation.",
    "This passage shows why fuel endurance mattered.",
  );
  video.segments[0]!.evidence[0]!.note =
    "The transcript says this internal evidence note supports the public prose.";

  const findings = scanCuratedVideoFileMechanicalWording(
    "src/derived/video-segments/example.json",
    video,
    { includeReview: true },
  );

  assert.deepEqual(
    findings.map(({ field, confidence, ruleId, match }) => ({ field, confidence, ruleId, match })),
    [
      {
        field: "summary",
        confidence: "review",
        ruleId: "meta-content-opening",
        match: "This passage shows",
      },
      {
        field: "body",
        confidence: "high",
        ruleId: "answer-reporting-frame",
        match: "The answer explains",
      },
    ],
  );
});

test("context-sensitive naval and technical terms are review-only", () => {
  const video = sampleVideo(
    "The prototype aircraft uses signal processing to seed a sonobuoy field ahead of the convoy.",
  );

  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording("example.json", video),
    [],
  );
  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording("example.json", video, { includeReview: true })
      .map(({ confidence, ruleId, match }) => ({ confidence, ruleId, match })),
    [
      { confidence: "review", ruleId: "context-sensitive-workflow-term", match: "prototype" },
      { confidence: "review", ruleId: "context-sensitive-workflow-term", match: "processing" },
      { confidence: "review", ruleId: "context-sensitive-workflow-term", match: "seed" },
    ],
  );
});

test("explicit workflow and scaffold wording is actionable", () => {
  const video = sampleVideo(
    "This segment exists to provide search metadata for later extraction in the content workflow.",
  );
  const ruleIds = scanCuratedVideoFileMechanicalWording("example.json", video)
    .map((finding) => finding.ruleId);

  assert.deepEqual(ruleIds, [
    "segment-existence-frame",
    "search-scaffold-reference",
    "content-workflow-deferral",
    "pipeline-workflow-reference",
  ]);
});

test("source limitations and interpretive attribution remain unflagged", () => {
  const video = sampleVideo(
    "The transcript does not establish the exact range. Dr. Clarke argues that the surviving figure is still useful.",
  );

  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording("example.json", video, { includeReview: true }),
    [],
  );
});

test("fuzzy review is opt-in and catches typo variants", () => {
  const video = sampleVideo(
    "Earler in the transcrpt, the speaker compares cruiser endurance with destroyer endurance.",
  );

  assert.deepEqual(scanCuratedVideoFileMechanicalWording("example.json", video), []);
  const findings = scanCuratedVideoFileMechanicalWording(
    "example.json",
    video,
    { includeFuzzy: true },
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, "possible-mechanical-phrase-variant");
  assert.equal(findings[0]?.referencePhrase, "earlier in the transcript");
  assert.ok((findings[0]?.similarity ?? 0) >= 0.9);
});

test("site-content wording CLI scopes strict scans and writes reports", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "site-content-wording-"));
  const segmentsDirectory = join(repoRoot, "src/derived/video-segments");
  const cleanRelativePath = "src/derived/video-segments/clean.json";
  const issueRelativePath = "src/derived/video-segments/issue.json";
  const jsonReportPath = join(repoRoot, "reports/site-content-wording-scan.json");
  const markdownReportPath = join(repoRoot, "reports/site-content-wording-scan.md");
  try {
    await mkdir(segmentsDirectory, { recursive: true });
    await writeFile(
      join(repoRoot, cleanRelativePath),
      `${JSON.stringify(sampleVideo("Fuel endurance constrained the destroyer's operating radius."), null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(repoRoot, issueRelativePath),
      `${JSON.stringify(sampleVideo("The answer explains that fuel endurance constrained the operation."), null, 2)}\n`,
      "utf8",
    );

    assert.equal(
      await withoutConsole(() => checkSiteContentWording(["--repo-root", repoRoot, "--summary-only"])),
      0,
    );
    assert.equal(
      await withoutConsole(() => checkSiteContentWording([
        "--repo-root",
        repoRoot,
        "--strict",
        "--summary-only",
      ])),
      1,
    );
    assert.equal(
      await withoutConsole(() => checkSiteContentWording([
        "--repo-root",
        repoRoot,
        "--path",
        cleanRelativePath,
        "--strict",
        "--review",
        "--summary-only",
      ])),
      0,
    );
    assert.equal(
      await withoutConsole(() => checkSiteContentWording([
        "--repo-root",
        repoRoot,
        "--path",
        issueRelativePath,
        "--strict",
        "--review",
        "--summary-only",
      ])),
      1,
    );
    assert.equal(
      await withoutConsole(() => checkSiteContentWording([
        "--repo-root",
        repoRoot,
        "--report",
        "--summary-only",
      ])),
      0,
    );
    assert.equal(existsSync(jsonReportPath), true);
    assert.equal(existsSync(markdownReportPath), true);
    assert.match(await readFile(jsonReportPath, "utf8"), /answer-reporting-frame/u);
    assert.match(await readFile(jsonReportPath, "utf8"), /Do not bulk-rewrite/u);
    assert.match(await readFile(markdownReportPath, "utf8"), /## Actionable Issues/u);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("site-content wording CLI accepts repeated paths and review controls", () => {
  const options = parseArgs([
    "--path",
    "src/derived/video-segments/one.json",
    "--path",
    "src/derived/video-segments/two.json",
    "--review",
    "--fuzzy",
    "--fuzzy-threshold",
    "0.93",
    "--strict-review",
    "--summary-only",
  ]);
  assert.ok(options);
  assert.deepEqual(options.paths, [
    "src/derived/video-segments/one.json",
    "src/derived/video-segments/two.json",
  ]);
  assert.equal(options.review, true);
  assert.equal(options.fuzzy, true);
  assert.equal(options.fuzzyThreshold, 0.93);
  assert.equal(options.strictReview, true);
  assert.equal(options.summaryOnly, true);
});

function sampleVideo(
  body: string,
  summary = "Fuel endurance and operating radius",
): CuratedVideoFileSeed {
  return {
    videoId: "abcdefghijk",
    topics: [],
    segments: [
      {
        id: "destroyer-endurance",
        videoId: "abcdefghijk",
        slug: "destroyer-endurance",
        title: "Destroyer endurance",
        kind: "notable_point",
        start: "1:00",
        end: "2:00",
        topics: [],
        summary,
        body,
        sourcePath: "src/transcripts/txt/example_abcdefghijk.txt",
        evidence: [
          {
            start: "1:00",
            end: "2:00",
            note: "The source passage compares fuel load with operating radius.",
          },
        ],
      },
    ],
  };
}

async function withoutConsole<T>(operation: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalError = console.error;
  try {
    console.log = () => undefined;
    console.error = () => undefined;
    return await operation();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
