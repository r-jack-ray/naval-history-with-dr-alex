# Audit-risk report revision

The report now orders concrete repair and Q&A cues, followed by measured gaps between authored evidence ranges. It no longer emits an Audit Risk Score or uses processing-log counts to rank ties. Empty segment arrays are excluded regardless of processing history. Subsequent edits moved `audit route` to the final column and removed the `risk signals` and `manual audio review remaining` columns.

## Evidence for removing the old assumptions

The September 5 log snapshot inspected during this task contained 93 outcomes: 79 explicitly reported additions or growth, 12 revised existing records without additions, and 2 confirmed intentionally empty shards. The 79 addition outcomes followed four prior log entries in 41 cases, five in 32 cases, and six in 6 cases. Eleven followed earlier explicit saturation claims. Representative processing-log line pairs were 6583 to 9499 (+9 records), 6483 to 9516 (+12), 7074 to 9534 (+13), and 6461 to 9574 (+66, with synchronization still blocked).

These are descriptive counts from selected work, not a representative sample of audit opportunities. Revisions can add substance at the same segment count, and failed synchronization does not erase content improvements. No inspected log row explicitly named GPT-6, Astra, or Ultra; that runtime context came from the user. These limitations prevent a defensible per-pass or per-model probability estimate. The former implementation already lacked a pass-count probability formula, but retained an empty-shard routing threshold and a log-count tie-break. Both are removed.

## Small checks that informed the change

These checks compared short canonical TXT excerpts with nearby authored segments and the processing history. They were not full audits and did not modify content.

| Video ID | Check | Implication |
| --- | --- | --- |
| `NIpZjYf3r9c` | The former 10.6-minute anchor gap was the interior of evidence spanning 15:16-25:52. The 19:29-24:03 sample discussed destroyer closing tactics already represented by that segment. | Merge evidence intervals. The new largest gap is about 0.8 minutes. |
| `Y02aQUnLx14` | The 8:01-14:05 sample inside a 20-minute leading gap contains woodworking and music. Earlier log line 8954 identifies nonhistorical material; latest line 9333 strengthens the one substantive aside. | A real gap can be deliberately excluded material. Show outcome notes beside the gap. |
| `FtXHhfiu598` | The 4:59-7:15 sample within the 2:01-10:50 gap concerns travel costs, credit cards, and channel support. Latest log line 7898 explicitly excludes personal funding discussion. | Gap length is not expected audit yield. |
| `4qfsJFvFQSY` | The new 1:41:57-3:22:27 gap is geometrically real. A 2:29:02-2:31:40 sample contains multiplayer selection and banter despite historical ship and battle names. | Do not invent a semantic keyword filter. Read the latest notes and check the actual passage before commissioning work. |

An intermediate run also caught two implementation problems before finalization. Strictly rejecting evidence outside a segment produced 614 false repair rows because legitimate earlier citations support cross-references. The final measurement clips those citations to the owning segment while preserving their source validity. Sorting by percentage alone promoted a 2.8-minute travel update above much longer gaps. The final order uses gap minutes, then percentage, without arbitrary short-video thresholds.

## Subsequent report simplification

- `audit route` remains available as the last column. Its internal role in ranking is unchanged.
- `risk signals` was removed from the written TSV because its repeated text and exceptional value did not help manual selection. Internal diagnostic signals remain available to the analysis code and its tests.
- `manual audio review remaining` was removed from the report, input and row types, CLI summary, and detection code. The former detector matched a few phrases in only the latest processing-log entry; it did not assess audio or transcript quality. Audio concerns remain verbatim in the latest processing result and notes.

A small log-only check confirmed a missed March 2021 example. Processing-log line 8960, the latest outcome inspected for `2021-03-03_T23-45-01_naval-fire-support-of-the-wwi-western-front-long-patrol-part-4-lord-clive-class-m10-13_stRrYBkgM0k.json`, states that the casualty detail at 24:30-25:09 remains caption-damaged and needs audiovisual review. That wording matched none of the detector's positive phrases. A false flag therefore indicated an absent recognized phrase rather than the absence of an audio concern. This check did not establish the cause or extent of the underlying audio issue.

