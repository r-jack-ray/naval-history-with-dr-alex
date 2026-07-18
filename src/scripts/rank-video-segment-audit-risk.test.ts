import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("CLI maps canonical processing states, isolates malformed shards, and emits renamed headers", async () => {
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
      { videoId: "repair1", fileStem: "repair_repair1", videoTitle: "Repair", lastEndSeconds: 600, paths: { txt: "txt/repair_repair1.txt" } },
      { videoId: "follow1", fileStem: "follow_follow1", videoTitle: "Follow", lastEndSeconds: 600, paths: { txt: "txt/follow_follow1.txt" } },
      { videoId: "done1", fileStem: "done_done1", videoTitle: "Done", lastEndSeconds: 600, paths: { txt: "txt/done_done1.txt" } },
      { videoId: "generic1", fileStem: "generic_generic1", videoTitle: "Bruships Trailer", lastEndSeconds: 600, paths: { txt: "txt/generic_generic1.txt" } },
      { videoId: "explicit1", fileStem: "explicit_explicit1", videoTitle: "Naval Questions Answered", lastEndSeconds: 600, paths: { txt: "txt/explicit_explicit1.txt" } },
      { videoId: "manual1", fileStem: "manual_manual1", videoTitle: "Manual Audio", lastEndSeconds: 600, paths: { txt: "txt/manual_manual1.txt" } },
      { videoId: "school1", fileStem: "school-functions_school1", videoTitle: "SASC School Functions", lastEndSeconds: 600, paths: { txt: "txt/school-functions_school1.txt" } },
    ];
    await writeFile(manifestPath, JSON.stringify({ transcripts: records }), "utf8");
    await writeFile(configPath, JSON.stringify({
      firstPass: { minimumEvidenceWindows: 1 },
      liveStreamExtraction: { explicitQaTitleMarkers: [] },
      videoTypeRules: [{ matchTitle: "Bruships", followUpStage: "exhaustive-live-qa-review" }],
    }), "utf8");
    for (const record of records) await writeFile(path.join(transcripts, `${record.fileStem}.txt`), "transcript", "utf8");
    await writeFile(path.join(segments, "repair_repair1.json"), "null", "utf8");
    const source = (stem: string) => path.relative(process.cwd(), path.join(transcripts, `${stem}.txt`)).replaceAll(path.sep, "/");
    const shard = (record: typeof records[number]) => ({
      schemaVersion: 1, videoId: record.videoId, segments: [{ kind: "chapter", start: "0:00", sourcePath: source(record.fileStem), evidence: [{ start: "0:00", note: "Evidence." }] }],
    });
    await writeFile(path.join(segments, "follow_follow1.json"), JSON.stringify(shard(records[1]!)), "utf8");
    await writeFile(path.join(segments, "done_done1.json"), JSON.stringify({ schemaVersion: 1, videoId: "done1", segments: [] }), "utf8");
    await writeFile(path.join(segments, "generic_generic1.json"), JSON.stringify(shard(records[3]!)), "utf8");
    await writeFile(path.join(segments, "explicit_explicit1.json"), JSON.stringify(shard(records[4]!)), "utf8");
    await writeFile(path.join(segments, "manual_manual1.json"), JSON.stringify(shard(records[5]!)), "utf8");
    await writeFile(path.join(segments, "school-functions_school1.json"), JSON.stringify(shard(records[6]!)), "utf8");
    await writeFile(logPath, [
      "timestamp;shardPath;result;needsFurtherProcessing;notes",
      "2026-07-12T20:00:00;src/derived/video-segments/follow_follow1.json;reviewed;yes;more work",
      "2026-07-12T20:00:00;src/derived/video-segments/follow_follow1.json;reviewed;yes;still more work",
      "2026-07-12T20:00:01;src/derived/video-segments/done_done1.json;closed;no;intentional empty",
      "2026-07-12T20:00:02;src/derived/video-segments/generic_generic1.json;curated 1 first-pass segment;yes;initial consume",
      "2026-07-12T20:00:03;src/derived/video-segments/generic_generic1.json;audited;no;no transcript-visible Q and A",
      "2026-07-12T20:00:04;src/derived/video-segments/generic_generic1.json;audited;no;high-effort audit saturated",
      "2026-07-12T20:00:05;src/derived/video-segments/explicit_explicit1.json;audited;no;title still warrants review",
      "2026-07-12T20:00:06;src/derived/video-segments/manual_manual1.json;audited;no;full transcript compared",
      "2026-07-12T20:00:07;src/derived/video-segments/manual_manual1.json;strengthened;yes;Full transcript compared, manual audio review remains at 12:59-13:28",
    ].join("\n"), "utf8");

    const script = path.resolve("dist/scripts/rank-video-segment-audit-risk.js");
    const result = await execFileAsync(process.execPath, [script, "--manifest", manifestPath, "--segments-input", segments,
      "--transcript-root", transcripts, "--processing-log", logPath, "--processing-config", configPath, "--output", outputPath]);
    const output = await readFile(outputPath, "utf8");
    const lines = output.trimEnd().split("\n");
    assert.match(lines[0] ?? "", /audit_route\taudit_risk_score\trisk_tier/u);
    assert.match(lines[0] ?? "", /needs_further_processing\tmanual_audio_review_remaining\tprocess_log_entries/u);
    assert.doesNotMatch(lines[0] ?? "", /probability/u);
    assert.match(lines[1] ?? "", /repair_required/u);
    assert.match(output, /follow_up_required/u);
    const header = (lines[0] ?? "").split("\t");
    const rows = lines.slice(1).map((line) => line.split("\t"));
    const fileStemIndex = header.indexOf("file_stem");
    const rankIndex = header.indexOf("rank");
    const auditRiskScoreIndex = header.indexOf("audit_risk_score");
    const auditRouteIndex = header.indexOf("audit_route");
    const manualAudioReviewIndex = header.indexOf("manual_audio_review_remaining");
    const processLogEntriesIndex = header.indexOf("process_log_entries");
    const follow = rows.find((row) => row[fileStemIndex]?.endsWith("follow_follow1.json"));
    const repair = rows.find((row) => row[fileStemIndex]?.endsWith("repair_repair1.json"));
    const done = rows.find((row) => row[fileStemIndex]?.endsWith("done_done1.json"));
    const generic = rows.find((row) => row[fileStemIndex]?.endsWith("generic_generic1.json"));
    const explicit = rows.find((row) => row[fileStemIndex]?.endsWith("explicit_explicit1.json"));
    const manual = rows.find((row) => row[fileStemIndex]?.endsWith("manual_manual1.json"));
    assert.equal(follow?.[processLogEntriesIndex], "2");
    assert.equal(repair?.[processLogEntriesIndex], "0");
    assert.equal(generic?.[processLogEntriesIndex], "3");
    assert.equal(manual?.[processLogEntriesIndex], "2");
    assert.equal(manual?.[manualAudioReviewIndex], "true");
    assert.equal(manual?.[auditRouteIndex], "low_signal");
    assert.ok(Number(manual?.[rankIndex]) > Number(done?.[rankIndex]));
    assert.ok(rows.every((row) => /^\d+\.\d$/u.test(row[auditRiskScoreIndex] ?? "")));
    assert.match(generic?.join("\t") ?? "", /low_signal.*consume-plus-two-audits threshold/u);
    assert.match(explicit?.join("\t") ?? "", /review_candidate/u);
    assert.match(manual?.join("\t") ?? "", /only manual audio review/u);
    assert.match(output, /\tdone1\tDone\tno\tfalse\t1\t/u);
    assert.match(output, /recorded processing state explicitly requests further processing/u);
    assert.doesNotMatch(output, /school-functions_school1|SASC School Functions/u);
    assert.match(result.stderr, /shards=6 excluded_sasc_shards=1.*manual_audio_review_remaining=1/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
