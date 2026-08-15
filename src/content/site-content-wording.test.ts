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
  const video = sampleQaVideo(
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
        ruleId: "meta-content-frame",
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

test("bare naval and technical terms do not create review noise", () => {
  const video = sampleVideo(
    "The prototype aircraft uses signal processing during troop extraction and can seed a sonobuoy field. " +
    "Curated footage appears during a first pass through the book; the ship would later pass through support duties " +
    "before a future defence review.",
  );

  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording("example.json", video),
    [],
  );
  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording("example.json", video, { includeReview: true }),
    [],
  );
});

test("meta-content frames include this and the variants", () => {
  const video = sampleVideo(
    "The passage explains how propulsion limits affected the deployment.",
    "This section shows why endurance mattered.",
  );

  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording("example.json", video, { includeReview: true })
      .map(({ field, ruleId, match }) => ({ field, ruleId, match })),
    [
      { field: "summary", ruleId: "meta-content-frame", match: "This section shows" },
      { field: "body", ruleId: "meta-content-frame", match: "The passage explains" },
    ],
  );
});

test("workflow collocations remain judgment-required", () => {
  const video = sampleVideo("The content processing stage remains unfinished.");

  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording("example.json", video, { includeReview: true })
      .map(({ confidence, ruleId, match }) => ({ confidence, ruleId, match })),
    [
      {
        confidence: "review",
        ruleId: "context-sensitive-workflow-term",
        match: "content processing",
      },
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

test("exact source and evidence window terminology is actionable", () => {
  const video = sampleVideo(
    "The source window is incomplete, while the evidence window remains a placeholder.",
  );

  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording("example.json", video)
      .map(({ confidence, ruleId, match }) => ({ confidence, ruleId, match })),
    [
      {
        confidence: "high",
        ruleId: "source-evidence-window-reference",
        match: "source window",
      },
      {
        confidence: "high",
        ruleId: "source-evidence-window-reference",
        match: "evidence window",
      },
    ],
  );
});

test("answer reporting is scoped to Q&A clause boundaries", () => {
  const subjectVideo = sampleVideo(
    "The speed of the response shows how prior planning supported the landing.",
  );
  const qaVideo = sampleQaVideo(
    "The answer shows how prior planning supported the landing. Modern examples in the answer show the same pattern.",
  );

  assert.deepEqual(scanCuratedVideoFileMechanicalWording("subject.json", subjectVideo), []);
  const subjectReviewVideo = sampleVideo(
    "The response explains why the navy changed its deployment.",
  );
  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording(
      "subject-review.json",
      subjectReviewVideo,
      { includeReview: true },
    ).map(({ segmentKind, confidence, ruleId, match }) => ({
      segmentKind,
      confidence,
      ruleId,
      match,
    })),
    [
      {
        segmentKind: "notable_point",
        confidence: "review",
        ruleId: "non-qa-answer-reporting-frame",
        match: "The response explains",
      },
    ],
  );
  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording("qa.json", qaVideo)
      .map(({ segmentKind, confidence, ruleId, match }) => ({
        segmentKind,
        confidence,
        ruleId,
        match,
      })),
    [
      {
        segmentKind: "qa",
        confidence: "high",
        ruleId: "answer-reporting-frame",
        match: "The answer shows",
      },
    ],
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
      `${JSON.stringify(sampleQaVideo("The answer explains that fuel endurance constrained the operation."), null, 2)}\n`,
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
        "--rule",
        "source-evidence-window-reference",
        "--strict",
        "--summary-only",
      ])),
      0,
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
    assert.match(await readFile(jsonReportPath, "utf8"), /"segmentKind": "qa"/u);
    assert.match(await readFile(jsonReportPath, "utf8"), /"ruleCounts"/u);
    assert.match(await readFile(jsonReportPath, "utf8"), /Do not bulk-rewrite/u);
    assert.match(await readFile(markdownReportPath, "utf8"), /## Actionable Issues/u);
    assert.match(await readFile(markdownReportPath, "utf8"), /## Findings by Rule/u);
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
    "--rule",
    "answer-reporting-frame",
    "--rule",
    "meta-content-frame",
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
  assert.deepEqual(options.rules, ["answer-reporting-frame", "meta-content-frame"]);
  assert.equal(options.strictReview, true);
  assert.equal(options.summaryOnly, true);
});

test("site-content wording CLI rejects unknown rule filters", () => {
  assert.throws(
    () => parseArgs(["--rule", "missing-rule"]),
    /Unknown site-content wording rule: missing-rule/u,
  );
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

function sampleQaVideo(
  body: string,
  summary = "Fuel endurance and operating radius",
): CuratedVideoFileSeed {
  const video = sampleVideo(body, summary);
  const source = video.segments[0]!;
  video.segments[0] = {
    ...source,
    kind: "qa",
    question: "How did fuel endurance affect the operation?",
    answerShort: "Fuel endurance constrained the operating radius.",
  };
  return video;
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
