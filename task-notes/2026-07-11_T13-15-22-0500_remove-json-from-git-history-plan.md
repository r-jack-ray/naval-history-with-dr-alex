# Remove Transcript JSON Storage and Rewrite It From Git History

Status: planning only. Do not implement or execute the history rewrite from this planning task.

Created: 2026-07-11T13:15:22-05:00
Last reviewed: 2026-07-11

## Recommended Execution Configuration

- Model: `gpt-5.6-sol`
- Reasoning effort: `xhigh`
- Run mode: interactive, single-agent Codex task; do not use subagents, multi-agent, ultra, or a scheduled automation.

This combines a current-tree storage migration with a destructive Git history rewrite. Keep one agent in control because the implementation commit, ref audit, rewrite, validation, leased push, and rollback state must remain serialized.

The run has two mandatory approval gates:

1. Before the preparatory implementation commit or any normal push, report the exact staged scope, TXT/manifest coverage results, 7z verification result, current remote tip, and implementation test results. Obtain explicit approval for the commit and push.
2. After the rewritten mirror passes every local validation, stop and report the original tip, rewritten tip, audited refs, scope-comparison result, path-removal result, and test results. Obtain a fresh explicit approval before the force-push.

## Objective

Make `src/transcripts/txt/` the only stored transcript-body format in the active repository, remove all current code and documentation dependence on `src/transcripts/json/`, prevent that directory from being reintroduced, and remove every file historically stored below that exact path from every audited writable remote ref, currently expected to be `main` only.

The final current-tree contract should be:

- New transcript fetches write one TXT file plus the transcript manifest update; they do not write a repository JSON transcript.
- Existing-transcript detection uses the manifest and TXT file, not JSON.
- `src/transcripts/manifest.json` records only the TXT storage template and each record's TXT path.
- Existing manifest `fileStem` values remain authoritative and stable during refetches so curated shard filenames and `sourcePath` values do not drift.
- Obsolete JSON store/conversion commands and active JSON-storage documentation are removed.
- The exact root-anchored ignore rule `/src/transcripts/json/` prevents accidental reintroduction.
- Git history filtering removes only `src/transcripts/json/`; unrelated JSON files and all content outside that directory remain unchanged.

## Analyzed Repository Snapshot

Refresh every fact immediately before execution because the repository is active.

- Current branch: `main`.
- Current local and recorded remote-tracking tip: `5d7a552789706f961dad291575c9212a6e20f8ae`.
- Worktree at planning time: clean; `main` matched `origin/main`.
- Configured remote: `git@github.com:r-jack-ray/naval-history-with-dr-alex.git`.
- Visible local refs: local `main` and `origin/main`; no local tags were shown.
- Repository history: 133 commits.
- First commit touching the JSON transcript path: `381dbb5` (`Add saved YouTube inventory and transcript tooling`).
- Commits directly touching `src/transcripts/json/`: 48.
- Current tracked JSON transcript files: 2,057.
- Current JSON working-tree size: 919,040,107 bytes, approximately 876.46 MiB.
- Current tracked TXT transcript files: 2,057.
- Current manifest records: 2,057.
- At planning time, manifest stems, JSON basenames, and TXT basenames formed exact one-to-one sets: no missing or unmanifested JSON or TXT files.
- Reachable history contained 2,058 unique blobs below `src/transcripts/json/`, with approximately 877.70 MiB of logical blob content.
- Local Git storage at planning time: approximately 156.41 MiB loose plus 259.59 MiB packed.
- `git filter-repo --version` returned `a40bce548d2c`; no installation step should normally be needed.
- The previous TSV rewrite has already left `/src/transcripts/tsv/` in `.gitignore`; preserve it.
- The user has already created an external 7z backup and explicitly accepts restoring the project from that archive as the disaster-recovery fallback. Do not create another backup mirror, bundle, or archive.

Current active dependencies on JSON transcript storage include:

- `src/youtube/transcripts.ts`: storage-path types, manifest schema, current JSON+TXT writer, stored-record existence check, superseded-file cleanup, and JSON parsing.
- `src/scripts/get-video-transcript.ts`: JSON-based skip/restore logic, JSON output option, and JSON status messages.
- `src/youtube/batch-transcripts.ts`: current storage writer and JSON status message.
- `src/scripts/store-transcript-json.ts` and `src/scripts/convert-transcript-json.ts` plus their `package.json` commands.
- `src/youtube/channel-video-links.ts`: a dormant `stored` transcript state whose current shape requires `jsonPath`.
- Transcript storage and channel inventory tests that assert JSON paths and files.
- `src/transcripts/manifest.json`: schema version 1, a JSON storage template, and `paths.json` on every record.
- Active guidance in `AGENTS.md`, `README.md`, `src/transcripts/README.md`, and `.agents/skills/naval-video-page-prototype/SKILL.md`.

Downstream site-content, schedule, and audit code already consumes `paths.txt` and should remain TXT-backed. Confirm this again after implementation.

## Scope and Non-Goals

- Do not remove or filter any `.json` file outside `src/transcripts/json/`.
- Do not remove `src/transcripts/manifest.json`, `src/transcripts/fetch-status.json`, channel JSON, curated shard JSON, `topics.json`, generated archive JSON, package JSON, or configuration JSON.
- Do not alter transcript wording, timestamps, curated segments, topic data, schedules, reports, or site content as part of this migration.
- Do not regenerate transcripts from YouTube merely to support removal. The existing TXT files are the retained transcript bodies.
- Do not scrub historical prose references from old task notes or commit messages. Current active code and guidance must be corrected; historical planning records may remain.
- Do not rewrite old manifest or code commits individually. Filtering the exact directory will necessarily make some historical checkouts that expected JSON incomplete; the supported rewritten tip must be fully TXT-only and pass all tests.
- Do not use `git filter-branch`, interactive rebase, commit-by-commit deletion, `git push --mirror`, an unleased `--force`, `git reset --hard`, or `git clean`.
- Do not create a new backup mirror, Git bundle, 7z file, or other redundant backup. The user's existing 7z is the disaster fallback, and the active checkout must remain on the original history until the rewrite is accepted.
- Temporary migration or comparison scripts are allowed only under an ignored temporary location such as `.tmp/` or outside the repository. Do not commit them; delete them after acceptance.

## Preconditions and Stop Conditions

1. Re-read `AGENTS.md`, this complete plan, and the referenced TSV plan before acting.
2. Require a clean worktree before implementation. If unrelated changes exist, stop and let their owner preserve or finish them; do not stash, reset, clean, or absorb them into this task.
3. Pause transcript fetchers, schedule workers, builds that write shared generated data, collaborators, automations, merges, and all other pushes for the implementation-and-rewrite window.
4. Ask the user for the existing 7z path. Run the installed 7z integrity test against it, list enough of its contents to confirm it is the intended project archive, and record its SHA-256. Do not extract a second copy merely for backup. If the archive cannot be read successfully, stop.
5. Explicitly document the 7z recovery boundary. The archive restores the snapshot the user created, while the still-unmodified active checkout is the exact pre-rewrite rollback source until final acceptance. Do not realign or delete the active checkout before acceptance.
6. Confirm the complete advertised remote ref set, including symbolic `HEAD`, heads, tags, notes, replace refs, and pull-request refs. If a writable branch or tag beyond `main` exists, stop and revise the rewrite, push, validation, and rollback scope.
7. Confirm force-pushing `main` is allowed and record any branch-protection changes that must later be restored.
8. Verify `git filter-repo --version`. Investigate if it is missing or no longer resolves to the prepared installation.
9. Recount current manifest records, JSON files, and TXT files and require exact stem agreement. Stop if any manifest record lacks either current source JSON or retained TXT before the parity check.
10. Before removing any JSON use, byte-verify every retained TXT file against a fresh `transcriptToTxt` rendering of its corresponding JSON. Use a temporary, uncommitted verification script and fail on the first or aggregate every mismatch. Do not proceed unless all 2,057 or the refreshed full set match.
11. Record hashes for the complete retained TXT tree and important current non-JSON files before implementation so later comparisons can prove they were preserved.
12. After the preparatory TXT-only implementation commit is pushed normally, record the exact remote `main` object ID as `$OriginalMain`. If the remote moves afterward, stop and restart the rewrite from a fresh mirror.

Stop immediately if:

