# Topic Normalization Patterns and Canonicalization Plan

Timestamp: 2026-07-16T17:41:19-05:00

Last reviewed: 2026-07-16T18:23:41-05:00

Status: Planning only. No topic patterns, skills, source shards, registry records, generated data, routes, or tests have been changed by this task.

Historical baseline: `task-notes/2026-07-15_T18-23-35-0500_topic-display-and-search-correction-plan.md` was already implemented and is retained only as a historical record. Its completed display-title, punctuation, alias-search, and numeric-review work is the starting state for this plan, not unfinished work to repeat.

## Purpose

Create one durable, machine-readable and skill-readable topic-normalization policy; make the three topic-producing or topic-repairing naval skills use it; and consolidate the first high-confidence set of duplicate topic slugs already present in the curated shards and shared registry.

This is intentionally a 50-80% improvement pass. It should remove the obvious, repeated naming families and prevent their recurrence without pretending that all 18,945 topics can be semantically normalized safely in one pass. Ambiguous synonym, proper-name, and broader-versus-narrower relationships remain review work.

## Required Outcome

- Store normalization-owned construction, display, exact migration, alias additions, and exception rules in one tracked flat file.
- Make the normalization file the detailed source of truth for normalization policy instead of repeating calibre and casing rules in multiple skills and briefs. `topics.json` remains authoritative for all curated topic metadata, including summaries and aliases unrelated to a normalization rule.
- Give shard-writing skills a read-only way to select canonical slugs while preserving their one-shard-plus-log write boundary.
- Give build repair a deterministic diagnostic and explicit migration path for active normalization rules.
- Merge approved duplicate topic families across every top-level video topic array, every segment topic array, and `topics.json`.
- Preserve search discovery through curated aliases and preserve retired topic URLs through explicit static HTML legacy-route redirects.
- Keep routine synchronization and site generation from silently rewriting source shards when an evolving rule file changes.
- Leave unresolved or semantically risky candidates visible for a later pattern-optimization pass.

## Confirmed Current State

Planning snapshot taken before this note was created on 2026-07-16. Recompute every count in Phase 0; these values are context, not apply-time evidence:

- `src/derived/video-segments/topics.json` contains 18,945 topic records.
- 18,920 topic slugs are referenced; 25 registry records are currently unused and intentionally preserved by the synchronizer.
- `src/derived/video-segments/` contains 2,061 per-video JSON shards, excluding `topics.json`.
- A read-only formatting scan found 1,320 of the 2,062 JSON files in that directory are not byte-equivalent to whole-file `JSON.stringify(..., null, 2)` output. Format-preserving topic-array edits are required to avoid unrelated shard churn.
- `src/site/topic-store.ts` currently appends missing registry records and preserves existing and unused records. It does not rewrite shard references, merge equivalent registry records, or remove deprecated records.
- Every registry record is emitted as a generated topic and static topic route. Zero-coverage records are filtered out of the topic-directory cards, so rewriting shard references without pruning mapped registry records would leave duplicate or empty generated topic records and Pagefind-indexable topic pages even when no empty directory card appears.
- Topic `aliases` support display and search only. They are not slug equivalence declarations and do not preserve an old `/topics/<slug>/` route.
- Under the punctuation-collapsing normalization used by the prior display/search pass, 315 alias entries representing 309 normalized strings across 160 source topics collide with another topic title. Alias overlap must be audited, but it must never be interpreted automatically as proof that two topics are equivalent.

Use one shared collision key throughout tooling and tests: `value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()`. The single-space replacement both removes punctuation and collapses whitespace. Recompute the snapshot with that exact helper before relying on the counts above.

### Screenshot families

Usage below is segment references / unique shard files. None of these nine records has an alias; all still use a generic default summary. The word-form 74-gun record was not in the screenshot but belongs to the same exact semantic family and must not be left behind.

| Current slug | Current title | Usage | First-pass canonical slug | Canonical title |
| --- | --- | ---: | --- | --- |
| `57-mm-guns` | `57 Mm Guns` | 3 / 3 | `57-mm-guns` | `57 mm Guns` |
| `57mm-gun` | `57mm Gun` | 1 / 1 | `57-mm-guns` | `57 mm Guns` |
| `57mm-guns` | `57mm Guns` | 1 / 1 | `57-mm-guns` | `57 mm Guns` |
| `76-mm-guns` | `76 Mm Guns` | 1 / 1 | `76-mm-guns` | `76 mm Guns` |
| `76mm-gun` | `76mm Gun` | 1 / 1 | `76-mm-guns` | `76 mm Guns` |
| `76mm-guns` | `76mm Guns` | 2 / 2 | `76-mm-guns` | `76 mm Guns` |
| `74-gun-ship` | `74 Gun Ship` | 2 / 2 | `74-gun-ships` | `74-Gun Ships` |
| `74-gun-ships` | `74 Gun Ships` | 2 / 2 | `74-gun-ships` | `74-Gun Ships` |
| `seventy-four-gun-ships` | `Seventy Four Gun Ships` | 4 / 4 | `74-gun-ships` | `74-Gun Ships` |

Canonical metric slugs separate the SI unit token with a dash because the visible form requires a space: `<number>-mm-guns` becomes `<number> mm Guns`. Generic calibre categories use the plural. A named weapon or mount can remain singular when it is genuinely a distinct system rather than a calibre category.

`ships-of-the-line` currently carries aliases `74-gun ships`, `third rates`, and `seventy-fours` that overlap narrower topics. Move `seventy-fours` to the canonical 74-gun topic, remove the other two narrow aliases, and retain only the genuinely broad `line of battle ships` alias unless separate review supports another broad synonym. Do not merge the broader `ships-of-the-line` topic with the narrower 74-gun or `third-rates` topics.

