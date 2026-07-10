# Remove Transcript TSV Files From Git History

Status: planning only. Do not execute this plan until current work is committed or backed up and history-rewrite coordination is complete.

Created: 2026-07-10T08:40:23-05:00
Last reviewed: 2026-07-10

## Recommended Execution Configuration

- Model: `gpt-5.6-sol`
- Reasoning effort: `xhigh`
- Run mode: interactive, single-agent Codex task; do not use subagents, multi-agent, ultra, or a scheduled automation.

This is a bounded but destructive, quality-first Git operation. `gpt-5.6-sol` is the best fit for the exact ref, object, and rollback reasoning required, and `xhigh` provides an appropriate verification margin without the latency and cost of `max`. Keep one agent in control because the rewrite, validation, and push all operate on one shared ref state and must remain serialized.

The run has two mandatory gates:

1. Before any preparatory commit or push, verify and preserve all unrelated dirty work and obtain any required approval for external backup paths and remote writes.
2. After the rewritten mirror passes every local validation, stop and present the original tip, rewritten tip, audited refs, backup verification, scope-comparison result, and test result. Do not force-push until the user gives a fresh explicit go-ahead.

## Objective

Remove every file historically stored under `src/transcripts/tsv/` from every audited writable remote ref, currently `main`, then replace the remote `main` history with the rewritten version.

The history filter must affect only that path. Historical references to TSV files in manifests, documentation, task notes, configuration, scripts, and commit messages may remain. Current JSON and TXT transcripts, curated content, logs, schedules, reports, code, and unrelated history must be preserved. Before the rewrite, add the exact ignore rule `/src/transcripts/tsv/` in a dedicated preparatory commit so the removed files cannot be accidentally reintroduced.

## Analyzed Repository Snapshot

Refresh these facts immediately before execution because they are time-sensitive.

- Remote: `git@github.com:r-jack-ray/naval-history-with-dr-alex.git`
- Current branch: `main`
- Visible local refs: local `main` and `origin/main`; no tags were present.
- Current recorded `main` tip: `c3179ec1e48b9634a18eb07f3983a19e689e45e7`.
- Repository history: 109 commits.
- First commit containing the TSV path: `d59221b` (`Add saved YouTube inventory and transcript tooling`, 2026-07-07).
- Commits directly touching the TSV path: 48.
- Commits from the first TSV-containing commit through current `main`: 102 of 109.
- Unique TSV blobs: 2,057.
- Logical TSV blob size: approximately 375.46 MiB.
- Reachable Git disk usage attributed to the path: approximately 109.18 MiB.
- Local Git storage at review time: approximately 379.41 MiB packed plus 228.24 MiB loose.
- `git-filter-repo` was installed after analysis for the Python 3.14 embedded, Python 3.7, and Python 3.13 environments. `C:\Toolbox\Python313\Scripts` was added to the user PATH, and `git filter-repo --version` returned `a40bce548d2c`.
- All 2,057 tracked files under `src/transcripts/tsv/` are currently deleted in the dirty worktree, but the path has no `.gitignore` rule. Preserve unrelated work and add the ignore rule before creating the final rewrite mirror.

Expected benefit: a fresh clone should be materially smaller, with the exact reduction depending on pack delta compression and server-side garbage collection.

## Non-Goals

- Do not remove or rewrite references to TSV in files outside `src/transcripts/tsv/`.
- Do not delete JSON or TXT transcript history.
- Do not combine this operation with content, schedule, manifest, tooling, or documentation edits. The only allowed current-tree change is the dedicated `.gitignore` rule that prevents TSV reintroduction.
- Do not perform the rewrite in the active dirty checkout.
- Do not use `git filter-branch`, interactive rebases, or commit-by-commit manual deletion.
- Do not force-push any ref other than the explicitly audited target branch.
- Do not use `git push --force`; use an explicit object-ID lease.

## Preconditions and Stop Conditions

1. Inventory the dirty worktree by path. Finish, commit, and push all intended unrelated changes, or create and verify a separate backup that can restore every local-only change. The active checkout currently contains extensive unrelated work and must not be reset, cleaned, switched to rewritten history, or used as the rewrite repository.
2. Pause all writers, automations, collaborators, and merges that can push to the repository.
3. Confirm that no open pull request, release process, deployment, or external consumer depends on the existing commit hashes.
4. Confirm the complete advertised remote ref set, including symbolic `HEAD`, heads, tags, notes, replace refs, and any pull-request refs. If any writable branch or tag beyond `main` exists, stop and expand the plan deliberately. Read-only GitHub pull-request refs may require GitHub-specific cleanup or support if storage reclamation, rather than only `main` history, is the goal.
5. Confirm that force-pushing `main` is allowed. Temporarily adjust branch protection only if necessary and restore it afterward.
6. Verify the prepared `git-filter-repo` installation with `git filter-repo --version`. The recorded prepared version identifier is `a40bce548d2c`; investigate before proceeding if the command is missing or unexpectedly resolves elsewhere.
7. Record the exact remote `main` object ID after the preparatory ignore commit is pushed. If `main` changes after this record is made, stop and restart from a fresh mirror.
8. Create an external backup mirror or Git bundle before filtering. Store it outside the active repository and outside the rewrite directory.
9. Confirm `/src/transcripts/tsv/` is ignored in the recorded remote tip and that no broader TSV pattern was introduced.

