# Remove Legacy archive.json From Git History

Created: 2026-07-12T04:33:05-05:00

Status: approved for execution by the user in the task that created this plan.

## Decision

Rewrite reachable main history to remove exactly:

site/src/data/generated/archive.json

This is worthwhile repository maintenance, not a correctness, security, or immediate push-blocking emergency. The file is generated, is absent from the current tree, and accumulated many large historical versions.

Audit snapshot before execution:

- main and origin/main: 4850ee68a52b01302d6f58dd6d95750787e8ad03
- commits touching the exact path, including deletion: 57
- distinct blobs for the path: 56
- smallest blob: 11,655 bytes
- largest blob: 63,189,237 bytes, about 60.26 MiB
- legacy path present at current tip: no
- replacement split archive: schema v2, 67 files, 64 segment buckets
- current counts: 1,509 videos, 24,695 segments, 12,878 topics
- current split archive size: 60,388,827 bytes

The largest historical revision exceeds GitHub's 50 MiB warning threshold. Removing the old monolithic revisions should reduce clone and transfer weight, but it will not remove the current split dataset and therefore will not make the repository small.

References:

- https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github
- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository

Because this is non-sensitive generated data, success means the path is no longer reachable from rewritten main. It does not promise immediate physical deletion from GitHub caches, pull-request refs, forks, or server-side storage.

## Objective

1. Remove site/src/data/generated/archive.json from every reachable main commit.
2. Preserve site/src/data/generated/archive/ and every other retained path.
3. Preserve retained file content, modes, messages, authorship, and timestamps except for mechanically rewritten ancestry.
4. Permit git-filter-repo to prune commits that become empty solely because the legacy path was removed.
5. Validate repository integrity, split-archive integrity, tests, Astro, and Pagefind before publishing.
6. Publish main only with an exact object-ID force-with-lease.
7. Verify from a fresh remote clone.
8. Realign the active checkout without git reset --hard.

## Scope

In scope:

- refs/heads/main
- the exact legacy file path
- one disposable main-only bare rewrite repository
- one disposable validation clone
- an exact leased force-push of main
- fresh-clone verification
- a local rollback ref

Out of scope:

- removing or untracking site/src/data/generated/archive/
- filtering any other path
- Git LFS migration
- rewriting messages or authors
- rewriting forks or collaborators' private refs
- GitHub Support purge requests
- automatic branch-protection changes
- git push --mirror, git push --all, git push --force, git reset --hard, git clean, or git checkout --
- inspecting, hashing, listing, opening, extracting, or restoring the user's 7z backup
- staging or committing the 7z backup

## Backup handling

The user completed the 7z backup and moved it to a separate folder.

- Do not inspect or verify it.
- Do not alter, delete, rename, stage, commit, or push it.
- Treat it as a user-managed extra recovery layer.
- Preserve the original checkout and original main object independently through remote verification.

## Hard stops

Stop before publication if:

- tracked changes unrelated to this plan exist;
- local main and remote main differ at baseline;
- remote main moves after OriginalMain is recorded;
- another remote branch or tag contains the legacy path;
- remote ref scope changes;
- signed history is found and its invalidation is not already covered by the execution authorization;
- any retained path, content object, or mode changes unexpectedly;
- rewritten and original tip trees differ;
- commit-map comparison reports an unexplained difference;
- git fsck fails;
- archive hashes or counts fail;
- check, site:check, or forced site:build fails for a source-related reason;
- the exact force-with-lease fails;
- branch protection rejects the push;
- fresh-clone verification finds the legacy path.

Never weaken a failed check, widen the filter, change protection automatically, or downgrade the push.

## Native-command safety

PowerShell does not stop automatically when a native command returns a nonzero exit code. Every Git and npm operation in this plan must be fail-fast.

At the start of each execution shell, resolve the executables before defining checked wrapper functions:

~~~powershell
$ErrorActionPreference = 'Stop'
$GitExe = (Get-Command git.exe -ErrorAction Stop).Source
$NodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$NpmExe = Join-Path (Split-Path $NodeExe -Parent) 'npm.cmd'

function git {
  & $script:GitExe @args
  if ($LASTEXITCODE -ne 0) {
    throw "git failed with exit code $LASTEXITCODE: $($args -join ' ')"
  }
}

function npm {
  & $script:NpmExe @args
  if ($LASTEXITCODE -ne 0) {
    throw "npm failed with exit code $LASTEXITCODE: $($args -join ' ')"
  }
}
~~~

All Git and npm examples below assume these wrappers are active. Any other native executable must receive an immediate explicit LASTEXITCODE check. Commands whose nonzero result is expected must be implemented with an output-based query that returns zero, not by suppressing a failure.

