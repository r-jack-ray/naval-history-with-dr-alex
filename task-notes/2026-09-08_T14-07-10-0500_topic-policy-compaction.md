# Topic normalization catalog compaction

The catalog shrank from 1,648,471 to 1,377,906 bytes (270,565 bytes, 16.41%). Its nine-column schema remains unchanged. Rule count fell from 6,078 to 6,053. This is a structural and editorial cleanup; no topic identity mappings, authored topic references, or registry records were migrated.

## Findings and changes

- `src/derived/topic-normalization-patterns.tsv`: Shortened 3,608 active-rule notes through reviewed whole-note substitutions and removal of identical repeated historical rationales. Preserved distinct source URLs, dates, confidence qualifiers, and naming caveats.
- `src/derived/topic-normalization-patterns.tsv`: Cleared repeated titles and aliases from 1,488 creation-exact redirects covering 1,066 targets. Each target already has an active exact display self-map containing identical metadata. Titles remain on that display row, and redirect aliases use `[]`.
- `src/derived/topic-normalization-patterns.tsv`: Combined 26 regular class-plural regex rules into `normalize-20260808-singular-typed-class`, with the same bounded vessel-type alternatives and replacement `$1-$2s`. Kept the special `ships-of-the-line` rule separate. All 534 review and disabled rows are byte-identical to their original rows.
- `src/site/topic-normalization.ts`: Validate regex replacement syntax by substituting numeric capture references before applying the existing topic-slug grammar. This permits literal suffixes beside captures while retaining missing-capture and runtime output validation.
- `src/site/topic-normalization.test.ts`: Added fixture coverage for combined replacements, bounded class matches, exact exceptions, malformed templates, missing captures, and invalid output from an unmatched optional capture.
- `src/site/topic-store.test.ts`: Reused the existing append test to verify that a canonical display rule supplies the title and aliases when its creation redirect omits them.
- `README.md`: Documented metadata ownership, alias preservation, and combined regex replacements.

No exact rules were replaced by regex rules. There were no duplicate full rule bodies to delete. Exact rules carry metadata requirements and take precedence over regex rules, so generalizing them would need a separate semantic review. Source-specific notes remain repeated where removing them would require an additional reference format.

## Metadata exceptions

The synchronization planner exposed alias-order or spelling changes for four otherwise eligible targets: `aviation-support-ships`, `fiction-star-wars-venator-class-star-destroyers`, `gerald-r-ford-class-aircraft-carriers`, and `type-uc-ii-u-boat`. Their creation metadata remains intact. Other creation rules for these targets have partially overlapping aliases; factoring changes which spelling or position wins first-occurrence deduplication.

## Verification

The original and final candidate catalogs were compared through the actual creation and display resolvers for 34,147 slugs: every registry slug, every exact input and target, and synthetic class cases including all 26 suffixes, plural forms, Type designators, invariant craft, and the special compound plural. Results and ambiguity behavior matched after translating the 26 retired regex IDs to their combined ID.

Policy title and alias requirements matched for all 3,209 exact-rule targets. The real synchronization planner produced byte-identical default topic JSON for all 1,066 compacted targets, including alias order, spelling, and blank summaries. This check planned against a temporary missing registry and did not write one. The canonical TSV was checked against the verified candidate after its atomic replacement.

Final checks passed:

- TypeScript: `npm run check:types`.
- Focused Node tests: 31 passed across normalization, normalization audit, topic store, and topic usage reporting.
- `npm run report:video-topic-usage`: Both companion TSV reports are byte-identical to the baseline. There are 29,815 registered topics, 29,790 used topics, 25 retained unused topics, zero unregistered topics, and 216 advisory similarity candidates.
- `npm run audit:topic-normalization`: 2,165 shards, zero blockers, zero review findings.
- `npm run check:video-topics`: Registry current.

No topic synchronization was needed. Generated archives, site builds, processing logs, authored shards, and registry metadata were not changed. Normal site integration can regenerate the archive with the updated policy hash. Temporary snapshots and comparison scripts are under `.tmp/topic-policy-compaction-20260908/`.
