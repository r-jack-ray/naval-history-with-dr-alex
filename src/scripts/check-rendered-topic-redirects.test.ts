import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const execFileAsync = promisify(execFile);
const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "check-rendered-topic-redirects.js");
const canonicalSlug = "57-mm-guns";
const legacySlug = "57mm-gun";
const canonicalUrl = `https://r-jack-ray.github.io/naval-history-with-dr-alex/topics/${canonicalSlug}/`;

test("verifies canonical topic counts and a non-indexed absolute legacy redirect", async () => {
  const root = await createRenderedFixture();
  try {
    const result = await execFileAsync(process.execPath, [scriptPath], { cwd: root });
    assert.match(result.stdout, /1 canonical topics, 1 legacy redirects, 1 canonical destinations/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a legacy topic redirect that appears in Pagefind", async () => {
  const root = await createRenderedFixture();
  try {
    await writePagefindFragment(root, "legacy.pf_fragment", `/topics/${legacySlug}/`);
    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath], { cwd: root }),
      (error: Error & { stderr?: string }) => {
        assert.match(error.stderr ?? error.message, /Pagefind includes legacy topic redirect/u);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createRenderedFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "rendered-topic-redirects-"));
  const generatedDirectory = join(root, "site", "src", "data", "generated", "archive");
  const patternsDirectory = join(root, "src", "derived");
  const canonicalDirectory = join(root, "site", "dist", "topics", canonicalSlug);
  const legacyDirectory = join(root, "site", "dist", "topics", legacySlug);
  await Promise.all([
    mkdir(generatedDirectory, { recursive: true }),
    mkdir(patternsDirectory, { recursive: true }),
    mkdir(canonicalDirectory, { recursive: true }),
    mkdir(legacyDirectory, { recursive: true }),
    mkdir(join(root, "site", "dist", "pagefind", "fragment"), { recursive: true }),
  ]);

  await writeFile(join(generatedDirectory, "topics.json"), `${JSON.stringify([{
    slug: canonicalSlug,
    title: "57 mm Guns",
    summary: "A canonical topic.",
    aliases: ["57mm gun"],
    legacySlugs: [legacySlug],
    videoCount: 1,
    segmentCount: 2,
  }], null, 2)}\n`, "utf8");

  const patternsText =
    "rule_id\tstatus\tscope\tmatch_kind\tmatch\treplacement\tcanonical_title\taliases_json\tlegacy_route\tnotes\n" +
    "metric-57mm-legacy\tactive\tmigration\texact\t57mm-gun\t57-mm-guns\t57 mm Guns\t[]\tredirect\tRendered fixture redirect\n";
  await writeFile(
    join(patternsDirectory, "topic-normalization-patterns.tsv"),
    patternsText,
    "utf8",
  );
  const patternsSha256 = createHash("sha256").update(patternsText, "utf8").digest("hex");
  await writeFile(join(generatedDirectory, "index.json"), `${JSON.stringify({
    schemaVersion: 4,
    source: {
      patternsInput: "src/derived/topic-normalization-patterns.tsv",
      patternsSha256,
      patternsSourceSha256: patternsSha256,
    },
  }, null, 2)}\n`, "utf8");

  await writeFile(join(canonicalDirectory, "index.html"), `<!doctype html>
<html><head><meta data-pagefind-meta="topic[content]" content="57 mm Guns"></head>
<body><main data-pagefind-body>
<ol class="segment-list topic-segment-list"><li>One</li><li>Two</li></ol>
<ul class="small-card-list"><li>Video</li></ul>
</main></body></html>`, "utf8");

  await writeFile(join(legacyDirectory, "index.html"), `<!doctype html>
<html><head>
<link rel="canonical" href="${canonicalUrl}">
<meta name="robots" content="noindex,follow">
<meta http-equiv="refresh" content="0; url=${canonicalUrl}">
</head><body><p>Moved to <a href="${canonicalUrl}">57 mm Guns</a>.</p></body></html>`, "utf8");

  await writePagefindFragment(root, "canonical.pf_fragment", `/topics/${canonicalSlug}/`);
  return root;
}

async function writePagefindFragment(root: string, filename: string, url: string): Promise<void> {
  const path = join(root, "site", "dist", "pagefind", "fragment", filename);
  await writeFile(path, gzipSync(JSON.stringify({ url })));
}
