# `needsFurtherProcessing` Removal and Video Segment Audit Risk Reassessment Plan

Status: planning only. This file records the investigated implementation plan; it does not authorize implementation.

## Objective and decision summary

Remove `needsFurtherProcessing` from the canonical processing log and every active consumer, then revise the video-segment audit report after that state is gone.

The report's confirmed repository purpose is a fast, metadata-based work queue used by the repository owner to choose shard repairs and follow-up content audits. Its target should be stated as:

> Put deterministic integrity repairs first, then prioritize existing non-SASC shards that have current, pre-audit evidence of likely benefit from another substantive transcript-backed audit.

The score remains an uncalibrated prioritization heuristic. It cannot prove semantic incompleteness. Git outcomes are offline validation evidence rather than production score inputs.

The evidence supports these decisions:

- Remove all state-based completion, routing, Q&A suppression, score weighting, and sorting.
- Preserve hard structural, transcript, timestamp, source-path, evidence, and malformed-Q&A defects as the highest-priority `repair_required` route.
- Delete the three-pass 80% score reduction and the hard fewer-than-three/three-plus rank partition. Keep processing-log count as audit-opportunity context and, after equal actual risk evidence, a deterministic tie-break.
- Remove absolute gap minutes, temporal-bin deficit, and Q&A dispersion from the numeric score. They add little top-set separation in the present corpus, and absolute gap disproportionately favors long/game-stream videos. Keep their raw report columns as reviewer diagnostics.
- Use one capped, scale-independent relative anchor-gap component as the numeric `Audit Risk Score` for scorable nonempty shards.
- Keep only narrow categorical review cues: an empty shard with zero or one recorded pass, and an explicit-Q&A-title shard with transcript content but missing or extremely clustered valid Q&A. Do not score the broader configured-video-type Q&A expectation until it has better outcome evidence.
- Keep `manual audio review remaining` as the final TSV column and display-only operational information. It must be absent from every route, score, tier, and sort decision.
- Leave game streams unchanged in production scoring. The repository evidence provides no basis for a game-specific penalty or bonus.
- Leave video publication age and inferred processing generation out of production scoring. Cohort effects exist, but the available dates and free-text generation labels are confounded and selection-biased.
- Replace processing-log-based backlog completion with canonical shard presence from `seed.videos`, which includes intentionally empty shards.
- Remove the obsolete six-column tab-log path in the transcript-schedule artifact auditor. No committed second log contract or lane log supports retaining it.

## Evidence labels

This plan uses three labels so implementation decisions are not confused with open questions:

- **Confirmed behavior** means current source, data, tests, or documentation directly establishes the fact.
- **Evidence-supported conclusion** means repository data and classified history support the proposed behavior, with stated limitations.
- **Unresolved uncertainty** means the available repository evidence is too confounded or sparse for a production rule; the plan chooses the least-assumptive behavior.

## Confirmed current repository behavior

### Canonical processing-log contract

`src/derived/site-content-processing.log` currently has the exact header:

```text
timestamp;shardPath;result;needsFurtherProcessing;notes
```

At the 2026-08-12 investigation snapshot, it contains 6,324 data rows for 2,147 unique shards. There are 5,559 historical `no` rows and 765 historical `yes` rows. Latest-state cardinality is 2,145 `no` and 2 `yes`, so current state has almost no cross-corpus ranking resolution. Migration checks must use the implementation-time pre-migration count if legitimate rows are appended after this plan.

Pass counts per shard are:

| Recorded passes | Shards |
| ---: | ---: |
| 1 | 71 |
| 2 | 97 |
| 3 | 1,869 |
| 4 | 99 |
| 5 | 10 |
| 6 | 1 |

The exact header and state enum are owned by `src/content/schemas/site-content-processing-log.ts`. `src/content/site-content-processing-log.ts` parses five fields, derives manifest identity, returns latest maps, and deliberately treats the last physical row as latest. Its tests establish append-order precedence and reject a legacy tab row.

At least one historical row, physical line 3,485, contains an additional semicolon inside `notes`. The current reader preserves it because it splits only the first four delimiters. The four-field migration must split only the first three delimiters and preserve the entire remaining notes string. A general `line.split(";")` migration would corrupt canonical history.

### Active downstream state dependencies

The field currently affects more than the risk report:

- `src/content/site-content-audit.ts` treats latest `no` as completion, excludes those video IDs from the uncurated backlog, exposes `completedProcessingLogVideoCount`, and renders a completed-log statistic.
- `src/scripts/audit-site-content.ts` prints `completed-log-videos`.
- `src/content/site-content-processing-log.ts` exposes `latestByVideoId` and a parsed-record `videoId` primarily to support that completion behavior.
- `src/derived/site-content-processing.config.json` and `src/content/schemas/site-content-processing-config.ts` retain required `defaultNeedsFurtherProcessing` configuration even though no runtime code reads the property.
- `src/pipeline/transcript-schedule-audit.ts` independently parses a six-column tab-separated log while its default path points at the canonical semicolon log. The parser ignores column five and therefore ignores every current canonical row. Its test preserves the obsolete shape even though the canonical parser test rejects it.
- Schemas, fixtures, source tests, report tests, README guidance, repository guidance, curator/auditor briefs, and two shard-processing skills describe the five-field state contract.

`loadCuratedArchiveSeed` already returns one `seed.videos` item per canonical shard, including empty shards. Canonical shard presence is therefore sufficient to distinguish a stored transcript with no shard from an intentionally empty shard. Processing state is unnecessary for backlog membership.