## Phase 1: Save this plan and capture the baseline

1. Commit and push this plan normally before recording OriginalMain.
2. Pause repository-writing automations and manual pushes.
3. Confirm Git, Node 22+, npm, and git-filter-repo.
4. Require a clean tracked worktree and index.
5. Fetch origin.
6. Record local main, remote main, a sorted complete advertised-remote-ref snapshot, and all local refs.
7. Record path history, blob IDs and sizes, repository object statistics, and the original tip tree.
8. Record the split archive index, file hashes, counts, and bucket assignments.
9. Inventory commit signatures. Any remote tag is already a scope hard stop; if the scope is revised later, annotated-tag signatures must also be inventoried.
10. Require the advertised writable remote scope to contain only refs/heads/main and no tags.

Suggested PowerShell:

~~~powershell
$Repo = 'C:\Workspaces\naval-history-with-dr-alex'
$LegacyPath = 'site/src/data/generated/archive.json'
$RemoteUrl = (git -C $Repo remote get-url origin).Trim()

git -C $Repo status --short --branch
git -C $Repo diff --check
if (git -C $Repo status --porcelain=v1 --untracked-files=no) {
  throw 'Tracked worktree or index changes are present.'
}

git -C $Repo fetch origin
$OriginalMain = (git -C $Repo rev-parse refs/heads/main).Trim()
$RemoteMain = ((git -C $Repo ls-remote --exit-code origin refs/heads/main) -split '\s+')[0]
if ($OriginalMain -ne $RemoteMain) {
  throw 'Local main and remote main do not match.'
}

$OriginalTree = (git -C $Repo rev-parse "$OriginalMain^{tree}").Trim()
$RemoteRefsBaseline = @(git -C $Repo ls-remote --symref origin | Sort-Object)
$WritableRemoteRefs = @(git -C $Repo ls-remote --heads --tags origin)
if ($WritableRemoteRefs.Count -ne 1 -or $WritableRemoteRefs[0] -notmatch '\srefs/heads/main$') {
  throw 'Remote writable ref scope is not main-only with no tags.'
}

$SignedCommits = @(git -C $Repo log refs/heads/main --format='%H %G?' |
  Where-Object { $_ -notmatch ' N$' })
if ($SignedCommits.Count -ne 0) {
  throw 'Signed commits would be invalidated by rewriting.'
}

git -C $Repo show-ref
$RemoteRefsBaseline
git -C $Repo count-objects -vH
~~~

The recorded OID must be a refreshed 40-character value, not the audit snapshot above.

Validate all paths, counts, bucket assignments, and SHA-256 values declared by:

site/src/data/generated/archive/index.json

## Phase 2: Rewrite one main-only bare repository

Use one new main-only bare repository outside the active repository. Do not use a mirror clone: an unrestricted filter-repo run in a mirror would rewrite every mirrored ref. The original checkout and the user's separate 7z are the recovery layers.

~~~powershell
$Parent = Split-Path $Repo -Parent
$Mirror = Join-Path $Parent 'naval-history-archive-json-rewrite.git'

if (Test-Path -LiteralPath $Mirror) {
  throw "Rewrite workspace already exists: $Mirror"
}

git clone --bare --single-branch --no-tags --branch main $RemoteUrl $Mirror
$RewriteRefs = @(git -C $Mirror for-each-ref --format='%(refname)' | Sort-Object)
if ($RewriteRefs.Count -ne 1 -or $RewriteRefs[0] -ne 'refs/heads/main') {
  throw 'Disposable rewrite repository contains refs outside main.'
}

$MirrorOriginalMain = (git -C $Mirror rev-parse refs/heads/main).Trim()
if ($MirrorOriginalMain -ne $OriginalMain) {
  throw 'Mirror main does not equal OriginalMain.'
}

git -C $Mirror count-objects -vH
git -C $Mirror filter-repo --force --path $LegacyPath --invert-paths

$RewrittenMain = (git -C $Mirror rev-parse refs/heads/main).Trim()
if ($RewrittenMain -eq $OriginalMain) {
  throw 'The rewrite did not change main.'
}
~~~

Use that exact filter. Do not filter the archive directory, a wildcard, a parent directory, or any second path. git-filter-repo may remove origin; restore a non-mirror origin only after local validation.

## Phase 3: Validate rewritten history before any remote write

### Path reachability

Both queries must be empty:

~~~powershell
git -C $Mirror log --all --full-history -- $LegacyPath
git -C $Mirror rev-list --objects --all | Select-String -SimpleMatch " $LegacyPath"
~~~

Confirm the split index, videos, topics, and all 64 buckets remain.

### Tip-tree identity

The legacy file is already absent at the current tip, so the entire tree object must be unchanged:

