# Remove Transcript TSV Files From Git History

Status: planning only. Do not execute this plan until current work is committed or backed up and history-rewrite coordination is complete.

Created: 2026-07-10T08:40:23-05:00

## Objective

Remove every file historically stored under `src/transcripts/tsv/` from all reachable Git history, then replace the remote `main` history with the rewritten version.

The rewrite must affect only that path. Historical references to TSV files in manifests, documentation, task notes, configuration, scripts, and commit messages may remain. Current JSON and TXT transcripts, curated content, logs, schedules, reports, code, and unrelated history must be preserved.

## Analyzed Repository Snapshot

Refresh these facts immediately before execution because they are time-sensitive.

- Remote: `git@github.com:r-jack-ray/naval-history-with-dr-alex.git`
- Current branch: `main`
- Visible refs: local `main` and `origin/main`; no tags were present.
- Repository history: 107 commits.
- First commit containing the TSV path: `d59221b` (`Add saved YouTube inventory and transcript tooling`, 2026-07-07).
- Commits directly touching the TSV path: 48.
- Descendant commits expected to receive new hashes: approximately 100 of 107.
- Unique TSV blobs: 2,057.
- Logical TSV blob size: approximately 375.46 MiB.
- Reachable Git disk usage attributed to the path: approximately 109.18 MiB.
- Local Git storage before cleanup: approximately 368.20 MiB packed plus 228.32 MiB loose.
- `git-filter-repo` was installed after analysis for the Python 3.14 embedded, Python 3.7, and Python 3.13 environments. `C:\Toolbox\Python313\Scripts` was added to the user PATH, and `git filter-repo --version` returned `a40bce548d2c`.

Expected benefit: a fresh clone should be materially smaller, with the exact reduction depending on pack delta compression and server-side garbage collection.

## Non-Goals

- Do not remove or rewrite references to TSV in files outside `src/transcripts/tsv/`.
- Do not delete JSON or TXT transcript history.
- Do not combine this operation with content, schedule, manifest, tooling, or documentation edits.
- Do not perform the rewrite in the active dirty checkout.
- Do not use `git filter-branch`, interactive rebases, or commit-by-commit manual deletion.
- Do not force-push any ref other than the explicitly audited target branch.

## Preconditions and Stop Conditions

1. Finish, commit, and push all intended current changes, or create a separately verified backup of the dirty worktree. The active checkout currently contains extensive unrelated work and must not be reset as part of this operation.
2. Pause all writers, automations, collaborators, and merges that can push to the repository.
3. Confirm that no open pull request, release process, deployment, or external consumer depends on the existing commit hashes.
4. Confirm the complete remote ref set. If branches or tags now exist, expand the plan deliberately before rewriting them.
5. Confirm that force-pushing `main` is allowed. Temporarily adjust branch protection only if necessary and restore it afterward.
6. Verify the prepared `git-filter-repo` installation with `git filter-repo --version`. The recorded prepared version identifier is `a40bce548d2c`; investigate before proceeding if the command is missing or unexpectedly resolves elsewhere.
7. Record the exact remote `main` object ID. If `main` changes after this record is made, stop and restart from a fresh mirror.
8. Create an external backup mirror or Git bundle before filtering. Store it outside the active repository and outside the rewrite directory.

Stop immediately if:

- the remote tip changes before the force-push;
- additional remote branches or tags are discovered without an explicit decision about them;
- the filtered repository loses any non-TSV path;
- `git fsck`, checkout, build, or tests fail;
- the rollback backup cannot be read and verified.

## Phase 1: Freeze and Record the Remote State

Run from a neutral parent directory, not from the active checkout.

