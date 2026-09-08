# Prohibit "the transcript" in shard segments

## Request

Remove every case-insensitive occurrence of the exact phrase "the transcript" from authored shard segment fields, including evidence notes. Rewrite the affected text as direct, subject-led study-guide prose without changing supported claims, uncertainty, quotations, or speaker ownership.

Make the exact phrase an unconditional `check:site-content-wording` error. The default command must count it in `errors=`, print the failure and affected locations to the console, return a nonzero exit code, and include the findings in Markdown and JSON report output.

## Cause

The existing `transcript-reporting-frame` rule recognizes only a fixed list of verbs. The generic `transcript-reference` fallback is review-only and is omitted from the default actionable scan. Verbs outside the fixed list, including examples such as "credits", "presents", "narrates", "assigns", "places", and "calls", therefore produced no default finding.

## Work log

- Confirmed the default command can report `errors=0 warnings=0 issues=0` while shard segments still contain thousands of exact-phrase matches.
- Counted 5,955 case-insensitive whole-phrase occurrences across 5,954 string values, 5,699 segments, and 1,278 shards. Field totals were 5,755 evidence notes, 182 bodies, 11 short answers, and 7 summaries. The similar wording `the transcription` is outside the target.
- Reviewed possible subject-matter exceptions. All 5,955 occurrences are workflow or source-reporting narration; none requires retaining the phrase.
- Added the unconditional `prohibited-transcript-reference` rule for every scanned segment text field. A prior unconditional finding suppresses overlapping, narrower transcript rules so each occurrence is counted once.
- Updated command guidance to state that literal `the transcript` references are nonnegotiable errors.
- Added default-mode regression coverage for all fields, console diagnostics, nonzero exit, and Markdown/JSON report output.
- Added `npm run search:site-content-wording -- --phrase <text>`, a field-aware, case-insensitive search over authored shard prose and evidence notes. Word boundaries are the default; `--substring` is available explicitly.
- Split the affected shards into eight fixed, disjoint rewrite buckets. Rewrites preserve facts, uncertainty, opinion, quotations, and necessary speaker ownership, and may not substitute another source or narrator label.
- Rewrote every targeted value as direct historical or technical prose. A subsequent change-aware comparison found 2,503 edits where only the leading words `the transcript` had initially been removed and the remaining text was otherwise identical, ignoring case. Every one was rewritten again with a concrete subject; the final comparison count is zero.
- Evaluated a general sentence-initial reporting-verb blocker after the fragment `Recounts Vian...` exposed the poor replacement style. Tooling review showed that a static verb list both misclassified grammatical plural noun subjects such as `Records show...` and missed many actual clipped fragments. The unreliable rule was removed. The exact change-aware comparison remained the authoritative audit for this cleanup.
- Rewrote additional clearly subjectless or malformed evidence notes exposed during that evaluation. Valid noun-led sentences, counterfactual force, uncertainty, quotations, and named claim ownership were preserved.
- Corrected the reusable search command's case-insensitive matching to retain original-string offsets after Unicode characters whose lowercase form expands.

## Search command

```powershell
& "C:\Program Files\nodejs\npm.cmd" run search:site-content-wording -- --phrase "the transcript"
```

The command searches only authored segment `title`, `summary`, `body`, `question`, `answerShort`, and `evidence.note` values. Repeat `--phrase` for several phrases, use repeatable `--path` to restrict the search, add `--case-sensitive` when needed, or add `--substring` to include matches inside longer words.

## Validation record

- Final change-aware comparison against the prior shard text: `clipped-prefix-hits=0`.
- `npm run search:site-content-wording -- --phrase "the transcript" --summary-only`: 2,165 files, 68,822 segments, 345,046 searched fields, zero matching files, fields, segments, occurrences, or parse errors.
- `npm run check:site-content-wording -- --strict --report --summary-only`: `errors=0 warnings=0 issues=0 review-candidates=0 matched-occurrences=0 parse-errors=0`; regenerated `reports/site-content-wording-scan.md` and `.json`.
- `node --import tsx --test src/content/site-content-wording.test.ts src/scripts/search-site-content-wording.test.ts`: 28 tests passed.
- `npm run check:types`: passed.
- `npm test`: 271 tests passed with zero failures.
