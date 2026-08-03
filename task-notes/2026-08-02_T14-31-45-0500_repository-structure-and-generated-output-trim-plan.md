# Repository Structure and Generated Output Trim Plan

Timestamp: 2026-08-02T14:31:45-05:00

Reviewed: 2026-08-02T20:33:25-05:00

Status: Phase 0 was completed on 2026-08-02 as a measurement-only checkpoint; its baseline and repeatable canary are recorded in `task-notes/2026-08-02_T16-50-00-0500_repository-trim-phase-0-baseline.md`. Phase 1 was completed on 2026-08-02 after its reviewed generator callers, writer-lease help example, and archive-integrity assertion were corrected and the full Phase 1 gate was rerun; see `task-notes/2026-08-02_T18-03-44-0500_repository-trim-phase-1-bun-command-promotion.md`. Phase 2 implementation completed on 2026-08-02 and is recorded in `task-notes/2026-08-02_T20-24-59-0500_repository-trim-phase-2-source-read-only-build-graph.md`; its source-read-only, missing-archive, topic-canary, and Pagefind gates passed, but its complete validation gate remains blocked by the previously recorded topic-policy and ranking fixtures. Phase 3 remains unauthorized and blocked. A separate topic-curation run completed part of the Phase 6 subject-matter baseline after the original snapshot; that verified current state is recorded below but does not authorize any remaining phase. Implement phases strictly in numeric order, update only the authorized phase's checkpoint, and do not continue automatically.

## Purpose

Reduce avoidable repository weight and maintenance churn while preserving the proven channel, transcript, curation, Astro, and Pagefind workflows. The first concrete target is the deterministic split archive under `site/src/data/generated/archive/`: GitHub Pages already builds it from canonical source, yet the current checkout also tracks 144.08 MiB of generated JSON.

The process model below was distilled when this note was created from the completed AE&B cleanup recorded at `C:\Workspaces\ancient-egypt-and-the-bible\task-notes\2026-08-01_T20-03-18-0500_project-structure-trim-plan.md`:

- establish the supported human workflow before deleting commands or files
- identify one canonical source for every derived projection
- keep network acquisition separate from offline validation and human/agent curation
- remove aliases, reports, dependencies, duplicate validation, and migration residue only after finding their callers and proving an equivalent supported path
- implement small phases with independent validation and rollback points
- preserve historical task notes as decision evidence

The AE&B reference deliberately deferred its generated site/search tracking decision. This plan takes up that decision for the naval repository because the owner has now explicitly requested it. The legacy-JSON history-rewrite plan is not the reference for this work and is out of scope.

Future implementation must use the conclusions already recorded in this note; it must not inspect or modify the sibling AE&B checkout unless the owner explicitly requests that separate cross-repository work.

## Relationship to Existing Naval Plans

- `task-notes/2026-07-26_T12-31-20-0500_src-structure-rationalization-plan.md` remains a separate, dormant planning artifact. No phase here authorizes its directory moves, schema relocation, `src/derived/` renaming, topic-registry separation, processing-log path migration, or `.local/`-to-`.secrets/` credential move.
- This plan assumes the current paths named in `AGENTS.md`. If any path-changing phase from the July 26 plan is implemented first, stop and rebaseline this plan rather than combining phases or translating paths opportunistically.
- Phase 7 may remove proven command or migration residue, but it must not become an implicit implementation of the July 26 source-tree redesign. That redesign requires its own explicit phase authorization and refreshed measurements after this trim work.
- `task-notes/2026-07-12_T04-33-05-0500_remove-archive-json-from-git-history-plan.md` remains separate and out of scope. Current-tree untracking in Phase 3 does not authorize history rewriting.

## Accepted Decisions and Hard Boundaries

1. **Canonical source stays tracked.** Preserve:
   - `src/channel/episodes.json`, `src/channel/video-metadata.json`, `src/channel/ignored-videos.json`, and channel guidance
   - `src/transcripts/manifest.json` and `src/transcripts/txt/`
   - `src/derived/video-segments/`, including its authored per-video shards and shared `topics.json`
   - `src/derived/topic-normalization-patterns.tsv`
   - `src/derived/site-content-processing.config.json` and append-only `src/derived/site-content-processing.log`
   - `site/src/`, except its deterministic `data/generated/archive/` subtree
   - source, tests, agent/skill instructions, and Markdown task notes
2. **Generated site data is not canonical content.** `site/src/data/generated/archive/` is reconstructed from the canonical files above. Once all fresh-clone consumers generate it safely, stop tracking that directory and ignore it.
3. **This is a current-tree and future-churn cleanup, not a history rewrite.** Removing generated files from the current index will not erase their old blobs from Git history or immediately shrink every packfile. Any later history rewrite requires a separate plan and explicit approval.
4. **Treat the complete Codex topic-curation process as a critical, non-negotiable project contract.** Do not delete, weaken, silently rename, or make optional its generators, documentation, inputs, commands, or on-disk outputs:
   - `reports/video-segment-audit-risk.tsv`
   - `reports/video-topic-usage.tsv`
   - `reports/topic-normalization-review.tsv`
   The first report supports manual shard prioritization. The latter two are companion inputs to the owner's Codex topic-curation process and are generated together by `report:video-topic-usage`. Preserve `src/derived/topic-normalization-patterns.tsv`, `src/derived/video-segments/topics.json`, authored shard topic references, `report:video-topic-usage`, `sync:video-topics`, and `audit:topic-normalization` with them. These reports remain supported on-demand, ignored local reports unless the owner separately requests that reports become versioned source. Nothing in this trim plan may retire one of these surfaces; doing so would require a separate explicit owner-approved replacement plan with full workflow parity.
   The report files do not need to exist in a fresh clone before the command runs, but invoking the command must always produce both topic reports successfully; one companion output may not become optional.
5. **Keep both Pagefind implementations.** The official packaged Pagefind path remains the portable default and GitHub Pages path:
   - `site:build:pagefind`
   The custom workspace binary remains an explicit supported alternative:
   - `site:build:pagefind:workspace`
   - `site:build:workspace-pagefind`
   Do not make deployment depend only on the custom sibling checkout, remove the official package, or collapse the two validation paths into custom-only behavior.
