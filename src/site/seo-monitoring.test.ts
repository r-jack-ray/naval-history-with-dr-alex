import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLighthouseAuditTargets,
  buildRepresentativeLighthouseTargets,
  parseLighthouseAuditArgs,
  productionLighthouseBaseUrl,
} from "./seo-monitoring.js";

test("defaults to the quiet production representative audit", () => {
  const options = parseLighthouseAuditArgs([]);
  assert.equal(options.baseUrl.href, productionLighthouseBaseUrl);
  assert.equal(options.mode, "representative");
  assert.equal(options.outputPrefix, "reports/lighthouse/seo-baseline");
  assert.equal(options.quiet, true);
  assert.equal(options.showHelp, false);
});

test("configures a verbose home-only audit without requiring generated video data", () => {
  const options = parseLighthouseAuditArgs([
    "--mode",
    "home",
    "--base-url",
    "http://127.0.0.1:4321/naval-history-with-dr-alex",
    "--output-prefix",
    "reports/lighthouse/local-home",
  ]);
  assert.equal(options.baseUrl.href, "http://127.0.0.1:4321/naval-history-with-dr-alex/");
  assert.equal(options.mode, "home");
  assert.equal(options.outputPrefix, "reports/lighthouse/local-home");
  assert.equal(options.quiet, false);
  assert.deepEqual(buildLighthouseAuditTargets(options.mode), [{ name: "home", route: "" }]);
});

test("uses the environment base URL unless an explicit CLI URL overrides it", () => {
  const environmentOptions = parseLighthouseAuditArgs([], "https://example.test/site");
  assert.equal(environmentOptions.baseUrl.href, "https://example.test/site/");

  const cliOptions = parseLighthouseAuditArgs(
    ["--base-url", "http://localhost:4321/base/"],
    "https://example.test/site/",
  );
  assert.equal(cliOptions.baseUrl.href, "http://localhost:4321/base/");
});

test("rejects unsupported Lighthouse modes and URL protocols", () => {
  assert.throws(
    () => parseLighthouseAuditArgs(["--mode", "all"]),
    /--mode must be "home" or "representative"/u,
  );
  assert.throws(
    () => parseLighthouseAuditArgs(["--base-url", "file:///tmp/site/"]),
    /must use HTTP or HTTPS/u,
  );
});

test("derives representative Lighthouse routes from generated episode data", () => {
  const targets = buildRepresentativeLighthouseTargets([
    { slug: "empty", segmentSlugs: [], topics: [] },
    { slug: "example-video", segmentSlugs: ["example-note"], topics: [{ slug: "destroyers" }] },
  ]);
  assert.deepEqual(targets, [
    { name: "home", route: "" },
    { name: "video", route: "videos/example-video/" },
    { name: "time-note", route: "segments/example-note/" },
    { name: "topic", route: "topics/destroyers/" },
    { name: "largest-directory", route: "topics/browse/" },
  ]);
});

test("requires generated video data only for representative mode", () => {
  assert.throws(
    () => buildLighthouseAuditTargets("representative"),
    /Generated video data is required/u,
  );
});
