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
    ];
    await writeFile(manifestPath, JSON.stringify({ transcripts: records }), "utf8");
    await writeFile(configPath, JSON.stringify({ firstPass: { minimumEvidenceWindows: 1 }, liveStreamExtraction: { explicitQaTitleMarkers: [] }, videoTypeRules: [] }), "utf8");
    for (const record of records) await writeFile(path.join(transcripts, `${record.fileStem}.txt`), "transcript", "utf8");
    await writeFile(path.join(segments, "repair_repair1.json"), "null", "utf8");
    const source = (stem: string) => path.relative(process.cwd(), path.join(transcripts, `${stem}.txt`)).replaceAll(path.sep, "/");
    const shard = (record: typeof records[number]) => ({
      schemaVersion: 1, videoId: record.videoId, segments: [{ kind: "chapter", start: "0:00", sourcePath: source(record.fileStem), evidence: [{ start: "0:00", note: "Evidence." }] }],
    });
    await writeFile(path.join(segments, "follow_follow1.json"), JSON.stringify(shard(records[1]!)), "utf8");
    await writeFile(path.join(segments, "done_done1.json"), JSON.stringify({ schemaVersion: 1, videoId: "done1", segments: [] }), "utf8");
    await writeFile(logPath, [
      "timestamp;shardPath;result;needsFurtherProcessing;notes",
      "2026-07-12T20:00:00;src/derived/video-segments/follow_follow1.json;reviewed;yes;more work",
      "2026-07-12T20:00:00;src/derived/video-segments/follow_follow1.json;reviewed;yes;still more work",
      "2026-07-12T20:00:01;src/derived/video-segments/done_done1.json;closed;no;intentional empty",
    ].join("\n"), "utf8");

    const script = path.resolve("dist/scripts/rank-video-segment-audit-risk.js");
    await execFileAsync(process.execPath, [script, "--manifest", manifestPath, "--segments-input", segments,
      "--transcript-root", transcripts, "--processing-log", logPath, "--processing-config", configPath, "--output", outputPath]);
    const output = await readFile(outputPath, "utf8");
    const lines = output.trimEnd().split("\n");
    assert.match(lines[0] ?? "", /audit_route\taudit_risk_score\trisk_tier/u);
    assert.match(lines[0] ?? "", /needs_further_processing\tprocess_log_entries\ttranscript_bytes/u);
    assert.doesNotMatch(lines[0] ?? "", /probability/u);
    assert.match(lines[1] ?? "", /repair_required/u);
    assert.match(output, /follow_up_required/u);
    const header = (lines[0] ?? "").split("\t");
    const rows = lines.slice(1).map((line) => line.split("\t"));
    const fileStemIndex = header.indexOf("file_stem");
    const processLogEntriesIndex = header.indexOf("process_log_entries");
    const follow = rows.find((row) => row[fileStemIndex]?.endsWith("follow_follow1.json"));
    const repair = rows.find((row) => row[fileStemIndex]?.endsWith("repair_repair1.json"));
    assert.equal(follow?.[processLogEntriesIndex], "2");
    assert.equal(repair?.[processLogEntriesIndex], "0");
    assert.match(output, /\tdone1\tDone\tno\t1\t/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
