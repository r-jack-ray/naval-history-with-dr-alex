#!/usr/bin/env bun

import { withSiteBuildRepairHint } from "../site/build-repair-guidance.js";
import { prepareParallelTopicNormalizationInputs } from "./bun-topic-normalization.js";
import { parseBunWorkerOptions } from "./bun-worker-options.js";
import { isDirectExecution, printRunTime, } from "./console-run-timer.js";
import { generateSiteDataUsage, parseGenerateSiteDataArgs, runGenerateSiteData, } from "./generate-site-data.js";

async function main(): Promise<void> {
  const bunOptions = parseBunWorkerOptions(process.argv.slice(2));
  const options = parseGenerateSiteDataArgs(bunOptions.commandArgs);
  if (options.help) {
    process.stdout.write(
        generateSiteDataUsage("npm run generate:site-data", true),
    );
    return;
  }

  const prepared = await prepareParallelTopicNormalizationInputs(
      options.segmentsInput,
      options.patternsInput,
      bunOptions.workers,
  );
  await runGenerateSiteData(options, {
    precomputedCreationResolutions: prepared.creationResolutions,
    preloadedCatalog: prepared.catalog,
    preloadedShardIndex: prepared.shardIndex,
    summaryFields: ["runtime=bun", `workers=${prepared.workerCount}`],
  });
}

if (isDirectExecution(import.meta.url)) {
  const runStartedAt = Date.now();
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(withSiteBuildRepairHint(`npm run generate:site-data failed: ${message}`));
    process.exitCode = 1;
  }).finally(() => {
    printRunTime(runStartedAt);
  });
}
