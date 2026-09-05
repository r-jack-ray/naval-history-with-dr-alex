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
      {
        field: "evidence.note",
        confidence: "high",
        ruleId: "transcript-reporting-frame",
        match: "The transcript says",
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

test("unqualified transcript references require source-grounded review", () => {
  const video = sampleVideo(
    "The transcript does not establish the exact range. The surviving figure may still be useful.",
  );

  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording("example.json", video),
    [],
  );
  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording("example.json", video, { includeReview: true })
      .map(({ confidence, ruleId, match }) => ({ confidence, ruleId, match })),
    [
      {
        confidence: "review",
        ruleId: "transcript-reference",
        match: "The transcript",
      },
    ],
  );

  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording(
      "example.json",
      sampleVideo("A court-martial transcript was entered into evidence with the witness's account."),
      { includeReview: true },
    ),
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

test("host attribution locates each affected field while retaining shard totals", () => {
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
        shardOccurrenceCount,
      }) => ({
        confidence,
        ruleId,
        match,
        occurrenceCount,
        affectedSegmentCount,
        repeatedSegmentCount,
        shardOccurrenceCount,
      })),
    [
      {
        confidence: "review",
        ruleId: "host-attribution",
        match: "Dr. Clarke's",
        occurrenceCount: 1,
        affectedSegmentCount: 1,
        repeatedSegmentCount: 1,
        shardOccurrenceCount: 2,
      },
      {
        confidence: "review",
        ruleId: "host-attribution",
        match: "Dr. Clarke",
        occurrenceCount: 1,
        affectedSegmentCount: 1,
        repeatedSegmentCount: 1,
        shardOccurrenceCount: 2,
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

  assert.equal(finding?.shardOccurrenceCount, 4);
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
  const fuzzyFinding = findings.find(({ ruleId }) => ruleId === "possible-mechanical-phrase-variant");
  assert.equal(fuzzyFinding?.referencePhrase, "earlier in the transcript");
  assert.ok((fuzzyFinding?.similarity ?? 0) >= 0.9);
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
    const reportRun = await captureConsole(() => checkSiteContentWording([
        "--repo-root",
        repoRoot,
        "--path",
        cleanRelativePath,
        "--path",
        issueRelativePath,
        "--report",
        "--summary-only",
      ]));
    assert.equal(reportRun.result, 0);
    assert.match(
      reportRun.warnings.join("\n"),
      /Wording report contains errors or warnings: .*report=site-content-wording-scan\.md json=site-content-wording-scan\.json\./u,
    );
    assert.equal(existsSync(jsonReportPath), true);
    assert.equal(existsSync(markdownReportPath), true);
    assert.match(await readFile(jsonReportPath, "utf8"), /answer-reporting-frame/u);
    assert.match(await readFile(jsonReportPath, "utf8"), /"segmentKind": "qa"/u);
    assert.match(await readFile(jsonReportPath, "utf8"), /"ruleCounts"/u);
    assert.match(await readFile(jsonReportPath, "utf8"), /"matchedOccurrenceCount"/u);
    assert.match(await readFile(jsonReportPath, "utf8"), /Do not bulk-rewrite/u);
    assert.match(await readFile(jsonReportPath, "utf8"), /Inspect every transcript-reference finding/u);
    assert.match(await readFile(jsonReportPath, "utf8"), /Verify each Clark or Clarke match against the transcript/u);
    assert.match(await readFile(markdownReportPath, "utf8"), /## Actionable Issues/u);
    assert.match(await readFile(markdownReportPath, "utf8"), /## Findings by Rule/u);

    const cleanReportRun = await captureConsole(() => checkSiteContentWording([
      "--repo-root",
      repoRoot,
      "--path",
      cleanRelativePath,
      "--report",
      "--json-name",
      "clean-wording.json",
      "--markdown-name",
      "clean-wording.md",
      "--summary-only",
    ]));
    assert.equal(cleanReportRun.result, 0);
    assert.equal(cleanReportRun.warnings.length, 0);
    assert.equal(cleanReportRun.errors.length, 0);
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

test("evidence-only attributions include every note location and surname variant", () => {
  const video = sampleVideo("Fuel endurance constrained the operation.");
  video.segments[0]!.evidence = [
    { start: "1:00", note: "Dr Clarke contrasts fuel load and endurance. Alex Clarke explains the tradeoff." },
    { start: "1:20", note: "Clark notes a limit; Clarke then compares the estimates." },
  ];
  const findings = scanCuratedVideoFileMechanicalWording("example.json", video, { includeReview: true });
  const attribution = findings.filter(({ ruleId }) => ruleId === "host-attribution");
  assert.deepEqual(attribution.map(({ field, evidenceIndex, occurrenceCount, shardOccurrenceCount }) => ({
    field, evidenceIndex, occurrenceCount, shardOccurrenceCount,
  })), [
    { field: "evidence.note", evidenceIndex: 0, occurrenceCount: 2, shardOccurrenceCount: 4 },
    { field: "evidence.note", evidenceIndex: 1, occurrenceCount: 2, shardOccurrenceCount: 4 },
  ]);
  assert.equal(attribution.every(({ confidence }) => confidence === "review"), true);
  assert.deepEqual(scanCuratedVideoFileMechanicalWording("example.json", video), []);
});

test("evidence notes receive actionable checks and contextual review without scanning source metadata", () => {
  const video = sampleVideo("Fuel endurance constrained the operation.");
  video.segments[0]!.sourcePath = "src/transcripts/txt/the-transcript-explains_abcdefghijk.txt";
  video.segments[0]!.evidence = [
    { start: "1:00", note: "The transcript contrasts the estimates." },
    { start: "1:20", note: "Range\u2014and its limits." },
  ];
  assert.deepEqual(
    scanCuratedVideoFileMechanicalWording("example.json", video, { includeReview: true })
      .map(({ ruleId, confidence, evidenceIndex, unconditionalError }) => ({
        ruleId, confidence, evidenceIndex, unconditionalError,
      })),
    [
      {
        ruleId: "transcript-reporting-frame",
        confidence: "high",
        evidenceIndex: 0,
        unconditionalError: false,
      },
      {
        ruleId: "prohibited-unicode-dash",
        confidence: "high",
        evidenceIndex: 1,
        unconditionalError: true,
      },
    ],
  );
});

test("transcript reporting variants are actionable in public prose and evidence notes", () => {
  const frames = [
    "The transcript covers", "The transcript gives", "The transcript connects",
    "The transcript lists", "The transcript names", "The transcript follows", "The transcript sets out",
  ];
  for (const frame of frames) {
    const video = sampleQaVideo(`${frame} the destroyer designs.`);
    video.segments[0]!.evidence[0]!.note = `${frame} the destroyer designs.`;
    const findings = scanCuratedVideoFileMechanicalWording("example.json", video, { includeReview: true });
    assert.deepEqual(findings.map(({ field, confidence, match }) => ({ field, confidence, match })), [
      { field: "body", confidence: "high", match: frame },
      { field: "evidence.note", confidence: "high", match: frame },
    ], frame);
  }
});

test("answer reporting variants remain contextual in evidence notes", () => {
  const frames = [
    "The answer compares", "The answer contrasts", "The answer connects", "The answer traces",
    "The answer gives", "The answer lists", "The answer lays out",
  ];
  for (const frame of frames) {
    const video = sampleQaVideo(`${frame} the destroyer designs.`);
    video.segments[0]!.evidence[0]!.note = `${frame} the destroyer designs.`;
    const findings = scanCuratedVideoFileMechanicalWording("example.json", video, { includeReview: true });
    assert.deepEqual(findings.map(({ field, confidence, match }) => ({ field, confidence, match })), [
      { field: "body", confidence: "high", match: frame },
      { field: "evidence.note", confidence: "review", match: frame },
    ], frame);
  }
});

test("bare Alex reporting is review-only and preserves competing speaker ownership", () => {
  const video = sampleVideo("Jamie doubts the claim. Alex argues that the handbook was shared.");
  const findings = scanCuratedVideoFileMechanicalWording("example.json", video, { includeReview: true });
  assert.equal(findings[0]?.match, "Alex");
  assert.equal(findings[0]?.confidence, "review");
  assert.deepEqual(scanCuratedVideoFileMechanicalWording("example.json", video), []);
  assert.deepEqual(scanCuratedVideoFileMechanicalWording(
    "example.json", sampleVideo("Alexandria contains the dockyard. Alex Nelson commanded the ship."), { includeReview: true },
  ), []);
});

test("generic narrators and compound reporting cannot hide behind a removed host name", () => {
  const video = sampleVideo(
    "The presenter compares fuel loads, explains the tradeoff, and describes the resulting range. " +
    "The discussion links endurance to deployment.",
  );
  video.segments[0]!.evidence[0]!.note = "The proposed fleet, while doubting that it prevents the battle.";
  const findings = scanCuratedVideoFileMechanicalWording("example.json", video, { includeReview: true });
  assert.deepEqual(findings.map(({ ruleId }) => ruleId), [
    "generic-speaker-reporting-frame",
    "discussion-reporting-frame",
    "possible-dangling-narration",
  ]);
  assert.equal(findings.every(({ confidence }) => confidence === "review"), true);
});

test("watch-point value filler is actionable while historical assessments retain context", () => {
  const video = sampleVideo("This segment is useful because it explains the ship's endurance.");
  assert.equal(scanCuratedVideoFileMechanicalWording("example.json", video)[0]?.ruleId, "watch-point-value-frame");
  const clean = sampleVideo(
    "The book is useful because its tables record fuel consumption. " +
    "The speed of the response shows prior planning. The speaker of the assembly held a different office.",
  );
  clean.segments[0]!.evidence[0]!.note = "The exact range remains uncertain; no archival confirmation was available.";
  assert.deepEqual(scanCuratedVideoFileMechanicalWording("example.json", clean, { includeReview: true }), []);
});

test("CLI makes transcript-reporting evidence notes fail strict checks", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "site-content-wording-evidence-"));
  try {
    const video = sampleVideo("Fuel endurance constrained the operation.");
    video.segments[0]!.evidence[0]!.note = "The transcript traces prewar multi-carrier organization.";
    await writeFile(join(repoRoot, "example.json"), JSON.stringify(video));
    const args = ["--repo-root", repoRoot, "--path", "example.json", "--report", "--summary-only"];
    assert.equal(await withoutConsole(() => checkSiteContentWording([...args, "--strict"])), 1);
    const report = JSON.parse(await readFile(join(repoRoot, "reports/site-content-wording-scan.json"), "utf8"));
    assert.equal(report.publicFieldsScanned, 3);
    assert.equal(report.evidenceNotesScanned, 1);
    assert.equal(report.findings[0].field, "evidence.note");
    assert.equal(report.findings[0].evidenceIndex, 0);
    assert.equal(report.findings[0].ruleId, "transcript-reporting-frame");
    assert.equal(report.findings[0].confidence, "high");
    assert.deepEqual(report.ruleCounts, [{
      enforcement: "strict",
      confidence: "high",
      ruleId: "transcript-reporting-frame",
      count: 1,
    }]);
    assert.match(await readFile(join(repoRoot, "reports/site-content-wording-scan.md"), "utf8"), /evidence\[0\]\.note/u);

    video.segments[0]!.evidence[0]!.note = "Dr. Clarke recalls a personal visit to the ship.";
    await writeFile(join(repoRoot, "example.json"), JSON.stringify(video));
    assert.equal(await withoutConsole(() => checkSiteContentWording([...args, "--strict", "--review"])), 0);
    assert.equal(await withoutConsole(() => checkSiteContentWording([...args, "--strict-review"])), 1);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
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
            note: "Fuel load compared with operating radius.",
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
  return (await captureConsole(operation)).result;
}

async function captureConsole<T>(operation: () => Promise<T>): Promise<{
  result: T;
  logs: string[];
  warnings: string[];
  errors: string[];
}> {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const logs: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  try {
    console.log = (...values: unknown[]) => logs.push(values.map(String).join(" "));
    console.warn = (...values: unknown[]) => warnings.push(values.map(String).join(" "));
    console.error = (...values: unknown[]) => errors.push(values.map(String).join(" "));
    return {result: await operation(), logs, warnings, errors};
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}