No committed schedule or lane-private processing log uses the six-column tab contract. The active code and tests are internally inconsistent rather than evidence of two supported formats.

### Current report inputs and formula

`src/content/video-segment-audit-risk.ts` currently accepts:

- hard structural issues;
- latest processing state;
- process-log entry count;
- manual-audio flag;
- transcript and shard sizes;
- transcript interval and duration;
- segment, timestamp, source-path, evidence, and Q&A data;
- configured Q&A expectation.

Transcript/shard sizes, their ratio, segment count, segments per hour, first/last positions, raw bin counts, raw gaps, and anchor counts are displayed diagnostics. The active numeric metadata formula uses four normalized components:

```text
metadata risk =
    relative anchor-gap risk * 0.40
  + absolute gap-minutes risk * 0.35
  + temporal-bin deficit * 0.15
  + Q&A dispersion risk * 0.10
```

Duration confidence suppresses sparse-anchor risk for clips under roughly 30 minutes. The combined metadata value is then multiplied by `0.2` when either `processLogEntries >= 3` or manual audio remains.

The route bands are:

- `repair_required`: 85-99;
- `follow_up_required`: 65-84.9;
- `review_candidate`: 35-64.9;
- `low_signal`: 5-24.9.

Processing state and the manual-audio/three-pass suppression decide whether `follow_up_required` is reachable. Latest `no` also suppresses generic configured-Q&A absence and allows an empty shard to be treated as intentionally complete.

Current rank order is:

1. route;
2. a hidden deprioritization group based on manual audio, three-plus passes, and completed-empty state;
3. descending rounded score;
4. video title;
5. video ID.

The normal TSV omits route, tier, state, and risk signals even though hidden route and deprioritization groups control Rank.

### Current report distribution and dominance

The current ignored, on-demand `reports/video-segment-audit-risk.tsv` has 2,136 rows and 20 columns. Eleven SASC shards are excluded. All 2,136 rows are effectively `low_signal`; scores range from 5.0 to 7.7 over only 22 values.

- 69.8% score at most 5.2.
- 84.4% score at most 5.3.
- 98.9% score at most 6.0.
- The largest ties are 563 rows at 5.2, 551 at 5.1, and 377 at 5.0.
- All 2,136 displayed manual-audio values are `false`.

Rank is partitioned into hard blocks:

- ranks 1-115: nonempty shards with fewer than three log entries;
- ranks 116-2,088: nonempty shards with three or more entries;
- ranks 2,089-2,136: all 48 empty shards.

The 7.7-score row is rank 116, behind every lower-scored nonempty row with fewer than three passes. Rank therefore does not presently represent descending Audit Risk Score.

### Manual-audio coupling

`manualAudioReviewRemaining` currently changes route, score, and rank. It joins the three-pass condition in `textAuditDeprioritized`, suppresses `follow_up_required`, applies the 80% metadata reduction, and changes the secondary sort group. Unit and CLI tests explicitly assert this behavior.

The current detector also requires latest state `yes` and recognizes only two phrases. It misses both currently unresolved latest records:

- `OkYKTLkqWlo`: `manual audio needed ...`;
- `4ouWdWdJth8`: `needs audiovisual recovery`.

Historical records also use `manual audio review remains` and `still needs manual audio review`.

### Current missing values

The present report has no missing transcript-byte or duration values. Missing or empty transcript input is already a hard repair issue. Missing duration currently causes continuous metadata risk to return zero, silently making the unscorable content look low-risk. All 48 empty shards have blank temporal diagnostics and score exactly 5.0.

## Historical evidence and limitations

### Predictive value of processing state and pass count

A conservative result-text classifier separated substantive additions/splits/expansions/recoveries from explicit unchanged, empty, taxonomy-only, boundary-only, and unclear results. The classifier is supporting evidence; heterogeneous prose and selected follow-up audits prevent probability claims.

- Of 1,507 initially `no` shards that later received an audit opportunity, 1,285 (85.3%) later received content-like additions.
- At the immediately following pass, 1,190/1,507 initial `no` shards (79.0%) and 559/569 initial `yes` shards (98.2%) received content-like work.
- Among 63 shards initially closed as empty/no-usable with `no`, 55 remained empty and 8 became nonempty. One-pass empty closure had a 12.7% miss rate in this selected revisited cohort.
- Content-like outcomes were found in 84.2% of second passes, 69.2% of third passes, and 89.1% of selectively assigned fourth passes.

The results support removal of the state. A historical `yes` was a useful positive cue, while `no` had poor negative predictive value. The fourth-pass yield and concrete cases reject a sharp three-pass saturation threshold. Pass count describes opportunity; it is not a calibrated probability of future value.

### False negatives

Representative low-priority/completed cases that later yielded substantive value include:

- The initially empty `four-random-books-memberships-and-the-seapower-of-castles` shard later recovered a transcript-backed sea-power/castles watch point.
- `dreadnoughts-from-around-the-world-1905-14-1915` was logged complete at eight segments, then grew to nine and later fifteen segments with major prose expansion.
- `the-imperium-of-man-at-some-point-i-will-figure-this-game-out` was logged empty after a claimed full 2h29m review, then grew from 0 to 7 to 9 historically useful strategy-game watch points.
- `empire-total-war-twitch-stream-1-february-2023` reached the current three-pass downweight at 13 segments, then a fourth audit expanded it to 17 segments and strengthened five existing records.
- Current rank 2,068, `where-has-britains-royal-navy-gone`, scored 5.0 before a fourth pass added 13 watch points and strengthened 11 records.

