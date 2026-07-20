#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  buildRepresentativeLighthouseTargets,
  type LighthouseVideoCandidate,
} from "../site/seo-monitoring.js";

const productionBaseUrl = "https://r-jack-ray.github.io/naval-history-with-dr-alex/";
const auditBaseUrl = new URL(process.env.SEO_AUDIT_BASE_URL ?? productionBaseUrl);
if (auditBaseUrl.protocol !== "https:" && auditBaseUrl.protocol !== "http:") {
  throw new Error("SEO_AUDIT_BASE_URL must use HTTP or HTTPS.");
}
if (!auditBaseUrl.pathname.endsWith("/")) auditBaseUrl.pathname += "/";

const videos = JSON.parse(
  await readFile("site/src/data/generated/archive/videos.json", "utf8"),
) as LighthouseVideoCandidate[];
const targets = buildRepresentativeLighthouseTargets(videos);
const outputDirectory = resolve("reports", "lighthouse", "seo-baseline");
const lighthouseCli = resolve("node_modules", "lighthouse", "cli", "index.js");
await mkdir(outputDirectory, { recursive: true });

for (const target of targets) {
  const targetUrl = new URL(target.route, auditBaseUrl).href;
  const outputPath = join(outputDirectory, target.name);
  console.log(`Running Lighthouse ${target.name}: ${targetUrl}`);
  const exitCode = await run(process.execPath, [
    lighthouseCli,
    targetUrl,
    "--only-categories=performance,accessibility,best-practices,seo",
    "--output=html",
    "--output=json",
    `--output-path=${outputPath}`,
    "--chrome-flags=--headless",
    "--quiet",
  ]);
  if (exitCode !== 0) {
    throw new Error(`Lighthouse ${target.name} failed with exit code ${exitCode}.`);
  }
}

console.log(`Lighthouse SEO baseline written under ${outputDirectory}.`);

function run(command: string, args: string[]): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        reject(new Error(`Lighthouse terminated by signal ${signal}.`));
        return;
      }
      resolvePromise(code ?? 1);
    });
  });
}