The final report has 28 columns after adding `Transcript Bytes Per Minute` between `duration minutes` and `segment count`. It divides canonical transcript file bytes by the unrounded duration in minutes and displays two decimal places. Missing bytes or an unusable duration leave the cell blank; zero bytes with a valid duration produce `0.00`. The latest processing timestamp, log line, result, and notes remain together immediately before the final `audit route` column. These edits change the displayed columns without changing the evidence-gap measurements or ranking order.

The task-note review found a stale CLI-help reference to "manual-audio status". The subsequent transcript-byte-density change removed that reference while documenting the new column. The inferred audio field, detector, TSV column, and summary count remain absent.

## Final process

1. Exclude SASC shards and empty or unreadable segment arrays. Warn about malformed excluded files; preserve malformed entries in nonempty arrays as repair rows.
2. Preserve repair-first and explicit Q&A review routing. Compute the union of valid source-matching evidence intervals, clipped to the transcript and owning segment. Missing evidence ends remain point citations.
3. Order each route by largest gap minutes descending, then percentage descending, then file stem. Keep anchor geometry, transcript bytes per minute, and log count as diagnostics.
4. Include exact gap timestamps and the latest appended processing timestamp, line, result, and notes, with `audit route` last. Omit the redundant risk-signals column and the unreliable audio-review flag. Preserve raw outcome distinctions rather than inferring success, saturation, model strength, or audio-review status.
5. Read that context and spot-check the indicated TXT passage before selecting a subsequent audit. Reopen older saturation when a stronger model, method, or new evidence justifies it; log count never suppresses eligibility.

The live report contains 2,104 nonempty rows, excludes 48 empty shards and 11 SASC shards, and identifies no repair or explicit Q&A review routes in this snapshot. This result describes metadata, not complete transcript coverage. No shards, processing-log history, topics, or generated site data were edited.

## Validation

- All 19 focused tests in `src/content/video-segment-audit-risk.test.ts` and `src/scripts/rank-video-segment-audit-risk.test.ts` passed through Node with `--import tsx --test`.
- Existing TSV assertions were updated for the final column order and removed fields. Audio-related latest notes remain covered as verbatim context that does not alter measurements, and the CLI check confirms the removed audio summary stays absent.
- The selected `current guidance and CLI use the retained video-segment report command` test in `src/site/topic-normalization-guidance.test.ts` passed after replacing its stale score and audio-flag documentation assertions. README guidance now describes audio concerns through the latest result and notes.
- `C:\Program Files\nodejs\npm.cmd run check:types` passed after the final test edits.
- IntelliJ MCP inspections reported no errors in the original implementation and test changes, and subsequent inspections found no errors in the implementation after the column and audio-detector removals. Warning-level inspection during the original revision reported return-count style warnings.
- The canonical report was regenerated after each subsequent column change. A sandbox EPERM required narrow elevation for the report write. Readback confirmed 2,104 unique shards and consecutive unique ranks, zero empty rows, 28 aligned columns after the byte-density addition, `audit route` last, and no legacy score, risk-signals, or manual-audio column. The CLI summary also omits the manual-audio count.
- Three agents independently examined log outcomes, reviewed the implementation and tiny transcript samples, and updated regression fixtures. Repository-wide tests, site generation, and builds were not needed for this report-only change.
- The earlier note-only update rechecked the report layout and row integrity and received an independent agent review without rerunning code tests or regenerating the report.
- After adding `Transcript Bytes Per Minute`, all 19 focused tests, the selected report-guidance test, TypeScript checks, and IntelliJ error inspections passed again. Existing assertions cover its exact placement, two-decimal output, use of unrounded duration, missing values, and zero bytes. Regenerated report readback confirmed the requested neighboring columns and consistent row widths; a sample recomputed from canonical manifest duration matched the reported `943.20` bytes per minute.
