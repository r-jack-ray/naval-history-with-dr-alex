import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("Phase 7 keeps canonical commands and retires zero-caller scripts", async () => {
  const [
    packageJsonText,
    agents,
    readme,
    channelReadme,
    transcriptReadme,
    savedHtmlCli,
    auditRiskCli,
    lighthouseCli,
  ] = await Promise.all([
    readFile(join(repositoryRoot, "package.json"), "utf8"),
    readFile(join(repositoryRoot, "AGENTS.md"), "utf8"),
    readFile(join(repositoryRoot, "README.md"), "utf8"),
    readFile(join(repositoryRoot, "src", "channel", "README.md"), "utf8"),
    readFile(join(repositoryRoot, "src", "transcripts", "README.md"), "utf8"),
    readFile(join(repositoryRoot, "src", "scripts", "extract-saved-channel-html.ts"), "utf8"),
    readFile(join(repositoryRoot, "src", "scripts", "rank-video-segment-audit-risk.ts"), "utf8"),
    readFile(join(repositoryRoot, "src", "scripts", "audit-seo-lighthouse.ts"), "utf8"),
  ]);
  const packageJson = JSON.parse(packageJsonText) as { scripts: Record<string, string> };

  assert.equal(
    packageJson.scripts["check"],
    "npm test && npm run check:source && npm run site:check",
  );
  for (const retiredName of [
    "check:quick",
    "check:functional",
    "check:generated",
    "check:repository-policy",
    "append:site-content-processing-log",
    "alternate:extract:videos-html",
    "alternate:extract:live-streams-html",
    "alternate:fetch:transcript",
    "list:files-that-need-processing",
    "site:dev:generated",
    "site:build:full",
    "preaudit:lighthouse:home",
    "audit:lighthouse:home",
    "preaudit:lighthouse:local",
    "audit:lighthouse:local",
    "audit:lighthouse:seo-baseline",
  ]) {
    assert.equal(packageJson.scripts[retiredName], undefined, `${retiredName} must stay retired`);
  }
  assert.equal(
    existsSync(join(repositoryRoot, "src", "scripts", "list-files-that-need-processing.ts")),
    false,
  );
  assert.equal(
    existsSync(join(repositoryRoot, "src", "scripts", "get-video-transcript.ts")),
    false,
  );
  for (const retiredPath of [
    join(repositoryRoot, "src", "scripts", "extract-live-streams-html.ts"),
    join(repositoryRoot, "src", "youtube", "live-streams-html.ts"),
    join(repositoryRoot, "src", "youtube", "live-streams-html.test.ts"),
    join(repositoryRoot, "site", "src", "scripts", "topics-index.js"),
    join(repositoryRoot, ".codex", "hooks", "check-repository-policy.mjs"),
    join(repositoryRoot, ".codex", "hooks", "run-workspace-pagefind.mjs"),
    join(repositoryRoot, ".codex", "hooks", "site-build-if-changed.mjs"),
    join(repositoryRoot, ".codex", "hooks", "site-build-support.mjs"),
    join(repositoryRoot, ".codex", "hooks", "site-content-pipeline-lock.mjs"),
    join(repositoryRoot, ".codex", "hooks", "site-dev.mjs"),
    join(repositoryRoot, ".codex", "hooks", "validate-content-pipeline.ps1"),
    join(repositoryRoot, ".codex", "hooks", "validate-site.ps1"),
  ]) {
    assert.equal(existsSync(retiredPath), false, `${retiredPath} must stay retired`);
  }

  for (const currentGuidance of [
    agents,
    readme,
    channelReadme,
    transcriptReadme,
    savedHtmlCli,
    auditRiskCli,
    lighthouseCli,
  ]) {
    assert.doesNotMatch(currentGuidance, /check:(?:quick|functional)/u);
    assert.doesNotMatch(currentGuidance, /(?<!site:)check:generated/u);
    assert.doesNotMatch(currentGuidance, /check:repository-policy/u);
    assert.doesNotMatch(currentGuidance, /check-repository-policy\.mjs/u);
    assert.doesNotMatch(currentGuidance, /\.codex\/hooks\//u);
    assert.doesNotMatch(currentGuidance, /append:site-content-processing-log/u);
    assert.doesNotMatch(currentGuidance, /alternate:extract:videos-html/u);
    assert.doesNotMatch(currentGuidance, /alternate:extract:live-streams-html/u);
    assert.doesNotMatch(currentGuidance, /alternate:fetch:transcript\b/u);
    assert.doesNotMatch(currentGuidance, /list(?::|-)(?:files-that-need-processing)/u);
    assert.doesNotMatch(currentGuidance, /site:dev:generated/u);
    assert.doesNotMatch(currentGuidance, /site:build:full/u);
    assert.doesNotMatch(currentGuidance, /topics-index\.js/u);
    assert.doesNotMatch(currentGuidance, /(?:pre)?audit:lighthouse:(?:home|local|seo-baseline)/u);
  }
  assert.match(
    readme,
    /npm run alternate:extract:saved-channel-html -- --tab videos/u,
  );
  assert.match(
    channelReadme,
    /npm run alternate:extract:saved-channel-html -- --tab videos/u,
  );
  assert.match(
    savedHtmlCli,
    /npm run alternate:extract:saved-channel-html -- --tab videos/u,
  );
  for (const streamsGuidance of [readme, channelReadme, savedHtmlCli]) {
    assert.match(
      streamsGuidance,
      /npm run alternate:extract:saved-channel-html -- --tab streams/u,
    );
  }
  assert.equal(
    packageJson.scripts["audit:lighthouse"],
    "tsx src/scripts/audit-seo-lighthouse.ts",
  );
  assert.match(readme, /npm run audit:lighthouse/u);
  assert.match(lighthouseCli, /npm run audit:lighthouse -- \[options\]/u);
  assert.match(auditRiskCli, /npm run audit:site-content/u);

  for (const retainedBoundary of [
    "fetch:video-links",
    "fetch:video-metadata",
    "alternate:extract:saved-channel-html",
    "alternate:fetch:transcripts",
    "alternate:fetch:transcripts:safe",
    "audit:lighthouse",
    "generate:site-data",
    "site:check:generated",
    "site:build:generated",
    "site:build:pagefind",
    "site:build:pagefind:workspace",
    "site:build:workspace-pagefind",
    "report:video-segment-audit-risk",
    "report:video-topic-usage",
  ]) {
    assert.equal(typeof packageJson.scripts[retainedBoundary], "string", `${retainedBoundary} must remain supported`);
  }
  for (const retainedScriptPath of [
    "run-workspace-pagefind.mjs",
    "site-build-if-changed.mjs",
    "site-build-support.mjs",
    "site-content-pipeline-lock.mjs",
    "site-dev.mjs",
    "validate-content-pipeline.ts",
    "validate-site.ts",
    "validation-workflow.ts",
  ]) {
    assert.equal(
      existsSync(join(repositoryRoot, "src", "scripts", retainedScriptPath)),
      true,
      `${retainedScriptPath} must remain under src/scripts`,
    );
  }
});