### Additional bounded candidate families

These are review inventories, not active rules. Phase 3 must materialize every approved source-to-target edge as an exact row; category membership alone never authorizes migration.

- Metric spacing pairs: `20mm-cannon` / `20-mm-cannon`, `30mm-guns` / `30-mm-guns`, `bofors-40mm` / `bofors-40-mm`, `oerlikon-20mm` / `oerlikon-20-mm`, and `oto-melara-76mm` / `oto-melara-76-mm`, in addition to the 57 mm and 76 mm screenshot families.
- Ten other joined-`mm` records remain review-only unless exact evidence activates them: `155mm-guns`, `203mm-guns`, `37mm-guns`, `40mm-3p-ammunition`, `650mm-torpedoes`, `oto-melara-127mm`, `type-5-40mm`, `type-89-127mm`, `type-96-25mm`, and `type-96-25mm-aa-gun`. Several are designations or named systems rather than generic calibre categories.
- Number-word generic calibre pairs for 3-, 4-, 5-, 6-, 8-, 10-, 11-, 12-, 14-, 15-, 16-, 18-, and 20-inch guns, plus the 74-gun ship family above. Singular sources map directly to the plural target; prefixed subjects such as `british-15-inch-gun` and `automatic-eight-inch-guns` remain separate unless individually approved.
- Reviewed decimal generic-calibre families for 4.5, 4.7, 5.25, 5.5, 9.2, and 13.5 inches. `five-point-two-inch-guns` is transcript-evidenced as 5.25 inches and belongs to the 5.25 family; `nine-four-inch-guns` is transcript-evidenced as 9.4 inches and must remain separate. QF-, manufacturer-, mark-, mount-, and designation-specific topics remain separate.
- Exact British/American spelling clusters for generic concepts. The substring-stem inventory contains 72 defence/defense, 29 armour/armor, and 2 calibre/caliber pairs, while token-only matching yields 69, 19, and 1; neither count is an allowlist. Review multi-axis clusters together, including all four `harbor`/`harbour` plus `defence`/`defense` forms, and map each approved source directly to one target.
- Official-name clusters require their own canonical evidence. The five-record `jmsdf` plus Japan/Japanese and defence/defense cluster should map directly to `japan-maritime-self-defense-force`; `hms-defense` can map to `hms-defence`; US official terms such as `suppression-of-enemy-air-defenses` remain explicit exceptions. No global spelling rewrite is allowed.
- Exact singular/plural pairs only after subject identity is confirmed. The registry contains 366 simple `slug` / `slug+s` pairs, including 18 gun/guns and 5 ship/ships pairs. This count is a review inventory, not permission to pluralize all topics.
- Display tokens whose generic title casing is visibly wrong: lowercase `mm`; uppercase or exact forms for `QF`, `OTO`, `AA`, `CIWS`, `UAV`, `UUV`, `ASROC`, `SSN`, `SSBN`, and `CV`; and existing special titles such as `Live Q&A` and `U-Boats`. The current display correction affects 55 unique stored records; all 55 still have generated summaries containing the same bad casing and therefore require summary regeneration when their titles change. Existing `QF` records are already correct, but the token rule remains useful for future defaults.

Examples such as `42-commando`, `62-commando`, `73rd-highlanders`, year ranges, ship designations, Type-number names, and unit numbers demonstrate why numeric rewriting must never be global.

## External Naming Baseline

Sources checked 2026-07-16. Recheck product/designation styling if implementation is materially delayed.

