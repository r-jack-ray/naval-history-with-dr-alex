#!/usr/bin/env node
import {
  parseValidationCliOptions,
  runValidationWorkflow,
  type ValidationStep,
} from "./validation-workflow.js";

const topicPatternsPath = "src/derived/topic-normalization-patterns.tsv";

async function main(): Promise<void> {
  const options = parseValidationCliOptions(process.argv.slice(2), {
    backlogLimit: true,
    retainCallerLease: true,
  });
  if (options.showHelp) {
    printHelp();
    return;
  }

  const steps: ValidationStep[] = [
    { command: "npm", args: ["run", "build"] },
    {
      command: "npm",
      args: ["run", "audit:topic-normalization", "--", "--patterns-input", topicPatternsPath],
    },
    {
      command: "node",
      args: ["dist/scripts/audit-site-content.js", "--limit", String(options.backlogLimit)],
    },
    {
      command: "npm",
      args: ["run", "generate:site-data", "--", "--patterns-input", topicPatternsPath],
    },
    { command: "npm", args: ["run", "site:check:generated"] },
  ];
  if (!options.skipRepoCheck) {
    steps.push({ command: "npm", args: ["run", "check"] });
  }

  await runValidationWorkflow({
    options,
    owner: "validate-content-pipeline",
    purpose: "content-validation",
    steps,
  });
}

function printHelp(): void {
  console.log(`Usage: node --import tsx src/scripts/validate-content-pipeline.ts [options]

Options:
  --skip-repo-check              Skip the final npm run check.
  --retain-caller-lease          Keep a lease supplied with --lock-token.
  --backlog-limit <count>        Audit backlog rows to print; defaults to 25.
  --lock-token <token>           Renew and use an existing writer lease.
  --lock-wait-seconds <seconds>  Lease wait from 0 to 300; defaults to 30.
  --lock-stale-after-minutes <minutes>
                                 Lease duration from 1 to 720; defaults to 90.
  --help                         Show this help.
`);
}

main().catch((error: unknown) => {
  console.error(`Content-pipeline validation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
