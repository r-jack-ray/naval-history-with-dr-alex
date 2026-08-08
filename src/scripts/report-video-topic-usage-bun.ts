#!/usr/bin/env bun

import { availableParallelism } from "node:os";
import { isMainThread, parentPort, Worker, workerData, } from "node:worker_threads";

import {
  buildVideoTopicNameAnalysisPartition,
  collectVideoTopicNameDefinitions,
  renderVideoTopicUsageReport,
  type VideoTopicNameAnalysisEntry,
  type VideoTopicNameDefinition,
} from "../content/video-topic-usage-report.js";
import { loadCuratedTopicUsageSeed } from "../site/curated-seed.js";
import { auditTopicNormalization } from "../site/topic-normalization-audit.js";
import { discoverVideoSegmentShards } from "../site/video-segment-files.js";
import { isDirectExecution, printRunTime, } from "./console-run-timer.js";
import { parseVideoTopicUsageArgs, readVideoTopicUsageArgValue, writeVideoTopicUsageReports, } from "./report-video-topic-usage.js";

interface WorkerTask {
  partitionCount: number;
  partitionIndex: number;
  topics: VideoTopicNameDefinition[];
}

interface BunCliOptions {
  help: boolean;
  reportArgs: string[];
  workers: number;
}

async function main(): Promise<void> {
  const bunOptions = parseBunArgs(process.argv.slice(2));
  if (bunOptions.help) {
    printBunHelp();
    return;
  }
  const options = parseVideoTopicUsageArgs(bunOptions.reportArgs);
  const shardIndex = await discoverVideoSegmentShards(options.segmentsInput);
  const [seed, normalizationAudit] = await Promise.all([
    loadCuratedTopicUsageSeed(options.segmentsInput, shardIndex),
    auditTopicNormalization({
      patternsInput: options.normalizationPatterns,
      preloadedShardIndex: shardIndex,
      segmentsInput: options.segmentsInput,
    }),
  ]);
  const topics = collectVideoTopicNameDefinitions(seed);
  const workerCount = Math.min(bunOptions.workers, Math.max(1, topics.length));
  const nameAnalysis = await buildParallelNameAnalysis(topics, workerCount);
  const report = renderVideoTopicUsageReport(
      seed,
      normalizationAudit.catalog.rules,
      {nameAnalysis},
  );
  await writeVideoTopicUsageReports(
      options,
      report,
      normalizationAudit,
      [`runtime=bun`, `workers=${workerCount}`],
  );
}

function parseBunArgs(args: string[]): BunCliOptions {
  const defaultWorkers = Math.max(1, Math.min(8, availableParallelism()));
  if (args.includes("--help") || args.includes("-h")) {
    return {help: true, reportArgs: [], workers: defaultWorkers};
  }

  const reportArgs: string[] = [];
  let workers = defaultWorkers;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg !== "--workers") {
      reportArgs.push(arg);
      continue;
    }
    const value = readVideoTopicUsageArgValue(args, ++index, arg);
    workers = Number(value);
    if (
        !Number.isInteger(workers)
        || workers < 1
        || workers > availableParallelism()
    ) {
      throw new Error(
          `--workers must be an integer from 1 to ${availableParallelism()}; received ${JSON.stringify(value)}.`,
      );
    }
  }
  return {help: false, reportArgs, workers};
}

async function buildParallelNameAnalysis(
    topics: VideoTopicNameDefinition[],
    workerCount: number,
): Promise<Map<string, VideoTopicNameAnalysisEntry[1]>> {
  if (workerCount === 1) {
    return buildVideoTopicNameAnalysisPartition(topics, 0, 1);
  }
  const partitions = await Promise.all(Array.from(
      {length: workerCount},
      (_, partitionIndex) => runNameAnalysisWorker({
        partitionCount: workerCount,
        partitionIndex,
        topics,
      }),
  ));
  const entries = partitions.flat();
  const analysis = new Map(entries);
  if (entries.length !== topics.length || analysis.size !== topics.length) {
    throw new Error(
        `Parallel topic name analysis returned ${entries.length} entries for ${topics.length} topics.`,
    );
  }
  return analysis;
}

async function runNameAnalysisWorker(
    task: WorkerTask,
): Promise<VideoTopicNameAnalysisEntry[]> {
  return await new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {workerData: task});
    let receivedResult = false;
    worker.once("message", (message: VideoTopicNameAnalysisEntry[]) => {
      receivedResult = true;
      resolve(message);
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Topic name-analysis worker exited with code ${code}.`));
      } else if (!receivedResult) {
        reject(new Error("Topic name-analysis worker exited without returning a result."));
      }
    });
  });
}

function runWorker(): void {
  const task = workerData as WorkerTask;
  const result = buildVideoTopicNameAnalysisPartition(
      task.topics,
      task.partitionIndex,
      task.partitionCount,
  );
  if (parentPort === null) {
    throw new Error("Topic name-analysis worker has no parent message port.");
  }
  parentPort.postMessage([...result]);
}

function printBunHelp(): void {
  console.log(`Usage: npm run report:video-topic-usage -- [options]

Generates topic-usage and normalization-review TSV files while parallelizing
topic similarity analysis with Bun workers.

Options:
  --workers <count>                Worker count. Defaults to min(8, available CPUs).
  --segments-input <path>          Curated shard directory. Defaults to src/derived/video-segments.
  --normalization-patterns <path>  Topic normalization TSV. Defaults to src/derived/topic-normalization-patterns.tsv.
  --output <path>                  TSV output. Defaults to reports/video-topic-usage.tsv.
  --review-output <path>           Actionable exact-review TSV. Defaults to reports/topic-normalization-review.tsv.
  --quiet                          Suppress the one-line summary; run time is still printed.
  --help                           Show this help.
`);
}

if (!isMainThread) {
  runWorker();
} else if (isDirectExecution(import.meta.url)) {
  const runStartedAt = Date.now();
  main().catch((error: unknown) => {
    console.error(
        `Failed to run npm run report:video-topic-usage: ${
            error instanceof Error ? error.message : String(error)
        }`,
    );
    process.exitCode = 1;
  }).finally(() => {
    printRunTime(runStartedAt);
  });
}