These examples show why completion state, one-pass emptiness, and a three-pass cutoff should not be negative risk evidence.

### False positives

Representative high-priority cases with little later value include:

- Current ranks 1 and 2 each have two passes and score 6.0, yet their latest August 12 audits were unchanged/saturated with no shard diff.
- Current rank 12 is a seven-minute OBS test with one useful segment; its log reports no other substantive historical content.
- A short `when-a-q-turret-goes-up` transcript once received the state-driven follow-up route even though the later audit was unchanged and the short transcript was already covered.

Fewer than three passes is an opportunity indicator. It is too coarse to override stronger current-content evidence.

### Processing generation, age, and selection bias

2,132 of 2,147 shards received their first log row by 2026-07-19. Video publication date therefore does not represent shard age. Initial-state usage and later content-like outcomes vary sharply by first-processing cohort, and recognizable early generation groups had especially high second- and third-pass yields.

The cohort signal is confounded by model/effort, content mix, video duration, schedule selection, and changing audit methods. The log does not store stable model/effort or pipeline-version metadata. Free-text inference from `result` would be fragile and would create a new hidden state. First-processing date is suitable for temporary validation strata only. No publication-date or processing-date cutoff belongs in production scoring from the current evidence.

Absence of corrective history must be described as insufficient outcome evidence when the shard lacks comparable later audit opportunity.

### Git-history classification

Applicable scoring history shows that the present formulas were implementation choices rather than calibrated results:

| Commit | Date | Relevant change |
| --- | --- | --- |
| `734c99df` | 2026-07-12 | Introduced the repaired risk model and canonical log consumption. |
| `58080271` | 2026-07-13 | Added process-log count as a display-only diagnostic. |
| `96478a99` | 2026-07-16 | Added continuous metadata scoring; its test explicitly kept pass count out of the grade. |
| `b182bb78` | 2026-07-17 | Added the three-pass/manual-audio route suppression, 80% score reduction, and rank group. |
| `e49d9226` | 2026-07-19 | Added completed-empty bottom sorting. |
| `65832024` | 2026-07-27 | Removed route, tier, title, state, and diagnostic fields from the TSV while retaining their hidden ranking effects. |
| `0a8f1b55` | 2026-08-08 | Formatting/logging cleanup without material score change. |

Mechanical history must be excluded from audit outcomes:

| Commit(s) | Classification |
| --- | --- |
| `992c0b0a` | Rewrote 851 legacy tab log rows to the semicolon schema. |
| `d64d9d03` | Pure rename of 638 shard files to transcript-stem names. |
| `247e8155` | Pure rename of 602 transcript/shard artifacts to corrected canonical times. |
| `5d35b500` | Bulk timestamp and `sourcePath` migration across 587 shards. |
| `99648a3d`, `72bc0d46`, `40210e28`, `26b5319a`, `cd349ff2`, `0f5588bd`, `5d9e6ed4` | Corpus-wide topic normalization. |
| `d224233d` | Broad schema migration across roughly 2,138 shards; mixed content requires per-file classification. |
| `d7646d53`, `b2fbfae7` | Mixed bulk normalization/content work requiring per-diff classification. |

Raw commit count, blame ownership, and changed-line volume are unsuitable score inputs. Bulk renames can make `git log --follow` cross unrelated empty or near-identical files. Historical identity should use manifest `videoId`, explicit rename commits, and parsed JSON.

For temporary backtesting, classify semantic JSON changes into:

1. substantive segment addition/removal/split and public-text recovery;
2. segment-boundary or transcript-evidence correction;
3. other metadata correction;
4. topic-only change;
5. formatting/key-order-only change;
6. rename/move;
7. schema migration or generated-file maintenance;
8. no-op/unchanged.

Magnitude support should use segment-count change and normalized public-field text change, with sampled diffs for confirmation. Those outcome metrics remain offline evidence. They must never become production inputs, because they occur after the ranking snapshot and would leak the outcome.

### Source-video dependence

The canonical corpus has 2,147 shards and 2,147 unique `videoId` values. Multiple current authored shards per source video do not exist. Historical rename paths, series-level processing waves, and bulk commits still create correlated observations; those groups should not be treated as independent outcome samples.

### Game-stream investigation

`src/channel/video-metadata.json` provides a repository-owned identifier: official YouTube `snippet.categoryId === "20"`. There are 83 such report rows; 81 are at least 30 minutes and form a practical analysis cohort. Title and authored-topic cohorts can be used as sensitivity checks, but current authored topics and content are post-audit and therefore unsuitable production predictors.

For the 81 long-form official gaming-category rows versus the other report rows:

| Current median | Game streams | Others |
| --- | ---: | ---: |
| Duration | 171.0 min | 64.3 min |
| Segments | 21 | 21 |
| Segments/hour | 7.71 | 19.94 |
| Shard/transcript ratio | 0.479 | 0.616 |
| Body words | 1,844 | 1,979 |
| Body words/hour | 662 | 1,802 |

Absolute historical-content volume is comparable even though density per hour is lower. All 81 had a content-like second pass, 73/81 had a content-like third pass, and five of the six fourth passes were substantive. Series correlation and selected audit schedules reduce the effective sample size, but the evidence clearly fails to support a game-stream penalty.

Long duration inflates the current absolute-gap component: game rows are overrepresented immediately after the three-pass boundary, and the 9h10m World of Warships collaboration has the current maximum score. Removing absolute gap from the score addresses the generic duration effect without adding content-type logic.

