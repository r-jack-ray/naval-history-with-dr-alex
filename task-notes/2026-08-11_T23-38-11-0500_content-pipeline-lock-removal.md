# Content-pipeline lock removal

Status: Implemented on 2026-08-11.

## Supersession notice

This note supersedes every older task note that describes `.tmp/site-content-pipeline.lock`, `CONTENT_PIPELINE_LOCK_TOKEN`, `src/scripts/site-content-pipeline-lock.mjs`, persistent content-pipeline leases, or nested commands joining a lease. Those references record earlier designs only. Do not use them as current operating instructions and do not restore the locking mechanism from them.

## Why it was removed

- Per-video shard work already has explicit single-shard ownership and is performed sequentially.
- Corpus-wide taxonomy repair and curation are separate, explicitly scoped operations.
- Processing-log append collisions were rare, easy to recognize, and easy to repair. The lease imposed substantially more waiting, stale-state recovery, token propagation, command wrapping, testing, and instruction overhead than the log risk justified.
- Topic synchronization already verifies that `topics.json` still matches its planned preimage immediately before writing and then replaces the file atomically. A competing change therefore fails safely instead of being overwritten.
- Archive generation publishes deterministic files atomically, publishes its manifest last, and validates the completed manifest and file hashes. Site-content audit reports also use atomic replacement.
- The repository-wide lease never covered independently owned shard writes, so it did not create a complete transaction across the inputs it claimed to coordinate.

## Current workflow

The canonical package commands run their implementations directly. A curator or auditor writes and validates the selected shard, runs `C:\Program Files\nodejs\npm.cmd run sync:video-topics` with elevation on the first attempt, and appends exactly one canonical processing-log row only after synchronization succeeds. No content-pipeline lock, lease, token, nested lock joining, stale-lock recovery, or lock-specific command wrapper is part of the workflow.

The optional validation coordinators that existed to group commands beneath one persistent lease were removed. Use the canonical package commands documented in `package.json`, `README.md`, and `AGENTS.md` instead.

## Historical-note rule

Older task notes remain preserved as historical records. Whenever an older note conflicts with this note or with current repository guidance, this note and the current repository files take precedence.
