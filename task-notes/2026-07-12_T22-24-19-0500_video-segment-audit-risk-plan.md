# Video Segment Audit Risk Ranking Repair Plan

Status: planning only; do not implement as part of this task.

## Objective

Repair the existing `analyze:video-segment-audit` process, add inexpensive accuracy improvements that use data it already loads or can cheaply derive, and rename its public surfaces so they describe a metadata-based audit-prioritization heuristic rather than a statistical probability or completeness measurement.

The finished command should answer:

> Which existing per-video shards should be repaired or reviewed first, based on processing state, structural validity, and inexpensive coverage-warning signals?

It should not claim to determine whether the shard is semantically complete or whether every transcript-backed claim is correct.

## Explicit Non-Goals

Do not add any of the following:

- Reading or semantically analyzing full transcript text.
- LLM/model calls, embeddings, classifiers, or transcript-to-shard comparisons.
- A human-reviewed gold dataset.
- Precision@K, recall@K, NDCG, Brier-score, calibration, or model-training infrastructure.
- Statistical-probability claims.
- Changes to transcript TXT files, video-segment content shards, `topics.json`, the processing log, generated site archives, Astro/Pagefind sources, or unrelated reports.
- Repository-wide site generation or builds solely for this tooling change.

This remains a fast prioritization heuristic.

## Current Problems to Fix

### Processing-log schema drift

The analyzer currently splits processing-log rows on tabs and expects a separate video-ID field. The authoritative log now uses this five-field semicolon format:

```text
timestamp;shardPath;result;needsFurtherProcessing;notes
```

The current parser therefore leaves valid records as `needsFurtherProcessing=unknown`. This is the highest-priority correctness bug because the ignored state materially affects routing and score.

### Weak shard/root validation

The script assumes parsed JSON is an object. JSON `null`, arrays, missing `videoId`, missing or non-array `segments`, and wrong schema versions are not consistently treated as structural errors. A non-array `segments` value can be silently converted into an empty shard.

Manifest fallback by shard `videoId` can also hide a noncanonical shard filename even though the manifest-owned `fileStem` is authoritative.

### Shallow evidence validation

A nonempty evidence array currently counts as evidence even when its entries do not contain the required `start` and `note` fields. Source paths are checked only for nonempty string presence, not canonical-path agreement.

### Misleading coverage and score names

`coveragePct` is only the furthest segment start/end position divided by transcript duration. A single late segment can therefore look like full coverage.

`auditProbabilityPct` is an uncalibrated additive score. The word `probability` overstates what it means, and large groups of equal scores are sorted alphabetically rather than by additional risk evidence.

### Brittle Q&A signal

The title regex misses repository titles using forms such as `Q/A`. A single `qa` segment also removes the warning even if that record is malformed. The process duplicates title knowledge instead of consuming the existing processing configuration.

### Mixed concerns in one score

Invalid JSON, missing transcripts, explicit `needsFurtherProcessing=yes`, and heuristic sparsity warnings are all folded into one number. Structural repair, explicit follow-up, and heuristic review are different work queues and should be distinguishable in the output.

## Target Behavior and Naming

### Canonical command and files

Use these names unless implementation-time reference discovery finds a concrete reason to retain an old compatibility alias:

- Package task: `rank:video-segment-audit-risk`
- CLI source: `src/scripts/rank-video-segment-audit-risk.ts`
- Analysis module: `src/content/video-segment-audit-risk.ts`
- Tests: `src/content/video-segment-audit-risk.test.ts` plus a CLI/parser integration test
- Task-specific TypeScript config: `tsconfig.video-segment-audit-risk.json`
- Default report: `reports/video-segment-audit-risk.tsv`

Before renaming, search the repository for all current task, source, report, and column names. Update every tracked consumer, including skill/help text. Remove old names when there is no external consumer. Add a temporary package alias only if an actual external automation still invokes the old task.

### Output terminology

Replace misleading names as follows:

