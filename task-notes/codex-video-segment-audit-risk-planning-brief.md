# Codex Planning Brief: `needsFurtherProcessing` Removal and Video Segment Audit Risk Reassessment

## Objective

Create a **Markdown plan file only**. Do not implement the changes yet.

Before writing the plan, inspect the relevant repository code, generated data, documentation, Codex skills, and Git history so the plan reflects actual repository behavior rather than assumptions.

Treat the current `Rank` and `Audit Risk Score` formulas as hypotheses to evaluate, not behavior that must be preserved.

Prefer the simplest scoring model that is supported by repository evidence. Do not add complexity merely because more data is available.

---

## 1. Remove `needsFurtherProcessing`

In:

- `src/derived/site-content-processing.log`

Plan the removal of the `needsFurtherProcessing` column and all associated data.

### Required investigation

Find every active dependency or reference to `needsFurtherProcessing`, including but not limited to:

- scripts
- report-generation code
- Codex skills
- Markdown documentation
- schemas, types, interfaces, parsing logic, or validation logic
- tests and fixtures
- generated-file consumers
- other repository files that describe, interpret, calculate from, or display this field

### Constraints

- Do **not** update or plan retrospective edits to existing files under `task-notes/`.
- Identify downstream effects caused by removing the field.
- Distinguish active dependencies from historical or obsolete references.
- Do not preserve dead compatibility logic unless the repository actually requires it.

### Reason for removal

`needsFurtherProcessing` has poor negative predictive value. It is aggressively set to `no`, while later audits commonly determine that additional processing is actually required. Because of this false-negative behavior, the field should no longer be treated as reliable evidence.

---

## 2. Reevaluate `video-segment-audit-risk.tsv`

This section must be investigated **after accounting for the removal of `needsFurtherProcessing`**, because the report must no longer depend on that field.

Relevant files include:

- `reports/video-segment-audit-risk.tsv`
- `src/scripts/rank-video-segment-audit-risk.ts`
- `src/content/video-segment-audit-risk.ts`

Also inspect any additional files that actually participate in generating, sorting, scoring, testing, or documenting the report.

### Required structural change

Move the `manual audio review remaining` column to the far-right side of the generated TSV.

### Required scoring constraint

`manual audio review remaining` must have **no positive or negative effect** on either:

- `Rank`
- `Audit Risk Score`

Its value is display/operational information only.

The plan should include a regression/invariance test proving that changing only `manual audio review remaining` cannot change the score or rank.

---

# Audit-Risk Model Investigation

Before recommending a revised ranking model, determine what the report is actually intended to prioritize.

A useful working target is:

> Which video-segment shards are most likely to benefit from additional substantive audit work?

Validate that this matches the repository's actual purpose before using it as the basis of the model.

Do not equate "has Git history" with "has audit risk." Git history is evidence that must be classified.

## A. Historical predictive value of each signal

For every current scoring/ranking input:

- Determine what the signal is intended to represent.
- Compare the signal against later substantive audit findings or corrections where repository history permits.
- Determine whether the signal appears useful, neutral, misleading, or redundant.
- Recommend retaining, removing, or reweighting the signal based on evidence.

Do not keep an input merely because the current implementation already uses it.

## B. False negatives and false positives

Actively inspect examples of:

- low-risk/low-priority shards that later required substantial correction
- high-risk/high-priority shards that later required little or no meaningful correction

Use these cases to identify weak assumptions in the scoring model.

Pay particular attention to false negatives because the purpose of this report is prioritization for further audit work.

## C. Selection bias and audit-opportunity bias

A shard with little corrective Git history may simply have received little audit attention.

Investigate whether the available history is biased by:

- which shards were selected for earlier audits
- how long a shard has existed
- how many opportunities it has had to be reviewed
- when it entered the processing pipeline

Do not interpret absence of later corrections as proof of low risk when the shard has not had comparable audit opportunity.

## D. Processing-generation / pipeline-version effects

Determine whether shards created or processed under older versions of the processing/audit pipeline are systematically more likely to need later correction.

If so, evaluate whether processing generation or creation period is a more useful risk indicator than one or more existing status fields.

Avoid embedding specific date cutoffs unless repository history clearly supports them.

## E. Signal overlap and double-counting

Check whether multiple scoring inputs are measuring substantially the same underlying condition.