**Evidence-supported conclusion:** keep game-stream category, title, topic, and series identity out of route, score, and sort. Continue to score the same current evidence for all content types.

## Signal-by-signal decision

| Current input or behavior | Intended meaning | Evidence and overlap | Planned treatment |
| --- | --- | --- | --- |
| Hard structural/transcript/evidence issues | Confirmed repair need | Deterministic current defect rather than historical prediction | Retain as highest-priority `repair_required` route. |
| `needsFurtherProcessing` | Human completion/follow-up state | Latest values are almost uniform; `no` has poor negative predictive value | Remove from schema, data, types, routing, score, sorting, docs, and tests. |
| `processLogEntries >= 3` | Prior audit opportunity/saturation | Current threshold controls Rank; later third/fourth passes remain productive | Remove the multiplier and hard rank group. Keep count in TSV and use fewer passes only after equal risk evidence. Use zero/one pass to flag an empty shard with insufficient independent review. |
| Manual-audio flag | Operational A/V follow-up | Orthogonal to text-content audit; current coupling violates the requirement | Keep display-only, derive from latest result/notes, put last, and prove invariance. |
| Relative anchor gap | Scale-independent temporal sparsity | Active for 1,671 rows; avoids direct duration reward | Retain as the sole continuous score component, capped and duration-confident. |
| Absolute gap minutes | Long unanchored interval | Overlaps duration and other coverage signals; inflates long/game rows; removing it leaves current top 100 unchanged | Remove from score; retain raw diagnostic column. |
| Temporal-bin deficit | Distributed anchors | Nonzero for only 55 rows, never dominant, and removing it leaves top 100 unchanged | Remove from score; retain raw diagnostic column. |
| Q&A dispersion numeric weight | Distributed Q&A | Nonzero for 25 rows, dominant once, and removing it leaves top 100 unchanged | Remove from numeric score; retain Q&A counts/bins and narrow explicit-title categorical cues. |
| Configured-video-type Q&A absence | Broad Q&A expectation | Current expected-zero examples are short announcements, trailers, setup failures, or fully reviewed non-Q&A transcripts | Keep as optional risk-signal/debug context only; do not route or score it. |
| Explicit-title Q&A absence/dispersion | Strong title-level review cue | Repository policy makes exhaustive Q&A material important, while short empty startup videos are known false positives | Route a nonempty explicit-title shard with zero valid Q&A, or a long explicit-title shard with Q&A confined to one bin, to `review_candidate`. Empty cases follow the audit-opportunity rule. |
| Empty shard plus latest `no` | Intentional completion | 8/63 selected one-pass empty closures later became nonempty | Remove state interpretation and hard bottom group. Route an empty zero/one-pass shard for review; repeated empties retain blank score and explicit low-signal semantics without permanent completion claims. |
| Transcript/shard bytes and ratio | Size/context | Current size is post-audit in historical analysis and rewards volume | Keep display-only. |
| Segment count and segments/hour | Content volume/density | Repository policy rejects numeric segment quotas; game streams show similar absolute volume with lower hourly density | Keep display-only. |
| Duration | Normalization and score availability | Long duration creates more edit opportunity and absolute-gap inflation | Use only for relative-gap duration confidence and missing-data validation. Do not score duration itself. |
| First/last positions, bins, absolute gap, anchors | Explainability diagnostics | Helpful for human inspection; several overlap as score inputs | Keep display-only. |
| Video age / first-processing date | Possible generation proxy | Real cohort differences, strong confounding, narrow processing window | Use only in temporary validation strata. |
| Git corrections/results | Later outcome | Valid backtest labels that occur after the prediction point | Use only in offline validation, never production scoring. |
| Game category/type | Possible content-density difference | Comparable absolute content and high later audit yield; correlated samples | Leave unchanged and out of production scoring. |
| SASC exclusion | Existing report population boundary | Scope filter rather than risk evidence; this investigation found no reason to alter it | Retain unchanged. |

## Proposed report model

### Routes

Reduce the route type to:

1. `repair_required`: any confirmed structural, identity, transcript, timestamp, source-path, evidence, malformed-Q&A, or required-duration defect.
2. `review_candidate`: no repair defect, plus either:
   - zero segments and at most one processing-log entry;
   - a nonempty shard whose title explicitly promises Q&A and has zero valid Q&A records;
   - an explicit-title Q&A video at least 60 minutes long whose valid Q&A records occupy at most one temporal bin.
3. `low_signal`: every other structurally valid row.

Delete `follow_up_required`, its CLI count/help text, its score band, and the now-unreachable `high` risk tier. Prefer removing the internal `RiskTier` abstraction entirely because it is absent from the TSV and adds no information beyond route and score.

Remove the current temporal-gap and low-bin warning-to-route jumps. They duplicate the continuous temporal score and create arbitrary large band changes from small threshold changes.

### Audit Risk Score

For a structurally valid, nonempty row with a usable transcript interval and at least one valid anchor, calculate only the current relative-gap component:

```text
duration confidence = clamp((duration minutes - 5) / 25, 0, 1)
relative gap index =
  clamp((largest anchor gap pct - 5) / 45, 0, 1)
  * duration confidence
Audit Risk Score = round(relative gap index * 100, 1)
```

This is a capped 0-100 heuristic index, not a probability or completeness percentage. Multiplying by 100 improves human-readable separation without changing order. Preserve the existing five-minute onset, thirty-minute full-confidence point, and 50% full-gap point in the first revision because the repository has insufficient snapshot evidence to justify replacement thresholds. Revisit them only after prospective outcomes exist.

