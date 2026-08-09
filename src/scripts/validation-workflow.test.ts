import assert from "node:assert/strict";
import test from "node:test";

import { parseValidationCliOptions, runValidationWorkflow, type ValidationCliOptions, type ValidationRuntime, type ValidationStep, } from "./validation-workflow.js";

test("validation CLI parsing preserves defaults and enforces command capabilities", () => {
  assert.deepEqual(parseValidationCliOptions([]), defaultOptions());
  assert.deepEqual(
      parseValidationCliOptions([
        "--skip-repo-check",
        "--retain-caller-lease",
        "--backlog-limit", "10",
        "--lock-token", "token-1",
        "--lock-wait-seconds", "0",
        "--lock-stale-after-minutes", "720",
      ], {backlogLimit: true, retainCallerLease: true}),
      {
        backlogLimit: 10,
        lockStaleAfterMinutes: 720,
        lockToken: "token-1",
        lockWaitSeconds: 0,
        retainCallerLease: true,
        showHelp: false,
        skipRepoCheck: true,
      },
  );
  assert.throws(() => parseValidationCliOptions(["--backlog-limit", "1"]), /not supported/u);
  assert.throws(() => parseValidationCliOptions(["--retain-caller-lease"]), /not supported/u);
  assert.throws(() => parseValidationCliOptions(["--lock-wait-seconds", "301"]), /between 0 and 300/u);
  assert.throws(() => parseValidationCliOptions(["--lock-stale-after-minutes", "0"]), /between 1 and 720/u);
});

test("validation workflow acquires, exports, runs in order, releases, and restores", async () => {
  const calls: string[] = [];
  const environment: NodeJS.ProcessEnv = {CONTENT_PIPELINE_LOCK_TOKEN: "previous-token"};
  const runtime = makeRuntime(calls, environment);
  const steps: ValidationStep[] = [
    {command: "npm", args: ["run", "build"]},
    {command: "node", args: ["--import", "tsx", "src/scripts/audit-site-content.ts"]},
  ];

  await runValidationWorkflow({
    options: defaultOptions(),
    owner: "validator",
    purpose: "test-validation",
    steps,
  }, runtime);

  assert.match(calls[0] ?? "", /^node:capture:acquire --owner validator:1234 /u);
  assert.deepEqual(calls.slice(1), [
    "npm:run build:token=acquired-token",
    "node:--import tsx src/scripts/audit-site-content.ts:token=acquired-token",
    "node:capture:release --token acquired-token:token=acquired-token",
  ]);
  assert.equal(environment.CONTENT_PIPELINE_LOCK_TOKEN, "previous-token");
});

test("validation workflow renews and retains a caller lease only when requested", async () => {
  const calls: string[] = [];
  const environment: NodeJS.ProcessEnv = {};
  const runtime = makeRuntime(calls, environment);
  const options = {...defaultOptions(), lockToken: "caller-token", retainCallerLease: true};

  await runValidationWorkflow({
    options,
    owner: "validator",
    purpose: "test-validation",
    steps: [{command: "npm", args: ["run", "build"]}],
  }, runtime);

  assert.match(calls[0] ?? "", /^node:renew --token caller-token /u);
  assert.equal(calls.some((call) => call.includes("release --token")), false);
  assert.equal(environment.CONTENT_PIPELINE_LOCK_TOKEN, undefined);
});

test("validation workflow releases and restores after a stage failure", async () => {
  const calls: string[] = [];
  const environment: NodeJS.ProcessEnv = {CONTENT_PIPELINE_LOCK_TOKEN: "previous-token"};
  const runtime = makeRuntime(calls, environment, {failNpm: true});

  await assert.rejects(
      runValidationWorkflow({
        options: defaultOptions(),
        owner: "validator",
        purpose: "test-validation",
        steps: [{command: "npm", args: ["run", "build"]}],
      }, runtime),
      /stage failed/u,
  );

  assert.equal(calls.some((call) => call.includes("release --token acquired-token")), true);
  assert.equal(environment.CONTENT_PIPELINE_LOCK_TOKEN, "previous-token");
});

test("lease-release failure warns without replacing a successful validation result", async () => {
  const calls: string[] = [];
  const warnings: string[] = [];
  const runtime = makeRuntime(calls, {}, {failRelease: true, warnings});

  await runValidationWorkflow({
    options: defaultOptions(),
    owner: "validator",
    purpose: "test-validation",
    steps: [],
  }, runtime);

  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /Unable to release content-pipeline writer lease/u);
});

function defaultOptions(): ValidationCliOptions {
  return {
    backlogLimit: 25,
    lockStaleAfterMinutes: 90,
    lockWaitSeconds: 30,
    retainCallerLease: false,
    showHelp: false,
    skipRepoCheck: false,
  };
}

function makeRuntime(
    calls: string[],
    environment: NodeJS.ProcessEnv,
    behavior: { failNpm?: boolean; failRelease?: boolean; warnings?: string[] } = {},
): ValidationRuntime {
  return {
    environment,
    pid: 1234,
    async runNode(args, captureOutput = false) {
      const displayArgs = args[0]?.endsWith("site-content-pipeline-lock.mjs") ? args.slice(1) : args;
      calls.push(`node:${captureOutput ? "capture:" : ""}${displayArgs.join(" ")}:token=${environment.CONTENT_PIPELINE_LOCK_TOKEN ?? ""}`);
      if (displayArgs[0] === "release" && behavior.failRelease) {
        throw new Error("release failed");
      }
      return captureOutput ? JSON.stringify({lease: {token: "acquired-token"}}) : "";
    },
    async runNpm(args) {
      calls.push(`npm:${args.join(" ")}:token=${environment.CONTENT_PIPELINE_LOCK_TOKEN ?? ""}`);
      if (behavior.failNpm) {
        throw new Error("stage failed");
      }
    },
    warn(message) {
      behavior.warnings?.push(message);
    },
  };
}
