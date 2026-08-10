---
name: naval-topic-taxonomy-curator
description: Curate the corpus-wide video-topic taxonomy for the Naval History with Dr. Alex repository. Use when asked to review, merge, split, rename, canonicalise, deduplicate, or remove unused topics; resolve topic-normalization report findings; standardise topic titles, aliases, spelling, class names, calibres, people, fictional referents, or Type designators; or coherently update normalization policy, registry records, and all affected authored shard topic arrays. Use the shard content skills for transcript-backed topic additions confined to one selected video, and naval-site-build-repair for one narrow topic failure discovered during a build.
---

# Naval Topic Taxonomy Curator

Use this skill inside `C:\Workspaces\naval-history-with-dr-alex` for explicitly authorised semantic maintenance of the shared topic taxonomy.

## Ownership And Boundaries

- Treat `src/derived/topic-normalization-patterns.tsv` as authored creation and normalization policy, `src/derived/video-segments/topics.json` as the tracked registry, and topic arrays in `src/derived/video-segments/*.json` as live authored references. Update all affected layers coherently.
- Curate topic identity and metadata without rewriting unrelated segment prose. Read shard fields and transcript passages when needed to establish the referent.
- Re-inventory the current corpus for every selected topic family. Supplied examples illustrate the problem; they do not define a closed list.
- Use `$naval-transcript-to-site-content` or `$naval-site-content-auditor` when the task is to discover or add transcript-backed topics in one selected shard. Use `$naval-site-build-repair` for a narrow missing-topic or invalid-topic failure whose repair does not require corpus taxonomy work.
- Leave `site/src/data/generated/archive/`, `site/dist/`, processing logs, schedules, package files, and public prose untouched. Do not run archive generation, Astro, Pagefind, repository-wide tests, or site builds unless the user separately authorises them.
- Run only one report, synchronizer, or other shared writer at a time. Never bypass an active repository writer lease.

## Start

1. Read `AGENTS.md` and this skill completely.
2. Confirm that the request authorises taxonomy maintenance. Establish the requested family or, for a broad request, inspect the complete actionable review queue plus systematic high-confidence candidate families from the usage report.
3. Read the header and applicable rules in `src/derived/topic-normalization-patterns.tsv`. Do not treat an existing rule as correct merely because it is active.
4. Run `npm run report:video-topic-usage`. Consume both `reports/video-topic-usage.tsv` and `reports/topic-normalization-review.tsv`; the reports are ignored, on-demand evidence rather than canonical source.
5. Read the report headers before filtering or interpreting columns. Inspect every listed registry and shard source for each candidate under consideration.
6. Inventory every registry row whose `usage count` is `0`. Unused registry topics are standard scope in every taxonomy-curation pass, including a pass whose requested examples concern a narrower topic family.

## Decide Semantically

For each candidate family, record an evidence table with the old slug, proposed canonical slug, canonical title, action, every affected source, applicable rule, and semantic reason.

- Merge lexical variants only when their source contexts identify the same referent or concept.
- Preserve separate people, vessels, classes, weapons, calibre families, events, institutions, places, fictional universes, and similarly named concepts when their referents differ.
- Prefer UK English for generic editorial topics. Preserve official organisation, programme, weapon, class, and proper-name spellings.
- Give named ship classes typed, learner-readable canonical titles and slugs. Evaluate Type designators and referent-specific exceptions independently; a bare `type-<number>` must identify what the Type denotes.
- Qualify ambiguous bare names by referent when the corpus supports a split. Leave a candidate unresolved and report the evidence gap when the available sources cannot support a safe decision.
- Use the `fiction-...` namespace for referents that exist only within fiction. Keep real proposals, unbuilt designs, counterfactual history, future systems, and genre topics outside that namespace.
- Distinguish generic calibres from fully qualified gun systems or barrel-length topics. Retire a vague weapon topic when it cannot identify the bore or system and the sources support a more precise canonical family.
- Use similarity scores only to find candidates. Require semantic evidence before merging.
- Treat `reports/topic-normalization-review.tsv` as the actionable normalization and collision queue. Treat `potential duplicate review` in the usage report as similarity-based discovery: a clean pass may retain many semantically distinct candidates, so do not use its aggregate count as a zero target.
- Consult an authoritative external source when corpus evidence cannot settle official nomenclature or identity. Record the source in the normalization-rule notes when it materially supports the decision.

## Apply A Reviewed Mapping