Set the score to blank/undefined when it cannot be calculated. Do not substitute zero. Specific handling is:

- missing or empty canonical transcript: `repair_required`, blank score;
- missing/unusable duration for a nonempty shard: `repair_required`, blank score;
- invalid/missing anchors caused by malformed segments/evidence: `repair_required`, blank score when distribution is unavailable;
- empty shard with zero/one pass: `review_candidate`, blank score;
- empty shard with two or more passes: `low_signal`, blank score, fewer passes first only as a tie-break.

The projected relative-gap distribution over the current 2,088 scorable rows is approximately: p25 1.3, median 6.4, p75 12.2, p90 18.0, p99 36.0, maximum 81.6. It has materially more useful separation than the current 5.0-7.7 output and removes the long-video absolute-gap advantage. The 48 current empty rows remain explicitly unscored.

### Rank

Rank deterministically by:

1. route order: repair, review, low signal;
2. defined Audit Risk Score before blank score, then score descending;
3. fewer processing-log entries after equal score, as audit-opportunity context;
4. manifest-owned `fileStem` ascending as the final unique deterministic key.

Remove `auditDeprioritizationOrder`, `HEAVILY_REVIEWED_PASS_THRESHOLD`, and `DEPRIORITIZED_TEXT_AUDIT_METADATA_WEIGHT`.

For `repair_required` rows, a blank score is expected when inputs are corrupt. Route precedence remains sufficient; use `fileStem` for deterministic repair ties rather than inventing a severity weight. If a repair row has a calculable score, route still governs work order and the score only orders equally routed rows.

This makes pass count subordinate to current risk evidence. A three- or four-pass shard with a larger relative gap can outrank a two-pass shard with weaker evidence. Equal-risk shards with less audit opportunity come first. Git history, age, game identity, and manual audio never enter the comparator.

### TSV and explainability

Keep the report compact while making the controlling route visible:

- retain the existing human-readable diagnostic columns;
- add `audit route` immediately after `audit risk score` so route precedence is visible rather than hidden;
- keep `process log entries` as opportunity context;
- retain absolute gap minutes, temporal bins, Q&A counts/bins, byte sizes, ratios, density, positions, and anchor count as display-only fields;
- move `manual audio review remaining` to the final header and final value position;
- omit tier and full `riskSignals` from the normal TSV;
- use internal `riskSignals`, targeted tests, and temporary analysis output for detailed explanations.

Update CLI help to explain the route order, the single score component, blank-score behavior, diagnostic-only fields, and the metadata-only limitation.

### Manual-audio derivation and invariance

Keep `manualAudioReviewRemaining` in the input/row/display model, but reference it only when constructing the returned display row and TSV cell.

Derive it from the latest canonical record's `result` plus `notes`, independent of removed state. Recognize the unresolved phrases already present in repository history:

- `manual audio review remains`;
- `still needs manual audio review`;
- `manual audio needed`;
- `needs audiovisual recovery`.

Keep matching deliberately narrow and add negative cases such as `manual audio review completed` so completed work does not display as remaining. This text detection is operational display logic, not a content-risk feature.

Add two invariance tests:

1. Identical analysis input with only the manual boolean toggled must have identical route, score, and every non-display risk field.
2. Identical collections with the manual boolean toggled for one or all rows must produce the same ordered video/file-stem sequence and assigned ranks.

The CLI integration test must also assert that the manual column is last and that the current latest wording variants display correctly without changing rank.

## Implementation sequence and file-level changes

The log contract and all strict consumers form one atomic source change. The report work follows after the state-free parser and backlog semantics are established.

### Phase 1: Freeze migration invariants

Before modifying canonical data, use the existing parser and a temporary standard-library script under an ignored temporary directory to capture:

- exact header;
- 6,324 row count;
- 2,147 unique canonical shard paths;
- ordered tuples of `timestamp`, `shardPath`, `result`, and full `notes`;
- per-file-stem entry counts;
- latest physical record per file stem;
- count and identity of rows whose notes contain additional semicolons.

The temporary helper is validation scaffolding. Do not add a historical-analysis framework or shipped dependency.

### Phase 2: Migrate the canonical four-field contract atomically

Change the header to:

```text
timestamp;shardPath;result;notes
```

Update these files together:

- `src/derived/site-content-processing.log`
  - remove the fourth field from every implementation-time row (6,324 at this investigation snapshot);
  - preserve row order and every other field byte-for-value after parsing;
  - preserve semicolons already inside notes.
- `src/content/schemas/site-content-processing-log.ts`
  - change the exact header;
  - remove the state enum/property from the strict row schema.
- `src/content/site-content-processing-log.ts`
  - remove state from raw and parsed record types;
  - parse the first three delimiters and leave the notes remainder intact;
  - retain exact header validation, timestamp/path/result/notes validation, physical append-order latest semantics, problem reporting, and `latestByFileStem`;
  - remove parsed-record `videoId` and `latestByVideoId` after the backlog consumer is converted and an exact usage search confirms no consumer remains.
- `src/content/site-content-processing-log.test.ts`
  - replace five-field fixtures;
  - preserve last-physical-row and out-of-order timestamp coverage;
  - add/retain an explicit semicolon-in-notes regression for four fields;
  - continue to reject the obsolete tab shape.
- `src/content/schemas/schema.test.ts`
  - update header and row fixtures;
  - remove state assertions;
  - replace the unrelated strict-shard unknown-property fixture that currently uses `needsFurtherProcessing` with a generic unknown property so strict-object coverage remains.

