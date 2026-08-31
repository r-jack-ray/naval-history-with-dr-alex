import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import type { SiteContentProcessingConfig } from "../content/schemas/index.js";

const execFileAsync = promisify(execFile);

test("CLI consumes the four-field log, isolates malformed shards, and renders state-free ranking", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "video-segment-audit-risk-"));
  try {
    const segments = path.join(root, "segments");
    const transcripts = path.join(root, "transcripts");
    await mkdir(segments);
    await mkdir(transcripts);
    const manifestPath = path.join(root, "manifest.json");
    const logPath = path.join(root, "processing.log");
    const configPath = path.join(root, "config.json");
    const outputPath = path.join(root, "output.tsv");
    const records = [
      {videoId: "repair1", fileStem: "repair_repair1", videoTitle: "Repair", lastEndSeconds: 600, paths: {txt: "txt/repair_repair1.txt"}},
      {videoId: "follow1", fileStem: "follow_follow1", videoTitle: "Follow", lastEndSeconds: 600, paths: {txt: "txt/follow_follow1.txt"}},
      {videoId: "done1", fileStem: "done_done1", videoTitle: "Done", lastEndSeconds: 600, paths: {txt: "txt/done_done1.txt"}},
      {videoId: "generic1", fileStem: "generic_generic1", videoTitle: "Bruships Trailer", lastEndSeconds: 600, paths: {txt: "txt/generic_generic1.txt"}},
      {
        videoId: "explicit1",
        fileStem: "explicit_explicit1",
        videoTitle: "Naval Questions Answered",
        lastEndSeconds: 600,
        paths: {txt: "txt/explicit_explicit1.txt"}
      },
      {videoId: "manual1", fileStem: "manual_manual1", videoTitle: "Manual Audio", lastEndSeconds: 600, paths: {txt: "txt/manual_manual1.txt"}},
      {videoId: "manual2", fileStem: "manual-still_manual2", videoTitle: "Manual Audio Still", lastEndSeconds: 600, paths: {txt: "txt/manual-still_manual2.txt"}},
      {videoId: "manual3", fileStem: "manual-needed_manual3", videoTitle: "Manual Audio Needed", lastEndSeconds: 600, paths: {txt: "txt/manual-needed_manual3.txt"}},
      {videoId: "manual4", fileStem: "audiovisual_manual4", videoTitle: "Audiovisual Recovery", lastEndSeconds: 600, paths: {txt: "txt/audiovisual_manual4.txt"}},
      {videoId: "complete1", fileStem: "manual-complete_complete1", videoTitle: "Manual Audio Complete", lastEndSeconds: 600, paths: {txt: "txt/manual-complete_complete1.txt"}},
      {
        videoId: "school1",
        fileStem: "school-functions_school1",
        videoTitle: "SASC School Functions",
        lastEndSeconds: 600,
        paths: {txt: "txt/school-functions_school1.txt"}
      },
    ];
    await writeFile(manifestPath, JSON.stringify({transcripts: records}), "utf8");
    await writeFile(configPath, JSON.stringify(processingConfigFixture()), "utf8");
    for (const record of records) {
      await writeFile(path.join(transcripts, `${record.fileStem}.txt`), "transcript", "utf8");
    }
    await writeFile(path.join(segments, "repair_repair1.json"), "null", "utf8");
    const source = (stem: string) => path.relative(process.cwd(), path.join(transcripts, `${stem}.txt`)).replaceAll(path.sep, "/");
    const shard = (record: typeof records[number]) => ({
      videoId: record.videoId,
      topics: ["destroyers"],
      segments: [{
        id: `${record.videoId}-segment`,
        slug: `${record.videoId}-segment`,
        title: "Fixture segment",
        kind: "chapter",
        start: "0:00",
        topics: ["destroyers"],
        summary: "Fixture summary.",
        body: "Fixture body.",
        sourcePath: source(record.fileStem),
        evidence: [{start: "0:00", note: "Evidence."}],
      }],
    });
    await writeFile(path.join(segments, "follow_follow1.json"), JSON.stringify(shard(records[1]!)), "utf8");
    await writeFile(path.join(segments, "done_done1.json"), JSON.stringify({
      videoId: "done1",
      topics: [],
      segments: [],
    }), "utf8");
    await writeFile(path.join(segments, "generic_generic1.json"), JSON.stringify(shard(records[3]!)), "utf8");
    await writeFile(path.join(segments, "explicit_explicit1.json"), JSON.stringify(shard(records[4]!)), "utf8");
    await writeFile(path.join(segments, "manual_manual1.json"), JSON.stringify(shard(records[5]!)), "utf8");
    await writeFile(path.join(segments, "manual-still_manual2.json"), JSON.stringify(shard(records[6]!)), "utf8");
    await writeFile(path.join(segments, "manual-needed_manual3.json"), JSON.stringify(shard(records[7]!)), "utf8");
    await writeFile(path.join(segments, "audiovisual_manual4.json"), JSON.stringify(shard(records[8]!)), "utf8");
    await writeFile(path.join(segments, "manual-complete_complete1.json"), JSON.stringify(shard(records[9]!)), "utf8");
    await writeFile(path.join(segments, "school-functions_school1.json"), JSON.stringify(shard(records[10]!)), "utf8");
    await writeFile(logPath, [
      "timestamp;shardPath;result;notes",
      "2026-07-12T20:00:00;src/derived/video-segments/follow_follow1.json;reviewed;more work",
      "2026-07-12T20:00:00;src/derived/video-segments/follow_follow1.json;reviewed;still more work",
      "2026-07-12T20:00:01;src/derived/video-segments/done_done1.json;closed;intentional empty",
      "2026-07-12T20:00:02;src/derived/video-segments/generic_generic1.json;curated 1 first-pass segment;initial consume",
      "2026-07-12T20:00:03;src/derived/video-segments/generic_generic1.json;audited;no transcript-visible Q and A",
      "2026-07-12T20:00:04;src/derived/video-segments/generic_generic1.json;audited;high-effort audit saturated",
      "2026-07-12T20:00:05;src/derived/video-segments/explicit_explicit1.json;audited;title still warrants review",
      "2026-07-12T20:00:06;src/derived/video-segments/manual_manual1.json;audited;full transcript compared",
      "2026-07-12T20:00:07;src/derived/video-segments/manual_manual1.json;strengthened;Full transcript compared; manual audio review remains at 12:59-13:28",
      "2026-07-12T20:00:08;src/derived/video-segments/manual-still_manual2.json;audited;still needs manual audio review",
      "2026-07-12T20:00:09;src/derived/video-segments/manual-needed_manual3.json;audited;manual audio needed",
      "2026-07-12T20:00:10;src/derived/video-segments/audiovisual_manual4.json;audited;needs audiovisual recovery",
      "2026-07-12T20:00:11;src/derived/video-segments/manual-complete_complete1.json;audited;manual audio review completed",
    ].join("\n"), "utf8");

    const script = path.resolve("src/scripts/rank-video-segment-audit-risk.ts");
    const result = await execFileAsync(process.execPath, ["--import", "tsx", script, "--manifest", manifestPath, "--segments-input", segments,
      "--transcript-root", transcripts, "--processing-log", logPath, "--processing-config", configPath, "--output", outputPath]);
    const output = await readFile(outputPath, "utf8");
    const lines = output.trimEnd().split("\n");
    const header = (lines[0] ?? "").split("\t");
    assert.deepEqual(header, [
      "file stem",
      "rank",
      "audit risk score",
      "audit route",
      "process log entries",
      "transcript bytes",
      "shard bytes",
      "shard to transcript ratio",
      "duration minutes",
      "segment count",
      "qa count",
      "valid qa count",
      "qa temporal bins covered",
      "segments per hour",
      "first segment position pct",
      "last segment position pct",
      "temporal bins covered",
      "largest anchor gap pct",
      "largest anchor gap minutes",
      "valid anchor count",
      "manual audio review remaining",
    ]);
    assert.doesNotMatch(lines[0] ?? "", /_|probability/u);
    const rows = lines.slice(1).map((line) => line.split("\t"));
    assert.ok(rows.every((row) => row.length === header.length));
    const fileStemIndex = header.indexOf("file stem");
    const rankIndex = header.indexOf("rank");
    const auditRiskScoreIndex = header.indexOf("audit risk score");
    const auditRouteIndex = header.indexOf("audit route");
    const manualAudioReviewIndex = header.indexOf("manual audio review remaining");
    const processLogEntriesIndex = header.indexOf("process log entries");
    assert.ok(rows.every((row) => row[fileStemIndex] === path.basename(row[fileStemIndex] ?? "")));
    const follow = rows.find((row) => row[fileStemIndex] === "follow_follow1.json");
    const repair = rows.find((row) => row[fileStemIndex] === "repair_repair1.json");
    const done = rows.find((row) => row[fileStemIndex] === "done_done1.json");
    const generic = rows.find((row) => row[fileStemIndex] === "generic_generic1.json");
    const explicit = rows.find((row) => row[fileStemIndex] === "explicit_explicit1.json");
    const manual = rows.find((row) => row[fileStemIndex] === "manual_manual1.json");
    const manualStill = rows.find((row) => row[fileStemIndex] === "manual-still_manual2.json");
    const manualNeeded = rows.find((row) => row[fileStemIndex] === "manual-needed_manual3.json");
    const audiovisual = rows.find((row) => row[fileStemIndex] === "audiovisual_manual4.json");
    const completed = rows.find((row) => row[fileStemIndex] === "manual-complete_complete1.json");
    assert.equal(follow?.[processLogEntriesIndex], "2");
    assert.equal(repair?.[processLogEntriesIndex], "0");
    assert.equal(generic?.[processLogEntriesIndex], "3");
    assert.equal(manual?.[processLogEntriesIndex], "2");
    assert.equal(manual?.[manualAudioReviewIndex], "true");
    assert.equal(manualStill?.[manualAudioReviewIndex], "true");
    assert.equal(manualNeeded?.[manualAudioReviewIndex], "true");
    assert.equal(audiovisual?.[manualAudioReviewIndex], "true");
    assert.equal(completed?.[manualAudioReviewIndex], "false");
    assert.equal(header.at(-1), "manual audio review remaining");
    assert.equal(repair?.[rankIndex], "1");
    assert.equal(repair?.[auditRouteIndex], "repair_required");
    assert.equal(explicit?.[auditRouteIndex], "review_candidate");
    assert.equal(done?.[auditRouteIndex], "review_candidate");
    assert.equal(generic?.[auditRouteIndex], "low_signal");
    assert.ok(Number(explicit?.[rankIndex]) < Number(done?.[rankIndex]));
    assert.equal(done?.[auditRiskScoreIndex], "");
    assert.equal(repair?.[auditRiskScoreIndex], "");
    assert.ok(rows.filter((row) => row !== done && row !== repair).every((row) => /^\d+\.\d$/u.test(row[auditRiskScoreIndex] ?? "")));
    assert.ok(Number(done?.[rankIndex]) < Number(follow?.[rankIndex]));
    assert.ok(Number(follow?.[rankIndex]) < Number(generic?.[rankIndex]));
    assert.ok(Number(explicit?.[rankIndex]) < Number(generic?.[rankIndex]));
    assert.match(output, /repair_required|review_candidate|low_signal/u);
    assert.doesNotMatch(output, /school-functions_school1|SASC School Functions/u);
    assert.match(result.stdout, /shards=10 excluded_sasc_shards=1 repair_required=1 review_candidate=2 low_signal=7/u);
    assert.match(result.stdout, /manual_audio_review_remaining=4/u);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

function processingConfigFixture(): SiteContentProcessingConfig {
  return {
    firstPass: {
      defaultAction: "curate transcript-backed segments",
      processingMode: "full-file-best-effort",
      minimumEvidenceWindows: 1,
      preferredSegmentKinds: ["chapter", "notable_point", "qa", "transcript_excerpt"],
      requiredContentScans: ["subject-segments", "qa-exchanges"],
      guidance: "Inspect the full transcript.",
    },
    videoLevelTopics: {
      mode: "curated-summary-subset",
      requireAllSegmentTopics: false,
    },
    liveStreamExtraction: {
      mode: "full-duration-mixed-content",
      explicitQaTitleMarkers: ["Q&A"],
      requiredQaFields: ["start", "question", "answerShort"],
      guidance: "Capture every substantive exchange.",
    },
    topicLifecycle: {
      mode: "shard-derived-automatic",
      contentPass: "Add evidence-backed topics.",
      fictionPolicy: "Prefix fictional referents.",
      synchronization: "Synchronize topics deterministically.",
      exceptionRule: "Review ambiguous candidates.",
    },
    contentExhaustion: {
      mode: "model-effort-saturation",
      comparisonScope: "Compare the full transcript.",
      stopRule: "Stop when no substance is added.",
      reopenRule: "Reopen for stronger evidence or methods.",
    },
    followUpStages: [{
      slug: "exhaustive-live-qa-review",
      title: "Exhaustive Live Q&A Review",
      description: "Review every substantive exchange.",
    }],
    videoTypeRules: [{
      matchTitle: "Bruships",
      defaultKind: "chapter",
      defaultTopics: ["live-q-and-a"],
      followUpStage: "exhaustive-live-qa-review",
    }],
    topicGroups: [],
  };
}
