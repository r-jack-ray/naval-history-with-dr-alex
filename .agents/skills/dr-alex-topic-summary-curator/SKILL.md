---
name: dr-alex-topic-summary-curator
description: Audit and rewrite short learner-facing dictionary definitions for one explicitly selected similarity-group batch of Dr. Alex Clarke archive topics across naval and general history, military affairs, technology, politics, economics, research, and culture. Use when a named topic-summary batch must be identified against every video-level and segment-level location that keys each slug, externally defined when a reliable reference exists, with generic families kept appropriately general, ambiguous senses blocked for taxonomy review, and unrelated topics, shards, normalization policy, generated data, and site files preserved.
---

# Dr. Alex Topic Summary Curator

Require an explicit batch manifest or exact slug list. Never select work from the registry, another batch, or a queue.

Treat each public topic summary as a compact dictionary reference that is indexed into Dr Clarke's source material. When a reliable external reference covers the same subject, use that reference as the primary basis for the definition. Use the keyed corpus to identify the intended sense, confirm relevance, and detect collisions—not to derive the subject's basic type from conversational phrasing.

## Workflow

1. Read the named batch's primary group and subgroup.
2. Read [summary-quality-contract.md](references/summary-quality-contract.md), [similarity-groups.md](references/similarity-groups.md), and [review-ledger-schema.md](references/review-ledger-schema.md).
3. Inspect the immutable evidence packet and every indexed video-level and segment-level occurrence for each selected slug. Use these occurrences to build a sense inventory, not as the default definition source. Reconcile every evidence chunk for high-use topics; never sample.
4. Search the exact topic title and aliases on English Wikipedia. When a matching article exists, read its lead and any disambiguation notes and use that reference identification as the primary basis for the definition: subject type, canonical identity, period, affiliation, and the smallest stable distinguishing context. Confirm that the article describes the same sense as every keyed occurrence; never choose a namesake from title similarity alone. Record the page title, URL, access date, and the limited claims used in `externalVerification`.
5. If Wikipedia is absent, ambiguous, weakly sourced, or insufficiently precise, consult an authoritative museum, archive, government, academic, or specialist institutional source. Prefer the best stable reference account over an inference from transcript wording, and record any disagreement or qualification.
6. Draft one short dictionary-style definition in original wording. Preserve a general topic's genuine generality and do not copy source prose. Dr Clarke often personifies ships, designs, institutions, events, weapons, and abstract concepts; pronouns, agentive verbs, jokes, and rhetorical personification in a transcript are not evidence that a topic is a person.
7. Prefer an empty pending proposal to an inaccurate, speculative, weakly matched, or generic filler definition. Never retain or generate boilerplate merely to avoid an empty summary; leave `proposedSummary` empty with `reviewStatus: candidate` when reliable identification is incomplete.
8. Falsify the proposed sense—not each externally established fact—against every keyed occurrence and the recorded external identification. Mark unrelated multi-sense slugs `blocked-taxonomy`; do not hide collisions with vague prose. If the corpus clearly uses a different namesake, reject the external match and research that sense instead.
9. Record exact indexed and reviewed video/segment key counts, current fingerprints, evidence-packet hash, status, disposition, and supplemental verification.
10. In proposal mode, update only the named batch ledger atomically. In explicitly authorized apply mode, use `npm run topic-summary:apply` for only the selected verified slugs.
11. Run `npm run audit:topic-summaries` only when the named workflow calls for corpus completion; use the focused packet and dry-run apply checks during a batch.
12. Stop after the named batch. Report verified, pending-empty, blocked, and orphan-disposition counts.

## Ownership

- Touch only the selected ledger proposals or, in explicit apply mode, the exact selected `summary` fields in `src/derived/video-segments/topics.json`.
- Never edit video shards, transcripts, topic titles, aliases, slugs, normalization policy, generated data, Astro files, unrelated reports, dependencies, or Git state.
- Never run site generation or a full site build for an ordinary batch.
- Refuse verification when counts are incomplete, a fingerprint changed, context is insufficient, or a sense collision remains.

Use the repository commands in `src/scripts/topic-summary-review.ts`; do not recreate indexing or apply logic inside the skill.