- any current JSON file lacks a byte-equivalent retained TXT rendering;
- the manifest, JSON, and TXT identity sets do not agree before migration;
- implementation changes any existing TXT content or any curated content;
- the rewritten repository loses or changes any path outside `src/transcripts/json/` beyond the reviewed preparatory implementation commit;
- another writable remote ref appears without an explicit scope decision;
- the remote tip changes after `$OriginalMain` is recorded;
- the 7z integrity test fails;
- `git fsck`, mapped-commit comparison, checkout, tests, audits, or site build fail;
- rollback from the still-original active checkout is no longer available before acceptance.

## Phase 0: Prove the JSON-to-TXT Conversion Is Complete

Record the current identity and size snapshot, then run a full conversion-parity check.

The temporary checker should:

1. Read `src/transcripts/manifest.json`.
2. Require each record's `fileStem`, `paths.json`, and `paths.txt` to resolve beneath the expected transcript directories without traversal or case collisions.
3. Require exactly one current JSON and one current TXT for every record and no extra file in either directory.
4. Parse each JSON using the repository's existing parser, render it with `transcriptToTxt`, and compare the resulting UTF-8 bytes with the committed TXT.
5. Report record count, matched count, mismatches, missing files, extras, and a deterministic hash manifest for the TXT tree.

Use `.tmp/json-history-rewrite-tools/verify-transcript-json-txt-parity.mjs` for this check after `npm run build`. It writes an ignored per-file hash report at `.tmp/json-history-rewrite-tools/parity-report.json`. Keep the tool and output under `.tmp/`; do not add either to Git. Preserve only its concise results in the execution log or handoff.

This is the evidence gate for deleting the richer structured files. File-count equality alone is insufficient.

## Phase 1: Implement the TXT-Only Current-Tree Contract

Perform this phase in the active checkout. Do not delete or stage the tracked JSON files; the later history filter removes them from the preparatory commit and every ancestor.

### 1A. Migrate transcript storage and manifest types

Update `src/youtube/transcripts.ts` so the repository storage abstraction contains only:

- `root`;
- `txtOutput`;
- `manifestOutput`.

Change the current manifest to a new explicit schema version, recommended as version 2:

```json
{
  "schemaVersion": 2,
  "storage": {
    "txt": "txt/{fileStem}.txt"
  },
  "transcripts": [
    {
      "fileStem": "...",
      "paths": {
        "txt": "txt/....txt"
      }
    }
  ]
}
```

Requirements:

- The normal writer writes only the TXT output and manifest.
- Stored-record detection requires the manifest record plus an existing TXT file.
- Superseded-output cleanup considers only safe TXT paths beneath the configured transcript root.
- Current manifest `fileStem` remains authoritative for an already stored video. A normal skip must not recompute it from mutable metadata.
- A forced refetch of an existing record must reuse its stored `fileStem` unless a separately explicit, validated filename migration is requested. A newly fetched video may generate its initial stem normally.
- Manifest parsing may accept schema version 1 temporarily for migration, but normalization must ignore the legacy JSON storage/path fields and all new writes must emit version 2. Do not retain a runtime requirement that the JSON file exists.
- Preserve all non-path manifest metadata, record order, `fileStem`, TXT paths, and the existing `updatedAt` unless the implementation's normal manifest write contract deliberately updates it.

Use `.tmp/json-history-rewrite-tools/migrate-transcript-manifest-to-txt-only.mjs` for the mechanical migration. Run it without `--write` first and review its ignored preview. Applying it requires `--write --expected-sha256 <current-manifest-hash>`, so it cannot overwrite a changed manifest. Its diff must be limited to the schema version, removal of `storage.json`, and removal of every `paths.json` entry. Do not recompute or reorder records.

### 1B. Migrate fetch and batch behavior

Update `src/scripts/get-video-transcript.ts` and `src/youtube/batch-transcripts.ts` so:

- a manifest record plus its TXT file is sufficient to skip an existing transcript without a YouTube request;
- no skip path reads or reconstructs from JSON;
- a fetched in-memory transcript is rendered directly to TXT and recorded in the manifest;
- status messages say `Stored transcript TXT` or equivalent and never claim JSON storage;
- missing TXT is treated honestly: a normal run may refetch, while a force run refetches as requested;
- tests cover new transcript storage, stored TXT skip, missing TXT, forced refetch, stable existing `fileStem`, and superseded TXT cleanup.

