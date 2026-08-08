#!/usr/bin/env node
import { parseValidationCliOptions, runValidationWorkflow, type ValidationStep, } from "./validation-workflow.js";

async function main(): Promise<void> {
  const options = parseValidationCliOptions(process.argv.slice(2));
  if (options.showHelp) {
    printHelp();
    return;
  }

  const steps: ValidationStep[] = [
    {command: "npm", args: ["run", "build"]},
    {command: "npm", args: ["run", "generate:site-data"]},
    {command: "npm", args: ["run", "site:check:generated"]},
    {command: "npm", args: ["run", "site:build:generated"]},
  ];
  if (!options.skipRepoCheck) {
    steps.push({command: "npm", args: ["run", "check"]});
  }

  await runValidationWorkflow({
    options,
    owner: "validate-site",
    purpose: "site-validation",
    steps,
  });
}

function printHelp(): void {
  console.log(`Usage: node --import tsx src/scripts/validate-site.ts [options]

Options:
  --skip-repo-check              Skip the final npm run check.
  --lock-token <token>           Renew and use an existing writer lease.
  --lock-wait-seconds <seconds>  Lease wait from 0 to 300; defaults to 30.
  --lock-stale-after-minutes <minutes>
                                 Lease duration from 1 to 720; defaults to 90.
  --help                         Show this help.
`);
}

main().catch((error: unknown) => {
  console.error(`Site validation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
