import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalogPath = "src/derived/topic-normalization-patterns.tsv";

const curatorSkillPath = ".agents/skills/naval-transcript-to-site-content/SKILL.md";
const auditorSkillPath = ".agents/skills/naval-site-content-auditor/SKILL.md";
const buildRepairSkillPath = ".agents/skills/naval-site-build-repair/SKILL.md";

const shardWorkflowPaths = [
  curatorSkillPath,
  auditorSkillPath,
  ".agents/transcript-content-curator.md",
  ".agents/site-content-auditor.md",
] as const;

const companionGuidancePaths = [
  "AGENTS.md",
  "README.md",
  ".agents/transcript-content-curator.md",
  ".agents/site-content-auditor.md",
  ".agents/skills/naval-transcript-to-site-content/references/segment-seed-schema.md",
  "src/derived/site-content-processing.config.json",
] as const;

const catalogGuidancePaths = [
  curatorSkillPath,
  auditorSkillPath,
  buildRepairSkillPath,
  ...companionGuidancePaths,
] as const;

async function readGuidance(relativePath: string): Promise<string> {
  const repositoryRoot = new URL("../../", import.meta.url);
  const content = await readFile(new URL(relativePath, repositoryRoot), "utf8");
  return content.replace(/\s+/gu, " ");
}

test("topic-producing and companion guidance use the shared normalization catalog", async () => {
  for (const relativePath of catalogGuidancePaths) {
    const guidance = await readGuidance(relativePath);

    assert.match(
      guidance,
      new RegExp(catalogPath.replaceAll("/", "\\/"), "u"),
      `${relativePath} must name the shared normalization catalog`,
    );
    assert.doesNotMatch(
      guidance,
      /<whole>-<fraction>-inch-gun/u,
      `${relativePath} must not duplicate detailed numeric-calibre policy`,
    );
  }
});

test("curator and auditor guidance retain shard-only normalization authority", async () => {
  for (const relativePath of shardWorkflowPaths) {
    const guidance = await readGuidance(relativePath);

    assert.match(guidance, /active[^.]{0,140}creation/iu, `${relativePath} must apply active creation rules`);
    assert.match(guidance, /active exact[^.]{0,100}migration/iu, `${relativePath} must apply active exact migrations`);
    assert.match(guidance, /(?:selected|owned).{0,220}shard/iu, `${relativePath} must retain a selected-shard boundary`);
    assert.match(
      guidance,
      /(?:append(?:s|ing)? exactly one|one required result line)/iu,
      `${relativePath} must retain the one-log-append contract`,
    );
    assert.match(guidance, /review[^.]{0,180}unchanged/iu, `${relativePath} must keep review rules non-mutating`);
    assert.match(
      guidance,
      /(?:never|do not|does not|must not).{0,900}normalize:video-topics:apply/iu,
      `${relativePath} must prohibit the corpus-wide apply command`,
    );
    assert.match(
      guidance,
      /(?:never|do not|does not|must not).{0,520}topics\.json/iu,
      `${relativePath} must prohibit shared topic-registry edits`,
    );
  }

  const curatorSkill = await readGuidance(curatorSkillPath);
  assert.match(
    curatorSkill,
    /After successfully writing the selected shard, append exactly one/iu,
    "the curator must append only after a successful selected-shard write",
  );

  const auditorSkill = await readGuidance(auditorSkillPath);
  assert.match(
    auditorSkill,
    /Append this result line whenever the selected file was processed[^.]{0,220}unchanged[^.]{0,160}saturated[^.]{0,160}intentionally empty/iu,
    "the auditor must append for every completed selected-file audit result",
  );
});

test("companion guidance preserves review no-ops, shard boundaries, and the human apply workflow", async () => {
  const agents = await readGuidance("AGENTS.md");
  assert.match(agents, /one owned.{0,220}shard/iu);
  assert.match(agents, /append exactly one result line/iu);
  assert.match(agents, /review[^.]{0,180}unchanged/iu);
  assert.match(agents, /must never[^.]{0,220}normalize:video-topics:apply/iu);

  const schema = await readGuidance(
    ".agents/skills/naval-transcript-to-site-content/references/segment-seed-schema.md",
  );
  assert.match(schema, /active[^.]{0,140}creation/iu);
  assert.match(schema, /active exact[^.]{0,100}migration/iu);
  assert.match(schema, /review[^.]{0,180}unchanged/iu);
  assert.match(schema, /does not invoke[^.]{0,180}normalize:video-topics:apply/iu);

  const config = await readGuidance("src/derived/site-content-processing.config.json");
  assert.match(config, /active creation rules/iu);
  assert.match(config, /active exact migration mappings only inside the owned shard/iu);
  assert.match(config, /leave review or ambiguous candidates unchanged/iu);
  assert.match(config, /must not.{0,420}normalize:video-topics:apply/iu);

  const readme = await readGuidance("README.md");
  assert.match(readme, /npm run audit:topic-normalization/iu);
  assert.match(readme, /npm run normalize:video-topics -- --dry-run --plan-output/iu);
  assert.match(readme, /npm run normalize:video-topics:apply -- --plan/iu);
  assert.match(readme, /timestamp;shardPath;result;needsFurtherProcessing;notes/u);
});

test("build repair audits active mappings and delegates semantic and site implementation work", async () => {
  const guidance = await readGuidance(buildRepairSkillPath);

  assert.match(guidance, /read-only `npm run audit:topic-normalization` before adding a registry record/iu);
  assert.match(guidance, /review[^.]{0,160}does not authorize a mutation/iu);
  assert.match(guidance, /npm run normalize:video-topics:apply -- --plan <reviewed-plan-path>/iu);
  assert.match(guidance, /explicit topic-normalization scope/iu);
  assert.match(guidance, /\$naval-site-content-auditor/iu);
  assert.match(guidance, /\$naval-video-page-prototype/iu);
  assert.match(guidance, /legacy redirect/iu);
});