| Current | Replacement | Meaning |
| --- | --- | --- |
| `audit_probability_pct` | `audit_risk_score` | Uncalibrated 1-99 heuristic used only for ordering within a route. |
| `priority` | `risk_tier` | Human-readable band derived from the heuristic score. |
| `coverage_pct` | `last_segment_position_pct` | Furthest valid segment anchor as a percentage of transcript duration. |
| `reasons` | `risk_signals` | Specific deterministic or heuristic reasons for routing/ranking. |

Add an `audit_route` column with these values, sorted in this order:

1. `repair_required`: invalid JSON/schema, identity mismatch, missing canonical transcript, or other deterministic integrity failure.
2. `follow_up_required`: latest valid processing-log state is `needsFurtherProcessing=yes` and no repair issue supersedes it.
3. `review_candidate`: no hard failure, but inexpensive heuristic signals indicate possible thin or uneven content.
4. `low_signal`: no hard failure or material heuristic warning was detected.

The route is authoritative for queue order. `audit_risk_score` orders rows within the same route; it must not override a higher-priority route.

### Help text

State plainly that the command:

- Ranks existing per-video shards for repair or follow-up audit.
- Uses processing state, shard structure, timestamps, evidence metadata, and other inexpensive heuristics.
- Does not read transcript text.
- Does not measure semantic completeness or return calibrated probabilities.
- Does not include manifest transcripts with no shard; those remain the responsibility of the existing unprocessed-file/backlog workflow.

## Phase 1: Fix Correctness Bugs

### 1. Implement one canonical processing-log parser

Create a small reusable parser module rather than leaving private, divergent parsing logic in multiple consumers.

Requirements:

- Verify the exact canonical header.
- Parse five semicolon-separated fields.
- Reject or report fields containing an unexpected delimiter rather than shifting columns silently.
- Require a valid timestamp, canonical repo-relative shard path, nonempty result, `yes|no`, and nonempty notes.
- Derive `fileStem` from the shard-path basename and resolve `videoId` through the manifest.
- Treat the last physical valid occurrence for a shard as its latest state because the canonical log is append-only and timestamps are local without an offset.
- Count and expose malformed, unmapped, and ignored rows; do not silently discard them.
- Default to the one canonical `src/derived/site-content-processing.log` file. Do not glob similarly named lane/private logs into the result.
- If repeated `--processing-log` arguments remain supported, require each file to use an explicitly recognized schema and document how precedence is determined. Prefer simplifying to one canonical log unless a current consumer requires otherwise.

Use the same parser in any existing site-content audit code that consumes this canonical log, so the two commands cannot drift to different schemas again. Keep this reuse limited to log parsing; do not broaden the work into unrelated audit changes.

### 2. Validate parsed shard roots before scoring

Add explicit structural checks for:

- Root is a non-null object.
- `schemaVersion` is supported.
- `videoId` is a safe nonempty string.
- `segments` is an array.
- Shard filename equals `<manifest.fileStem>.json`.
- Shard `videoId` matches the manifest record for that file stem.
- Duplicate manifest stems or video IDs are detected rather than silently overwritten in a `Map`.
- Orphan or noncanonical shards are reported as `repair_required`; video-ID fallback must not hide a bad filename.

Do not reinterpret malformed structures as legitimate empty shards.

### 3. Harden timestamp parsing

Use one strict timestamp parser that:

- Accepts only supported `M:SS` or `H:MM:SS` forms.
- Rejects negative/noninteger values and minute/second components greater than 59.
- Rejects segment and evidence anchors beyond the stored transcript end, allowing only the repository's existing small timestamp tolerance where appropriate.
- Does not turn an invalid `end` into a valid-looking coverage value; record a structural risk signal.

Reuse an existing tested repository timestamp parser if practical rather than creating another permissive implementation.

### 4. Make report generation failures visible

- Fail with a useful error when the manifest, shard directory, or canonical log has an invalid top-level contract.
- Continue row-by-row only for isolated shard failures that can be emitted as `repair_required` rows.
- Print summary counts for routes, malformed log rows, unmapped log rows, and unknown processing states.
- Keep deterministic sorting: route, risk score descending, title, then video ID.

## Phase 2: Low-Hanging-Fruit Accuracy Improvements

### 1. Replace the false coverage implication with cheap temporal-distribution signals

Retain `last_segment_position_pct` as a diagnostic, but do not call it coverage.

