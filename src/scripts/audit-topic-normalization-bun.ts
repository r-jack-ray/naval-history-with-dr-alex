#!/usr/bin/env bun

import { executeTopicNormalizationAudit, parseTopicNormalizationAuditArgs, topicNormalizationAuditUsage, } from "./audit-topic-normalization.js";
import { prepareParallelTopicNormalizationInputs } from "./bun-topic-normalization.js";
import { parseBunWorkerOptions } from "./bun-worker-options.js";
import { isDirectExecution, printRunTime, } from "./console-run-timer.js";

async function main(): Promise<number> {
  const bunOptions = parseBunWorkerOptions(process.argv.slice(2));
  const options = parseTopicNormalizationAuditArgs(bunOptions.commandArgs);
  if (options.help) {
    process.stdout.write(
        topicNormalizationAuditUsage("npm run audit:topic-normalization")
            .replace(
                "  --help",
                "  --workers <count>       Worker count. Defaults to min(8, available CPUs).\n"
                + "  --help",
            ),
    );
    return 0;
  }

  const prepared = await prepareParallelTopicNormalizationInputs(
      options.segmentsInput,
      options.patternsInput,
      bunOptions.workers,
  );
  return await executeTopicNormalizationAudit(options, {
    precomputedCreationResolutions: prepared.creationResolutions,
    preloadedCatalog: prepared.catalog,
    preloadedShardIndex: prepared.shardIndex,
    summaryFields: ["runtime=bun", `workers=${prepared.workerCount}`],
  });
}

if (isDirectExecution(import.meta.url)) {
  const runStartedAt = Date.now();
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error: unknown) => {
    console.error(
        `Failed to run npm run audit:topic-normalization: ${
            error instanceof Error ? error.message : String(error)
        }`,
    );
    process.exitCode = 1;
  }).finally(() => {
    printRunTime(runStartedAt);
  });
}
