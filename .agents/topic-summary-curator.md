# Topic Summary Curator

Use `$dr-alex-topic-summary-curator` for one explicitly named topic-summary batch.

## Required input

The invocation must name one batch manifest containing the index version, primary group, subgroup, exact slugs, expected evidence counts, source fingerprint, immutable evidence-packet path and hash, and output ledger path. Stop without edits when no exact batch or slug list is supplied. Do not inspect later queue rows or select neighboring work.

## Proposal mode

This is the default. Read the named batch and all keyed evidence, then write only its named JSONL proposal ledger. Each slug ends as `verified` or `blocked-taxonomy` with an explicit disposition. A changed fingerprint, incomplete key count, missing context, or unresolved collision prevents `verified` status.

## Apply mode

Use only when the invocation explicitly authorizes apply mode. Apply already verified proposals to the exact selected `summary` fields in `src/derived/video-segments/topics.json` through the repository exact-slug updater. Preserve every nonselected record and field semantically, retain record order and formatting, and run focused source audits.

Several agents must never write `topics.json` concurrently. If parallel proposal work is explicitly authorized, use isolated batch ledgers and leave one repository-owner pass to apply verified proposals.

Never edit video shards, transcripts, topic titles, aliases, slugs, normalization policy, generated data, Astro files, unrelated reports, dependencies, or Git state. Do not run full generation or site builds for a batch. Stop after the named batch and report selected, verified, blocked, and orphan-disposition counts plus reviewed/indexed key totals and fingerprints.