After migration, compare the new parsed tuple list with the Phase 1 projection and require exact equality for all retained values. A row-count-only check is insufficient.

### Phase 3: Remove downstream completion semantics

Update `src/content/site-content-audit.ts` and `src/content/site-content-audit.test.ts`:

- keep processing-log parsing, malformed-row reporting, entry count, and referenced-shard existence validation;
- remove `completedVideoIds`, `completedProcessingLogVideoCount`, and latest-state logic;
- build a set from `input.seed.videos[].videoId` and define uncurated transcripts as manifest transcripts with no canonical seed video;
- continue using segment video IDs for the separate `videosWithSegmentsCount` statistic;
- test a valid empty canonical shard, a populated shard, a truly missing shard, duplicate/malformed data, and multiple log rows without completion interpretation.

Update `src/scripts/audit-site-content.ts` to remove `completed-log-videos` output. Update generated report wording in `src/content/site-content-audit.ts`; later regeneration of `reports/site-content-backlog.md` is validation only because reports are ignored.

Update `src/pipeline/transcript-schedule-audit.ts` and `src/pipeline/transcript-schedule-audit.test.ts`:

- delete the six-column tab parser;
- parse each supplied processing log as the canonical four-field contract, preferably through the shared parser rather than another delimiter implementation;
- preserve repeatable `--processing-log` only as repeatable canonical logs, parsing each header independently instead of concatenating multiple header-bearing texts;
- match a schedule entry to the manifest-derived canonical shard path and a log timestamp at or after the schedule timestamp;
- retain shard-existence checks and checked/in-progress issue semantics;
- cover fresh, stale, wrong-shard, malformed, notes-with-semicolon, multiple-canonical-log, and rejected-tab cases.

Do not add dual-schema compatibility unless a concrete external lane-log contract is supplied before implementation.

### Phase 4: Remove dead configuration and update log writers

Update:

- `src/derived/site-content-processing.config.json`;
- `src/content/schemas/site-content-processing-config.ts`;
- config fixtures in `src/content/schemas/schema.test.ts`, `src/content/site-content-audit.test.ts`, and `src/scripts/rank-video-segment-audit-risk.test.ts`.

Remove required `firstPass.defaultNeedsFurtherProcessing`. It has no runtime reader. Rephrase first-pass/live-stream guidance so each pass still performs exhaustive useful coverage and records unresolved transcript ranges, Q&A, audiovisual work, and limitations plainly in `result`, `notes`, and the handoff.

Update every active writer/contract document:

- `README.md`;
- `AGENTS.md`;
- `.agents/transcript-content-curator.md`;
- `.agents/skills/naval-transcript-to-site-content/SKILL.md`;
- `.agents/skills/naval-transcript-to-site-content/references/segment-seed-schema.md`;
- `.agents/skills/naval-site-content-auditor/SKILL.md`.

For both skills:

- require the exact four-field header;
- change the low-freedom PowerShell writer to `$fields = @($timestamp, $shardPath, $result, $notes)` and require four nonempty fields;
- remove state variable and enum checks;
- keep the 19-character local timestamp, append-at-physical-bottom, synchronization prerequisite, canonical shard path, nonempty fields, and no-new-semicolon/newline writer restrictions;
- change the split-count assertion and valid example to four fields;
- require unresolved coverage or audio ranges to be explicit in result/notes/handoff instead of encoding completion in a status field.

Do not edit old plans or investigation notes under `task-notes/`. They are historical records. `.agents/site-content-auditor.md` has only generic append guidance and needs no field-specific edit unless implementation-time exact search finds newly changed text. `.agents/skills/naval-site-build-repair/SKILL.md` already describes the risk report as a fast metadata prioritization aid and needs no semantic change.

Update `src/site/topic-normalization-guidance.test.ts` for the new README header while retaining the active `report:video-segment-audit-risk` command and on-demand report lifecycle assertions. Do not resurrect retired `rank:` commands or task-specific TypeScript configurations from historical plans. `package.json` keeps the current report command.

### Phase 5: Remove state from report generation

Update `src/scripts/rank-video-segment-audit-risk.ts`:

- stop importing/constructing `ProcessingState`;
- keep processing-log entry counts and latest record by file stem;
- remove unknown-state counts, state-derived route counts, and all five-field/state help text;
- derive manual audio from latest `result`/`notes` only;
- retain SASC exclusion and existing manifest/shard validation;
- treat missing duration for an otherwise canonical nonempty shard as a score-prerequisite repair issue;
- print the reduced route summary and explain the new score.

Update `src/content/video-segment-audit-risk.ts`:

- remove `ProcessingState` and state properties from input/row types;
- remove `follow_up_required`, state risk signals, generic-Q&A state suppression, completed-empty state logic, pass/manual score multiplier, and hidden deprioritization sort;
- remove the unreachable high tier or the entire unused tier model;
- calculate routes, relative-gap score, blank-score cases, and deterministic sorting as specified above;
- retain structural validators and raw diagnostic calculations;
- move manual audio to the final TSV cell;
- add `audit route` after score and preserve human-readable spaced headers.

Update `src/content/video-segment-audit-risk.test.ts`:

- delete state-routing, three-pass suppression, manual-audio deprioritization, and completed-state fixtures;
- add route tests for structural repair, one-pass empty review, repeatedly reviewed empty low-signal, explicit-title Q&A review, and configured-type display-only behavior;
- add exact relative-gap score tests at zero, partial, and capped values;
- add blank-score tests for empty and missing/unusable inputs;
- prove absolute gap, bin deficit, Q&A dispersion, size, count, game identity, and manual audio do not change the numeric score when relative gap and route cues are held fixed;
- prove score can outrank pass count and that pass count only resolves an equal-score tie;
- prove deterministic `fileStem` tie ordering;
- add both manual-audio invariance tests;
- assert `audit route` placement and manual audio as the final TSV header/value.

