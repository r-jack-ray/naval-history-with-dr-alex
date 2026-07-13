#!/usr/bin/env node
import {
  defaultTranscriptProblemReportOutput,
  defaultTranscriptProblemStatusInput,
  generateTranscriptProblemReport,
} from "../content/transcript-problem-report.js";

interface CliOptions {
  statusInput: string;
  output: string | undefined;
  quiet: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = await generateTranscriptProblemReport({
    statusInput: options.statusInput,
    ...(options.output !== undefined ? { output: options.output } : {}),
  });
  if (!options.quiet) {
    console.error(`Transcript problem report: failures=${report.problems.length} source=${options.statusInput} report=${options.output ?? "(none)"}`);
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { statusInput: defaultTranscriptProblemStatusInput, output: defaultTranscriptProblemReportOutput, quiet: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--status-input": options.statusInput = readValue(args, ++index, arg); break;
      case "--output": options.output = readValue(args, ++index, arg); break;
      case "--no-output": options.output = undefined; break;
      case "--quiet": options.quiet = true; break;
      case "--help":
      case "-h": printHelp(); process.exit(0);
      default: throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }
  return options;
}

function readValue(args: string[], index: number, name: string): string {
  const value = args[index];
  if (!value) throw new Error(`Missing value for ${name}.`);
  return value;
}

function printHelp(): void {
  console.log(`Usage: npm run report:transcript-problems -- [options]

Reads saved transcript-fetch failures only. It never contacts YouTube or retries a transcript.

Options:
  --status-input <path>  Prior-run status JSON. Defaults to src/transcripts/fetch-status.json.
  --output <path>        Markdown report. Defaults to reports/transcript-problems.md.
  --no-output            Analyze without writing a report.
  --quiet                Suppress the one-line summary.
  --help                 Show this help.
`);
}

main().catch((error: unknown) => {
  console.error(`Failed to report transcript problems: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
