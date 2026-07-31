#!/usr/bin/env bun

import { prepareParallelTopicNormalizationInputs } from "./bun-topic-normalization.js";
import { parseBunWorkerOptions } from "./bun-worker-options.js";
import {
  isDirectExecution,
  printRunTime,
} from "./console-run-timer.js";
import {
  parseSyncVideoTopicsArgs,
  runSyncVideoTopics,
  syncVideoTopicsUsage,
} from "./sync-video-topics.js";

async function main(): Promise<void> {
  const bunOptions = parseBunWorkerOptions(process.argv.slice(2));
  const options = parseSyncVideoTopicsArgs(bunOptions.commandArgs);
  if (options.help) {
    process.stdout.write(
      syncVideoTopicsUsage("npm run sync:video-topics:bun", true),
    );
    return;
  }

  const prepared = await prepareParallelTopicNormalizationInputs(
    options.segmentsInput,
    options.patternsInput,
    bunOptions.workers,
  );
  await runSyncVideoTopics(options, {
    precomputedCreationResolutions: prepared.creationResolutions,
    preloadedCatalog: prepared.catalog,
    preloadedShardIndex: prepared.shardIndex,
    summaryFields: ["runtime=bun", `workers=${prepared.workerCount}`],
  });
}

if (isDirectExecution(import.meta.url)) {
  const runStartedAt = Date.now();
  main().catch((error: unknown) => {
    console.error(
      `Failed to synchronize video topics with Bun: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }).finally(() => {
    printRunTime(runStartedAt);
  });
}