Remove `--json-output` from the fetch CLI. Retain explicit TXT output. Do not broaden this task into a second TSV cleanup; any remaining explicit TSV feature is out of scope unless its code cannot be separated safely from JSON output removal.

### 1C. Remove obsolete JSON-storage commands

After the parity gate succeeds, remove:

- the `convert:transcript-json` package script and its CLI source;
- the `store:transcript-json` package script and its CLI source;
- active help text and examples that direct users through repository JSON files.

Remove `readVideoTranscriptJson` if it becomes unused. A pure JSON parser may remain only if an isolated unit fixture still tests external transcript payload parsing; it must not imply or recreate repository JSON storage. Require a final symbol/reference search to decide this cleanly rather than leaving dead code.

### 1D. Update related schemas, tests, and guidance

- Change `ChannelEpisodeTranscriptState` so a stored transcript is represented by `txtPath`, not required `jsonPath`; update its tests even though current `episodes.json` records are presently `not_checked`.
- Update transcript storage, batch, and fixture tests to assert TXT-only writes and version-2 manifest shape.
- Update `AGENTS.md`, `README.md`, `src/transcripts/README.md`, and `.agents/skills/naval-video-page-prototype/SKILL.md` so TXT is the transcript source of record and JSON storage commands/directories are absent from active guidance.
- Preserve the shard-only, manifest-`fileStem`, schedule ownership, and single-agent transcript-curation rules.
- Add exactly this root-anchored rule without changing the existing TSV rule:

```gitignore
/src/transcripts/json/
```

Historical task notes may retain old JSON references. Active code, tests, skills, current README files, package scripts, and `AGENTS.md` must not.

## Phase 2: Validate and Commit the Preparatory Migration

Before staging, require:

- the full retained TXT tree hash to match the Phase 0 baseline;
- 2,057 or the refreshed full number of manifest records and TXT files with exact stem agreement;
- no `storage.json`, `paths.json`, or `src/transcripts/json` dependency in the current manifest or active code/guidance;
- no producer that can create a file below `src/transcripts/json/`;
- `git check-ignore -v --no-index src/transcripts/json/probe.json` to resolve to the exact new root rule;
- the existing `/src/transcripts/tsv/` rule to remain intact;
- no curated shard, topic registry, schedule, processing log, report, or generated archive change caused by this migration.

Run at least:

```powershell
npm run check
npm run audit:transcript-schedules
npm run audit:site-content
npm run site:build
git diff --check
```

Also run focused TXT-only storage and batch tests plus a no-network smoke test against one already stored video, proving it skips by manifest and TXT without modifying files. If a new-video smoke test is needed, use mocks or a disposable output root rather than changing committed transcript state.

Review generated or report changes after validation. Revert only known command-generated noise through safe, path-specific edits; never reset unrelated work. If a shared output changes substantively, investigate and include it only if it is a required consequence of the schema migration.

Stage the preparatory migration explicitly. Do not stage the 2,057 JSON deletions; they should not exist in the active worktree at this stage. The staged set should contain only reviewed implementation, schema, test, documentation, skill, manifest, and `.gitignore` changes.

At approval gate 1, report:

- staged paths;
- refreshed JSON/TXT/manifest counts;
- all-file conversion-parity result;
- TXT tree hash before and after;
- 7z test and SHA-256 result;
- active-reference search result;
- test, audit, and site-build results;
- current local and remote tips.

Only after explicit approval, create one concise preparatory commit and push it normally to `main`. If the normal push is rejected or the remote moved, stop and re-audit. Record the successfully pushed remote object ID as `$OriginalMain`.

## Phase 3: Freeze and Audit the Exact Remote State

Run from a neutral parent directory, not from inside the active checkout:

