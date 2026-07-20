# Review Ledger Schema

The named batch manifest supplies:

- `schemaVersion`, `batchId`, and exact `indexVersion`;
- one `primaryGroup` and `subgroup`;
- the exact owned `slugs`;
- immutable `evidencePacketPath` and named `outputLedgerPath`.

Keep exactly one current JSONL record per selected slug, in deterministic batch order. Update the batch file atomically.

Each record must preserve:

- identity: `slug`, `title`, primary group, subgroup, and close secondary relations;
- copy: `oldSummary` and `proposedSummary`;
- accounting: indexed and actually reviewed video-key and segment-key counts;
- state: index version, evidence fingerprint, selected-record preimage fingerprint, supplemental-evidence fingerprint, evidence packet path and SHA-256;
- handoff: bounded source-path preview, transcript or external verification, ambiguity notes;
- `reviewStatus`: `pending`, `candidate`, `verified`, or `blocked-taxonomy`;
- `disposition`: `public`, `orphan-retain`, or `orphan-retire`.

Set `verified` only when reviewed counts equal indexed counts, the evidence and preimage fingerprints are current, the proposal passes the quality contract, and the falsification pass found no contradictory occurrence. Set `blocked-taxonomy` for unrelated senses and list each sense with its complete occurrence IDs.

When no accurate definition can yet be established, use an empty `proposedSummary` with `reviewStatus: candidate` and explain what identification is missing. Do not copy the old summary or substitute a generic template merely to make the field nonempty.

For each applicable `externalVerification` entry, record the source title, canonical URL, access date, source type, and the narrow identification claims used. Check English Wikipedia first for the exact title and aliases; read the article lead and disambiguation notes rather than relying on a search snippet. When the article matches the corpus sense, treat it as the primary definition reference and use the corpus locations as sense-and-index evidence. When Wikipedia is absent, ambiguous, weakly sourced, or lacks needed precision, use an authoritative museum, archive, government, academic, or specialist institutional source before verification.

Do not record transcript personification as subject-type verification. When transcript grammar suggests that a ship, design standard, institution, event, weapon, or concept is a person, note the rhetorical ambiguity only if it affected review; determine the entity type from the matching reference source.

`orphan-retain` needs an evidence-backed definition but remains non-public while unkeyed. `orphan-retire` is only a deletion proposal and requires separate explicit authorization.

Use `npm run topic-summary:inspect -- --index <path> --slug <slug>` for complete occurrence inspection and `npm run topic-summary:apply -- --index <path> --ledger <path> --slug <slug>` for a dry run. Add `--write` only under explicit apply authorization.