Examples could include multiple fields that all indirectly represent:

- incomplete processing
- weak segmentation
- uncertain content classification
- historical audit activity

Avoid giving the same condition multiple independent weights unless there is evidence that the extra weighting improves prioritization.

## F. Git-history classification

Do not treat all commits or line changes as substantive audit evidence.

Separate, where reasonably possible:

- substantive historical/content corrections
- segment boundary corrections
- transcript-content corrections
- metadata corrections
- formatting-only changes
- generated-file changes
- renames or moves
- schema migrations
- broad mechanical refactors
- bulk repository maintenance

The plan should explain how Git history can be used without allowing mechanical change volume to masquerade as audit risk.

## G. Magnitude of later substantive changes

Where practical, distinguish between:

- a trivial correction
- a moderate correction
- a substantial reworking of shard content

Raw commit count or raw changed-line count alone may be misleading.

If a lightweight content-difference metric helps classify change magnitude, use it only as supporting evidence rather than automatically turning it into a new production scoring feature.

## H. Missing and unknown values

Inspect how the current report handles absent, unknown, blank, or unparseable values.

Do not silently treat missing data as either:

- evidence of low risk, or
- evidence of high risk

Recommend explicit behavior supported by the meaning of the field.

## I. Outliers and score dominance

Determine whether any single numeric field or condition can dominate `Audit Risk Score`.

Inspect the score distribution for:

- extreme outliers
- most rows collapsing into a narrow score band
- one field overwhelming all other evidence
- arbitrary large jumps caused by threshold boundaries

Recommend normalization or caps only when evidence shows they are needed.

## J. Rank stability and sensitivity

Evaluate whether small changes to one input produce disproportionately large rank changes.

Perform simple sensitivity checks such as:

- removing one signal at a time
- changing one signal within a realistic range
- comparing the top-priority set before and after a proposed adjustment

Prefer a model whose ranking is reasonably stable and understandable.

## K. Tie handling

If multiple rows receive the same or effectively equivalent score:

- identify the current tie-breaking behavior
- ensure the result is deterministic
- recommend a simple secondary ordering if needed

Do not introduce a new risk signal solely to avoid ties.

## L. Shard size and content volume

Investigate whether factors such as these correlate with later substantive corrections:

- transcript length
- shard length
- segment count
- video duration
- amount of historical-content text

If larger shards show more corrections, determine whether this represents genuine higher risk or simply more content providing more opportunities for edits.

Do not automatically reward or penalize size.

## M. Shards from the same source video

Determine whether multiple shards from one source video share correlated characteristics or audit outcomes.

Avoid treating many shards from one video as fully independent historical evidence if they were produced by the same processing conditions and corrected together.

Consider whether source-video-level effects matter when interpreting historical evidence, without necessarily adding a source-video scoring factor.

## N. Content-type effects

Investigate whether recognizable content types have meaningfully different audit behavior.

Do not special-case a content type merely because it is recognizable.

Any content-type adjustment should require enough examples and sufficiently consistent evidence to justify it.

## O. Game-stream shard investigation

Specifically investigate the hypothesis that game-stream shards may contain less historical content than normal video shards.

Do **not** assume this is true.

Determine:

- how game-stream shards can be identified reliably
- how many examples exist
- whether the sample is large enough to support a conclusion
- whether they actually contain less historical-content material
- whether they show a different rate or magnitude of later substantive corrections
- whether any observed difference is caused by content type or by another factor such as shard size, age, or processing generation

Only recommend a ranking/scoring adjustment for game-stream shards if repository evidence makes the distinction reasonably probable and operationally useful.

Document the evidence and reasoning whether the conclusion is:

- adjust scoring/ranking, or
- leave game streams unchanged

## P. Data leakage

Ensure the scoring model does not use information that only became available **after** the audit outcome it is effectively trying to predict.

When evaluating historical predictive usefulness, distinguish:

- information available at the time the shard would have been ranked
- later audit results that are valid only as outcome evidence

Do not turn outcome information into an input merely because it correlates strongly with the outcome.

## Q. Display-only versus scoring fields

Identify fields that are useful to a human reviewer but should not be risk signals.

`manual audio review remaining` is explicitly one such field.

Evaluate whether any other report columns should also be treated as informational rather than scoring inputs.

## R. Explainability

The proposed model should make it possible to understand why a shard ranked highly.

