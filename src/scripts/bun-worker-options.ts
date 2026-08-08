import { availableParallelism } from "node:os";

export interface BunWorkerOptions {
  commandArgs: string[];
  workers: number;
}

export function defaultBunWorkerCount(): number {
  return Math.max(1, Math.min(8, availableParallelism()));
}

export function parseBunWorkerOptions(args: readonly string[]): BunWorkerOptions {
  const commandArgs: string[] = [];
  let workers = defaultBunWorkerCount();
  let workersSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg !== "--workers") {
      commandArgs.push(arg);
      continue;
    }
    if (workersSeen) {
      throw new Error("--workers may be specified only once.");
    }
    workersSeen = true;
    const value = args[++index];
    workers = Number(value);
    if (
        value === undefined
        || !Number.isInteger(workers)
        || workers < 1
        || workers > availableParallelism()
    ) {
      throw new Error(
          `--workers must be an integer from 1 to ${availableParallelism()}; received ${JSON.stringify(value)}.`,
      );
    }
  }

  return {commandArgs, workers};
}

export function partitionRoundRobin<T>(
    values: readonly T[],
    partitionCount: number,
): T[][] {
  if (!Number.isInteger(partitionCount) || partitionCount < 1) {
    throw new Error(`Partition count must be a positive integer; received ${partitionCount}.`);
  }
  const partitions = Array.from({length: partitionCount}, () => [] as T[]);
  for (let index = 0; index < values.length; index += 1) {
    partitions[index % partitionCount]!.push(values[index]!);
  }
  return partitions;
}