~~~powershell
$RewrittenTree = (git -C $Mirror rev-parse "$RewrittenMain^{tree}").Trim()
if ($RewrittenTree -ne $OriginalTree) {
  throw 'Rewritten tip tree differs from the original tip tree.'
}
~~~

### Full commit-map comparison

Read git-filter-repo's commit-map. For every surviving old-to-new mapping:

1. Compare recursive trees after removing only the exact legacy path from the original side.
2. Require every retained path, mode, type, and object ID to match.
3. Compare author name, email and timestamp; committer name, email and timestamp; encoding; and full message.
4. Permit only expected commit, tree, and parent ID changes.
5. Inventory signatures separately.

For every pruned commit:

1. Prove removal of the exact legacy path makes it empty against its rewritten parent state.
2. Prove it contained no retained-path change.
3. Record its ID and reason.

The comparison report must have zero unexplained differences.

### Repository integrity and local size

~~~powershell
git -C $Mirror fsck --full
git -C $Mirror show-ref
git -C $Mirror for-each-ref refs/original refs/replace
git -C $Mirror gc --prune=now
git -C $Mirror count-objects -vH
~~~

No refs/original or refs/replace may retain the old history.

### Normal-clone site validation

~~~powershell
$ValidationClone = Join-Path $Parent 'naval-history-archive-json-validation'
if (Test-Path -LiteralPath $ValidationClone) {
  throw "Validation directory already exists: $ValidationClone"
}
git clone $Mirror $ValidationClone
~~~

From the validation clone:

~~~powershell
npm ci
npm run check
npm run generate:site-data
npm run site:check
npm run site:build -- --force
git diff --check
git status --short
~~~

Use C:\Program Files\nodejs\npm.cmd if the roaming npm shim fails.

Requirements:

- all checks pass;
- generated output is deterministic and leaves no tracked diff;
- the archive index and all file hashes validate;
- no consumer loads the removed monolithic path;
- Astro and Pagefind complete.

Retry only a clearly external Windows file lock after the lock is gone.

## Phase 4: Publish main with an exact lease

Re-query refs and remote main immediately before publication:

~~~powershell
$CurrentRemoteMain = ((git -C $Repo ls-remote --exit-code origin refs/heads/main) -split '\s+')[0]
if ($CurrentRemoteMain -ne $OriginalMain) {
  throw 'Remote main moved; do not push.'
}

$CurrentRemoteRefs = @(git -C $Repo ls-remote --symref origin | Sort-Object)
if (Compare-Object -ReferenceObject $RemoteRefsBaseline -DifferenceObject $CurrentRemoteRefs) {
  throw 'Advertised remote refs changed; do not push.'
}

$MirrorRemotes = @(git -C $Mirror remote)
if ($MirrorRemotes -contains 'origin') {
  git -C $Mirror remote remove origin
}
git -C $Mirror remote add origin $RemoteUrl
git -C $Mirror config remote.origin.mirror false
if ((git -C $Mirror config --bool remote.origin.mirror).Trim() -ne 'false') {
  throw 'Rewrite origin is still configured as a mirror.'
}

git -C $Mirror push "--force-with-lease=refs/heads/main:$OriginalMain" origin refs/heads/main:refs/heads/main
~~~

Push main only. Never substitute --force, --mirror, --all, or a lease without the expected OID.

If branch protection rejects the push, stop without changing protection settings.

## Phase 5: Verify from the GitHub remote

1. Require remote main to equal RewrittenMain.
2. Require the advertised writable ref set to contain exactly rewritten refs/heads/main and no tags.
3. Create a fresh clone from GitHub, not the mirror.
4. Require both legacy-path queries to be empty.
5. Require the fresh tip tree to equal OriginalTree.
6. Run git fsck, archive hash/count validation, check, site:check, and forced site:build.
7. Confirm GitHub Actions and Pages.
8. Record fresh-clone object statistics.

~~~powershell
$PublishedMain = ((git -C $Repo ls-remote --exit-code origin refs/heads/main) -split '\s+')[0]
if ($PublishedMain -ne $RewrittenMain) {
  throw 'Published main is not RewrittenMain.'
}

$PublishedWritableRefs = @(git -C $Repo ls-remote --heads --tags origin)
$ExpectedPublishedRef = $RewrittenMain + [char]9 + 'refs/heads/main'
if ($PublishedWritableRefs.Count -ne 1 -or $PublishedWritableRefs[0] -ne $ExpectedPublishedRef) {
  throw 'Published writable remote-ref scope is not exactly rewritten main.'
}