Investigate whether the current implementation already exposes enough component information for validation.

If extra diagnostics would help during development, prefer:

- temporary analysis output
- tests
- optional debug output

over permanently bloating the normal TSV.

## S. Score distribution

Inspect the resulting score/rank distribution across the full report.

Determine whether the model creates useful separation between:

- high-priority audit candidates
- middle-priority candidates
- low-priority candidates

A score that technically varies but clusters nearly every shard together is not operationally useful.

## T. Top/middle/bottom validation

For the current and proposed model, inspect representative samples from:

- the top of the ranking
- the middle
- the bottom

Use repository evidence and Git history to assess whether the ordering is directionally sensible.

The practical question is not whether the formula is mathematically elaborate; it is whether processing the highest-ranked shards first is likely to find more meaningful audit work.

## U. Simplicity test

If two scoring approaches appear similarly useful, prefer the simpler one.

Do not introduce:

- machine learning
- a large statistical framework
- a complex weighting system
- new persistent metadata
- elaborate historical-analysis infrastructure

unless the repository evidence shows that the simpler alternatives are materially inadequate.

---

# Python Tooling Guidance

The global user `AGENTS.md` already makes several Python tools available. Prefer existing project utilities and the Python standard library first. Use the following only where they materially simplify the investigation.

## Recommended

### `pathlib`

Use Python's standard `pathlib` for repository traversal, path normalization, and lightweight analysis scripts.

Good uses here include:

- enumerating shard files
- mapping generated files to sources
- locating related historical paths
- producing deterministic file lists

### `textdistance`

Use `textdistance` when a lightweight normalized comparison between historical versions of shard text helps distinguish substantive content changes from trivial edits.

Potentially useful metrics include:

- Jaccard
- Sørensen-Dice
- Levenshtein

Use these as **investigation aids**, not automatically as production risk-score inputs.

### `RapidFuzz`

Use `RapidFuzz` when Git history contains renamed, moved, slightly renamed, or otherwise difficult-to-match shard/file identifiers.

Use it for tolerant lookup and historical path reconciliation, not as a scoring feature unless an independently justified need is discovered.

### `python-frontmatter`

If the relevant Markdown shard files contain front matter that participates in the report inputs, use `python-frontmatter` rather than fragile manual parsing.

Do not use it if the files being investigated do not actually require front-matter parsing.

### `pytest`

Use `pytest` for targeted regression tests or temporary analysis helpers where appropriate.

Especially useful tests include:

- removal of `needsFurtherProcessing` does not break active consumers
- `manual audio review remaining` never changes `Audit Risk Score`
- `manual audio review remaining` never changes `Rank`
- TSV column order is deterministic
- tie ordering is deterministic
- missing-value behavior is explicit
- proposed scoring rules reproduce expected fixture outcomes

## Generally unnecessary unless a concrete need is discovered

Do not reach for `datasketch`, `SetSimilaritySearch`, or `networkx` simply because they are available.

They may be useful if investigation uncovers a genuine large-scale similarity-search or graph-analysis problem, but they are not default requirements for this task.

---

# Required Plan Output

The plan should:

1. Identify the specific files and logic that need to change.
2. Explain the dependency and sequencing between Section 1 and Section 2.
3. Identify obsolete references or assumptions created by removing `needsFurtherProcessing`.
4. Document the current `Rank` and `Audit Risk Score` logic before proposing changes.
5. Define what the ranking is intended to prioritize.
6. Summarize evidence from `site-content-processing.log` and relevant Git history.
7. Distinguish substantive audit-history evidence from mechanical repository changes.
8. Identify false-negative, false-positive, selection-bias, age, and processing-generation concerns.
9. Evaluate signal redundancy and possible double-counting.
10. Evaluate game-stream shards without assuming they require special treatment.
11. Ensure `manual audio review remaining` is completely excluded from score and rank calculations.
12. Describe any proposed scoring changes and the evidence supporting each one.
13. Explicitly state when an existing signal should remain unchanged because evidence for changing it is insufficient.
14. Include verification/testing steps for both the log-format change and report-generation changes.
15. Include a lightweight before/after validation of the ranking using representative top/middle/bottom samples.
16. Avoid unrelated refactoring and unnecessary redesign.

Where evidence is incomplete, say so and recommend the least-assumptive behavior rather than inventing a rule.
