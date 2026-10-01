import type { TaskWorkspace } from "../workspace/workspace.js";
import { runGit } from "./git.js";

export async function pushBranch(
  workspace: TaskWorkspace,
  branchName: string,
): Promise<string> {
  if (!branchName.trim()) {
    throw new Error("Branch name cannot be empty");
  }

  const result = await runGit(workspace, [
    "push",
    "--set-upstream",
    "origin",
    branchName,
  ]);

  return result.stdout || result.stderr;
}