6. **Prefer Bun where an equivalent Node and Bun maintenance task already exists.** Promote the proven Bun implementation to the canonical unsuffixed command and remove the duplicate public variant after caller migration. This decision currently applies to exactly four pairs; it is not authorization to rewrite every Node/Astro/npm task in Bun.
7. **npm remains the package/install surface and Node remains required.** Astro, the official Pagefind package, hooks, tests, and unpaired scripts may remain Node-based. Pin and install Bun as an additional runtime for the four proven maintenance paths.
8. **Preserve the writer leases and atomic-write protections.** Ignoring a generated output does not make concurrent writes safe. Topic synchronization must retain its canonical-source writer lease and atomic `topics.json` update; archive generation must retain its generated-output writer lease, per-file atomic writes, manifest-last publication, hash checks, and complete-directory validation.
9. **Make build and archive generation source-read-only before untracking.** Today `generate:site-data` plans and writes topic-store synchronization before it creates the archive, so a nominal build can modify tracked `src/derived/video-segments/topics.json`. Phase 2 must make `sync:video-topics` the only command that writes the canonical topic registry. `generate:site-data`, `site:dev`, `site:check`, `site:build`, and GitHub Pages must validate registry completeness and fail with an actionable synchronization instruction instead of silently repairing tracked source. This boundary must be complete before Phase 3.
10. **Preserve user-managed staging and unrelated work.** A later implementation must not stage, unstage, commit, push, or rewrite history unless explicitly requested.

## Confirmed Supported Weekly Workflow

Treat this owner-supplied sequence as the workflow cleanup must preserve:

1. Fetch and reconcile channel inventory plus official metadata:

   ```powershell
   npm run fetch:video-links
   ```

   The current bare command writes the canonical episode master and then synchronizes missing or due metadata. Keep `fetch:video-metadata` as an independently rerunnable refresh/repair path unless a consumer review proves it unnecessary.

2. Fetch every eligible missing transcript with conservative pacing:

   ```powershell
   npm run alternate:fetch:transcripts:safe
   ```

   Official YouTube Data API inventory/metadata and caption scraping are different acquisition systems. Keep them as separate commands and failure domains.

3. For each newly stored exact TXT, run one single-agent curation task:

   ```text
   <video transcript txt file> process with $naval-transcript-to-site-content
   ```

   The exact transcript selects one manifest-owned shard. The skill writes only that shard and appends its one required processing-log result line. It must not run shared generation, tests, builds, schedules, or other shards.

4. For each resulting exact shard, run at least two independent single-agent full-transcript audits:

   ```text
   <video shard file> process with $naval-site-content-auditor
   ```

   Each audit owns only that shard plus its required processing-log append. A same-model/configuration pass that adds no transcript-backed substance may be recorded as saturated, but the owner-required minimum is still two audit runs per newly curated file. Additional passes remain valid when a stronger model, greater effort, improved method, or new evidence is available.

5. Explicit shared topic synchronization, generated archive creation, tests, Astro, and Pagefind are repository-owner integration work after shard processing. Run the source-writing `sync:video-topics` boundary before the source-read-only archive/build boundary when new topic records are required. Do not fold those shared operations into either file-scoped skill.

Cleanup may make the deterministic handoff clearer, but it must not combine these ownership boundaries or turn the file-scoped Codex work into a multi-file/subagent batch.

## Confirmed Codex Topic-Curation Workflow

Topic curation is a separate, explicitly authorized corpus-maintenance workflow. It is not part of `$naval-transcript-to-site-content` or `$naval-site-content-auditor`, whose ownership remains one exact transcript/shard plus the required processing-log append. A request such as the following authorizes the topic-maintenance workflow, not transcript-content rewriting:

```text
Curate the topics. In that cleanup/curation, make sure to clean up and specify any
"type-<number>" to what it is related to.
```

### Critical non-regression contract

Every implementation phase, including Bun promotion, generated-archive untracking, dependency trimming, report cleanup, command consolidation, and CI restructuring, is blocked unless this workflow continues to satisfy all of the following:

- `report:video-topic-usage` completes from a fresh installed clone and emits both companion TSVs at their established paths with their human-readable schemas and exact source/action context intact
- the two ignored topic TSVs are required companion outputs of each report run, not committed fresh-clone prerequisites
- `video-topic-usage.tsv` continues to expose usage, subject/entity classification, aliases, normalization inputs, similarity candidates, co-topic context, and the potential-duplicate review flag rather than becoming a reduced count-only report
- `topic-normalization-review.tsv` continues to expose rule/collision kind, both topic slugs where applicable, rule/candidate data, source counts, exact shard/segment or registry sources, details, and recommended action
- `src/derived/topic-normalization-patterns.tsv` remains tracked, editable policy; `topics.json` and shard topic arrays remain tracked, reviewable authored state; ignored reports and generated archive files never replace them as source of truth
- `sync:video-topics` remains deterministic, lease-protected, and additive for genuinely missing registry records; it must not become an implicit corpus rewrite, AI description writer, or old-topic deletion step
- `audit:topic-normalization` remains a read-only validator and preserves its ability to detect policy violations and title/alias collisions
- the documented Codex handoff can still use both reports, inspect exact source contexts, record mappings and nomenclature evidence, migrate reviewed references, preserve manual descriptions/aliases, and validate the result

If an optimization changes any command implementation, report schema, path, or shared writer boundary, it must prove this complete contract in isolation and in the fresh-clone integration gate. A smaller output, a successful exit code, or a passing site build alone is not parity.

The supported process is:

1. Run the canonical `npm run report:video-topic-usage` command. It must continue to generate both:
   - `reports/video-topic-usage.tsv` for usage counts, subject/entity classifications, aliases, normalization inputs, similarity candidates, co-topic context, and the potential-duplicate review flag
   - `reports/topic-normalization-review.tsv` for exact review-rule matches, title/alias collisions, current shard or registry sources, details, and recommended action
2. Read both reports together. The usage report supplies discovery and context; the normalization review report supplies actionable policy/collision findings and exact source locations. Neither report alone is a safe automatic rewrite queue.
3. Build a reviewed old-slug-to-canonical-slug mapping before edits. Inspect every listed shard/segment and the topic registry when the same label may refer to different classes, systems, eras, or countries. Transcript context determines whether the topic belongs; authoritative online nomenclature is supporting evidence for the standard name when needed.
4. Update authored sources coherently: the active rules in `src/derived/topic-normalization-patterns.tsv`, every affected video-level and segment-level topic reference in the curated shards, and `src/derived/video-segments/topics.json`. Do not hand-edit `site/src/data/generated/archive/` or treat a generated report as canonical source.
5. Run `npm run sync:video-topics` to materialize any genuinely missing canonical records, regenerate both topic reports, and run the read-only `npm run audit:topic-normalization`. Generated archive, Astro, and Pagefind validation remain repository-owner integration work after authored topic changes.

### Type-designation naming policy

For a Type-designated ship class, the canonical topic slug is:

```text
type-<designation>-<singular-vessel-kind>
```

Examples include `type-26-frigate`, `type-45-destroyer`, and `type-212-submarine`. The referent-bearing suffix is required: a bare `type-212` or generic `type-212-class` is incomplete when the evidence identifies a submarine. The vessel kind remains singular in the canonical slug, so `type-26-frigates` and `type-212-submarines` are aliases or migration inputs, not canonical slugs.

This rule is about Type-designation topics, not a global instruction to singularize every ordinary `<name>-class-*` topic. It also must not turn every `type-*` token into a ship class. Use the singular, evidence-backed referent for other designations, such as `type-267-radar` or `type-24-torpedo-boat`, and retain a more precise design suffix when it denotes a distinct design, such as a separately evidenced `type-212a-submarine` or `type-212cd-submarine`.

