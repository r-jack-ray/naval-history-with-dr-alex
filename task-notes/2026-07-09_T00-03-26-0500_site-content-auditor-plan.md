# Site Content Auditor Plan

Timestamp: 2026-07-09T00:03:26-05:00

Generated from `src/derived/video-segments/`, `.agents/site-content-auditor.md`, and current public-field wording checks.

Criteria: already processed per-video segment file with at least one public `body` under 180 characters, or at least one visible public field matching scaffold/workflow wording such as `processing`, `curation`, `searchable`, `gives the page`, `helps users`, `source window`, or `evidence window`.

Total video-segment files needing auditor pass: 28

Do not split this plan into schedule shards. Keep this as one shared auditor checklist.

## Run Rules

1. Inspect `git status` before claiming a line.
2. Claim exactly one unchecked line by changing `[ ]` to `[x]` before editing.
3. Audit only the claimed `src/derived/video-segments/video-<videoId>.json` file unless the transcript evidence proves a topic record must be adjusted.
4. Read the segment summaries, bodies, topics, evidence, and cited transcript passages before expanding text.
5. Remove public workflow language and make bodies useful as learner-facing watch points.
6. Regenerate generated data after source edits with `npm run generate:site-data`.
7. Validate with:

```powershell
pwsh -NoProfile -File .codex/hooks/validate-content-pipeline.ps1 -SkipRepoCheck
npm run site:build
git -c safe.directory=C:/Workspaces/naval-history-with-dr-alex diff --check
```

8. Leave generated `site/src/data/generated/archive.json` changes in the same worktree as the claimed source edit.
9. If a record cannot be strengthened from the existing evidence, inspect the cited transcript window before leaving a targeted handoff note.

## Files

- [ ] src/derived/video-segments/video-CtfBU-tuNmA.json | CtfBU-tuNmA | segments=8 | shortBodies=6 | workflowHits=1 | priority=workflow-language
- [ ] src/derived/video-segments/video---l6rRIfksQ.json | --l6rRIfksQ | segments=6 | shortBodies=5 | workflowHits=1 | priority=workflow-language
- [ ] src/derived/video-segments/video-csReIEQKP3I.json | csReIEQKP3I | segments=6 | shortBodies=5 | workflowHits=1 | priority=workflow-language
- [ ] src/derived/video-segments/video-hV61sjE720w.json | hV61sjE720w | segments=6 | shortBodies=5 | workflowHits=1 | priority=workflow-language
- [ ] src/derived/video-segments/video-KqzuWF1tQO4.json | KqzuWF1tQO4 | segments=6 | shortBodies=4 | workflowHits=1 | priority=workflow-language
- [ ] src/derived/video-segments/video-KhKodHSccmE.json | KhKodHSccmE | segments=9 | shortBodies=9 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-5M0LeS3z9uU.json | 5M0LeS3z9uU | segments=8 | shortBodies=8 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-8rAI4ajBU5Q.json | 8rAI4ajBU5Q | segments=9 | shortBodies=8 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-yQPnWPw_bho.json | yQPnWPw_bho | segments=7 | shortBodies=7 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-e3dsNo2L9VU.json | e3dsNo2L9VU | segments=7 | shortBodies=6 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video--QT_D3BEqlQ.json | -QT_D3BEqlQ | segments=8 | shortBodies=5 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-eYhGE7TDlHQ.json | eYhGE7TDlHQ | segments=6 | shortBodies=5 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-jV-bnHLGcsM.json | jV-bnHLGcsM | segments=9 | shortBodies=5 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-uqSLUFlWki8.json | uqSLUFlWki8 | segments=8 | shortBodies=5 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-zqSUibSVEAc.json | zqSUibSVEAc | segments=9 | shortBodies=5 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-LYcA94lzYJM.json | LYcA94lzYJM | segments=6 | shortBodies=3 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-lLPfmYWw0W8.json | lLPfmYWw0W8 | segments=9 | shortBodies=2 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-Or9f7PKh_P8.json | Or9f7PKh_P8 | segments=6 | shortBodies=2 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-Wd2ljGfLFII.json | Wd2ljGfLFII | segments=7 | shortBodies=2 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-2f40BoW2IXA.json | 2f40BoW2IXA | segments=1 | shortBodies=1 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-4LLwvLSTtBI.json | 4LLwvLSTtBI | segments=1 | shortBodies=1 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-8F9YkMGK3uI.json | 8F9YkMGK3uI | segments=1 | shortBodies=1 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-kj00NoigwTQ.json | kj00NoigwTQ | segments=1 | shortBodies=1 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-MieHd7bkC3A.json | MieHd7bkC3A | segments=1 | shortBodies=1 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-nOBDy777ENQ.json | nOBDy777ENQ | segments=1 | shortBodies=1 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-UD8OwQEOqL8.json | UD8OwQEOqL8 | segments=1 | shortBodies=1 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-vqG2OaWpJbk.json | vqG2OaWpJbk | segments=1 | shortBodies=1 | workflowHits=0 | priority=thin-bodies
- [ ] src/derived/video-segments/video-X5aKo_r46Pc.json | X5aKo_r46Pc | segments=1 | shortBodies=1 | workflowHits=0 | priority=thin-bodies