Update `src/scripts/rank-video-segment-audit-risk.test.ts`:

- use a four-field canonical log fixture, including notes with a semicolon;
- cover all unresolved manual-audio wording variants plus a completed negative case;
- update route/summary expectations and remove unknown/follow-up state assertions;
- assert report row order under route, score, opportunity tie, and file-stem tie rules;
- assert diagnostic-only columns remain unable to alter score/rank;
- retain SASC exclusion and malformed-shard isolation coverage.

### Phase 6: Documentation and lifecycle wording

Update README command/output descriptions so the report is described as ranking deterministic repairs and metadata-indicated substantive audit candidates. Clarify that:

- `reports/video-segment-audit-risk.tsv` is ignored, on-demand, and replaced by each run;
- it does not prove semantic completeness;
- the score is the relative-gap heuristic within a visible route;
- manual audio is operational display data only;
- site-content backlog means a manifest transcript with no canonical shard, rather than a video with zero segments.

Retain the current package command and generated-report ownership rules. No generated report or site archive becomes canonical source.

## Verification plan

### Contract and migration tests

Require all of the following:

- exact four-field header accepted;
- old five-field and legacy tab rows rejected;
- the implementation-time pre/post row and unique-shard counts preserved (6,324 and 2,147 at this investigation snapshot);
- every ordered `timestamp`, `shardPath`, `result`, and full `notes` value equals the pre-migration projection;
- semicolon-bearing historical notes survive exactly;
- last physical record per file stem remains identical;
- malformed timestamp/path/result/notes behavior remains explicit;
- active-source search outside `task-notes/**` finds no `needsFurtherProcessing`, `defaultNeedsFurtherProcessing`, five-field contract text, state enum, or state-driven route help.

### Backlog and schedule tests

Require:

- canonical empty shards excluded from the uncurated backlog through `seed.videos` presence;
- a manifest transcript with no shard included regardless of processing-log rows;
- completed-log count removed from API, CLI, and Markdown report;
- processing-log entries and missing referenced shards still validated;
- schedule artifact checks recognize fresh canonical four-field rows and reject stale/wrong/legacy rows.

### Score, rank, and missing-value tests

Require:

- hard defects always precede review and low-signal rows;
- relative-gap score matches the documented formula and caps;
- missing duration does not become numeric zero risk;
- empty rows have blank scores and explicit route behavior based on audit opportunity;
- a higher score outranks pass count inside the same route;
- equal scores use fewer passes, then file stem;
- ties are deterministic across repeated generation;
- toggling only manual audio leaves route, score, ordered IDs/stems, and ranks identical;
- manual audio is the final TSV column;
- configured-video-type, game category, video age, byte size, segment density, absolute gap, bin deficit, and later Git outcomes are absent from production scoring.

### Full-report before/after validation

Preserve the current ignored report in a temporary path, generate the revised report twice, and compare:

1. Both revised runs are byte-identical.
2. Row count remains at the implementation-time baseline (2,136 rows and 11 SASC exclusions at this investigation snapshot), unless an independently verified canonical corpus change explains a difference.
3. Rank is a complete unique sequence.
4. Manual-audio display recognizes the two currently unresolved latest records, while changing those booleans in an in-memory replay leaves the full rank sequence unchanged.
5. Score distribution is summarized by count, distinct values, blank count, min, quartiles, p90, p99, max, and largest tie. Avoid pinning current corpus values in unit tests.
6. Route counts and blank-score reasons are inspected.
7. The highest score no longer sits below every fewer-than-three-pass row solely because of pass count.

Run lightweight sensitivity checks in temporary analysis code:

- compare the proposed relative-gap ranking with removal of that component;
- perturb duration and largest-gap percentage within realistic small ranges and inspect top-20/top-50 stability;
- confirm changes around route rules are explainable categorical changes rather than hidden score jumps;
- compare current and proposed top-20/top-50 membership;
- stratify results by pass opportunity, first-processing cohort, and official gaming category for validation only.

Do not add ML, a persistent historical feature store, a statistics framework, or new metadata to make these checks permanent.

### Top/middle/bottom historical sampling

Inspect at least five rows from each region of both current and proposed ranks. Include:

- current ranks 1 and 2 unchanged/saturated cases;
- the 9h10m World of Warships maximum-score/pass-boundary case;
- a middle case with later substantive correction such as Kuznetsov;
- the low-ranked Royal Navy fourth-pass expansion;
- an initially empty recovered shard;
- a repeatedly confirmed empty short startup/announcement shard;
- the Empire Total War fourth-pass case;
- at least two official gaming-category rows and two comparable-duration non-game rows.

For each historical check, reconstruct the input snapshot immediately before the later audit outcome. Match by `videoId`, parse semantic JSON, and exclude mechanical changes. Record whether the outcome was unchanged, boundary/evidence repair, moderate content work, or substantial content work. Current post-audit shard size/text must not be used as a historical predictor.

The acceptance question is practical: does the proposed top group contain more plausible current repair/audit work without systematically burying known productive later-pass, empty-recovery, long-form, or game-stream cases? Document adverse examples rather than tuning a new special case around each one.

### Commands after implementation

