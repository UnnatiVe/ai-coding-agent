import type { TaskWorkspace } from "../workspace/workspace.js";
import { runGit } from "./git.js";

export async function getGitDiff(
  workspace: TaskWorkspace,
): Promise<string> {
  const result = await runGit(workspace, [
    "diff",
    "--no-ext-diff",
    "--",
  ]);

  const status = await runGit(workspace, [
    "status",
    "--short",
  ]);

  const trackedDiff = result.stdout.trim();
  const statusOutput = status.stdout.trim();

  if (!trackedDiff && !statusOutput) {
    return "";
  }

  return [
    trackedDiff,
    statusOutput
      ? `Working tree status:\n${statusOutput}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}