Add:

- `first_segment_position_pct`
- `temporal_bins_covered`: distinct occupied bins across ten equal-duration transcript bins
- `largest_anchor_gap_pct`: largest gap between the transcript start, valid segment/evidence anchors, and transcript end
- `valid_anchor_count`
- `invalid_anchor_count`

Use segment starts and valid evidence-window starts/ends as anchors. These are distribution warnings, not claims that the time between anchors is fully covered.

Required behavior:

- One segment near the end must not appear equivalent to many distributed watch points.
- A large uncovered middle region must remain a risk signal even when the final segment reaches the transcript end.
- Short videos must not be penalized solely because they have few segments.

### 2. Remove quota-like score pressure

Keep `segments_per_hour` and shard/transcript byte ratio only as diagnostic columns if useful, but remove them as primary score drivers.

Reasons:

- Segment count must arise from substantive content, not a target density.
- JSON byte size rewards verbose bodies, repeated paths, and metadata rather than learning value.
- Intentionally empty completed shards and short/non-substantive videos are valid outcomes.

If either metric remains in scoring, cap it as a weak tie-breaker and ensure it cannot independently produce a high route/tier.

### 3. Strengthen evidence and source-path signals

For each segment, cheaply validate:

- `sourcePath` is a nonblank string.
- Normalized `sourcePath` equals the manifest TXT path.
- Evidence is a nonempty array when required by current processing configuration.
- Every evidence object has a valid `start`, optional valid `end`, and nonblank `note`.
- Evidence start/end order and transcript bounds are valid.

Expose counts rather than only a single missing-evidence count:

- `missing_source_path_segments`
- `wrong_source_path_segments`
- `missing_evidence_segments`
- `invalid_evidence_segments`

Structural evidence defects should normally route to `repair_required`; mere thinness can remain a review signal.

### 4. Improve inexpensive Q&A signals

- Load explicit Q&A title markers and video-type rules from `src/derived/site-content-processing.config.json` rather than maintaining a separate incomplete list.
- Normalize common equivalents including `Q&A`, `Q & A`, `Q/A`, `Q and A`, `Questions Answered`, and `Question and Answer`.
- Treat configured Bruships/exhaustive-live-Q&A video types as Q&A-expected.
- Validate that every `kind: qa` segment includes nonblank `question` and `answerShort` fields plus a valid timestamp/evidence window.
- Continue to flag Q&A-expected videos with zero valid Q&A records.
- Add Q&A temporal-bin diagnostics so one early Q&A record does not look like distributed Q&A coverage.

Do not estimate the number of omitted questions from transcript text; that is out of scope.

### 5. Use processing state as routing data, not pseudo-probability

- `needsFurtherProcessing=yes` places a structurally valid shard in `follow_up_required` regardless of heuristic score.
- `needsFurtherProcessing=no` does not suppress structural errors.
- An intentional empty shard with latest state `no` and valid schema remains `low_signal` unless another deterministic problem exists.
- `unknown` remains explicit and may add a modest review signal, but it must not be treated as equivalent to `yes`.

## Phase 3: Apply Intent-Matching Names

After behavior and tests are stable:

1. Rename the package task, source module, script, test, task-specific tsconfig, report path, interfaces, functions, columns, summary text, and help text.
2. Update tracked references found by repository-wide exact-name searches, including `.agents/skills/naval-site-build-repair/SKILL.md` if it still references the old probabilities report.
3. Remove the old generated report when the new report replaces it, provided Git status confirms that removal does not discard unrelated user work.
4. Do not retain `probability`, `accuracy`, or `coverage` terminology for outputs that are only heuristic risk or timestamp-position signals.
5. Add a one-line report comment or sidecar metadata only if the TSV's consumers can tolerate it; otherwise keep the TSV strictly tabular and put the non-probability disclaimer in CLI help and repository documentation.

## Test Plan

### Processing-log unit tests

- Canonical five-field semicolon header and valid `yes`/`no` rows.
- Repeated shard rows use the last physical valid row.
- Equal or out-of-order local timestamps do not defeat append-order precedence.
- Malformed field counts, invalid timestamps, invalid states, missing notes, and unmapped shard paths are counted and reported.
- A tab-format legacy row is not silently accepted as canonical input.

