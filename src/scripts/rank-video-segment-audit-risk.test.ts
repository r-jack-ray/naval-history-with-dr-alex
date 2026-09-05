import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import test from "node:test";
import {promisify} from "node:util";
import type {SiteContentProcessingConfig} from "../content/schemas/index.js";

const execFileAsync = promisify(execFile);

test("CLI excludes empty shards and exposes append-order context without predictive suppression", async () => {
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
    const definitions = [
      ["a-few", "Few passes"], ["z-many", "Many passes"], ["explicit", "Naval Questions Answered"],
      ["generic", "Bruships Trailer"], ["structural", "Structural defect"], ["empty-unlogged", "Empty"],
      ["empty-logged", "Reviewed Empty"], ["broken", "Malformed JSON"], ["null-root", "Null root"],
      ["missing-array", "Missing array"], ["null-entry", "Malformed segment"], ["school", "SASC School Functions"],
      ["manual", "Manual Audio"], ["manual-complete", "Manual Audio Complete"],
    ];
    const records = definitions.map(([fileStem, videoTitle], index) => ({
      videoId: "fixture" + index, fileStem: fileStem!, videoTitle: videoTitle!, lastEndSeconds: 600,
      paths: {txt: "txt/" + fileStem + ".txt"},
    }));
    await writeFile(manifestPath, JSON.stringify({transcripts: records}), "utf8");
    await writeFile(configPath, JSON.stringify(processingConfigFixture()), "utf8");
    for (const record of records) {
      await writeFile(path.join(transcripts, record.fileStem + ".txt"), "transcript", "utf8");
      const sourcePath = path.relative(process.cwd(), path.join(transcripts, record.fileStem + ".txt")).replaceAll(path.sep, "/");
      const shard = {
        videoId: record.videoId, topics: ["destroyers"],
        segments: [{
          slug: record.videoId + "-segment", title: "Fixture segment", kind: "chapter", start: "0:00",
          topics: ["destroyers"], summary: "Fixture summary.", body: "Fixture body.", sourcePath,
          evidence: [{start: "0:00", note: "Evidence."}],
        }],
      };
      let serialized: string;
      switch (record.fileStem) {
        case "broken": serialized = "{"; break;
        case "null-root": serialized = "null"; break;
        case "missing-array": serialized = JSON.stringify({videoId: record.videoId, topics: []}); break;
        case "empty-unlogged":
        case "empty-logged": serialized = JSON.stringify({...shard, segments: []}); break;
        case "null-entry": serialized = JSON.stringify({...shard, segments: [null]}); break;
        case "structural": serialized = JSON.stringify({...shard, unexpected: true}); break;
        default: serialized = JSON.stringify(shard);
      }
      await writeFile(path.join(segments, record.fileStem + ".json"), serialized, "utf8");
    }
    const log = [
      "timestamp;shardPath;result;notes",
      "2026-09-05T12:00:00;src/derived/video-segments/a-few.json;audited;full transcript",
      "2026-09-05T12:00:00;src/derived/video-segments/z-many.json;audited;first audit",
      "2026-09-05T12:00:01;src/derived/video-segments/z-many.json;saturated;earlier model exhausted",
      "2026-09-05T12:00:02;src/derived/video-segments/z-many.json;strengthened;GPT-6 Astra Ultra added context",
      "2026-09-04T11:00:00;src/derived/video-segments/z-many.json;strengthened\tagain;Astra Ultra; added examples\tand detail",
      "2026-09-05T12:00:03;src/derived/video-segments/generic.json;saturated;no transcript-visible Q and A",
      "2026-09-05T12:00:04;src/derived/video-segments/empty-logged.json;closed;intentional empty",
      "2026-09-05T12:00:05;src/derived/video-segments/manual.json;strengthened;Full transcript; manual audio review remains at 12:59-13:28",
      "2026-09-05T12:00:06;src/derived/video-segments/manual-complete.json;audited;manual audio review completed",
    ];
    await writeFile(logPath, log.join("\n"), "utf8");
    const result = await execFileAsync(process.execPath, [
      "--import", "tsx", path.resolve("src/scripts/rank-video-segment-audit-risk.ts"),
      "--manifest", manifestPath, "--segments-input", segments, "--transcript-root", transcripts,
      "--processing-log", logPath, "--processing-config", configPath, "--output", outputPath,
    ]);
    const lines = (await readFile(outputPath, "utf8")).trimEnd().split("\n");
    const header = lines[0]!.split("\t");
    const rows = lines.slice(1).map((line) => line.split("\t"));
    assert.equal(rows.length, 8);
    assert.ok(rows.every((row) => row.length === header.length));
    assert.doesNotMatch(header.join("\t"), /_|score|probability/u);
    assert.equal(header.at(-1), "audit route");
    assert.equal(header[header.indexOf("duration minutes") + 1], "Transcript Bytes Per Minute");
    assert.equal(header[header.indexOf("Transcript Bytes Per Minute") + 1], "segment count");
    const cell = (stem: string, column: string) =>
      rows.find((row) => row[header.indexOf("file stem")] === stem + ".json")?.[header.indexOf(column)];
    assert.ok(rows.every((row) => Number(row[header.indexOf("segment count")]) > 0));
    for (const stem of ["empty-unlogged", "empty-logged", "broken", "null-root", "missing-array", "school"]) {
      assert.equal(cell(stem, "rank"), undefined, stem);
    }
    assert.equal(cell("structural", "audit route"), "repair_required");
    assert.equal(cell("null-entry", "audit route"), "repair_required");
    assert.equal(cell("explicit", "audit route"), "review_candidate");
    assert.equal(cell("generic", "audit route"), "low_signal");
    assert.equal(cell("a-few", "process log entries"), "1");
    assert.equal(cell("a-few", "Transcript Bytes Per Minute"), "1.00");
    assert.equal(cell("z-many", "process log entries"), "4");
    assert.equal(cell("a-few", "largest evidence gap minutes"), cell("z-many", "largest evidence gap minutes"));
    assert.ok(Number(cell("a-few", "rank")) < Number(cell("z-many", "rank")));
    assert.equal(cell("z-many", "latest processing timestamp"), "2026-09-04T11:00:00");
    assert.equal(cell("z-many", "latest processing log line"), "6");
    assert.equal(cell("z-many", "latest processing result"), "strengthened again");
    assert.equal(cell("z-many", "latest processing notes"), "Astra Ultra; added examples and detail");
    assert.equal(cell("generic", "latest processing result"), "saturated");
    assert.equal(cell("generic", "largest evidence gap minutes"), "10.0");
    assert.equal(cell("generic", "largest evidence gap start"), "0:00");
    assert.equal(cell("generic", "largest evidence gap end"), "10:00");
    assert.equal(header.includes("risk signals"), false);
    assert.equal(cell("explicit", "latest processing result"), "");
    assert.equal(header.includes("manual audio review remaining"), false);
    assert.equal(cell("manual", "latest processing notes"), "Full transcript; manual audio review remains at 12:59-13:28");
    assert.equal(cell("manual-complete", "latest processing notes"), "manual audio review completed");
    assert.match(result.stdout, /shards=8/u);
    assert.match(result.stdout, /excluded_sasc_shards=1/u);
    assert.match(result.stdout, /excluded_empty_shards=5/u);
    assert.match(result.stdout, /repair_required=2 review_candidate=1 low_signal=5/u);
    assert.doesNotMatch(result.stdout, /manual_audio_review_remaining/u);
    for (const name of ["broken.json", "null-root.json", "missing-array.json"]) {
      assert.ok(result.stderr.includes(name), name);
    }
    assert.ok(!result.stderr.includes("empty-unlogged.json"));
    assert.ok(!result.stderr.includes("empty-logged.json"));
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