Use focused Node tests first, then the canonical integration graph. Bun-reaching commands require the repository's fixed npm executable with first-attempt sandbox elevation under current repository guidance.

```powershell
node --import tsx --test src/content/site-content-processing-log.test.ts src/content/site-content-audit.test.ts src/pipeline/transcript-schedule-audit.test.ts src/content/video-segment-audit-risk.test.ts src/scripts/rank-video-segment-audit-risk.test.ts src/content/schemas/schema.test.ts src/site/topic-normalization-guidance.test.ts
C:\Program Files\nodejs\npm.cmd run check:types
C:\Program Files\nodejs\npm.cmd run report:video-segment-audit-risk -- --output .tmp/video-segment-audit-risk.tsv
C:\Program Files\nodejs\npm.cmd run audit:site-content
C:\Program Files\nodejs\npm.cmd test
C:\Program Files\nodejs\npm.cmd run check:source
```

The last two commands reach Bun through the test/source graph and should follow the documented elevation rule. A full Astro/Pagefind build is unnecessary because this change does not alter site routes, templates, or generated archive contracts. Escalate to the broader `check` graph only if source validation exposes an actual downstream site dependency.

`reports/video-segment-audit-risk.tsv`, `reports/site-content-backlog.md`, and generated archive data remain ignored validation outputs. Regenerate them for inspection; do not hand-edit or commit them.

## Expected implementation files

Canonical data and parser:

- `src/derived/site-content-processing.log`
- `src/content/schemas/site-content-processing-log.ts`
- `src/content/site-content-processing-log.ts`
- `src/content/site-content-processing-log.test.ts`
- `src/content/schemas/schema.test.ts`

Backlog, schedule, and configuration consumers:

- `src/content/site-content-audit.ts`
- `src/content/site-content-audit.test.ts`
- `src/scripts/audit-site-content.ts`
- `src/pipeline/transcript-schedule-audit.ts`
- `src/pipeline/transcript-schedule-audit.test.ts`
- `src/derived/site-content-processing.config.json`
- `src/content/schemas/site-content-processing-config.ts`

Risk model and report:

- `src/content/video-segment-audit-risk.ts`
- `src/content/video-segment-audit-risk.test.ts`
- `src/scripts/rank-video-segment-audit-risk.ts`
- `src/scripts/rank-video-segment-audit-risk.test.ts`

Active guidance and contract tests:

- `README.md`
- `AGENTS.md`
- `.agents/transcript-content-curator.md`
- `.agents/skills/naval-transcript-to-site-content/SKILL.md`
- `.agents/skills/naval-transcript-to-site-content/references/segment-seed-schema.md`
- `.agents/skills/naval-site-content-auditor/SKILL.md`
- `src/site/topic-normalization-guidance.test.ts`

Expected unchanged surfaces:

- `package.json` (`report:video-segment-audit-risk` remains canonical);
- `.agents/skills/naval-site-build-repair/SKILL.md` (its metadata-aid warning remains accurate);
- old files under `task-notes/`;
- transcript TXT, authored video-segment shards, `topics.json`, normalization policy, Astro/Pagefind source, and generated archive data.

## Unresolved uncertainty and least-assumptive choices

- The ignored report has no tracked historical snapshots. Historical ranking backtests require reconstruction and sampled semantic confirmation.
- Audit selection is highly non-random. Outcome rates describe selected shards, not a calibrated untouched population.
- Processing generation appears important, but no stable pipeline-version/model/effort field exists. Keep it out of production scoring.
- Result-text classification is heterogeneous. Use it to find cases, then validate selected cases with semantic diffs.
- Current shard size and text include later audit work. Keep them display-only and out of historical predictor inputs.
- Official gaming category identifies a useful cohort, but game series and processing batches are correlated. Leave scoring unchanged.
- Relative anchor gap is still a heuristic and cannot see semantic completeness. Retain it as the simplest pre-audit coverage signal, expose the route and diagnostics, and gather prospective outcomes before adding or retuning weights.
- Repeated empty shards are often genuine, yet some one-pass empty judgments failed. Use the narrow zero/one-pass review rule, blank score, and opportunity tie-break instead of a permanent completed-empty status.
- Explicit Q&A titles are stronger than broad video-type inference, while short failed starts can still carry Q&A titles. Require nonempty content for the explicit zero-Q&A review cue and let empty cases follow the opportunity rule.

## Definition of done

- The canonical processing log has four fields and every retained historical value is migration-verified.
- No active source, schema, fixture, writer, help text, or guidance outside historical `task-notes/**` depends on `needsFurtherProcessing`.
- Site-content backlog membership uses canonical shard presence and handles empty shards without a completion state.
- Transcript-schedule artifact checks consume the actual canonical log contract and no unsupported tab compatibility remains.
- The report has three visible routes, one relative-gap score component, explicit missing-value behavior, and deterministic rank ordering.
- Three-pass history cannot suppress score or override stronger risk evidence.
- Absolute gap, bin deficit, Q&A dispersion, sizes, density, age, processing cohort, game identity, Git outcomes, and manual audio do not affect Audit Risk Score.
- Manual audio cannot affect route or Rank, appears as the final TSV column, and recognizes current unresolved wording.
- Game streams receive the same scoring rules as every other content type.
- Focused tests, type checks, canonical tests/source validation, deterministic regeneration, distribution review, sensitivity checks, and top/middle/bottom historical samples pass.
- Implementation stays inside the listed contracts, consumers, tests, and guidance, with no unrelated shard, site, taxonomy, or generated-data redesign.
