#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { buildLighthouseAuditTargets, defaultLighthouseVideosPath, type LighthouseVideoCandidate, parseLighthouseAuditArgs, } from "../site/seo-monitoring.js";

async function main(): Promise<void> {
  const options = parseLighthouseAuditArgs(process.argv.slice(2), process.env.SEO_AUDIT_BASE_URL);
  if (options.showHelp) {
    printHelp();
    return;
  }

  const videos = options.mode === "representative"
      ? JSON.parse(await readFile(defaultLighthouseVideosPath, "utf8")) as LighthouseVideoCandidate[]
      : undefined;
  const targets = buildLighthouseAuditTargets(options.mode, videos);
  const outputPrefix = resolve(options.outputPrefix);
  const outputDirectory = options.mode === "home" ? dirname(outputPrefix) : outputPrefix;
  const lighthouseCli = resolve("node_modules", "lighthouse", "cli", "index.js");
  await mkdir(outputDirectory, {recursive: true});

  for (const target of targets) {
    const targetUrl = new URL(target.route, options.baseUrl).href;
    const outputPath = options.mode === "home" ? outputPrefix : join(outputPrefix, target.name);
    const lighthouseArgs = [
      lighthouseCli,
      targetUrl,
      "--output=html",
      "--output=json",
      `--output-path=${outputPath}`,
      "--chrome-flags=--headless",
    ];
    if (options.mode === "representative") {
      lighthouseArgs.push("--only-categories=performance,accessibility,best-practices,seo");
    }
    if (options.quiet) {
      lighthouseArgs.push("--quiet");
    }

    console.log(`Running Lighthouse ${target.name}: ${targetUrl}`);
    const exitCode = await run(process.execPath, lighthouseArgs);
    if (exitCode !== 0) {
      throw new Error(`Lighthouse ${target.name} failed with exit code ${exitCode}.`);
    }
  }

  console.log(`Lighthouse ${options.mode} audit written under ${outputDirectory}.`);
}

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

function printHelp(): void {
  console.log(`Usage: npm run audit:lighthouse -- [options]

Options:
  --base-url <url>       Site root to audit. Defaults to SEO_AUDIT_BASE_URL, then production.
  --mode <mode>          "home" for one page or "representative" for five routes.
                         Defaults to representative.
  --output-prefix <path> Home mode writes this exact report prefix; representative mode
                         writes one named report prefix beneath this directory.
  --quiet                Suppress Lighthouse progress output.
  --no-quiet             Show Lighthouse progress output.
  --help                 Show this help.

Defaults:
  home output            reports/lighthouse/home
  representative output reports/lighthouse/seo-baseline

Examples:
  npm run audit:lighthouse
  npm run audit:lighthouse -- --mode home --output-prefix reports/lighthouse/home
  npm run audit:lighthouse -- --mode home --base-url http://127.0.0.1:4321/naval-history-with-dr-alex/ --output-prefix reports/lighthouse/local-home
`);
}

main().catch((error: unknown) => {
  console.error(`Failed to run Lighthouse audit: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