1. Resolve the complete selected family before editing. Ensure one canonical destination, no active exact-mapping chains, and no overlapping active regex matches.
2. Add or update narrowly bounded `creation` rules in `src/derived/topic-normalization-patterns.tsv`. Put exact rules before broader regex rules. Keep aliases useful for reader search; omit aliases that preserve a misleading or ambiguous label.
3. Replace every affected video-level and segment-level topic reference in authored shards. Preserve array ordering and unrelated content.
   - Before a bulk mechanical rewrite, record the exact old-slug occurrence count and affected files for every mapping.
   - Make the rewrite resumable and idempotent. A permissions interruption may leave a valid partial migration, so a retry must accept already-migrated occurrences while still rejecting counts above the reviewed maximum.
   - After any interrupted write, re-inventory the partial state before retrying. Verify that every resulting topic array remains duplicate-free.
4. Update the corresponding registry records in `src/derived/video-segments/topics.json`. Preserve every nonblank manual description and all still-valid aliases. Remove an obsolete record only after all authored references have moved and the normalization policy resolves its old slug directly to the canonical destination.
5. Parse every touched JSON file immediately. Treat malformed JSON, residual authored references, duplicate topic entries, and unexpected mapping matches as blockers.
6. Run `npm run sync:video-topics` only when authored canonical references genuinely lack registry records. The synchronizer appends missing records; it does not migrate references or remove obsolete records.

## Prune Unused Registry Topics

After completing authored-reference migrations and any required synchronization, prune the registry as a standard part of the same curation pass.

1. Regenerate `reports/video-topic-usage.tsv` and collect every registered topic whose `usage count` is `0`. Usage means an exact slug reference in a video-level or segment-level authored topic array. Aliases, summaries, normalization inputs, and policy destinations do not count as usage.
2. Inspect each unused record and every policy rule that matches it or resolves to it. Confirm from the current shards that the slug has no authored reference before deleting it.
3. Remove every confirmed unused record from `src/derived/video-segments/topics.json`.
   - When the record is an obsolete variant of a surviving canonical topic, transfer any unique nonblank manual summary and still-valid aliases to that canonical record before deletion.
   - When manual metadata has no safe surviving destination, treat the potential metadata loss as a blocker and resolve it explicitly before completing the pass.
   - Do not retain a registry placeholder merely because an active creation or display rule targets the slug. Keep a still-valid policy rule so synchronization can recreate the canonical record if authored usage returns; remove or retarget the rule only when its semantics are obsolete.
4. Reparse `topics.json` immediately and verify that the pruning changed no authored shard array.
5. Proceed to the post-prune validation. A completed taxonomy pass must finish with `unused=0`; investigate any remaining zero-use registry record rather than exempting it silently.

## Validate

1. Regenerate both reports with `npm run report:video-topic-usage` after the unused-topic prune.
2. Inspect both outputs. Confirm that retired authored references are absent, canonical sources are present, `unused=0`, and the selected family has no unexplained actionable review findings or title/alias collisions. Review high-confidence similarity candidates semantically, but do not require the advisory similarity count to reach zero.
3. Run the read-only `npm run audit:topic-normalization`.
4. Run the focused `npm run check:video-topics` registry/reference check.
5. Reparse every touched JSON file. Report any intentionally unresolved review candidates; never describe a pass as clean while blockers remain.
6. Stop without generating site data or running a site build. Hand approved source changes to the repository owner for integration generation.

If Bun or npm fails with `EPERM` or another permissions-shaped error, retry the exact authorised command with the narrowest sandbox elevation before diagnosing a repository defect. On this Windows machine, use `C:\Program Files\nodejs\npm.cmd` when the roaming npm shim is broken.

## Improve This Skill From Use

After a real taxonomy pass, identify workflow friction, missed safeguards, or repeated reasoning that would help a future curator. Update this skill only with generalisable guidance; keep snapshot counts, individual mappings, and transient candidate lists in reports or task notes. Keep `agents/openai.yaml` aligned with the skill, then rerun the skill-creator `quick_validate.py` check after every skill revision.

## Handoff

Report the candidate families reviewed, semantic decisions and evidence, old-to-canonical mappings applied, policy/shard/registry files changed, initial unused-topic count, unused slugs removed, manual summaries and aliases transferred, commands run, final report and audit counts including `unused=0`, unresolved candidates, and the exact integration work left to the repository owner.