Stop immediately if:

- the remote tip changes before the force-push;
- additional remote branches or tags are discovered without an explicit decision about them;
- the filtered repository loses any non-TSV path;
- any surviving rewritten commit differs from its mapped original commit outside `src/transcripts/tsv/`;
- `git fsck`, checkout, build, or tests fail;
- the rollback backup cannot be read and verified.

## Phase 0: Preserve Dirty Work and Prevent Reintroduction

Work in the active checkout only long enough to preserve unrelated work and make the dedicated ignore-rule commit. Do not stage any unrelated path or commit the 2,057 TSV deletions merely to support the rewrite; the filter will remove that path from the tip and all ancestors.

Add exactly this root-anchored rule to `.gitignore`:

```gitignore
/src/transcripts/tsv/
```

Verify the rule and the staged scope:

```powershell
git check-ignore -v --no-index src/transcripts/tsv/probe.tsv
git diff --cached --name-only
git diff --cached --check
```

The staged path list must contain only `.gitignore`. Commit and push that one preparatory change using normal non-force Git. If the push is rejected because remote `main` moved, stop, fetch, review the new state, and restart the coordination check. Do not create the final rewrite mirror until the ignore commit is on remote `main` and all unrelated dirty work has a verified recovery path.

## Phase 1: Freeze and Record the Remote State

Run from a neutral parent directory, not from the active checkout.

```powershell
$Remote = 'git@github.com:r-jack-ray/naval-history-with-dr-alex.git'
$OriginalMain = (git ls-remote $Remote refs/heads/main).Split("`t")[0]
$OriginalMain
```

Require `$OriginalMain` to be one 40-character object ID and record it in an execution log stored outside the repository. Record the symbolic default branch and the complete advertised ref set, not only heads and tags:

```powershell
git ls-remote --symref $Remote HEAD
git ls-remote $Remote
```

Expected writable snapshot: one branch, `main`, and no tags. Classify every additional advertised ref before continuing. If another writable ref exists, stop and revise the filter, push, rollback, and validation scope. Do not assume a mirror push is appropriate.

## Phase 2: Create a Clean Mirror and External Rollback Backup

Use new, disposable paths outside the active checkout:

```powershell
if (Test-Path naval-history-tsv-rewrite.git) { throw 'Rewrite mirror path already exists.' }
if (Test-Path naval-history-tsv-backup.git) { throw 'Backup mirror path already exists.' }
git clone --mirror $Remote naval-history-tsv-rewrite.git
git clone --mirror $Remote naval-history-tsv-backup.git
```

Verify that both mirrors contain the recorded original tip:

```powershell
git -C naval-history-tsv-rewrite.git rev-parse refs/heads/main
git -C naval-history-tsv-backup.git rev-parse refs/heads/main
```

Both results must equal `$OriginalMain`. Keep `naval-history-tsv-backup.git` unchanged until the rewrite is accepted and recovery is no longer needed.

Create and verify an additional portable backup, then record its SHA-256 hash in the external execution log:

```powershell
git -C naval-history-tsv-backup.git bundle create ..\naval-history-before-tsv-rewrite.bundle --all
git bundle verify naval-history-before-tsv-rewrite.bundle
Get-FileHash naval-history-before-tsv-rewrite.bundle -Algorithm SHA256
```

Verify the bundle contains `$OriginalMain` before filtering. If the backup mirror, bundle, or hash cannot be read back, stop.

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
$RewrittenMain = git -C naval-history-tsv-rewrite.git rev-parse refs/heads/main
```

Review unexpected dangling or missing objects and confirm there are no `refs/original/` or old-history replace refs. The rewritten `main` tip must differ from `$OriginalMain`, while the earliest commits before TSV introduction may retain their original hashes. Record `$RewrittenMain` in the external execution log.

Verify the preventive rule survived at the rewritten tip:

```powershell
git -C naval-history-tsv-rewrite.git show 'refs/heads/main:.gitignore' | Select-String -SimpleMatch '/src/transcripts/tsv/'
```

### Scope comparison

