export const siteBuildRepairHint =
  "Repair hint: Use $naval-site-build-repair and paste this complete error into Codex.";

export function withSiteBuildRepairHint(message: string): string {
  return message.includes("$naval-site-build-repair")
    ? message
    : `${message}\n\n${siteBuildRepairHint}`;
}