```powershell
$Remote = 'git@github.com:r-jack-ray/naval-history-with-dr-alex.git'
$OriginalMain = (git ls-remote $Remote refs/heads/main).Split("`t")[0]
git ls-remote --symref $Remote HEAD
git ls-remote $Remote
```

Require `$OriginalMain` to be one 40-character object ID equal to the just-pushed preparatory commit. Classify every advertised ref. Expected writable scope is one branch, `main`, and no tags. Do not assume this snapshot remains current; it is protected later by the object-ID lease.

Leave the active checkout at `$OriginalMain` on the original, unfiltered history. Do not fetch-reset, switch it to rewritten commits, or delete its original objects. It is the exact rollback and old-to-new comparison source until acceptance.

## Phase 4: Create One Disposable Rewrite Mirror and Filter the Exact Path

Create only one new disposable mirror outside the active repository. This is the workspace in which the rewrite occurs, not an additional retained backup:

```powershell
if (Test-Path naval-history-json-rewrite.git) { throw 'Rewrite mirror path already exists.' }
git clone --mirror $Remote naval-history-json-rewrite.git
git -C naval-history-json-rewrite.git rev-parse refs/heads/main
```

The mirror tip must equal `$OriginalMain`. Then run exactly:

```powershell
git -C naval-history-json-rewrite.git filter-repo --path src/transcripts/json/ --invert-paths
```

Do not add extension filters, replacement text, callbacks, renames, message rewrites, or any other path. `git-filter-repo` may remove `origin`; that is expected.

## Phase 5: Validate the Rewritten Mirror Before Any Force-Push

### Path removal and repository integrity

These commands must find no reachable JSON transcript path:

```powershell
git -C naval-history-json-rewrite.git log --all -- src/transcripts/json/
git -C naval-history-json-rewrite.git rev-list --objects --all | Select-String ' src/transcripts/json/'
git -C naval-history-json-rewrite.git fsck --full
git -C naval-history-json-rewrite.git show-ref
$RewrittenMain = git -C naval-history-json-rewrite.git rev-parse refs/heads/main
```

Record `$RewrittenMain`; it must differ from `$OriginalMain`. Confirm there are no `refs/original/` or replace refs retaining the old history.

Verify at the rewritten tip:

- `/src/transcripts/json/` is in `.gitignore` and `/src/transcripts/tsv/` remains present;
- `src/transcripts/json/` is absent;
- all retained TXT files and their baseline hashes are present;
- the manifest is version 2 and contains only TXT storage paths;
- the TXT-only code, tests, commands, and guidance from the preparatory commit are present.

### All-history scope comparison

Use `filter-repo/commit-map` as the authoritative old-to-new mapping. Run `.tmp/json-history-rewrite-tools/Compare-FilteredHistory.ps1` against the still-original active checkout and rewrite mirror. It is read-only and writes an ignored JSON report. Compare every surviving mapped commit:

1. Generate recursive `git ls-tree` manifests for the old and new commit.
2. Remove only old entries whose path begins exactly `src/transcripts/json/`.
3. Require all remaining mode, object type, object ID, and path records to be byte-for-byte identical.
4. Compare commit messages and author/committer identities and timestamps for surviving commits.
5. Explain every pruned commit and prove it contained no unique non-JSON tree change after its parents were rewritten.

Perform a separate tip-tree comparison excluding only `src/transcripts/json/`. At minimum, prove identical retained TXT files, curated data, channel data, scripts, `.agents/`, `.codex/`, site files, task notes, root configuration, and all unrelated JSON files.

The preparatory implementation changes are present on both sides of this comparison and therefore are not exceptions. Any difference outside the filtered directory is a failure.

### Build verification

Create one temporary normal clone from the rewritten mirror and run:

```powershell
npm ci
npm run check
npm run audit:transcript-schedules
npm run audit:site-content
npm run site:build
```

Re-run the active-reference search and TXT/manifest coverage checks inside this clone. Confirm the worktree is clean afterward except for understood ignored build/report output.

### Mandatory approval gate 2

Stop before any force-push. Report:

- `$OriginalMain` and `$RewrittenMain`;
- every advertised remote ref and its classification;
- 7z archive SHA-256 and integrity-test result;
- path-removal result;
- all-commit scope-comparison and pruned-commit results;
- TXT count and baseline-hash result;
- manifest-v2 and active-reference results;
- `git fsck`, `npm run check`, both audits, and `npm run site:build` results.

Ask for a fresh explicit go-ahead. The original execution prompt is not approval to cross this gate.

## Phase 6: Recheck the Remote and Push Main With an Object-ID Lease

Immediately before pushing:

```powershell
$CurrentRemoteMain = (git ls-remote $Remote refs/heads/main).Split("`t")[0]
if ($CurrentRemoteMain -ne $OriginalMain) {
  throw 'Remote main changed after the rewrite began. Abort and restart from a fresh mirror.'
}
git ls-remote --symref $Remote HEAD
git ls-remote $Remote
```

Require the full ref set to match the classified preflight snapshot. Restore `origin` in the rewrite mirror if `git-filter-repo` removed it, then push only `main`:

```powershell
git -C naval-history-json-rewrite.git push "--force-with-lease=refs/heads/main:$OriginalMain" origin refs/heads/main:refs/heads/main
```

Never downgrade to `--force`. Never push `--mirror`. A lease rejection is a stop condition, not something to bypass.

## Phase 7: Verify the Remote From a Fresh Clone

Create a new normal clone from the remote and require:

- its `main` tip equals `$RewrittenMain`;
- both JSON transcript path-history searches are empty;
- `git fsck --full` succeeds;
- both exact transcript ignore rules resolve correctly;
- manifest-v2/TXT coverage and baseline hashes pass;
- active JSON-storage reference searches are empty outside historical notes;
- `npm ci`, `npm run check`, both audits, and `npm run site:build` succeed;
- the complete advertised remote ref set has no unplanned change;
- expected GitHub Actions and Pages deployment complete successfully.

Restore branch protection and resume writers only after these checks pass.

Do not immediately realign or delete the original active checkout. Keep it untouched until the user accepts the rewritten remote and the rollback window closes.

## Rollback

### Exact pre-rewrite rollback while the active checkout is retained

The active checkout must still contain `$OriginalMain` and the original objects.

1. Pause pushes again.
2. Verify the active checkout resolves `$OriginalMain` and that remote `main` still equals `$RewrittenMain`.
3. Push the exact original commit back to `main` using `--force-with-lease=refs/heads/main:$RewrittenMain`.
4. Fresh-clone the restored remote and verify its tip and integrity.
5. Restore protections and notify all consumers that original history was reinstated.

If the rollback lease rejects, stop and inspect the new remote state. Do not bypass it.

### Disaster recovery from the user's 7z

If the active checkout or its original objects are lost, use the already verified 7z according to the user's stated fallback. This restores the archive's snapshot, which may predate the preparatory TXT-only commit and `$OriginalMain`. Inspect the restored `.git` tip and worktree before deciding whether to republish it. Any remote rewrite from that older snapshot requires a new explicit ref audit, impact report, approval, and object-ID lease.

Do not claim that the 7z is an exact `$OriginalMain` rollback source unless its verified contents prove that fact.

## Coordinate Existing Clones

Announce that `main` history was rewritten and old commit hashes must not be merged or pushed back.

Preferred recovery is a fresh clone. A clone that must be retained needs an explicit backup of its local-only work before being realigned. Do not prescribe or execute a destructive reset without its owner's confirmation.

After the user accepts the result and closes the rollback window, delete disposable rewrite/test clones and their temporary scripts. Then replace or deliberately realign the original active checkout. Do not keep removed JSON objects accidentally reachable through local branches, tags, replace refs, or stale worktrees.

## Completion Criteria

- Every pre-removal JSON transcript was proven byte-equivalent to its retained TXT rendering.
- Current manifest and TXT identity sets agree exactly, with no missing or extra TXT file.
- Current manifest schema and storage code are TXT-only.
- Existing stored `fileStem` values remain stable across skips and forced refetches.
- No current producer, package command, active guide, skill, or test uses `src/transcripts/json/`.
- Obsolete store/convert JSON CLIs are removed.
- `/src/transcripts/json/` and `/src/transcripts/tsv/` are both ignored by exact root-anchored rules.
- No reachable path under `src/transcripts/json/` exists in the rewritten mirror or a fresh remote clone.
- Only the audited `main` ref was force-pushed, using the exact recorded object-ID lease.
- Every surviving mapped commit is identical outside the filtered JSON transcript path, and every pruned commit is explained.
- All unrelated JSON, TXT, curated content, code, documentation, task notes, configuration, and generated source files are preserved.
- `git fsck --full`, `npm run check`, transcript schedule audit, site-content audit, and site build succeed in the rewritten mirror clone and fresh remote clone.
- Branch protection and paused writers are restored.
- Collaborators and automations are told to reclone or safely realign.
- The original active checkout is retained until acceptance, then removed or deliberately realigned.

## Storage Follow-Up

The 876.46 MiB current working-tree saving should be immediate in fresh clones. Git repository-size reduction will depend on compression and GitHub garbage collection.

The leased force-push makes the filtered objects unreachable from the audited writable refs, but GitHub may retain unreachable objects temporarily. Pull-request refs, forks, caches, old clones, the original active checkout, the rewrite process, and the user's 7z can continue to retain the removed content. This plan removes the path from supported history; it does not promise immediate physical erasure from every storage layer.

After acceptance, run local size measurements only in disposable clones if useful. Do not add a large measurement artifact to the repository.

## Prompt to Execute This Plan

Run as an interactive single-agent task with `gpt-5.6-sol` and reasoning effort `xhigh`:

```text
Execute task-notes/2026-07-11_T13-15-22-0500_remove-json-from-git-history-plan.md exactly as a single-agent, two-gate TXT-storage migration and Git history rewrite.