Do not merge Type 212, Type 212A, and Type 212CD merely because their strings are similar. Inspect the actual sources and decide whether a record denotes the general family, the German/Italian 212A design, the German-Norwegian 212CD design, or an imprecise reference that can safely map to a broader canonical topic. Preserve official and common plural names as aliases where useful for search, but do not use aliases as a substitute for migrating authored references.

Primary-source nomenclature checks already support the pattern:

- The Royal Navy calls the City Class the [Type 26 frigate](https://www.royalnavy.mod.uk/equipment/ships/city-class) and also uses “Type 26 frigates” in running prose. The canonical slug can therefore be singular while retaining the plural form as an alias.
- The German Navy states that its squadron operates [Type 212A submarines](https://www.bundeswehr.de/en/organization/navy/structure/flotilla-1/1-submarine-squadron), while the Bundeswehr equipment page uses [U-Boot-Klasse 212A](https://www.bundeswehr.de/de/ausruestung-technik-bundeswehr/seesysteme-bundeswehr/u-boot-klasse-212-a). This supports `submarine` as the referent but also shows why the `A` suffix must not be discarded without source review.
- TKMS identifies the [HDW Class 212CD](https://www.tkmsgroup.com/submarines/submarine-classes/hdw-class-212-cd) as a Common Design submarine based on the 212A platform. This supports a separate `type-212cd-submarine` canonical topic rather than collapsing 212CD into Type 212 or 212A.

When nomenclature remains ambiguous, prefer an official navy, defence ministry, shipbuilder, museum, or archival source. Record the chosen source and rationale in the mapping ledger or normalization-rule note. Web research resolves naming; it does not override transcript evidence or justify adding an otherwise unsupported topic.

## Reference-Project Evidence Reviewed

The corrected AE&B reference plan and its implementation series were reviewed:

| Commit | Relevant guidance |
| --- | --- |
| `d6f5253` | Recorded the cleanup plan, reduced command aliases, clarified the supported workflow, and separated local configuration from reports. |
| `4e44cbc` | Removed an obsolete canonical-data projection, simplified source-to-site flow, replaced the broad Google client, and reduced the lockfile/dependency closure. |
| `02d8851` | Preserved two independently rerunnable acquisition stages while removing redundant transcript commands and strengthening retry/checkpoint behavior. |
| `d8b3c4c` | Assigned report ownership, made diagnostics conditional, and retired an unconsumed report subsystem. |
| `f27530a` | Consolidated validation/CI and shared parsing instead of running overlapping full-corpus passes. |
| `f650049` | Retired completed bootstrap/migration residue only after proving fresh-clone and recovery paths did not use it. |

Reusable conclusions:

- current implementation is not automatically a permanent contract when it is fresh migration residue
- a report is retained because a person or machine consumes it, not merely because a generator exists
- one canonical network-free validation graph should be called by local and CI wrappers
- broad dependencies should be replaced only with fixture-backed parity, retry, pacing, and error-safety tests
- current-tree cleanup and destructive Git-history cleanup are separate projects

## Measured Naval Repository Baseline

Snapshot originally taken 2026-08-02 before this plan was written and refreshed for directly measurable volatile rows during the 15:53 review. These values are evidence, not permanent acceptance constants; Phase 0 must remeasure them from a coordinated quiet state and clean validation clone.

| Item | Measured value | Consequence |
| --- | ---: | --- |
| Public npm scripts | 51 | The command surface merits a caller/ownership review. |
| Node/Bun public pairs | 4 | The owner has selected Bun as canonical for these pairs. |
| Tracked generated archive | 67 files, 151,074,107 bytes (144.08 MiB) | This is deterministic duplicate checkout content and the primary untracking target. |
| Commits touching the generated archive | 77 | Routine transcript/topic work repeatedly churns large derived files. |
| Tracked curated shard store | 2,143 files, 101,231,379 bytes (96.54 MiB) | Canonical authored content; keep tracked. |
| Tracked canonical TXT store | 2,142 files, 182.53 MiB | Transcript source of record; keep tracked. |
| Canonical metadata/policy snapshot | 8 files, 15.99 MiB | Keep tracked. |
| Local Git loose objects | 410.66 MiB | Current-tree untracking alone will not remove historical objects. |
| Local Git packs | 254.94 MiB | Record again after ordinary cleanup, but do not promise pack shrink without a separate history project. |
| Installed `node_modules` | 28,916 files, 574.14 MiB | Dependency cleanup can materially improve installs. |
| Installed `googleapis` directory | 1,851 files, 197.87 MiB | Only two source modules import it; this is a high-value parity replacement candidate. |
| Current local Bun | 1.3.14 | Record and pin an explicitly tested Bun version before making Bun mandatory in CI. |

Current report policy and observed files:

- `reports/` is ignored by `.gitignore`; the tracking baseline records all three owner-kept TSVs as untracked on-demand output.
- `reports/video-segment-audit-risk.tsv` exists locally and is 443,270 bytes.
- `reports/video-topic-usage.tsv` exists locally and is 8,029,764 bytes after the post-plan topic-curation run.
- `reports/topic-normalization-review.tsv` is the mandatory companion output; the refreshed file is 137 bytes and contains only its header because the current audit has no review findings.
- The post-plan topic-curation run migrated the reviewed bare, generic `-class`, and plural ship-designation references to singular referent-bearing canonical slugs. `type-212`, `type-212-class`, and `type-212-submarines` now remain only as active normalization inputs for `type-212-submarine`; `type-212cd` resolves separately to `type-212cd-submarine`.
- A scan of the refreshed usage report found no current canonical Type-designation slug in the selected bare numeric, generic `-class`, or plural ship-referent shapes. The unrelated general topic `type-numbers` is not a vessel designation and is intentionally outside that rule.
- The read-only `audit:topic-normalization` review on 2026-08-02 covered 2,142 shards, 25,258 registry topics, and 25,212 used topics with 0 blockers and 0 review findings. Phase 6 must preserve this completed baseline and add durable documentation/regression coverage rather than redoing the corpus migration without new evidence.
- Other existing reports require the Phase 6 consumer/lifecycle review before retention or retirement.

Current build observations:

- `generate:site-data` writes the manifest plus 64 segment buckets, videos, and topics into `site/src/data/generated/archive/`. The reviewed `index.json` uses split-manifest schema version 7 and declares 2,142 videos, 58,958 segments, and 25,258 topics; the reconstructed logical archive remains schema version 6.
- The archive writer is deterministic and lease-guarded. It writes each JSON file atomically, verifies data-file hashes, publishes `index.json` after the data files, removes extra JSON, and validates the complete directory.
- `site/src/data/archive.ts` eagerly reads the manifest and every declared JSON file from disk during module initialization; it does not statically import the JSON modules. It still requires generation before Astro check/dev/build in a fresh clone.
- `generate:site-data` currently calls topic-store synchronization and can write tracked `topics.json` before archive creation. That source mutation is an explicit Phase 2 blocker for safe on-demand generation and untracking.
- `site:check` generates the archive before Astro checking.
- `site:build` validates and generates when needed, then runs Astro and the official Pagefind command by default.
- `site:dev` currently assumes generated data is already present, which becomes unsafe after untracking.
- The Pages workflow currently runs `site:check` and then `site:build`. In a fresh runner the first command generates the archive but does not populate the build wrapper's archive cache, so the second command can generate the same archive again.
- The Pages workflow does not currently run the ordinary TypeScript test suite, search-ranking regression, or rendered-video-date regression.
- `check:site-seo` recompiles TypeScript internally even when an earlier canonical check could already have produced `dist/`.
- Both official and custom Pagefind branches already exist in `.codex/hooks/site-build-if-changed.mjs`; preserve that architecture.
- `src/pipeline/shared-output.test.ts`, README, AGENTS, agent briefs, and skills encode the current tracked archive, source-writing generator behavior, and Node/Bun pair policy. They must change in the same phase as each policy, not be left stale.
- README and AGENTS currently document `rank:video-segment-audit-risk`, and the CLI help prints that retired name, while `package.json` exposes `report:video-segment-audit-risk`; correct all live guidance/help without renaming the retained report command or rewriting completed historical notes.
- The ordinary transcript batch currently skips a ready video with a recorded previous failure unless `--retry-failed` is supplied. That behavior must be reconciled with the owner's routine use of the safe command before retry aliases are removed.

## Source, Generated, and Retained-Artifact Policy

| Surface | Policy after implementation | Reason |
| --- | --- | --- |
| `src/channel/` canonical stores | Keep tracked | Official inventory and metadata authority. |
| `src/transcripts/manifest.json` and `src/transcripts/txt/` | Keep tracked | Transcript mapping and source of record. |
| `src/derived/video-segments/` | Keep tracked | Authored public study-guide source. |
| Topic normalization policy, processing config, and processing log | Keep tracked | Authored policy and durable processing evidence. |
| `site/src/data/generated/archive/` | Generate, validate, ignore, and stop tracking | Deterministic 144.08 MiB build input reconstructed locally and in GitHub. |
| `site/dist/`, `.astro/`, `dist/`, `.tmp/` | Keep ignored | Local/CI build and cache artifacts. |
| Owner-kept report TSVs | Keep all three supported and ignored | Human/Codex-consumed on-demand reports, not canonical source. |
| Topic normalization catalog, topic registry, and authored shard references | Keep tracked | Policy plus authored taxonomy state used by the Codex curation workflow. |
| Official Pagefind output/path | Keep supported; official deployment default | Portable production search path. |
| Custom workspace Pagefind path | Keep supported and independently testable | Local/custom performance path without replacing the official package. |
| Historical Markdown task notes | Keep tracked | Decision and process evidence. |

## Phase 0: Establish Baselines and Invariants

Status: completed 2026-08-02. Checkpoint: `task-notes/2026-08-02_T16-50-00-0500_repository-trim-phase-0-baseline.md`.

Owner correction: Node/Bun equivalence and performance proof predated this plan. The Phase 0 Node/Bun measurements are retained only as historical checkpoint evidence; they are not an instruction to compare the runtimes again in Phase 2 or any later phase.

### Tasks

- Record the current source revision, current-tree file counts/sizes, Git object/pack measurements, dependency/install measurements, script count, and build timings.
- Retain the logical archive counts and representative hashes recorded in the completed checkpoint. Do not produce new Node/Bun generator comparisons.
- Historical completed check only: the four then-existing Node/Bun pairs were run against isolated temporary outputs or read-only operations. Do not repeat this runtime comparison in later phases.
- Record official Pagefind build/index size, page count, representative search rankings, and runtime.
- When the sibling custom Pagefind binary is available, record the same measurements for the workspace path in an isolated/sequential run. Absence of the sibling binary must not fail the official baseline.
- Record the exact files read and written by the supported weekly commands without making live network requests during ordinary baseline validation.
- Run and preserve an end-to-end topic-curation canary: generate both topic reports into isolated report paths, validate their headers and representative exact source/action fields, run the read-only normalization audit, and run topic synchronization against an isolated copy. Record counts and hashes so later Bun/cleanup phases can detect semantic loss, not merely command success. Use the reviewed 0-blocker/0-review state as a comparison point, not as a substitute for the fresh baseline.
- Create or use a clean validation clone under `C:\Workspaces` for fresh-clone gates. Do not use the user's active checkout as proof of missing-generated-output behavior, because it already contains generated files and caches.

### Exit Gate

- Baseline commands pass or every pre-existing failure is recorded with evidence.
- Both Pagefind paths have an explicit owner and validation route.
- The complete topic-curation non-regression contract has a recorded baseline and repeatable canary.
- No tracked source, tracked generated output, report-policy, or Git-policy change occurs in this phase. Temporary/ignored baseline artifacts may be created only in the named isolated locations.

## Phase 1: Promote the Proven Bun Paths to Canonical Commands

Status: completed 2026-08-02. Checkpoint: `task-notes/2026-08-02_T18-03-44-0500_repository-trim-phase-1-bun-command-promotion.md`. The reviewed generator callers and writer-lease help example now invoke the Bun CLI, the build-wrapper test structurally couples `ensureBuiltSite` to archive-integrity validation, and the full Phase 1 gate was rerun. No later repository-trim phase is authorized or implemented.

The Bun migration is closed. Phases 2-7 validate the unsuffixed canonical Bun commands only. They must not execute retired Node CLI variants, rerun Node/Bun output comparisons, or add Node/Bun performance benchmarks. Runtime-neutral TypeScript modules may remain as implementation details where they still have callers.

The four completed migrations were:

| Canonical name to retain | Duplicate name to retire after migration |
| --- | --- |
| `report:video-topic-usage` | `report:video-topic-usage:bun` |
| `sync:video-topics` | `sync:video-topics:bun` |
| `audit:topic-normalization` | `audit:topic-normalization:bun` |
| `generate:site-data` | `generate:site-data:bun` |

### Tasks

- Change each unsuffixed command to invoke the current Bun worker entrypoint and preserve its existing arguments, output paths, writer-lease purpose, atomic writer, diagnostics, and exit semantics.
- Pin the tested Bun runtime for local/CI use and install it in GitHub Actions before any canonical Bun command runs. Keep npm and `package-lock.json` as the dependency-install contract.
- Update README, AGENTS, current agent/skill instructions, PowerShell validation hooks, build wrappers, and tests to call the unsuffixed canonical command.
- Make validation hooks call repository-owned npm commands instead of restating the Node direct-entrypoint command when the existing lease token can be inherited safely.
- Refactor shared logic into runtime-neutral modules where a Bun CLI currently imports a Node direct-execution file. Do not duplicate parsers, writers, or business logic merely to remove the Node CLI.
- Update usage text and error prefixes so each promoted CLI names the unsuffixed canonical command and does not advertise its retired `:bun` alias.
- Remove the `:bun` aliases only after repository search and tests prove that no current caller remains.
- Remove a Node-only direct entrypoint only if its exported implementation has a clear new home and CodeGraph plus tests show no remaining caller. It is acceptable to retain a `.ts` implementation module while Bun is the only public CLI.
- Do not convert `fetch:video-links`, transcript acquisition, Astro, npm install, official Pagefind, or other unpaired commands to Bun in this phase.

### Validation Gate

- Completed historical gate: each canonical command reports `runtime=bun` and matched the retained logical/byte contracts. Later phases validate those canonical commands directly and do not rerun Node/Bun comparisons.
- The Bun report command preserves both topic TSV schemas, row/source/action semantics, ordering, and deterministic output; the Bun audit and synchronization paths preserve the complete critical contract, not only their exit codes.
- Topic synchronization still joins the shared lease and atomically updates only `topics.json` when needed.
- Archive generation still validates every manifest-listed file and SHA-256.
- All three mandatory reports still generate at their documented paths.
- The GitHub runner can install dependencies and run canonical Bun commands from a fresh clone.

## Phase 2: Build Once and Make Missing Generated Data a Supported State

Status: implementation completed 2026-08-02; checkpoint: `task-notes/2026-08-02_T20-24-59-0500_repository-trim-phase-2-source-read-only-build-graph.md`. The full gate remains blocked by six pre-existing topic-policy test expectations and the pre-existing `queen-elizabeth-class` ranking fixture. Phase 3 remains unauthorized and blocked. Do not rerun the full Phase 2 validation campaign; any authorized correction must target only the named blocker or a changed code path and reuse the retained Phase 2 evidence.

Complete this phase before untracking the archive.

### Tasks

- Separate canonical topic synchronization from archive generation before changing any fresh-clone entrypoint:
  - keep `sync:video-topics` as the only command that may write `src/derived/video-segments/topics.json`
  - add a shared non-writing topic-sync check/plan path that returns a nonzero result when registry additions are required
  - make `generate:site-data` consume that check and fail with an actionable `npm run sync:video-topics` instruction instead of calling `writeTopicStoreSynchronization`
  - preserve the topic-normalization catalog hash/provenance and review diagnostics without granting the generator a canonical-source write
- Add fixtures proving that a missing topic record makes generation fail without changing any canonical input byte, explicit synchronization adds only the missing blank-description record under its lease, and repeated synchronization plus generation is a no-op on tracked source.
- Make `site:dev` validate or generate the archive before Astro starts only after generation is source-read-only. A fresh clone must not require a remembered manual generation step and starting the development server must not edit tracked source.
- Keep `site:check` as a generation-owning public command and `site:check:generated` as an internal no-regeneration stage.
- Create one canonical network-free validation graph with clearly named layers, following the AE&B pattern:
  - quick type/syntax checks
  - functional unit/content contract tests
  - offline source and generated-data validation
  - CI policy that adds production Astro/Pagefind and worktree/whitespace checks
- Make Pages run the ordinary tests and source validators, not only Astro/SEO commands.
- Generate the archive once per clean CI job. After `site:check` generates it, use the existing generated-data build path or a new single orchestrator rather than calling a cache path that regenerates solely because no local cache exists.
- Split `check:site-seo` into build-owning and already-built layers, or otherwise prevent redundant TypeScript compilation in the canonical CI sequence.
- Run `check:search-ranking` and `check:rendered-video-dates` after the production Pagefind build.
- Keep the official Pagefind command as the Pages default. Keep the custom workspace commands as explicit local/workspace alternatives. The official/custom manifest, page-count, and representative-search comparison was a one-time Phase 2 gate and must not become a routine later-phase benchmark unless a later change affects either Pagefind path.
- Preserve the current 15-minute-or-greater timeout guidance for full Astro/Pagefind builds.
- Add a fresh-clone test that begins with no `site/src/data/generated/archive/`, runs only documented public commands, and succeeds through Astro and official Pagefind.
- Include the topic-curation canary in the fresh-clone job before any generated archive is untracked: both topic reports, the read-only audit, and the non-writing synchronization check must work without relying on an old checkout's ignored files or caches.

### Validation Gate

- A clean clone with the generated archive physically absent passes type/tests, archive generation, Astro check, full official Pagefind build, SEO validation, search ranking, and rendered-date validation.
- The same clone passes the critical topic-curation report/audit canary with both companion reports complete.
- Hashes of every tracked canonical input, including `topics.json`, are unchanged by `generate:site-data`, `site:dev` startup validation, `site:check`, `site:build`, and the Pages build. A deliberately incomplete isolated registry fails before archive publication and names the explicit synchronization command.
- CI performs exactly one archive-generation stage per clean build unless source changes during the run.
- Official Pagefind deployment remains independent of `..\pagefind`.
- The custom workspace path still works when its binary is present and fails with a clear prerequisite when it is absent.

## Phase 3: Stop Tracking the Deterministic Split Archive

Status: not started.

### Tasks

- Add an anchored ignore rule for `/site/src/data/generated/archive/`.
- Remove the 67 generated files from the Git index in one ordinary cleanup change while allowing local regeneration to recreate ignored working files.
- Add a cross-platform repository-policy command for Git checkouts that fails if `git ls-files -- site/src/data/generated/archive` returns any path and fails if an archive probe is not ignored. Keep this out of ordinary library unit tests; non-Git source packages must receive a clear not-applicable result rather than an unrelated test failure.
- Preserve generator support for `--output-dir` so tests can generate into isolated directories.
- Retain the deterministic generation comparison already proven in Phase 2. Because Phase 3 changes tracking and ignore policy rather than generator behavior, do not rerun that comparison unless Phase 3 also changes generator code or output.
- Update current contracts in README, AGENTS, `.agents/site-archive-builder.md`, `$naval-video-page-prototype`, `$naval-site-build-repair`, and relevant shared-output tests:
  - the archive is generated and ignored
  - it is never hand-edited
  - `generate:site-data`, `site:dev`, `site:check`, and `site:build` own or invoke source-read-only regeneration
  - file-scoped transcript/content skills do not write it
  - `index.json` remains the runtime manifest even though it is no longer Git-tracked
- Do not rewrite completed historical task notes merely because they record the former tracked policy. Add a short superseding note to current guidance instead.
- Do not remove the archive manifest, integrity validation, 64-bucket contract, source provenance, atomic replacement, cache sentinels, or writer lease.
- Reuse the Phase 0 baseline and the Phase 2 build evidence. Record one post-untracking impact snapshot for tracked archive bytes, checkout size, and representative content-diff size. Capture archive, Astro, and Pagefind timing only from the single already-required validation build; do not add a benchmark harness, repeat builds for timing, or rerun Node/Bun comparisons. Report current-tree savings separately from unchanged historical Git object size.

### Validation Gate

- `git ls-files -- site/src/data/generated/archive` is empty.
- `git check-ignore -v --no-index -- site/src/data/generated/archive/index.json` identifies the intended anchored rule.
- A fresh clone contains no generated archive before generation and passes the complete Phase 2 validation through official Pagefind afterward.
- Archive untracking changes no topic-curation input, report schema, command behavior, exact-source traceability, policy catalog, registry, or authored shard reference.
- Regeneration changes no tracked file when canonical source is unchanged.
- Missing canonical topic records fail with the Phase 2 actionable error; regeneration never repairs `topics.json` implicitly.
- A representative source change produces only authored-source diffs; the regenerated 67-file archive remains ignored.
- Both Pagefind paths remain present and supported.

## Phase 4: Preserve and Simplify the Weekly Acquisition/Curation Handoff

Status: not started.

### Tasks

- Keep `fetch:video-links` as the supported full channel inventory plus missing/due metadata synchronization command.
- Keep `fetch:video-metadata` as an explicit refresh/repair command unless a concrete consumer audit proves it redundant.
- Keep `alternate:fetch:transcripts:safe` with its 60-second pacing as the owner's routine transcript command.
- Preserve valid-TXT skips, short-video policy, ignored-video policy, deferred readiness states, timestamped manifest-owned naming, checkpoints, partial-failure durability, and safe reruns.
- Correct the current failure-eligibility mismatch deliberately:
  - recommended behavior is for an ordinary later safe run to retry every ready record that still lacks valid TXT, while retaining backoff/circuit-break protection for blocking evidence
  - if previous failures are intentionally sticky instead, retain one clearly documented safe recovery command
  - retire `alternate:fetch:transcripts:retry` and `:retry:safe` only after one of those recovery contracts is implemented and fixture-tested
- Print one deterministic end-of-run handoff listing newly stored TXT paths, deferred records, failed records, and still-pending records so the owner can launch exactly one curator and at least two auditors per file.
- Audit the single-video transcript command and saved-HTML inventory commands for real repair/offline-fallback consumers. Do not delete them merely because they are absent from the routine weekly sequence.
- Keep official API inventory/metadata and public-caption scraping separate; do not wrap them in one transaction or make a caption failure roll back accepted inventory.
- Keep the two named content skills single-file, single-agent, and outside deterministic repository generation.

### Validation Gate

- Fixture tests cover no additions, multiple additions, missing/due metadata, stored TXT, deferred videos, previous failures, rate-limit/CAPTCHA circuit breaking, partial checkpoints, rerun recovery, and deterministic handoff output.
- No ordinary validation makes a live YouTube request.
- Any live report-only/API or transcript canary is separately authorized and does not overwrite canonical data unexpectedly.
- The exact owner workflow commands remain documented and supported.

## Phase 5: Replace the Broad `googleapis` Dependency

Status: not started.

The dependency currently occupies 197.87 MiB and 1,851 installed files. Only `src/youtube/channel-video-links.ts` and `src/youtube/video-metadata.ts` import it.

### Tasks

- Implement one narrow typed YouTube Data API client on Node 22 built-in `fetch` for the endpoints actually used by inventory and metadata: channels, playlist items, and videos.
- Preserve API-key precedence and redaction, uploads-playlist discovery, pagination, optional page limits, 50-ID video batches, one-second default pacing, checkpoint behavior, response normalization, ignored-video filtering, and guarded canonical writes.
- Inject fetch, sleep, and clock dependencies for offline fixtures.
- Preserve or explicitly implement bounded transient retries for transport failures, unreadable retryable responses, HTTP 408/429, and 5xx responses. Fail permanent 4xx and malformed successful payloads without leaking the API key.
- Reuse metadata returned by channel discovery where safe; keep the standalone metadata refresh/repair path for later state changes.
- Remove `googleapis` and its transitive lockfile closure only after fixture and live report-only parity gates pass.
- Record dependency count, installed files/bytes, clean `npm ci` time, type-check time, and command behavior before and after.

### Validation Gate

- Offline fixtures cover channels, playlist pagination, videos batching, empty/partial/malformed responses, transient retry success/exhaustion, permanent errors, timing, checkpointing, and secret redaction.
- `fetch:video-links` and `fetch:video-metadata` help/output contracts remain compatible.
- A separately authorized report-only bounded canary succeeds before canonical apply is considered.
- Transcript fetching remains on its separate caption-scraping implementation.

## Phase 6: Preserve the Codex Topic-Curation Workflow and Clarify Report Lifecycle

Status: partially satisfied by independent topic-curation work completed after this plan's original snapshot. The Type-designation corpus migration and zero-finding report/audit baseline are complete; durable workflow documentation, regression coverage, route-compatibility evidence, and the unrelated-report lifecycle review remain not started.

### Mandatory Keep Records

| Report | Generator | Owner/use | Policy |
| --- | --- | --- | --- |
| `reports/video-segment-audit-risk.tsv` | `report:video-segment-audit-risk` | Owner manually ranks shard follow-up work. | Keep generator, docs, and output path; remain ignored/on-demand. |
| `reports/video-topic-usage.tsv` | `report:video-topic-usage` (Bun after Phase 1) | Owner manually reviews topic usage, similarity, and co-topic context. | Keep generator, docs, and output path; remain ignored/on-demand. |
| `reports/topic-normalization-review.tsv` | `report:video-topic-usage` (Bun after Phase 1) | Codex and owner review exact policy matches, collisions, source locations, and recommended actions during topic curation. | Keep generator, docs, and output path; remain ignored/on-demand. |

### Retained Topic-Curation Surfaces

| Surface | Role | Boundary |
| --- | --- | --- |
| `src/derived/topic-normalization-patterns.tsv` | Tracked source of truth for active creation/display/review policy. | Taxonomy-maintenance work may edit it; shard-only skills may only read it. |
| `src/derived/video-segments/topics.json` | Tracked shared topic registry, titles, aliases, and manual descriptions. | Preserve manual descriptions; do not generate them with AI. |
| `src/derived/video-segments/*.json` topic arrays | Tracked authored video-level summary topics and segment-level granular topics. | Migrate only reviewed exact references; do not rewrite content prose merely to normalize a slug. |
| `report:video-topic-usage` | Discovery/report command that emits both topic reports. | Report-only; must not mutate authored sources. |
| `sync:video-topics` | Deterministically appends missing registry records. | It is not a corpus-rewrite or obsolete-record-removal command. |
| `audit:topic-normalization` | Read-only policy and collision validator. | Validation may report unrelated findings; do not silently widen a selected repair. |

These surfaces are permanent keeps for this trim plan. The general report/command consumer review below may classify and retire unrelated artifacts, but it may not retire or degrade any row in this table.

### Completed Type-Designation Baseline to Preserve

The corpus reconciliation completed after this plan's initial snapshot and before this review. Treat its result as current authored state, not as permission to repeat a global migration:

- reviewed bare, generic `-class`, and plural ship-designation inputs now resolve through active exact creation rules to evidence-backed singular referent-bearing slugs
- `type-212`, `type-212-class`, and `type-212-submarines` resolve to `type-212-submarine`; `type-212cd` resolves independently to `type-212cd-submarine`
- current canonical registry/report rows preserve Type 212 and Type 212CD as distinct designs; no current Type 212A canonical row should be invented merely to complete a numeric family
- official/common plural, class-name, acronym, and historic forms are retained as aliases where the completed review approved them
- the refreshed usage report has no selected bare numeric, generic `-class`, or plural ship-referent canonical slug, and the companion normalization-review report is header-only
- `audit:topic-normalization` currently reports 0 blockers and 0 review findings

Phase 6 must freeze that direction with fixtures for bare, `-class`, plural, singular, alphanumeric, Roman-numeral, non-ship, distinct-variant, and intentionally unresolved cases. Future Type-designation changes require new source evidence and a reviewed mapping; string similarity alone never authorizes merging Type 212, Type 212A, Type 212CD, or another family.

### Tasks

- Correct the stale `rank:video-segment-audit-risk` name in current README/AGENTS guidance and the CLI usage string to the retained `report:video-segment-audit-risk` package command. Do not rewrite completed historical notes.
- Document the example Codex prompt, both report inputs, the normalization catalog, registry, shard-reference migration, sync command, read-only audit, and generated-data handoff as one supported topic-curation workflow.
- Preserve the refreshed two-report baseline and record its headers/counts/hashes in the Phase 0 canary; ignored report files may later be regenerated, but their contract may not drift silently.
- Create a durable completion ledger for the already applied Type-designation mappings with old slug, canonical slug, referent, exact sources inspected, official nomenclature source when needed, aliases retained, collision/route impact, and decision. Reconstruct missing rationale from the current catalog and exact authored sources; do not remigrate the corpus merely to create the ledger.
- Add fixture tests that preserve the completed creation/display direction and distinguish bare, `-class`, plural, singular, alphanumeric, Roman-numeral, non-ship, distinct-variant, and intentionally unresolved Type designations. Include a regression scan that rejects contradictory active rules pointing a canonical singular ship topic back to a plural.
- Verify the catalog, registry, and all affected video-level/segment-level references agree with the completed mapping. Change authored state only if that verification finds a concrete regression; preserve nonblank human-written descriptions.
- Check the former public topic slugs against the generated redirect/route contract and record the compatibility result. A search alias is not automatically an HTTP redirect.
- After documentation/tests or any evidence-backed repair, regenerate both topic reports, run explicit `sync:video-topics`, regenerate the reports again if synchronization adds records, and run `audit:topic-normalization`. Resolve selected findings without claiming that unrelated future findings were fixed.
- Regenerate the archive through its canonical command and validate topic pages, duplicate routes/titles, representative searches, the official Pagefind contract, and the custom contract when its sibling binary is available. Record an unavailable custom binary as a prerequisite gap rather than failing the portable official path. The archive remains tracked until Phase 3 and is ignored afterward, and it is never patched directly.
- Inventory every other report and record: generator, human/machine consumer, generation trigger, clean-success behavior, failure behavior, retention period, and cleanup method.
- Prefer console status for ephemeral summaries, failure-only diagnostics for validators, and explicit `--report` output for optional detailed artifacts.
- Retire a generator/report only when current repository references, history origin, and owner review show no consumer. Preserve historical task notes that explain a retired report.
- Keep credentials and local configuration under ignored `.local/`, never under `reports/`.
- Keep all reports outside site archive generation and public pages unless explicitly designed as public content.

### Validation Gate

- All three mandatory keep reports regenerate successfully with stable human-readable TSV headers; the two topic reports are produced together by the canonical command.
- Their files are not deleted by cleanup helpers and are not accidentally staged by normal Git operations.
- Every reviewed Type-designation topic has a specific evidence-backed singular referent, or remains explicitly queued as unresolved; no selected bare, generic `-class`, or plural ship-form canonical slug survives silently.
- The policy catalog, registry, and every affected shard agree on each approved canonical slug, and repeat synchronization does not recreate a retired form.
- Official nomenclature sources and aliases are recorded for ambiguous cases, with Type 212/212A/212CD distinctions preserved where the evidence requires them.
- The completed 0-blocker/0-review baseline is covered by fixtures and a durable mapping/route-compatibility ledger, not merely by the current ignored report files.
- Every retained report has a documented owner and lifecycle.
- No report is made canonical source merely to justify keeping it.

## Phase 7: Consolidate Validation, Commands, and Migration Residue

Status: not started.

### Tasks

- Recount the public script surface after Phases 1-6 and classify every remaining command as routine, repair, low-level internal, local audit, or CI/build stage.
- Keep separate commands when they represent genuinely different boundaries, especially:
  - official versus custom Pagefind
  - inventory/metadata versus caption scraping
  - source-read-only archive generation versus `:generated` no-regeneration stages
  - local Lighthouse audit versus production SEO contract validation
- Remove aliases only when the base command exposes the same safe capability and all callers are migrated.
- Replace direct implementation restatements in `.codex/hooks/*.ps1` with canonical repository commands where lease ownership and error behavior remain correct. Retain a thin PowerShell wrapper if it still serves Windows/agent orchestration; do not keep a second command graph inside it.
- Verify whether `list:files-that-need-processing`, `report:transcript-problems`, the single-video fetcher, saved-HTML extraction commands, raw build commands, and Lighthouse preaudit aliases have active consumers before retaining or retiring them.
- Remove deprecated exported helpers such as `isPublishedButUnstarted` only after CodeGraph and repository searches prove no caller.
- Enable `noUnusedLocals` and `noUnusedParameters` in normal TypeScript validation here, then remove only compiler-confirmed dead locals/imports. Keep this broad compiler cleanup out of the Phase 2 fresh-clone/build-boundary change.
- Pin the actual supported Node/npm/Bun toolchain and add a version file so clean machines and GitHub use the tested versions.
- Ensure every build/test path removes or invalidates stale `dist` output before executing compiled tests.
- Add line-ending policy only where it resolves demonstrated churn in append-only logs or schedules; do not rewrite those files as a side effect.
- Keep package scripts readable. Do not introduce a general CLI framework unless two or more commands truly share argument and error semantics.
- Do not move source directories, schemas, canonical datasets, the topic registry, the processing log, or the credential directory under this phase. Those are July 26 source-structure-plan concerns and remain separately authorized.

### Validation Gate

- All current authoritative docs, skills, hooks, package scripts, workflows, and live CLI help name existing commands. Completed historical task notes may retain the command/path names that were accurate when written.
- One canonical CI command graph covers type checks, unit tests, source validation, generated archive validation, official Astro/Pagefind production output, SEO, ranking, dates, and whitespace/worktree policy.
- Custom Pagefind remains an additional supported path, not a replacement for official Pagefind.
- No canonical source, mandatory report, recovery capability, or historical task note was removed without recorded evidence.

## Deferred Repository-Weight Review

After the current-tree generated archive cleanup is stable, measure rather than assume whether further storage work is warranted.

Possible later questions:

- Can the Pages job use sparse/partial checkout without weakening transcript-evidence validation?
- Should heavy manual-only audit dependencies live in a separate tool package so ordinary `npm ci` is smaller?
- Is the normal clone size acceptable once generated archive churn stops?
- Does any canonical raw store belong in LFS, release assets, or another durable repository?

These are not authorized by this plan. Do not move canonical TXT, curated shards, manifests, logs, or topic policy; do not add Git LFS; and do not rewrite history without a separate owner-approved design and recovery plan.

## Implementation Order

Implement the phases strictly in numeric order. Do not advance a later-numbered phase ahead of an unfinished earlier-numbered phase.

1. Phase 0: measurements, invariants, and a repeatable full topic-curation canary.
2. Phase 1: make the already-proven Bun variants canonical and retire the duplicate public aliases.
3. Phase 2: separate source-writing topic synchronization from source-read-only archive generation, then make fresh-clone generation and one-pass CI reliable with the topic-curation canary.
4. Phase 3: untrack and ignore the deterministic split archive only after that canary passes from a clone where the archive starts absent.
5. Phase 4: simplify the acquisition/curation handoff without changing its ownership boundaries.
6. Phase 5: replace `googleapis` after parity tests.
7. Phase 6: preserve the completed Type-designation baseline, add its regression/route evidence, and finish topic-workflow plus report-lifecycle documentation.
8. Phase 7: retire only the now-proven command and migration residue; the critical topic-curation surfaces are excluded from retirement.

Do not combine phases merely because adjacent files overlap. A later request for `implement Phase N` authorizes only that phase and its checkpoint update. Phase 3 remains hard-blocked until Phase 2 proves that every archive/build entrypoint leaves tracked canonical inputs byte-identical.

## Final Validation Matrix

Use `C:\Program Files\nodejs\npm.cmd` when the roaming npm shim is broken. Full site builds must receive at least 900,000 ms.

| Area | Required proof |
| --- | --- |
| TypeScript | Type check, clean compile, unused-code checks, complete Node test suite. |
| Canonical Bun commands | The canonical four Bun commands pass their supported workflows. Node/Bun comparison and performance benchmarking are closed and must not be repeated. |
| Canonical data | Episode, metadata, manifest, TXT, shard, topic, processing-log, and normalization validators pass without network; explicit topic synchronization is the only archive-adjacent canonical writer. |
| Generated archive | Clean generation from absent output; manifest/schema/path/count/hash/provenance checks; second generation is deterministic; incomplete topic state fails without source mutation. |
| Git policy | Generated archive has no tracked paths and is ignored; generation and all site entrypoints dirty no tracked file. |
| Astro | `site:check` and a forced production build pass from a fresh clone. |
| Official Pagefind | Default build, representative queries, filters, ranking, output integrity, dates, and SEO checks pass. |
| Custom Pagefind | Keep the workspace path available. Reuse the completed Phase 2 evidence unless a later change affects this path or the owner explicitly requests another comparison. |
| Reports | All three mandatory keep TSVs regenerate and remain available for manual/Codex use; the two topic reports remain companion outputs. |
| Topic curation | Reports, normalization catalog, registry, authored shard references, sync, and read-only audit agree; selected Type designations use an evidence-backed singular referent and preserve distinct variants. |
| Acquisition | Offline fixtures prove inventory/metadata, safe transcript selection, retry/recovery, pacing, checkpoints, and handoff behavior. |
| GitHub Pages | Clean runner installs Node/npm/Bun, generates once, validates, builds with official Pagefind, uploads, and deploys the exact tested output. |
| Hygiene | `git diff --check` passes and a clean validation clone ends clean apart from intentionally ignored generated/report/build artifacts. |

## Rollback Principles

- Land each phase as a coherent ordinary change so it can be reverted without mixing later work.
- The Bun migration is closed. Later-phase rollback checks validate the canonical public commands and stable output contracts; they do not restore retired Node public aliases merely to rerun Node/Bun comparisons.
- If separating topic synchronization from generation breaks a supported path, restore the generator/check behavior coherently and keep Phase 3 blocked; do not compensate by allowing only one site entrypoint to mutate `topics.json`.
- If untracked generated data breaks a consumer, repair that consumer's generation boundary first. Temporarily reverting the coherent Phase 3 commit is safer than hand-adding selected generated shards.
- If the custom Pagefind path fails, the official packaged Pagefind path remains the deployment fallback by design. If official Pagefind fails, do not silently switch production to the custom binary without owner approval.
- Remove `googleapis` only after parity gates; restore the dependency and prior adapter together if the native client fails.
- Do not delete ignored owner reports during rollback or cleanup.
- No rollback step in this plan force-pushes, rewrites history, deletes canonical transcript/content data, or replaces the user's active checkout.

## Exit Criteria

This plan is complete when:

- `site/src/data/generated/archive/` is deterministic, generated on demand, ignored, and absent from Git's tracked current tree
- `sync:video-topics` is the sole canonical topic-registry writer, while archive generation and every site build/dev/check entrypoint are source-read-only and fail clearly on incomplete topic state
- fresh local and GitHub builds succeed when that directory starts absent
- routine source changes no longer produce 67-file generated archive diffs
- the four proven Bun maintenance paths are canonical and their duplicate public aliases are gone
- the official and custom Pagefind paths both remain supported, with official Pagefind still the portable deployment default
- the owner-supplied inventory, safe transcript, one-curator, and at-least-two-auditor workflow remains documented and functional
- `reports/video-segment-audit-risk.tsv`, `reports/video-topic-usage.tsv`, and `reports/topic-normalization-review.tsv` remain supported manual/Codex reports
- the Codex topic-curation workflow remains documented and functional, including both report inputs, normalization policy, source review, registry/shard migration, synchronization, audit, and generated-site handoff
- every cleanup phase has passed the topic-curation non-regression canary; no report field, exact-source pointer, policy capability, manual metadata, command boundary, or Codex handoff needed by the workflow was lost
- Type-designation topics use `type-<designation>-<singular-referent>` when the referent is known; bare, generic `-class`, plural ship forms, and distinct variants are reviewed rather than blindly merged
- GitHub runs one canonical network-free validation/build graph without redundant archive generation
- the broad Google dependency is removed only if parity, retry, pacing, and live report-only gates succeed
- every retired report, command, dependency, projection, or migration helper has recorded consumer evidence
- current-tree savings and unchanged historical Git size are reported honestly
- the separate July 26 source-tree rationalization plan remains unimplemented unless independently authorized and rebaselined