$FreshClone = Join-Path $Parent 'naval-history-archive-json-fresh-remote'
if (Test-Path -LiteralPath $FreshClone) {
  throw "Fresh-clone directory already exists: $FreshClone"
}
git clone --single-branch --no-tags --branch main $RemoteUrl $FreshClone

git -C $FreshClone log --all --full-history -- $LegacyPath
git -C $FreshClone rev-list --objects --all | Select-String -SimpleMatch " $LegacyPath"
git -C $FreshClone fsck --full
~~~

GitHub may retain unreachable objects internally for some time. Fresh-clone reachability and branch history, not an immediately updated size display, are the acceptance tests.

## Phase 6: Realign the active checkout

After fresh-clone and deployment checks pass:

~~~powershell
if (git -C $Repo status --porcelain=v1 --untracked-files=no) {
  throw 'Tracked changes appeared during the rewrite.'
}

$CurrentLocalMain = (git -C $Repo rev-parse refs/heads/main).Trim()
if ($CurrentLocalMain -ne $OriginalMain) {
  throw 'Local main moved during the rewrite.'
}

$RollbackRef = 'refs/rewrites/archive-json/original-main'
$ExistingRollback = @(git -C $Repo for-each-ref --format='%(objectname)' $RollbackRef)
if ($ExistingRollback.Count -eq 0) {
  $ZeroObject = '0' * 40
  git -C $Repo update-ref $RollbackRef $OriginalMain $ZeroObject
}
elseif ($ExistingRollback.Count -ne 1 -or $ExistingRollback[0].Trim() -ne $OriginalMain) {
  throw 'Existing rollback ref does not match OriginalMain.'
}

git -C $Repo fetch origin +refs/heads/main:refs/remotes/origin/main

$FetchedMain = (git -C $Repo rev-parse refs/remotes/origin/main).Trim()
if ($FetchedMain -ne $RewrittenMain) {
  throw 'Fetched origin/main is not RewrittenMain.'
}

git -C $Repo switch --detach refs/remotes/origin/main
git -C $Repo update-ref refs/heads/main $RewrittenMain $OriginalMain
git -C $Repo switch main
git -C $Repo branch --set-upstream-to=origin/main main
git -C $Repo status --short --branch
~~~

This is safe only because OriginalTree and RewrittenTree are identical. Keep refs/rewrites/archive-json/original-main local and never push it.

## Rollback

Rollback only while remote main still equals RewrittenMain:

~~~powershell
$CurrentRemoteMain = ((git -C $Repo ls-remote --exit-code origin refs/heads/main) -split '\s+')[0]
if ($CurrentRemoteMain -ne $RewrittenMain) {
  throw 'Remote main moved after rewrite; automatic rollback is unsafe.'
}

git -C $Repo push "--force-with-lease=refs/heads/main:$RewrittenMain" origin refs/rewrites/archive-json/original-main:refs/heads/main
~~~

Then fresh-clone and verify OriginalMain, run normal checks, and realign the active checkout using the same detached-switch method. Do not use git reset --hard or an unleased push.

## Collaborator and automation recovery

- Tell all collaborators and automation owners that main has new commit IDs.
- Prefer fresh clones.
- Never merge old main into rewritten main.
- Move unpublished work with patches or selected cherry-picks.
- Restart writers only after they use rewritten main.
- Watch for obsolete clones trying to push old history.
- Never use push --all or push --mirror from the original checkout.

## Deferred cleanup

After at least one verified GitHub Pages deployment and acceptance:

1. Remove the local rollback ref only when immediate Git rollback is no longer needed.
2. Remove disposable workspaces through a separately checked filesystem operation.
3. Optionally expire local reflogs and garbage-collect for local disk reclamation.
4. Do not delete or verify the user's 7z backup.

The remote-history objective is complete while the rollback ref and 7z remain.

## Completion criteria

- remote main equals RewrittenMain;
- a fresh GitHub clone cannot reach the legacy path from main;
- original and rewritten tip trees are identical;
- the split archive remains valid;
- full commit-map comparison has no unexplained difference;
- git fsck passes;
- npm run check passes;
- npm run site:check passes;
- npm run site:build -- --force passes;
- GitHub Actions and Pages pass;
- the active checkout tracks rewritten origin/main;
- the rollback ref is retained locally;
- the 7z backup was not inspected or modified;
- collaborators and automations are warned not to reintroduce old history.

## Final handoff fields

- OriginalMain and RewrittenMain
- original and rewritten tree IDs
- exact filtered path
- remote refs before and after
- commits touched and blobs removed
- object statistics before and after
- commit-map and pruned-commit results
- fsck result
- archive count/hash result
- check, site:check, and forced site:build results
- force-with-lease result
- fresh-clone and deployment results
- active-checkout status
- rollback ref status
- confirmation that the 7z backup was not inspected or modified