Read AGENTS.md, the complete JSON plan, and task-notes/2026-07-10_T08-40-23-0500_remove-tsv-from-git-history-plan.md first. Treat every count, ref, object ID, dirty-worktree fact, remote setting, archive fact, and protection setting as volatile and refresh it. Do not use subagents, multi-agent, ultra, a scheduled automation, git reset --hard, git clean, git filter-branch, git push --mirror, or an unleased --force push.

Preserve all unrelated work. Pause writers. Ask me for the existing 7z path, test that archive, list enough content to identify it, and record its SHA-256; do not create any new backup mirror, bundle, archive, or redundant project copy. Keep the active checkout on the original history through the rollback window.

Before implementation, run npm run build and `.tmp/json-history-rewrite-tools/verify-transcript-json-txt-parity.mjs` to prove every current JSON transcript has one manifest-owned TXT and byte-compare a fresh transcriptToTxt rendering of every JSON with the retained TXT. Stop on any mismatch, missing file, extra file, unsafe path, or identity drift. Use `.tmp/json-history-rewrite-tools/migrate-transcript-manifest-to-txt-only.mjs` for the guarded preview and manifest-v2 write. These temporary tools and their output must stay ignored and must not be committed.

Implement the TXT-only contract without staging the tracked JSON deletions: migrate the manifest to version 2 with TXT-only storage, make fetch/storage/batch logic write and detect TXT only, preserve existing manifest fileStem values, remove JSON output and obsolete store/convert JSON commands, update related schemas/tests/current guidance, and add the exact /src/transcripts/json/ ignore rule while preserving /src/transcripts/tsv/. Do not change retained TXT content, curated content, schedules, topics, reports, or unrelated JSON.