- Generic visible metric measurements follow the BIPM SI convention: a space separates the number and unit symbol, `mm` stays lowercase, and unit symbols are not pluralized. This governs titles such as `57 mm Guns`; it does not dictate the URL slug. See the [BIPM SI Brochure](https://www.bipm.org/en/si-brochure-9).
- Generic editorial taxonomy uses UK English, while official American proper names retain their sourced spelling. This matches the [GOV.UK English and proper-name guidance](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/).
- Manufacturer and model styling is evidence-owned, not inferred from the generic SI formatter. BAE uses forms including `57mm Mk110`, `Bofors 57 Mk3`, and `40Mk4`; Leonardo uses `OTO 76/62 SR`; Rheinmetall uses both branded names such as `Oerlikon Searanger 20` and descriptive `20 mm Oerlikon Cannon KAE`. Preserve those exact distinctions with exact display or alias rules rather than a global joined-`mm` rewrite. See [BAE Systems 57 mm product terminology](https://www.baesystems.com/en/product~57mm-naval-gun-system~), [Leonardo OTO 76/62 SR](https://electronics.leonardo.com/en/products/76-62-super-rapid), and [Rheinmetall naval air-defence terminology](https://www.rheinmetall.com/en/products/air-defence-systems/naval-air-defence).
- Every active manufacturer, official-name, or historically ambiguous rule must identify its authoritative web source or transcript/shard evidence in `notes`. If authoritative sources conflict, keep the rule in `review` and preserve useful sourced variants as aliases only after collision review.

## Authoritative Flat-File Contract

Create this tracked, manually curated file:

`src/derived/topic-normalization-patterns.tsv`

It is authored policy, not generated output. Skills read it but do not edit it during ordinary transcript curation or shard auditing. Broad changes to it require an explicit taxonomy or normalization task.

Use UTF-8 TSV with this fixed ten-column header. Require exactly ten fields on every data row; tabs or line breaks are forbidden inside field values.

```text
rule_id	status	scope	match_kind	match	replacement	canonical_title	aliases_json	legacy_route	notes
```

Column meanings:

- `rule_id`: unique stable identifier for review and test output.
- `status`: `active`, `review`, or `disabled`. Only `active` rules can change a slug or title.
- `scope`: one or more of `creation`, `migration`, and `display`, joined in that canonical order with `+`, for example `creation+display`. The ambiguous value `both` is invalid.
- `match_kind`: `exact`, `regex`, or `token`.
- `match`: an exact slug/token or a fully anchored regular expression.
- `replacement`: the canonical slug, replacement template, or canonical token.
- `canonical_title`: exact title or title template; blank only when the rule does not own the title.
- `aliases_json`: a JSON array of approved search aliases. Aliases are never treated as slug mappings.
- `legacy_route`: `redirect` or `none`. Every first-pass source-slug merge uses `redirect`.
- `notes`: short rationale, exception, and evidence pointer with no tabs or line breaks. Active manufacturer, official-name, and ambiguous historical rules require a URL or repo-relative transcript/shard pointer here.

Representative rows, shown for schema intent rather than as an implemented file:

```text
rule_id	status	scope	match_kind	match	replacement	canonical_title	aliases_json	legacy_route	notes
metric-57mm-singular	active	migration	exact	57mm-gun	57-mm-guns	57 mm Guns	["57mm gun"]	redirect	Confirmed screenshot duplicate
metric-57mm-joined	active	migration	exact	57mm-guns	57-mm-guns	57 mm Guns	["57mm guns"]	redirect	Confirmed screenshot duplicate
metric-57mm-canonical	active	display	exact	57-mm-guns	57-mm-guns	57 mm Guns	["57 mm gun"]	none	Canonical generic calibre topic
metric-mm-create	active	creation	regex	^([0-9]+)mm-guns$	$1-mm-guns	$1 mm Guns	[]	none	Future generic metric calibre construction
token-mm	active	display	token	mm	mm		[]	none	SI unit remains lowercase
```

### Rule precedence and validation

1. Active exact rules win over active regex rules; regex rules win over token/display fallback rules.
2. First-pass migration rules and every rule with `legacy_route=redirect` must use `match_kind=exact`. Creation may use exact or fully anchored regex rules. Token rules are display-only. Regex and token rules cannot create legacy routes.
3. Regex syntax and replacement templates use the JavaScript/ECMAScript Unicode contract, including `$1` capture references; the parser must compile every expression before accepting the catalog.
4. A parser must reject duplicate rule IDs, invalid statuses/scopes/kinds, malformed JSON aliases, invalid output slugs, unanchored regexes, incompatible scope/kind/legacy-route combinations, two destinations for one source, conflicting canonical titles, mapping chains, cycles, and ambiguous active matches within a scope.
5. A canonical target must not itself be an active migration source. Multiple deprecated sources may map directly to one target.
6. Well-formed `review` rows report unresolved candidates but never alter data or fail merely because they remain unresolved. Malformed fields, invalid regexes, or other catalog-schema violations in any status still invalidate the catalog.
7. An active exact migration rule with `legacy_route=redirect` and no remaining source reference or source registry record is fulfilled, not stale. It remains active as a permanent deprecation tombstone and redirect source unless an explicit URL-retirement change removes it. Zero-match warnings apply only where absence is unexpected.
8. Classify findings as warning, review, or blocker. Pre-existing unrelated alias/title collisions are review findings, not migration edges; any collision introduced or changed by the active plan is a blocker until resolved. Catalog invalidity, active-rule ambiguity, stale reviewed-plan inputs, and metadata conflicts are also blockers.

## Canonical Naming Policy for the First Pass

- Generic metric calibre topics: `<number>-mm-guns`, titled `<number> mm Guns`.
- Generic inch-calibre topics: numeral-based canonical slugs and correctly punctuated titles; plural `Guns` for the category.
- Named systems, manufacturers, marks, models, and mounts remain specific and may remain singular.
- Numeric compound adjectives retain visible hyphenation, for example `74-Gun Ships` and `32-Pounder Guns`.
- Use British English for generic editorial taxonomy, subject to exact official-name exceptions.
- Preserve established acronyms and manufacturer styling through token or exact display rules.
- Gun-calibre ranges continue to use `to` in the slug, such as `4-to-5-inch-guns`.
- Decimal-inch construction continues to distinguish `4-5-inch-guns` from a range or date. Date, designation, ordinal, regiment, command, and Type-number patterns require explicit rules or review.
- Never merge a generic calibre topic with a manufacturer-specific or weapon-system topic merely because both contain the same measurement.
- Never infer equivalence solely from title similarity, an alias, singular/plural spelling, usage count, creation order, or the current generated card order.

## Tooling Design

### Parser and resolver

Add `src/site/topic-normalization.ts` and focused tests in `src/site/topic-normalization.test.ts`.

The module should:

- parse the TSV with line-numbered errors;
- validate the complete catalog before analyzing any shard;
- resolve creation, migration, and display rules deterministically;
- expose exact legacy-slug-to-canonical-slug mappings separately from search aliases;
- produce a read-only normalization plan containing affected shards, topic arrays, registry records, title changes, alias changes, redirects, warnings, and blockers;
- expose one shared `defaultTopicSummary(title)` classifier/formatter so a generated summary can be identified before a title changes and regenerated afterward;
- compute a canonical catalog SHA-256 for generated-data provenance and reviewed-plan binding;
- perform no writes from its pure parsing/planning functions.

Move current hardcoded special-title, uppercase-token, and terminal decimal-inch policy behind the parsed catalog where practical. Keep generic title tokenization in code; keep evolving exceptions and canonicalization policy in the TSV.

Add a formatting-preserving shard editor with focused tests. The current corpus mixes inline and multiline arrays, so whole-file `JSON.parse` / `JSON.stringify` is not acceptable. Use a JSON AST/range editor such as `jsonc-parser`, or an equivalently tested in-repo tokenizer, to replace only the top-level and segment `topics` array spans. Reparse each postimage and prove that every byte outside the intended spans and every non-topic JSON value is unchanged.

### Read-only audit and explicit apply command

Add a dedicated CLI, for example `src/scripts/normalize-video-topics.ts`, with these modes:

- default or `--dry-run`: analyze and print the deterministic change plan; write no source or generated data, with `--plan-output` as the only requested artifact write;
- `--plan-output <path>`: write canonical JSON containing the resolved catalog and catalog hash, every input path and preimage SHA-256, proposed operations and postimage SHA-256 values, warnings, blockers, and a digest of the complete plan;
- `--check`: write nothing and exit nonzero when any active source mutation is pending, including slug, title, generated-summary, or normalization-owned alias changes, or when the catalog/data is invalid;
- `--apply --plan <path>`: under the existing shared-writer lease, reparse the catalog, recompute or resume the reviewed plan according to the transaction state machine, and never substitute a newly different plan;
- `--patterns-input <path>` and `--segments-input <path>`: support focused fixtures and temporary validation.

Define package scripts unambiguously:

- `audit:topic-normalization`: build and run read-only `--check` without acquiring a writer lease;
- `normalize:video-topics`: build and run the default dry-run/plan writer without acquiring a writer lease;
- `normalize:video-topics:apply`: invoke `.codex/hooks/site-content-pipeline-lock.mjs run --build --purpose topic-normalization --recover-stale -- ... --apply`.

The CLI must refuse `--apply` unless `CONTENT_PIPELINE_LOCK_TOKEN` is present and matches the active lease owner record immediately before planning and again before the first write; mere environment-variable presence is insufficient. The lease serializes participating shared writers only; transcript curators and shard auditors deliberately do not join it. The maintenance pause plus reviewed preimage hashes is therefore mandatory. Ordinary site generation must never turn a newly activated rule into an implicit multi-shard rewrite.

### Synchronization and generation integration

Update `src/site/topic-store.ts`, `src/scripts/sync-video-topics.ts`, and `src/scripts/generate-site-data.ts` so they load the same catalog and complete normalization preflight before appending or generating topics.

- Split synchronization into a pure `planTopicStoreSynchronization` phase and an explicit write phase.
- Parse and validate the catalog, scan the full corpus, and reject every pending active source mutation before the synchronizer can write `topics.json` or the generator can write archive data. This preflight must happen before the current synchronization call.
- Synchronization may continue appending genuinely new canonical registry records.
- Neither command may rewrite shard files implicitly.
- Existing non-decimal numeric-review diagnostics remain, but the TSV becomes the preferred resolution source.
- Add `--patterns-input` to synchronization and generation, add `patternsInput` plus the catalog SHA-256 to generated manifest provenance, and pass the same resolved catalog into archive construction.
- Add the TSV to `.codex/hooks/site-build-if-changed.mjs` archive and site fingerprints and to `.codex/hooks/validate-content-pipeline.ps1` so policy changes cannot be skipped by either supported build path.
- Prove that an invalid catalog or pending active mutation leaves both `topics.json` and the generated archive byte-identical.

### Migration behavior

The explicit apply operation must load the reviewed plan, rehash the entire corpus under the lease, and abort globally before its first write if any active family has a blocker. A family can be deferred by returning all of its rules to `review`; `--apply` never silently skips one blocked active family while applying the rest. It then:

1. Replace approved deprecated slugs in every shard's top-level `topics` array and every segment `topics` array.
2. Preserve first-seen array order and remove duplicate canonical values created by a many-to-one replacement.
3. Use the formatting-preserving range editor; only changed topic arrays may produce shard diffs.
4. Keep the specified canonical registry record and canonical title.
5. Classify every summary against `defaultTopicSummary(currentTitle)` before changing any title. Preserve the sole non-default summary within a family, including one from a deprecated source when the canonical summary is still generated. If distinct non-default summaries conflict, block the apply. If none exists, regenerate the default summary from the canonical title so old casing does not survive.
6. Treat former source titles and aliases as candidates during dry-run, but retain them only after review materializes each approved value in the relevant rule's `aliases_json`. Apply the catalog union after normalized collision checks, drop duplicates and values normalized equal to the canonical title, and preserve unrelated canonical aliases as ordinary `topics.json` metadata. Do not promote default summaries into aliases or treat unlisted source metadata as normalization-owned policy.
7. Remove only explicitly mapped deprecated registry records after confirming zero live references remain.
8. Preserve all unrelated and intentionally unused registry records.
9. Keep the canonical record's current position; if it does not yet exist, insert it at the earliest mapped source position.
10. Treat `src/pipeline/atomic-write.ts` as per-file protection, not corpus atomicity. Before the first commit, stage every postimage and an exact preimage backup under an ignored digest-named transaction directory and verify their hashes. Persist a journal containing the reviewed digest and completed steps. Commit in a reference-safe order: first write an expanded registry with canonical records present while deprecated records remain; next rewrite shards; last prune deprecated registry records.
11. Implement an explicit apply state machine. With no journal, every input must match its preimage. A matching in-progress journal may resume only when each file matches its expected preimage or postimage and the completed-step record agrees. A matching completed journal with every final postimage returns a byte-identical no-op. Any other state aborts and preserves the evidence for recovery. After transaction cleanup, reusing the old plan is correctly rejected as stale; post-migration idempotence is then proved with a freshly generated empty plan.
12. Leave generated archive files untouched until supported generation runs.
13. Run a second in-memory resolution pass before success and require zero pending active source mutations, zero missing topic references, a fulfilled redirect mapping for every retired slug, and an idempotent second plan.

### Legacy topic routes

Search aliases do not preserve URLs. Every removed first-pass slug must therefore remain routable.

- Keep source `topics.json` at schema version 1 and semantic-only. Derive redirects from fulfilled active catalog tombstones even after deprecated registry records are removed.
- Add required `legacySlugs: string[]` to every generated canonical topic in `src/site/archive-data.ts` and `site/src/data/archive.ts`. Bump the logical archive schema from 2 to 3 and the split manifest schema from 3 to 4; update generator tests, the Astro adapter, and `.codex/hooks/site-build-if-changed.mjs` validation so stale generated data is rejected.
- Record `patternsInput` and the catalog SHA-256 in the generated manifest. Add the TSV to both archive and site fingerprints. Before the `site:build:generated` cache short-circuit as well as before Astro/Pagefind, compare generated provenance with the current catalog and stop on stale data rather than skipping or building old redirects against new policy.
- Validate that every legacy slug is well formed, globally unique, disjoint from all canonical slugs and other redirect sources, and attached to an existing canonical target. Legacy slugs never increment topic, video, or segment counts.
- Make `getTopicPaths()` return discriminated props such as `{ kind: "canonical", topic }` and `{ kind: "redirect", legacySlug, canonicalTopic }`.
- Extend `site/src/pages/topics/[slug].astro` so canonical slugs render the normal topic page and legacy slugs render a minimal static HTML redirect document. Because GitHub Pages cannot emit a true HTTP 301 here, the stub must use an absolute canonical link, `robots=noindex,follow`, a zero-delay HTML refresh, and a clear fallback link.
- Branch before the normal `BaseLayout` metadata/body path, or add a rigorously tested non-indexable layout mode, so redirect pages emit no Pagefind body, type metadata, or topic filters and are absent from the built Pagefind index.
- The topic directory, counts, related videos, and related time notes must include only the canonical topic.
- Add a rendered-output verifier for every fulfilled redirect rule and its canonical destination, including canonical URL, refresh target, fallback link, `noindex`, Pagefind exclusion, and canonical relationship counts.

If route redirects are deliberately rejected during implementation, stop for an explicit owner decision before removing any deprecated registry record. Silent URL breakage is not an accepted default.

## Skill and Guidance Updates

The detailed naming patterns should live in the TSV. Durable prose should state when to read it, what statuses may be applied, and each workflow's write boundary.

### `$naval-transcript-to-site-content`

Update `.agents/skills/naval-transcript-to-site-content/SKILL.md` to:

- read `src/derived/topic-normalization-patterns.tsv` after the schema and processing-config references;
- resolve every new topic slug through rules whose scope includes `creation` before writing it;
- replace active exact deprecated mappings found in the explicitly selected shard, deduplicating only that shard's topic arrays;
- leave `review` and ambiguous matches unchanged and identify them in the handoff;
- report active mappings applied and unresolved candidates;
- never edit the TSV, `topics.json`, another shard, redirects, generated data, or shared validation output, and never invoke the corpus-wide apply command.

### `$naval-site-content-auditor`

Update `.agents/skills/naval-site-content-auditor/SKILL.md` to:

- read the TSV before evaluating the selected shard's topic arrays;
- apply active exact mappings only inside that selected shard while preserving evidence-backed topic specificity;
- use active creation rules for newly added topics;
- replace the unconditional "preserve established slugs" wording with "preserve established slugs unless an active shared rule explicitly deprecates them";
- report applied mappings and unresolved review candidates;
- retain the selected-shard-plus-one-log-line write boundary and all existing shared-output prohibitions, including a ban on invoking the corpus-wide apply command.

### `$naval-site-build-repair`

Update `.agents/skills/naval-site-build-repair/SKILL.md` to:

- read the TSV for topic-title, alias, missing-topic, duplicate-taxonomy, or normalization failures;
- run the read-only normalization audit before adding a registry record or manually changing a reference;
- use the dedicated apply command for an already active mapping instead of ad hoc multi-file replacement;
- require explicit topic-normalization scope before editing the TSV or performing a broad migration;
- delegate transcript-semantic ambiguity to the content auditor rather than guessing;
- delegate generated archive, Astro route, redirect, and Pagefind implementation to `$naval-video-page-prototype` rather than widening build-repair logic;
- verify all references, registry consolidation, legacy redirects, regeneration, and focused/full checks after an authorized repair.

### Site implementation routing

Use `.agents/site-archive-builder.md` with `$naval-video-page-prototype` for the generated `legacySlugs` contract, manifest-version changes, Astro route discrimination, redirect document, and Pagefind exclusion. That skill consumes the normalization output but does not originate or approve taxonomy mappings, so it needs no topic-naming authority.

### Companion guidance

Replace duplicated detailed numeric/calibre paragraphs with concise TSV pointers and boundary-specific duties in:

- `AGENTS.md`;
- `.agents/transcript-content-curator.md`;
- `.agents/site-content-auditor.md`;
- `.agents/skills/naval-transcript-to-site-content/references/segment-seed-schema.md`;
- `src/derived/site-content-processing.config.json`;
- `README.md` for the human dry-run/check/apply workflow.

Do not weaken any shard-only boundary while centralizing the rules.

Add resolver golden tests for active creation/exact mappings and review no-ops, plus static guidance-contract tests proving each skill names the TSV and retains its write prohibitions. Do not claim that a repository test can prove future model behavior from Markdown instructions alone.

## Implementation Phases

### Phase 0: Establish a maintenance window and baseline

- [ ] Record `git status --short --branch` and preserve unrelated changes. The planning review found `main` one commit ahead with this note untracked, but no tracked shard or registry input dirty; do not describe that as a clean worktree.
- [ ] Identify the transcript/audit shard writers that must be paused for the later activation/apply window. They do not participate in the shared lease, so the lease alone is insufficient.
- [ ] Recompute current registry, used-slug, unused-record, shard, alias-collision, and candidate-family counts.
- [ ] Capture separate top-level-video and segment-reference counts, exact source files, and evidence for every first-pass mapping.
- [ ] Capture SHA-256 values for `topics.json`, the pattern catalog, and every shard before approving an apply plan.
- [ ] Stop if a writer changes a mapped shard, `topics.json`, the pattern file, or generated archive inputs after the reviewed plan is created.

Acceptance: one current, reproducible before-state exists, the later operational pause is explicit, and no unrelated file is claimed or overwritten.

### Phase 1: Implement and validate the TSV contract

- [ ] Add the flat file with the fixed field, scope-set, compatibility, and evidence rules above. Move already-satisfied special-title, decimal, and uppercase-token behavior into active catalog rows in the same change so default-title behavior never regresses. Enter newly mutating migration and existing-record display corrections as `review` initially; do not create a long-lived build-blocking interval before tooling and redirects exist.
- [ ] Add parser/resolver tests for valid rows, exact field counts, malformed fields, invalid JSON, invalid slugs, scope ordering, scope/kind compatibility, precedence, conflicts, chains, cycles, overlap, fulfilled redirect tombstones, stale rules, and review-only rows.
- [ ] Move applicable display-token and exact-title exceptions out of hardcoded arrays into the catalog.
- [ ] Prove generic fallback title formatting still works when no rule matches.

Acceptance: one catalog produces deterministic decisions, new candidate rules remain non-mutating, and invalid catalogs fail before any content read/write plan is applied.

### Phase 2: Add corpus audit, planning, and explicit apply tooling

- [ ] Add dry-run, check, and apply modes.
- [ ] Add the formatting-preserving topic-array editor and prove bytes outside edited spans remain identical on representative inline and multiline shards.
- [ ] Inventory both video-level and segment-level topic arrays.
- [ ] Produce exact changed-file and before/after slug counts per rule.
- [ ] Add registry metadata merge, collision reporting, source-record pruning, and idempotence checks.
- [ ] Add canonical reviewed-plan output, plan digest, per-file pre/post hashes, stale-plan rejection, staged preimage/postimage backups, transaction journal, safe commit order, and resume/rollback behavior.
- [ ] Add the exact package scripts, apply-only lease integration, and direct-apply lock-token guard.
- [ ] Split topic synchronization into plan/write phases and make catalog/normalization preflight precede every registry or archive write.
- [ ] Add catalog fingerprints, manifest provenance, and read-only pipeline validation.

Acceptance: dry-run is byte-preserving; blockers and stale reviewed inputs abort before the first write; apply is crash-safe and resumable or rollback-safe; no interrupted prefix has dangling topic references; and a second apply is a no-op.

### Phase 3: Implement the versioned generated-data and redirect contract

- [ ] Add catalog path/hash provenance and required `legacySlugs` arrays to generated topic data; bump and validate the logical and split-manifest schemas.
- [ ] Update `src/site/archive-data.ts`, `site/src/data/archive.ts`, and the build-hook validator for the new contract and stale-catalog detection.
- [ ] Generate discriminated canonical/redirect topic paths and a minimal non-indexable static HTML redirect document.
- [ ] Add collision, count-isolation, rendered-HTML, canonical-target, and Pagefind-exclusion tests.
- [ ] Use `.agents/site-archive-builder.md` with `$naval-video-page-prototype` for this site-facing phase.

Acceptance: fulfilled catalog mappings can produce durable static redirects without duplicate topic records, stale generated data is rejected, and no mapping has been activated merely to exercise the route code.

### Phase 4: Update all three skills and companion guidance

- [ ] Make each named skill read and apply the TSV according to its boundary.
- [ ] Centralize duplicated naming details and leave short responsibility pointers in companion documents.
- [ ] Validate that curator and auditor permissions remain one shard plus the required processing-log append.
- [ ] Add resolver golden tests plus static guidance-contract tests for TSV use, review no-ops, one-shard boundaries, and the prohibition on invoking the broad apply command.

Acceptance: all three skills use the same active catalog and no shard-only workflow gains shared-output authority.

### Phase 5: Curate, activate, dry-run, and approve the first migration

- [ ] Review the complete nine-record screenshot/74-gun core, five exact metric-spacing pairs, bounded number-word and decimal families, explicit spelling/official-name clusters, and display corrections. Keep every unapproved edge as `review`.
- [ ] Activate only evidence-reviewed exact migration edges and bounded display/creation rules; broad regex migration, alias-derived equivalence, and semantic guessing remain inactive.
- [ ] Add/remove/narrow aliases under the collision policy, including the `ships-of-the-line`, `74-gun-ships`, and `third-rates` cleanup.
- [ ] Materialize every former source title or alias that should survive as a normalization-owned search term in the relevant `aliases_json`; do not rely on one-time implicit import during apply.
- [ ] Record every deferred candidate family and why it is unsafe to automate.
- [ ] Begin the operational maintenance pause, recheck the tracked input hashes, and run the catalog audit and normalization dry-run with `--plan-output .tmp/topic-normalization-plan.json`.
- [ ] Review every affected shard, canonical target, merged title, merged alias, curated-summary conflict, alias collision, and legacy route.
- [ ] Confirm generic and manufacturer-specific subjects remain separate.
- [ ] Confirm the plan leaves all unmapped shard bytes and all unrelated unused registry records unchanged.
- [ ] Save report output under `reports/` only if a persistent artifact is needed; do not turn this task note into generated report storage.

Acceptance: the exact canonical plan JSON and digest are approved before writes, all inputs still match its preimage hashes, and it contains no unresolved blocker.

### Phase 6: Apply source normalization and legacy routes

- [ ] Apply the reviewed plan exactly once with `normalize:video-topics:apply -- --plan .tmp/topic-normalization-plan.json` under the shared-writer lock.
- [ ] Preserve the transaction journal until the final pruned-registry step and verify resume/rollback behavior if the run was interrupted.
- [ ] Re-run the same apply command while the completed journal exists and require a byte-identical no-op, then generate a fresh dry-run plan and require it to contain no source operations.
- [ ] Confirm all mapped shard arrays are canonical and deduplicated.
- [ ] Confirm each approved family has one canonical registry record.
- [ ] Confirm no deprecated source record remains unless it is intentionally retained by an explicit review decision.
- [ ] Confirm every retired slug has a fulfilled catalog redirect tombstone; generated redirect files are verified only after Phase 7 generation.
- [ ] Rerun dry-run/check and require no pending active source mutation.
- [ ] Run topic synchronization and require a byte-identical no-op; any appended registry record means apply was incomplete.

Acceptance: source data is canonical and idempotent before archive generation.

### Phase 7: Regenerate and validate the public site

- [ ] Run supported topic synchronization and archive generation; never hand-edit generated archive JSON.
- [ ] Verify canonical topic counts equal the union of former family references without double-counting.
- [ ] Verify topic directory cards show one canonical 57 mm, 76 mm, and 74-gun topic.
- [ ] Verify canonical titles and approved aliases in topic filtering and built Pagefind search.
- [ ] Verify every fulfilled legacy route emits the canonical/noindex/refresh/fallback contract and is excluded from topic indexes and Pagefind.
- [ ] Run focused tests, repository checks, Astro checks, a forced production build, and `git diff --check`.
- [ ] Retain the transaction backups through rendered verification; remove the ignored transaction directory only after all checks pass and record the applied plan digest in the handoff.

Acceptance: source, generated data, rendered pages, redirects, and search all agree on the canonical mapping.

## Focused Test Matrix

- Exact many-to-one families for 57 mm, 76 mm, and 74-gun ships, including `seventy-four-gun-ships`.
- Metric spacing pairs for generic and manufacturer-specific subjects without cross-merging those scopes.
- Decimal-inch and `to`-range behavior from the implemented historical baseline.
- `five-point-two-inch-guns` resolves to the evidence-backed 5.25-inch family while `nine-four-inch-guns` remains 9.4 inches.
- Lowercase `mm` and exact acronym/manufacturer casing.
- British generic spelling, four-way harbor/harbour plus defence/defense clustering, the JMSDF official-name cluster, and official-name exceptions.
- False-positive protection for dates, `42-commando`, `73rd-highlanders`, `761st-tank-battalion`, Type-number subjects, and ship designations.
- Dry-run leaves the TSV, registry, and every shard byte-identical.
- Format-preserving edits leave every byte outside the selected topic-array spans unchanged on inline and multiline fixtures.
- One source matching conflicting rules aborts before writes.
- Mapping chains and cycles fail validation.
- Top-level and segment arrays both normalize and deduplicate in first-seen order.
- Default summaries are classified before title changes and regenerated from canonical titles; a sole non-default source summary within a family is promoted; conflicting curated summaries block the entire active apply until that family returns to `review`.
- Unmapped shards and unrelated unused registry topics remain unchanged.
- Aliases normalized equal to the canonical title are dropped; cross-topic collisions are reported but never treated as equivalence.
- Invalid catalogs and pending active changes leave synchronization and generation outputs byte-identical.
- A changed preimage or catalog rejects a reviewed plan before writes; direct apply without matching active lease ownership fails.
- Fault injection after each commit stage proves journaled resume or rollback and reference completeness.
- First apply changes the expected files; second apply is byte-identical; fulfilled redirect tombstones are not reported as stale.
- Generated archive schema/provenance validation rejects a stale catalog and contains one canonical topic with correct counts, titles, aliases, and legacy slugs.
- Legacy redirect pages carry absolute canonical, `noindex,follow`, refresh, and fallback metadata; omit Pagefind metadata/body; and are absent from Pagefind results.

## Validation Sequence

Use the fixed Windows Node/npm installation if the roaming shim fails. Allow at least 15 minutes for the full Astro/Pagefind build.

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run build
node --test dist/site/topic-normalization.test.js dist/site/topic-array-editor.test.js dist/site/topic-store.test.js dist/site/archive-data.test.js
& 'C:\Program Files\nodejs\npm.cmd' run normalize:video-topics -- --dry-run --plan-output .tmp/topic-normalization-plan.json
# Review the canonical plan JSON and digest before the only mutating apply step.
& 'C:\Program Files\nodejs\npm.cmd' run normalize:video-topics:apply -- --plan .tmp/topic-normalization-plan.json
# The completed-journal replay must be a byte-identical no-op.
& 'C:\Program Files\nodejs\npm.cmd' run normalize:video-topics:apply -- --plan .tmp/topic-normalization-plan.json
& 'C:\Program Files\nodejs\npm.cmd' run audit:topic-normalization
$topicStoreHashBeforeSync = (Get-FileHash -LiteralPath 'src/derived/video-segments/topics.json' -Algorithm SHA256).Hash
& 'C:\Program Files\nodejs\npm.cmd' run sync:video-topics
if ((Get-FileHash -LiteralPath 'src/derived/video-segments/topics.json' -Algorithm SHA256).Hash -ne $topicStoreHashBeforeSync) { throw 'Topic synchronization was not a byte-identical no-op.' }
& 'C:\Program Files\nodejs\npm.cmd' run audit:site-content -- --no-output --limit 0
& 'C:\Program Files\nodejs\npm.cmd' run check
& 'C:\Program Files\nodejs\npm.cmd' run generate:site-data
& 'C:\Program Files\nodejs\npm.cmd' run site:check:generated
& 'C:\Program Files\nodejs\npm.cmd' run site:build:generated -- --force
node dist/scripts/check-rendered-topic-redirects.js
git diff --check
```

After the production build, verify at minimum:

```text
/naval-history-with-dr-alex/topics/
/naval-history-with-dr-alex/topics/57-mm-guns/
/naval-history-with-dr-alex/topics/57mm-gun/       -> canonical 57 mm route
/naval-history-with-dr-alex/topics/57mm-guns/      -> canonical 57 mm route
/naval-history-with-dr-alex/topics/76-mm-guns/
/naval-history-with-dr-alex/topics/76mm-gun/       -> canonical 76 mm route
/naval-history-with-dr-alex/topics/76mm-guns/      -> canonical 76 mm route
/naval-history-with-dr-alex/topics/74-gun-ships/
/naval-history-with-dr-alex/topics/74-gun-ship/     -> canonical 74-gun route
/naval-history-with-dr-alex/topics/seventy-four-gun-ships/ -> canonical 74-gun route
```

## Out of Scope for This First Pass

- Fuzzy or embedding-based topic merging.
- Treating all aliases as synonyms or redirects.
- Global singularization/pluralization.
- Global number-word conversion.
- Global American-to-British spelling replacement without proper-name review.
- Merging broader and narrower concepts such as `ships-of-the-line` and `74-gun-ships`.
- Merging generic calibres with manufacturer-, mark-, mount-, or weapon-system-specific topics.
- Rewriting transcript evidence, public segment prose, segment IDs/slugs, video IDs, timestamps, or source paths.
- Running topic migration automatically inside routine transcript curation, content auditing, site synchronization, or site generation.
- Completing all 366 singular/plural pairs or all 315 alias/title collisions in this initial effort.

## Final Acceptance Checklist

- [ ] `src/derived/topic-normalization-patterns.tsv` is the single detailed source for normalization-owned policy and passes strict validation; `topics.json` remains authoritative for unrelated curated metadata.
- [ ] The nine screenshot/74-gun source records resolve to exactly three canonical topics with correct visible titles.
- [ ] The approved first-pass metric, calibre, spelling, inflection, and display rules are applied consistently.
- [ ] No active shard references a deprecated slug, no active source mutation remains pending, and every redirect tombstone is fulfilled rather than misreported as stale.
- [ ] Each approved family has one canonical registry record and one public topic card.
- [ ] Canonical counts equal the former union without duplicate references.
- [ ] Default summaries follow corrected titles, each sole non-default curated summary within a family is preserved where applicable, and conflicting curated summaries cannot be silently discarded.
- [ ] Search aliases remain separate from slug equivalence, are collision-checked, drop canonical-equivalent redundancy, and retain useful former wording.
- [ ] Every retired first-pass slug has a tested static HTML legacy redirect and no redirect appears in Pagefind or canonical topic counts.
- [ ] Curator and auditor skills consult the file but remain shard-only writers.
- [ ] Build repair uses the shared audit/apply path and does not invent taxonomy mappings.
- [ ] `$naval-video-page-prototype` owns the generated archive, route, and Pagefind implementation without gaining taxonomy-approval authority.
- [ ] Routine synchronization/generation preflight all pending active source mutations before writes and never rewrite shards implicitly.
- [ ] The reviewed plan digest, input-hash gate, formatting-preserving edits, transaction recovery, and second-apply idempotence checks pass.
- [ ] Generated schema/provenance validation rejects stale catalog data, including on the generated-data-only build path.
- [ ] Focused tests, repository checks, generation, Astro/Pagefind build, rendered-route checks, and `git diff --check` pass.
- [ ] Review-status candidates remain available for the next optimization pass with no claim of complete taxonomy normalization.

## Recommended Execution Boundary

Implement and test tooling with new candidate rules still in `review`. Begin the coordinated writer pause only for final activation, reviewed-plan creation, apply, generation, and rendered verification. Keep the pattern/tooling/skill work and its first explicit migration in the same reviewed change set so new rules, source references, registry records, redirects, and generated output cannot drift apart.

Stop after the first-pass acceptance checklist. Report the active rules added, review rules deferred, exact source and generated files changed, canonical families and reference counts, aliases removed or merged, legacy redirects created, validation commands and results, and any proper-name or semantic conflicts left for the next pattern-optimization pass.
