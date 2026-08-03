import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("Phase 7 keeps canonical commands and retires zero-caller scripts", async () => {
  const [packageJsonText, agents, readme, channelReadme, transcriptReadme, savedHtmlCli, auditRiskCli] = await Promise.all([
    readFile(join(repositoryRoot, "package.json"), "utf8"),
    readFile(join(repositoryRoot, "AGENTS.md"), "utf8"),
    readFile(join(repositoryRoot, "README.md"), "utf8"),
    readFile(join(repositoryRoot, "src", "channel", "README.md"), "utf8"),
    readFile(join(repositoryRoot, "src", "transcripts", "README.md"), "utf8"),
    readFile(join(repositoryRoot, "src", "scripts", "extract-saved-channel-html.ts"), "utf8"),
    readFile(join(repositoryRoot, "src", "scripts", "rank-video-segment-audit-risk.ts"), "utf8"),
  ]);
  const packageJson = JSON.parse(packageJsonText) as { scripts: Record<string, string> };

  assert.equal(
    packageJson.scripts["check"],
    "npm run check:types && npm test && npm run check:source && npm run check:generated",
  );
  for (const retiredName of [
    "check:quick",
    "check:functional",
    "alternate:extract:videos-html",
    "alternate:fetch:transcript",
    "list:files-that-need-processing",
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

  for (const currentGuidance of [agents, readme, channelReadme, transcriptReadme, savedHtmlCli, auditRiskCli]) {
    assert.doesNotMatch(currentGuidance, /check:(?:quick|functional)/u);
    assert.doesNotMatch(currentGuidance, /alternate:extract:videos-html/u);
    assert.doesNotMatch(currentGuidance, /alternate:fetch:transcript\b/u);
    assert.doesNotMatch(currentGuidance, /list(?::|-)(?:files-that-need-processing)/u);
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
  assert.match(auditRiskCli, /npm run audit:site-content/u);

  for (const retainedBoundary of [
    "fetch:video-links",
    "fetch:video-metadata",
    "alternate:fetch:transcripts",
    "alternate:fetch:transcripts:safe",
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
});