Run every focused and repository validation in the plan. At gate 1, report staged paths, all-file conversion parity, TXT hashes, manifest/TXT counts, archive verification, reference searches, tests/audits/builds, and local/remote tips. Ask for explicit approval before the preparatory commit or normal push.

After that commit is approved and pushed normally, record the exact remote main tip. Rewrite only src/transcripts/json/ in one new disposable mirror using git filter-repo --path src/transcripts/json/ --invert-paths. Use the still-original active checkout for old-to-new comparisons and exact rollback; do not create a backup mirror or bundle. Run `.tmp/json-history-rewrite-tools/Compare-FilteredHistory.ps1` against the original checkout and rewritten mirror, then perform the remaining path, ref, fsck, TXT hash, manifest, active-reference, audit, and build validations.

At gate 2, stop and report the original and rewritten tips, all advertised refs, 7z SHA-256, path-removal result, all-history scope comparison, pruned commits, TXT/manifest results, fsck, tests, audits, and site build. Ask for a fresh explicit go-ahead. Do not force-push based only on this prompt.

Only after that approval, re-audit the full remote ref set and push only main using --force-with-lease with the exact original object ID. Stop on a lease rejection or any changed ref. Verify from a fresh remote clone, restore protections and writers, keep the original checkout through the acceptance window, and provide a compact Changed / Remote / Checked / Rollback / Notes closeout.
```