```powershell
$Remote = 'git@github.com:r-jack-ray/naval-history-with-dr-alex.git'
$OriginalMain = (git ls-remote $Remote refs/heads/main).Split("`t")[0]
$OriginalMain
```

Record `$OriginalMain` in the execution log. Also record all advertised heads and tags:

```powershell
git ls-remote --heads --tags $Remote
```

Expected snapshot: one branch, `main`, and no tags. If that is no longer true, stop and revise the push and validation scope.

## Phase 2: Create a Clean Mirror and External Rollback Backup

Use new, disposable paths outside the active checkout:

```powershell
git clone --mirror $Remote naval-history-tsv-rewrite.git
git clone --mirror $Remote naval-history-tsv-backup.git
```

Verify that both mirrors contain the recorded original tip:

```powershell
git -C naval-history-tsv-rewrite.git rev-parse refs/heads/main
git -C naval-history-tsv-backup.git rev-parse refs/heads/main
```

Both results must equal `$OriginalMain`. Keep `naval-history-tsv-backup.git` unchanged until the rewrite is accepted and recovery is no longer needed.

Optional additional portable backup:

```powershell
git -C naval-history-tsv-backup.git bundle create ..\naval-history-before-tsv-rewrite.bundle --all
git bundle verify naval-history-before-tsv-rewrite.bundle
```

## Phase 3: Rewrite Only the TSV Directory

Run the filter only in the disposable rewrite mirror:

```powershell
git -C naval-history-tsv-rewrite.git filter-repo --path src/transcripts/tsv/ --invert-paths
```

This exact path filter is the scope boundary. Do not add filename patterns, extensions, content replacements, path renames, message callbacks, or other filters.

`git-filter-repo` may remove the `origin` remote as a safety measure. That is expected; add it back only after local validation.

## Phase 4: Validate the Rewritten Mirror Before Push

### Path removal

These commands must produce no TSV path history:

```powershell
git -C naval-history-tsv-rewrite.git log --all -- src/transcripts/tsv/
git -C naval-history-tsv-rewrite.git rev-list --objects --all | Select-String ' src/transcripts/tsv/'
```

Historical text references outside that directory are allowed and should not be scrubbed.

### Repository integrity

```powershell
git -C naval-history-tsv-rewrite.git fsck --full
git -C naval-history-tsv-rewrite.git show-ref
git -C naval-history-tsv-rewrite.git rev-list --count refs/heads/main
```

Review unexpected dangling or missing objects. The rewritten `main` tip must differ from `$OriginalMain`, while the earliest commits before TSV introduction may retain their original hashes.

### Scope comparison

Create temporary clean checkouts from the original backup and rewritten mirror. Compare their tip trees while excluding only `src/transcripts/tsv/`.

At minimum, verify:

- `src/transcripts/json/` is identical;
- `src/transcripts/txt/` is identical;
- `src/derived/`, `.agents/`, `.codex/`, `site/`, `task-notes/`, and root project files are identical;
- the rewritten tip has no `src/transcripts/tsv/` directory;
- commit messages remain unchanged apart from commits pruned automatically if a historical commit becomes empty.

If any non-TSV tip content differs, discard the rewrite mirror and investigate before proceeding.

### Build verification

Create a normal temporary clone from the rewritten mirror, install dependencies using the repository's lockfile, and run:

```powershell
npm run check
```

Run additional site or transcript-schedule validation only if it is part of the agreed execution window and will not conflict with active shared writers.

## Phase 5: Recheck the Remote Tip and Force-Push Main

Immediately before pushing, verify that the remote has not changed:

```powershell
$CurrentRemoteMain = (git ls-remote $Remote refs/heads/main).Split("`t")[0]
if ($CurrentRemoteMain -ne $OriginalMain) {
  throw "Remote main changed after the rewrite began. Abort and restart from a fresh mirror."
}
```

Restore the remote in the rewrite mirror if `git-filter-repo` removed it:

```powershell
git -C naval-history-tsv-rewrite.git remote add origin $Remote
```

Force-push only `main`:

```powershell
git -C naval-history-tsv-rewrite.git push --force origin refs/heads/main:refs/heads/main
```

Do not use `git push --mirror` unless a refreshed ref audit proves that every mirrored ref is intentionally in scope.

## Phase 6: Verify the Remote From a Fresh Clone

Create a new normal clone after the force-push. Do not validate only through the rewrite mirror.

```powershell
git clone $Remote naval-history-after-tsv-rewrite
git -C naval-history-after-tsv-rewrite log --all -- src/transcripts/tsv/
git -C naval-history-after-tsv-rewrite rev-list --objects --all | Select-String ' src/transcripts/tsv/'
git -C naval-history-after-tsv-rewrite fsck --full
```

The path searches must be empty. Then install dependencies and run `npm run check` in the fresh clone.

Compare the fresh clone's `main` tip with the locally validated rewritten tip. Re-enable normal pushes, automations, and branch protections only after these checks pass.

## Phase 7: Coordinate Existing Clones

Announce that `main` history was rewritten and that old commit hashes are obsolete. Existing clones must not merge or push their old branch history back into the rewritten repository.

Preferred recovery for every collaborator and automation checkout: archive any local-only work, delete the old clone, and make a fresh clone.

For a clone that must be retained, require an explicit backup of local work before fetching and resetting it to the new `origin/main`. Do not prescribe a destructive reset until the owner confirms that all local changes are safely preserved.

## Rollback

Rollback is possible while the untouched backup mirror or verified bundle is retained.

1. Pause all pushes again.
2. Verify that the rollback source's `refs/heads/main` equals `$OriginalMain`.
3. Force-push only the original `main` ref from `naval-history-tsv-backup.git`.
4. Fresh-clone the restored remote and verify its tip and repository integrity.
5. Notify collaborators that the original history was restored.

Do not rely on reflogs, GitHub caches, or unreachable objects as the rollback mechanism.

## Completion Criteria

- All advertised remote heads and tags were audited immediately before execution.
- Only the intended `main` ref was force-pushed.
- No reachable Git object path begins with `src/transcripts/tsv/` in a fresh remote clone.
- Historical references outside that directory remain untouched.
- JSON, TXT, curated content, code, documentation, task notes, configuration, and other tip content match the pre-rewrite repository.
- `git fsck --full` succeeds in the rewrite mirror and fresh remote clone.
- `npm run check` succeeds from the rewritten history.
- Branch protection and paused automations are restored.
- Collaborators and automation owners have been told to reclone or safely realign their checkouts.
- The rollback mirror or bundle is retained until the rewritten repository has been accepted.

## Storage Follow-Up

The force-push makes the TSV objects unreachable from rewritten refs, but local and hosted storage may not shrink immediately. Local test mirrors can be measured after garbage collection. GitHub controls server-side object retention and garbage collection, so its reported size may lag behind the successful history rewrite.

After an agreed retention period and successful acceptance checks, delete disposable rewrite clones and decide whether to retain the external rollback bundle. Keeping that bundle preserves the removed TSV history and its storage cost outside the main repository, which may be desirable temporarily but is not required permanently.
