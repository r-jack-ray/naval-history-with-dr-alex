# Shard Auditor Process-Call Review

Date: 2026-08-07 09:29:54 -0500

Scope: Review and report only. This note analyzes `.agents/skills/naval-site-content-auditor/SKILL.md` and its directly invoked synchronization and lease helpers. No audit, synchronization, generation, test, build, or Git command was run.

## Executive Finding

The main excess is the shared-output finalization attached to every audit pass. The shard/transcript comparison has unavoidable variable reads, but every completed pass also performs at least four fixed external calls, even when the shard is unchanged, saturated, or intentionally empty:

1. Acquire the shared-output lease.
2. Run corpus-wide topic synchronization.
3. Validate and append the processing-log row.
4. Release the lease.

The topic synchronizer is not shard-local. It enumerates, parses, and validates the entire shard corpus and performs several full topic-policy walks. This finalization should be coordinator-owned and batched outside the auditor skill.

## Explicit Process Calls

| Call | Frequency per audit pass | Assessment |
| --- | ---: | --- |
| `rg -n --fixed-strings ...` | Optional, potentially many | Core transcript navigation; retain in the auditor. |
| `Get-Content -LiteralPath '<transcript>' | Select-Object -Skip <line> -First <count>` | One PowerShell invocation per transcript slice | Core evidence reading; retain in the auditor. `Select-Object` remains in the same PowerShell process. |
| `node src/scripts/site-content-pipeline-lock.mjs acquire --purpose site-content-audit --recover-stale` | One | Shared-output administration; move outside the auditor. |
| `npm run sync:video-topics` | One, with possible retries after environmental failure | Largest repeated operation; move outside and batch. |
| PowerShell processing-log header check, `Get-Date`, field validation, `Add-Content`, and optional tail verification | At least one, commonly several | Shared logging; move outside the auditor. |
| `node src/scripts/site-content-pipeline-lock.mjs renew ...` | Conditional | Move with the shared finalizer. |
| `node src/scripts/site-content-pipeline-lock.mjs release ...` | One | Move outside the auditor. |

The fixed shared-output minimum is therefore four top-level process invocations per completed pass. Separate header checks, post-append verification, and retries increase the actual count.

The skill also mandates operations without prescribing a particular process:

- Read `AGENTS.md` and `.agents/site-content-auditor.md`.
- Read the selected shard.
- Read the transcript named by the shard's `sourcePath`.
- Read `src/derived/topic-normalization-patterns.tsv`.
- Write the selected shard.
- Validate the canonical shard write.

Those operations may become shell processes or direct file-tool calls depending on the runtime.

## Topic-Synchronization Expansion

`package.json` defines `sync:video-topics` as:

```text
node src/scripts/site-content-pipeline-lock.mjs run
  --purpose video-topic-sync
  --recover-stale
  -- bun run src/scripts/sync-video-topics-bun.ts
```

On Windows, the process hierarchy is approximately:

```text
npm.cmd
  -> npm package-script shell
     -> Node lock-wrapper process
        -> verifies the already-owned CONTENT_PIPELINE_LOCK_TOKEN lease
        -> Bun synchronization process
           -> up to 8 shard-loading worker threads
           -> up to 8 topic-normalization worker threads
```

The inner lock wrapper does not acquire a second lease when the auditor supplies a token. It revalidates ownership and launches Bun. This is overlapping wrapper work rather than a duplicate shared mutation.

Each synchronization performs the following corpus-wide work:

1. Enumerate every JSON shard except `topics.json`.
2. Read, parse, and schema-validate every shard.
3. Walk all video- and segment-level topic arrays to collect creation inputs.
4. Resolve all topic inputs against the normalization catalog.
5. Walk the corpus again to plan topic-store synchronization.
6. Run the full topic-normalization audit across all shards and registry records.
7. Reload the normalization catalog to detect concurrent policy changes.
8. Read `topics.json` during planning, normalization auditing, and the preimage check.
9. Atomically rewrite `topics.json` when missing canonical records must be appended.

The preparation and normalization phases create separate worker waves, each capped at `min(8, available CPUs)`.

## Current Scale

Snapshot from the current checkout on 2026-08-07:

- 2,144 per-video shard files
- 25,843 topic-registry records
- 4,215 normalization-rule rows
- 5,288 processing-log data rows

At this size, 50 audit passes imply:

- At least 200 fixed shared-output top-level invocations.
- 50 complete synchronization runs.
- Approximately 107,200 shard-file parses (`2,144 × 50`).
- Up to 800 worker-thread creations (`16 × 50`).

One batch finalization for the same 50 completed passes would require approximately four top-level finalization invocations, one corpus synchronization, one append operation containing 50 rows, and up to 16 worker-thread creations.

## Overlap and Scope Leakage

### Repeated policy work

The auditor always reads `topic-normalization-patterns.tsv`. The synchronizer then loads that catalog during parallel preparation and reloads it during its drift check. A normal pass therefore reads the same policy at least three times across the auditor and finalizer.

The auditor also validates the selected shard and its topic arrays, while synchronization reparses and schema-validates that shard as part of all 2,144 shards and then subjects it to multiple corpus-wide topic walks.

### Repeated guidance reads

The skill explicitly directs the agent to read `AGENTS.md` and `.agents/site-content-auditor.md`. Codex already receives applicable `AGENTS.md` guidance, and the separate auditor brief substantially duplicates the skill's mission, wording rules, substance rules, workflow, synchronization, logging, and handoff requirements.

