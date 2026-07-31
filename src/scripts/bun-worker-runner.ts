import { Worker } from "node:worker_threads";

export async function runBunWorkerTask<TResult>(
  moduleUrl: URL,
  workerData: unknown,
  label: string,
): Promise<TResult> {
  return await new Promise<TResult>((resolve, reject) => {
    const worker = new Worker(moduleUrl, { workerData });
    let receivedResult = false;
    worker.once("message", (message: TResult) => {
      receivedResult = true;
      resolve(message);
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`${label} worker exited with code ${code}.`));
      } else if (!receivedResult) {
        reject(new Error(`${label} worker exited without returning a result.`));
      }
    });
  });
}