### CLI integration test

Use a temporary manifest, transcript directory, shard directory, processing log, and output path. Assert that:

- Canonical `yes` and `no` states reach the TSV.
- Output routes sort correctly.
- Malformed shards become `repair_required` rows without aborting all other rows.
- The default/explicit output contains the renamed headers and no probability terminology.

### Structural and evidence tests

- JSON `null`, array root, missing/wrong schema version, missing video ID, and non-array `segments`.
- Wrong shard filename, orphan shard, duplicate manifest stem/video ID, and shard/manifest ID mismatch.
- Blank and wrong source paths.
- `evidence: [{}]`, blank note, invalid timestamps, end-before-start, and out-of-range evidence.
- Invalid segment timestamps, including minute/second values above 59.

### Risk-signal tests

- One short segment at the end of a long transcript does not look fully distributed.
- Distributed anchors cover more temporal bins than a clustered set with the same count.
- Large internal gaps remain visible when the last segment reaches the end.
- Short videos and intentional empty completed shards are not penalized by a numeric segment quota.
- `Q/A` and other configured variants trigger Q&A expectation.
- Invalid Q&A records do not satisfy Q&A presence.
- Explicit `yes`, explicit `no`, and `unknown` processing states route as specified.
- Route precedence beats risk score; ties remain deterministic.

### Naming regression tests

- TSV headers contain `audit_risk_score`, `risk_tier`, `audit_route`, and `last_segment_position_pct`.
- CLI help contains the metadata-only/non-probability disclaimer.
- Repository search finds no unintended `auditProbability`, `audit_probability_pct`, or probabilities-report references after the rename.

## Validation Commands

Run only after implementation:

```powershell
C:\Program Files\nodejs\npm.cmd run check:types
C:\Program Files\nodejs\npm.cmd test
C:\Program Files\nodejs\npm.cmd run rank:video-segment-audit-risk -- --output .tmp/video-segment-audit-risk.tsv
git diff --check
```

Also inspect the temporary TSV to confirm:

- Mapped canonical log entries are no longer all `unknown`.
- Every valid latest `yes` row is routed to `follow_up_required`, unless it has a superseding repair issue.
- Intentional empty shards with valid latest `no` states are not elevated solely for being empty.
- Structural failures are separated from heuristic review candidates.
- No output column or help text calls the score a probability or the last timestamp coverage.

Do not run `generate:site-data`, `site:check`, `site:build`, Pagefind, or transcript-content audits unless implementation unexpectedly touches their owned inputs.

## Expected Files

Likely additions or edits:

- `package.json`
- `tsconfig.video-segment-audit.json` renamed to `tsconfig.video-segment-audit-risk.json`
- `src/scripts/analyze-video-segment-audit.ts` renamed to `src/scripts/rank-video-segment-audit-risk.ts`
- `src/content/video-segment-audit-analysis.ts` renamed to `src/content/video-segment-audit-risk.ts`
- `src/content/video-segment-audit-analysis.test.ts` renamed/expanded
- A shared processing-log parser and its tests under `src/content/`
- Narrow processing-log consumer changes in `src/content/site-content-audit.ts` and its tests, if needed to share the canonical parser
- `reports/video-segment-audit-probabilities.tsv` replaced by `reports/video-segment-audit-risk.tsv`
- Tracked help/skill references discovered by exact-name search

Do not edit unrelated dirty shards or the active processing log.

## Definition of Done

- The canonical semicolon log is parsed correctly and current mapped states reach the report.
- Malformed shards are identified as repair work rather than silently treated as empty content.
- Structural repair, explicit follow-up, heuristic review, and low-signal rows are separate routes.
- The ranking uses inexpensive temporal distribution, evidence validity, configured Q&A signals, and processing state without reading transcript text.
- Fixed segment-density and byte-ratio thresholds no longer dominate ranking.
- Public names describe risk ranking rather than probability, accuracy, or completeness.
- Unit and CLI integration tests cover the former log-schema failure and the added low-cost signals.
- Only scoped tooling, tests, report naming, and directly affected references change.

