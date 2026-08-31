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

test("Unicode dash characters are unconditional errors in every public field", () => {
  const video = sampleQaVideo(
    "Body clause\u2014continuation.",
    "Summary range 1914\u20131918.",
  );
  const segment = video.segments[0]!;
  segment.title = "Title\u2014detail";
  if (segment.kind === "qa") {
    segment.question = "Question\u2013detail?";
    segment.answerShort = "Answer\u2014detail.";
  }

  const findings = scanCuratedVideoFileMechanicalWording("example.json", video);
  assert.deepEqual(
    findings.map(({ field, confidence, ruleId, unconditionalError, match }) => ({
        field,
        confidence,
        ruleId,
        unconditionalError,
        match,
      })),
    [
      {
        field: "title",
        confidence: "high",
        ruleId: "prohibited-unicode-dash",
        unconditionalError: true,
        match: "\\u2014",
      },
      {
        field: "summary",
        confidence: "high",
        ruleId: "prohibited-unicode-dash",
        unconditionalError: true,
        match: "\\u2013",
      },
      {
        field: "body",
        confidence: "high",
        ruleId: "prohibited-unicode-dash",
        unconditionalError: true,
        match: "\\u2014",
      },
      {
        field: "question",
        confidence: "high",
        ruleId: "prohibited-unicode-dash",
        unconditionalError: true,
        match: "\\u2013",
      },
      {
        field: "answerShort",
        confidence: "high",
        ruleId: "prohibited-unicode-dash",
        unconditionalError: true,
        match: "\\u2014",
      },
    ],
  );
  assert.equal(
    findings.some((finding) => /[\u2013\u2014]/u.test(`${finding.match}${finding.excerpt}`)),
    false,
  );
});

test("source limitations and naturally qualified interpretation remain unflagged", () => {
  const video = sampleVideo(
    "The transcript does not establish the exact range. The surviving figure may still be useful.",
  );

  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording("example.json", video, { includeReview: true }),
    [],
  );
});

test("a single host attribution creates one shard-level review finding", () => {
  const video = sampleVideo(
    "Dr. Clarke argues that the surviving figure is still useful.",
  );

  const finding = scanCuratedVideoFileMechanicalWording(
    "example.json",
    video,
    { includeReview: true },
  ).find(({ ruleId }) => ruleId === "host-attribution");

  assert.equal(finding?.match, "Dr. Clarke");
  assert.equal(finding?.occurrenceCount, 1);
  assert.equal(finding?.affectedSegmentCount, 1);
  assert.equal(finding?.repeatedSegmentCount, 0);
});

test("repeated host attribution is summarized in one shard-level review finding", () => {
  const video = sampleVideo(
    "Dr. Clarke argues that the surviving figure is still useful.",
    "In Dr. Clarke's view, the surviving figure needs qualification.",
  );

  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording("example.json", video, { includeReview: true })
      .map(({
        confidence,
        ruleId,
        match,
        occurrenceCount,
        affectedSegmentCount,
        repeatedSegmentCount,
      }) => ({
        confidence,
        ruleId,
        match,
        occurrenceCount,
        affectedSegmentCount,
        repeatedSegmentCount,
      })),
    [
      {
        confidence: "review",
        ruleId: "host-attribution",
        match: "Dr. Clarke's",
        occurrenceCount: 2,
        affectedSegmentCount: 1,
        repeatedSegmentCount: 1,
      },
    ],
  );
});

test("host attribution includes contextual surname variants", () => {
  const video = sampleVideo("Clarke argues that the first figure is provisional.");
  const source = video.segments[0]!;
  const bodies = [
    "Clarke argues that the first figure is provisional.",
    "For Clarke, the second figure is more persuasive.",
    "According to Clarke, the third figure remains uncertain.",
    "In Clarke's view, the fourth figure needs qualification.",
    "The fifth figure comes from the surviving table.",
    "A science-fiction author wrote about a different subject.",
  ];
  video.segments = bodies.map((body, index) => ({
    ...source,
    id: `destroyer-endurance-${index}`,
    slug: `destroyer-endurance-${index}`,
    start: `${index + 1}:00`,
    end: `${index + 1}:30`,
    summary: `Endurance note ${index + 1}`,
    body,
  }));

  const finding = scanCuratedVideoFileMechanicalWording(
    "example.json",
    video,
    { includeReview: true },
  ).find(({ ruleId }) => ruleId === "host-attribution");

  assert.equal(finding?.occurrenceCount, 4);
  assert.equal(finding?.affectedSegmentCount, 4);
  assert.equal(finding?.repeatedSegmentCount, 0);
  assert.match(finding?.guidance ?? "", /solo-speaker episode/u);
});

test("matching surnames remain review-only and protect other people", () => {
  const video = sampleVideo(
    "Captain Morgan Clarke commanded the synthetic cruiser during the exercise.",
  );

  const finding = scanCuratedVideoFileMechanicalWording(
    "example.json",
    video,
    { includeReview: true },
  ).find(({ ruleId }) => ruleId === "host-attribution");

  assert.equal(finding?.confidence, "review");
  assert.equal(finding?.match, "Clarke");
  assert.match(finding?.guidance ?? "", /confirm that the matched Clark or Clarke refers to the host/iu);
  assert.match(finding?.guidance ?? "", /Preserve other people named Clark or Clarke/u);
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
  const dashRelativePath = "src/derived/video-segments/dash.json";
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
    await writeFile(
      join(repoRoot, dashRelativePath),
      `${JSON.stringify(sampleVideo("Fuel endurance\u2014not speed\u2013constrained the operation."), null, 2)}\n`,
      "utf8",
    );

    assert.equal(
      await withoutConsole(() => checkSiteContentWording([
        "--repo-root",
        repoRoot,
        "--path",
        cleanRelativePath,
        "--path",
        issueRelativePath,
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
        "--path",
        issueRelativePath,
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
        dashRelativePath,
        "--summary-only",
      ])),
      1,
    );
    assert.equal(
      await withoutConsole(() => checkSiteContentWording([
        "--repo-root",
        repoRoot,
        "--path",
        dashRelativePath,
        "--rule",
        "source-evidence-window-reference",
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
        "--path",
        issueRelativePath,
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
        "--path",
        cleanRelativePath,
        "--path",
        issueRelativePath,
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
    assert.match(await readFile(jsonReportPath, "utf8"), /"matchedOccurrenceCount"/u);
    assert.match(await readFile(jsonReportPath, "utf8"), /Do not bulk-rewrite/u);
    assert.match(await readFile(jsonReportPath, "utf8"), /Verify each Clark or Clarke match against the transcript/u);
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
