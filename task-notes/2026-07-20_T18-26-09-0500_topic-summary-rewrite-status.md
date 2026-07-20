# Topic Summary Rewrite Status

Date: 2026-07-20 18:26 -05:00
Branch: `codex/corpus-grounded-topic-summary-rewrite`
Status: Archived experimental work; do not merge or deploy as-is.

## Decision

This branch preserves the topic-summary rewrite experiment for possible later use. The work demonstrated that corpus-wide automatic descriptions are not reliable enough for the public site and that reviewing roughly 20,000 topics individually is not currently practical.

The preferred next step is to return to `main` and make topic descriptions optional or remove them from public presentation. Topic slugs, titles, aliases, routes, video links, segment links, and indexing should remain available so topics continue to work as dictionary-style index entries even when they have no description.

## What This Branch Implements

- A `dr-alex-topic-summary-curator` skill and supporting agent guidance.
- A topic-summary review CLI with index, group packet, manifest, ledger, validation, dry-run, and exact-apply workflows.
- Reference-first guidance: use a reliable external definition, especially Wikipedia when a suitable article exists, rather than inferring an entity type from conversational transcript wording.
- A rule that personification in Dr. Clarke's speech is not evidence that a topic is a person.
- A preference for an empty summary over an inaccurate or generic summary.
- Topic-summary quality rules, calibration cases, normalization checks, archive handling, metadata handling, and associated tests.
- Large source and generated topic-summary rewrites produced during the earlier broad group passes.
- Direct corrections for the `1706 Establishment` and `1719 Establishment` examples.

## Current Content State

| Measure | Current value |
| --- | ---: |
| Source topics | 20,003 |
| Group 1 topics | 2,990 |
| Group 1 externally verified summaries applied | 429 |
| Group 1 summaries deliberately left empty/pending | 2,561 |
| Group 1 video-level topic keys reviewed | 2,825 |
| Group 1 segment-level topic keys reviewed | 56,120 |
| Corpus summaries still using legacy framing | 31 |
| Corpus summaries still using the erroneous person template | 6,268 |
| Source/generated summary mismatches | 2,992 |
| Generated archive topics | 20,003 |

All groups previously received broad automated rewrites, but many of those summaries remain generic or incorrect. The stricter reference-first Group 1 pass exposed the scale of the remaining problem: only 429 topics could be confidently matched and defined automatically, while 2,561 were safer to leave blank.

## Attempted Wikipedia Use and Its Limits

The stricter Group 1 pass attempted to use Wikipedia as the preferred definition source when a topic had a clear corresponding article. This worked well for recognizable named concepts such as the `1706 Establishment` and `1719 Establishment`, and it helped prevent conversational personification from being mistaken for entity classification. Only 429 of the 2,990 Group 1 topics were accepted through this reference-first process; the remaining 2,561 were left empty rather than populated with uncertain definitions.

Wikipedia improves the starting evidence but does not make automatic matching safe:

- An exact or near-exact title can resolve to a disambiguation page, redirect, similarly named subject, ship, class, weapon, organization, person, or event with the wrong sense.
- Short, numeric, caliber-based, misspelled, transcript-derived, or highly specialized naval topics may have no suitable article even when the subject is real and well defined elsewhere.
- A broad encyclopedia lead may be accurate in general but still describe a different sense from the one indexed in Dr. Clarke's source material.
- Article leads can be too long, context-dependent, or full of parenthetical qualifications to work as concise learner-facing dictionary definitions without careful rewriting.
- External definitions establish what a topic is, but they do not establish why a particular video or segment was linked to that topic; the source material still controls those index relationships.
- Redirects, article moves, changing content, incomplete coverage, and temporary lookup failures can make automated results inconsistent over time.
- Coverage is uneven across countries, periods, specialist terminology, and niche naval subjects, so Wikipedia availability must not be treated as a measure of a topic's importance or validity.

Consequently, Wikipedia should remain a preferred reference, not an automatic authority-to-summary pipeline. A candidate definition still needs entity-sense verification, concise paraphrasing, and rejection when the match is ambiguous. Failed or uncertain lookup should produce no description, not boilerplate or a transcript-inferred guess.

## Review and Validation State

- `npm run check:types` passed on 2026-07-20.
- `npm test` passed all 183 tests on 2026-07-20.
- The exact Group 1 dry-run and apply completed for 429 accepted summaries.
- Targeted Group 1 checks found no duplicate accepted summaries, over-length accepted summaries, or source/ledger mismatches.
- The generated archive is stale relative to the source topic registry by 2,992 summaries after the stricter Group 1 pass.
- A full site build has not been used as a completion criterion for this archived experiment. Current validation treats empty summaries as errors, so the 2,561 intentionally empty Group 1 summaries must not be regenerated and deployed under the existing contract.
- Machine-oriented review packets and ledgers under `reports/topic-summary-review/` are ignored by repository policy and are not part of this commit. They are reproducible from the committed tooling and source data.

## Why This Is Not Ready to Merge

- Topic descriptions are not accurate across the corpus.
- Thousands of summaries still use a demonstrably wrong person template.
- The safer Group 1 results include thousands of empty summaries that the current build contract rejects.
- Generated topic data is not synchronized with the latest source registry.
- The review output is designed for agent processing, not manageable human review.

## Recommended Later Work From `main`

1. Make topic summaries optional throughout source validation and archive generation.
2. Remove topic descriptions from cards, topic pages, page metadata, and search documents when absent.
3. Preserve topic navigation, aliases, routes, and links into the relevant videos and transcript segments.
4. Remove unreliable descriptions from the source topic registry rather than publishing boilerplate or guessed definitions.
5. Keep video and segment summaries unchanged; this decision concerns only topic descriptions.
6. Retain this branch as a reference for any future smaller, explicitly reviewed definition project.
