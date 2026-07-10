#!/usr/bin/env node
import {
  auditTranscriptSchedules,
  defaultTranscriptScheduleManifest,
  defaultTranscriptSchedulePaths,
  defaultTranscriptScheduleProcessingLog,
  defaultTranscriptScheduleSegmentsInput,
  type TranscriptScheduleAuditOptions,
} from "../pipeline/transcript-schedule-audit.js";

interface CliOptions extends TranscriptScheduleAuditOptions {
  quiet: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const audit = await auditTranscriptSchedules(options);
  if (!options.quiet) {
    for (const issue of audit.issues) {
      const location = issue.path ? ` ${issue.path}${issue.line ? `:${issue.line}` : ""}` : "";
      console.error(`[${issue.severity}] ${issue.code}${location}: ${issue.message}`);
    }
    console.error([
      `Transcript schedule audit: schedules=${audit.stats.scheduleCount}`,
      `scheduled=${audit.stats.scheduledTranscriptCount}`,
      `manifest=${audit.stats.manifestTranscriptCount}`,
      `unchecked=${audit.stats.uncheckedCount}`,
      `in-progress=${audit.stats.inProgressCount}`,
      `checked=${audit.stats.checkedCount}`,
      `errors=${audit.stats.errorCount}`,
      `warnings=${audit.stats.warningCount}`,
      `artifacts=${options.checkArtifacts ? "checked" : "skipped"}`,
    ].join(" "));
  }
  if (audit.stats.errorCount > 0) process.exitCode = 1;
}

function parseArgs(args: string[]): CliOptions {
  const schedulePaths: string[] = [];
  const options: CliOptions = {
    manifestPath: defaultTranscriptScheduleManifest,
    schedulePaths,
    checkArtifacts: false,
    processingLogPath: defaultTranscriptScheduleProcessingLog,
    segmentsInput: defaultTranscriptScheduleSegmentsInput,
    quiet: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--manifest": options.manifestPath = readValue(args, ++index, arg); break;
      case "--schedule": schedulePaths.push(readValue(args, ++index, arg)); break;
      case "--check-artifacts": options.checkArtifacts = true; break;
      case "--processing-log": options.processingLogPath = readValue(args, ++index, arg); break;
      case "--segments-input": options.segmentsInput = readValue(args, ++index, arg); break;
      case "--quiet": options.quiet = true; break;
      case "--help":
      case "-h": printHelp(); process.exit(0);
      default: throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }
  if (schedulePaths.length === 0) schedulePaths.push(...defaultTranscriptSchedulePaths);
  return options;
}

function readValue(args: string[], index: number, name: string): string {
  const value = args[index];
  if (!value) throw new Error(`Missing value for ${name}.`);
  return value;
}

function printHelp(): void {
  console.log(`Usage: npm run audit:transcript-schedules -- [options]

Options:
  --manifest <path>        Transcript manifest path.
  --schedule <path>        Schedule path; repeat to override the four defaults.
  --check-artifacts        Require checked rows to have a fresh log entry and shard.
  --processing-log <path>  Processing log used by artifact checks.
  --segments-input <path>  Current-schema shard directory.
  --quiet                  Suppress issue and summary output.
  --help                   Show this help.`);
}

main().catch((error: unknown) => {
  console.error(`Failed to audit transcript schedules: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