Use `filter-repo/commit-map` from the rewritten bare mirror as the authoritative old-to-new mapping. Automate a comparison for every surviving mapped commit: generate recursive `git ls-tree` manifests for the original commit in the untouched backup and its rewritten commit, remove only entries whose path begins exactly `src/transcripts/tsv/`, and require the remaining mode, object type, object ID, and path records to be byte-for-byte identical. Also compare commit messages and author/committer identity and timestamps for surviving commits. Review every pruned commit and prove it had no unique non-TSV tree change after its parents were rewritten.

Create temporary clean checkouts from the original backup and rewritten mirror as a separate tip-level check. Compare their tip trees while excluding only `src/transcripts/tsv/`.

At minimum, verify:

- `src/transcripts/json/` is identical;
- `src/transcripts/txt/` is identical;
- `src/derived/`, `.agents/`, `.codex/`, `site/`, `task-notes/`, and root project files are identical;
- the rewritten tip has no `src/transcripts/tsv/` directory;
- the rewritten tip contains the exact root-anchored `.gitignore` rule `/src/transcripts/tsv/`;
- commit messages remain unchanged apart from commits pruned automatically if a historical commit becomes empty.

If any non-TSV content or metadata differs unexpectedly at any mapped commit, discard the rewrite mirror and investigate before proceeding.

### Build verification

Create a normal temporary clone from the rewritten mirror, install dependencies using the repository's lockfile, and run:

```powershell
npm ci
npm run check
npm run site:build
```

These commands run only in the disposable clone, so their generated output cannot conflict with active shared writers. Do not run transcript schedule workers or mutate coordinator-owned shared state.

### Mandatory pre-push gate

Stop after all local checks pass. Report `$OriginalMain`, `$RewrittenMain`, every advertised remote ref and its classification, the backup bundle hash, the path-removal result, the all-commit scope-comparison result, `git fsck`, `npm run check`, and `npm run site:build`. Ask for a fresh explicit go-ahead. Do not treat the original task prompt as approval to cross this gate.

## Phase 5: Recheck the Remote and Push Main With an Object-ID Lease

Immediately before pushing, verify that the remote has not changed:

```powershell
$CurrentRemoteMain = (git ls-remote $Remote refs/heads/main).Split("`t")[0]
if ($CurrentRemoteMain -ne $OriginalMain) {
  throw "Remote main changed after the rewrite began. Abort and restart from a fresh mirror."
}
git ls-remote --symref $Remote HEAD
git ls-remote $Remote
```

Require the complete advertised ref set to match the classified preflight set. Restore the remote in the rewrite mirror if `git-filter-repo` removed it:

```powershell
$Remotes = git -C naval-history-tsv-rewrite.git remote
if ($Remotes -contains 'origin') {
  git -C naval-history-tsv-rewrite.git remote set-url origin $Remote
} else {
  git -C naval-history-tsv-rewrite.git remote add origin $Remote
}
```

Push only `main`, with the recorded original object ID as an atomic lease:

```powershell
git -C naval-history-tsv-rewrite.git push "--force-with-lease=refs/heads/main:$OriginalMain" origin refs/heads/main:refs/heads/main
```

Do not downgrade this command to `--force`. Do not use `git push --mirror` unless a separately reviewed plan proves that every mirrored ref is intentionally in scope. If the lease rejects the push, stop and restart from a fresh mirror; never bypass the rejection.

## Phase 6: Verify the Remote From a Fresh Clone

Create a new normal clone after the force-push. Do not validate only through the rewrite mirror.

```powershell
git clone $Remote naval-history-after-tsv-rewrite
git -C naval-history-after-tsv-rewrite rev-parse refs/heads/main
git -C naval-history-after-tsv-rewrite log --all -- src/transcripts/tsv/
git -C naval-history-after-tsv-rewrite rev-list --objects --all | Select-String ' src/transcripts/tsv/'
git -C naval-history-after-tsv-rewrite fsck --full
git -C naval-history-after-tsv-rewrite check-ignore -v --no-index src/transcripts/tsv/probe.tsv
```

The fresh-clone tip must equal `$RewrittenMain`, both path searches must be empty, and the ignore check must resolve to the exact root-anchored rule. Then run `npm ci`, `npm run check`, and `npm run site:build` in the fresh clone.

Re-run `git ls-remote --symref $Remote HEAD` and `git ls-remote $Remote`; require remote `main` to equal `$RewrittenMain` and confirm no unplanned ref changed. Re-enable normal pushes, automations, and branch protections only after these checks pass. Confirm any expected GitHub Actions or Pages deployment triggered by the rewritten tip completes successfully.

## Phase 7: Coordinate Existing Clones

Announce that `main` history was rewritten and that old commit hashes are obsolete. Existing clones must not merge or push their old branch history back into the rewritten repository.

Preferred recovery for every collaborator and automation checkout: archive any local-only work, delete the old clone, and make a fresh clone.

For a clone that must be retained, require an explicit backup of local work before fetching and resetting it to the new `origin/main`. Do not prescribe a destructive reset until the owner confirms that all local changes are safely preserved.

## Rollback

Rollback is possible while the untouched backup mirror or verified bundle is retained.

1. Pause all pushes again.
2. Verify that the rollback source's `refs/heads/main` equals `$OriginalMain`.
3. Verify remote `main` still equals `$RewrittenMain`, then push only the original `main` ref from `naval-history-tsv-backup.git` using `--force-with-lease=refs/heads/main:$RewrittenMain`.
4. Fresh-clone the restored remote and verify its tip and repository integrity.
5. Notify collaborators that the original history was restored.

If the rollback lease rejects, stop and investigate the new remote state. Do not rely on reflogs, GitHub caches, or unreachable objects as the rollback mechanism.

## Completion Criteria

- The complete advertised remote ref set was audited immediately before execution and immediately before the leased push.
- Only the intended `main` ref was force-pushed.
- No reachable Git object path begins with `src/transcripts/tsv/` in a fresh remote clone.
- Historical references outside that directory remain untouched.
- JSON, TXT, curated content, code, documentation, task notes, configuration, and other tip content match the pre-rewrite repository.
- Every surviving mapped commit matches its original outside `src/transcripts/tsv/`, including file modes and blob identities, and every pruned commit was explained.
- The rewritten tip ignores `/src/transcripts/tsv/` with an exact root-anchored rule.
- `git fsck --full` succeeds in the rewrite mirror and fresh remote clone.
- `npm run check` and `npm run site:build` succeed from the rewritten history.
- Branch protection and paused automations are restored.
- Collaborators and automation owners have been told to reclone or safely realign their checkouts.
- The rollback mirror or bundle is retained until the rewritten repository has been accepted.

## Storage Follow-Up

The force-push makes the TSV objects unreachable from rewritten refs, but local and hosted storage may not shrink immediately. Local test mirrors can be measured after garbage collection. GitHub controls server-side object retention and garbage collection, so its reported size may lag behind the successful history rewrite.

Advertised or hidden GitHub pull-request refs, forks, caches, and old clones may continue to retain the old objects. This plan guarantees removal from the audited writable refs, not immediate physical erasure from every GitHub storage layer. If the TSV data is sensitive or complete server-side purging is required, follow GitHub's sensitive-data removal process and contact GitHub Support after the rewrite.

After an agreed retention period and successful acceptance checks, delete disposable rewrite clones and decide whether to retain the external rollback bundle. Keeping that bundle preserves the removed TSV history and its storage cost outside the main repository, which may be desirable temporarily but is not required permanently.

## Prompt to Run This Plan

Run this as an interactive Codex task with `gpt-5.6-sol` and reasoning effort `xhigh`:

```text
Execute task-notes/2026-07-10_T08-40-23-0500_remove-tsv-from-git-history-plan.md exactly as a single-agent, two-gate Git history rewrite.

Start by reading the repository AGENTS.md and the complete plan. Treat every analyzed count, ref, object ID, dirty-worktree fact, remote setting, and protection setting as volatile: refresh it before acting. Preserve all unrelated dirty work. Do not use subagents, multi-agent, ultra, scheduled automation, git reset --hard, git clean, git push --mirror, or an unleased --force push. Do not modify any repository path except the dedicated /src/transcripts/tsv/ ignore rule described in Phase 0; the history filter itself must remove only src/transcripts/tsv/.

Before the preparatory .gitignore commit or any remote write, inventory the worktree, prove that all local-only work has a verified recovery path, and obtain any required approvals. Stage only .gitignore for the preparatory commit. Perform the rewrite only in a new disposable mirror outside the active checkout, create and verify both rollback forms, audit the complete advertised remote ref set, and apply every path, integrity, mapped-commit scope, build, and site-build check in the plan.

After Phase 4 passes, stop. Report the original and rewritten main object IDs, all audited refs, the backup-bundle SHA-256, the all-history scope-comparison result, fsck result, npm run check result, and npm run site:build result. Ask me for a fresh explicit go-ahead. Do not force-push based only on this prompt.

Only after I explicitly approve that gate, re-audit the complete remote ref set and push main using the exact original object ID in --force-with-lease. If the lease rejects or any stop condition is met, stop without bypassing it. After a successful push, verify from a fresh remote clone, restore protections and paused writers, and give a compact Changed / Remote / Checked / Rollback / Notes closeout. Do not delete the rollback mirror or bundle.
```