### Site-wide wording targets

The skill's public-wording section includes visible page headings, card text, and search placeholder text, while the auditor brief says to scan only the selected shard. Page headings and search-interface copy belong to a site review, not a per-shard transcript audit. They should be removed from this skill's scope.

### Global failures block shard-local completion

The synchronizer performs a full-corpus normalization preflight. An unrelated shard or registry problem can therefore prevent the selected audit's processing-log row even when its shard write is valid. This conflicts with the intended shard-local judgment boundary and is another reason to give synchronization to a coordinator.

### Unchanged passes still synchronize

The skill expressly requires synchronization for unchanged, saturated, and intentionally empty passes. The synchronizer may add topics introduced by other concurrent shard work, so its result is not attributable to the audited shard. This behavior is shared integration work, not audit work.

## Recommended Boundary

### Auditor responsibility

The auditor should:

- Read the exact selected shard.
- Read its exact `sourcePath` transcript in safe contiguous slices.
- Perform the semantic, historical, and evidence comparison.
- Improve only that shard when justified.
- Decide `needsFurtherProcessing` and describe the pass result.
- Perform or request a lightweight parse of the written shard.
- Return a structured completion receipt.

The auditor's completion receipt should contain:

- Canonical shard path
- Shard SHA-256 after the audit
- Result text
- `needsFurtherProcessing` value
- Notes
- Added or changed topic slugs
- Applied creation-rule identifiers
- Unresolved review or ambiguous topic candidates

### Coordinator responsibility

A coordinator should:

1. Collect one or more completed audit receipts.
2. Verify that each receipt's shard hash still matches the file to be finalized.
3. Acquire the shared-output lease once.
4. Run topic synchronization once for the batch.
5. Append one valid five-field processing-log row per receipt in one operation.
6. Release the lease once.
7. Retain pending receipts without appending any rows if synchronization fails.

The hash prevents a coordinator from logging an obsolete intermediate version, particularly if more than one pass targets the same shard. Rows for repeated passes over the same shard must be appended in the same order as their finalized shard versions.

## Recommended Implementation Shape

Create one current-schema finalization command outside the auditor skill rather than teaching every auditor the lease, synchronization, timestamp, row-validation, append, and release protocol.

That command should own the complete transaction:

```text
finalize completed audit receipts
  -> acquire lease
  -> synchronize topics once
  -> validate receipt hashes and five-field rows
  -> append all rows
  -> release lease in success and failure paths
```

The existing `site-content-pipeline-lock.mjs append-log` operation should not be reused without redesign. It accepts six legacy fields and writes tab-separated rows, while the current site-content processing log requires exactly five semicolon-separated fields.

## Topic-Policy Access

Topic-policy judgment cannot be removed entirely because the auditor may introduce new topic slugs. It can be narrowed:

- Skip the full catalog read when the pass proposes no topic-array changes, relying on coordinator synchronization for global drift detection.
- When topics change, provide a coordinator-prepared resolver or relevant active-creation-rule subset instead of requiring every auditor to load the entire TSV.
- Keep unresolved `review`, disabled, or ambiguous candidates as audit blockers that must be returned in the receipt before shared finalization.

## Validation Boundary

Keep semantic validation inside the auditor:

- Transcript evidence and containment
- Historical meaning and caveats
- Segment coverage and chronology
- Q&A prompt/answer fidelity
- Learner-facing wording
- Honest saturation determination

Deterministic validation can move to a pair-scoped coordinator helper, although it still needs to run once per changed shard:

- JSON parsing and schema validity
- Video/source identity
- Unique segment IDs and slugs
- Timestamp format and ordering
- Topic-slug syntax
- Required Q&A fields
- Forbidden workflow wording scans limited to the shard

This helper must remain shard-local and must not invoke repository-wide generation, builds, tests, or audits.

## Commands That Are Already Excluded

The auditor correctly does not run these and they are not candidates for removal from its actual process inventory:

- `generate:site-data`
- `site:check`
- `site:build`
- Pagefind
- `src/scripts/validate-content-pipeline.ts`
- `npm run check`
- Repository-wide tests or audits
- Git commands

## Source Pointers

- Auditor setup and required external reads: `.agents/skills/naval-site-content-auditor/SKILL.md`, lines 24-31
- Transcript command pattern: `.agents/skills/naval-site-content-auditor/SKILL.md`, lines 33-36
- Public wording scope: `.agents/skills/naval-site-content-auditor/SKILL.md`, lines 38-48
- Shared-output finalization: `.agents/skills/naval-site-content-auditor/SKILL.md`, lines 68-94
- Duplicated workflow brief: `.agents/site-content-auditor.md`, lines 40-54
- Package synchronization command: `package.json`, line 24
- Lock wrapper and child-process launch: `src/scripts/site-content-pipeline-lock.mjs`, lines 284-320 and 825-847
- Bun topic preparation: `src/scripts/bun-topic-normalization.ts`, lines 20-41
- Worker count: `src/scripts/bun-worker-options.ts`, lines 8-15
- Worker creation: `src/scripts/bun-worker-runner.ts`, lines 1-23
- Corpus shard parsing: `src/site/video-segment-files.ts`, lines 32-74
- Synchronization planning and preflight: `src/site/topic-store.ts`, lines 64-180
- Full normalization audit: `src/site/topic-normalization-audit.ts`, lines 75-160
