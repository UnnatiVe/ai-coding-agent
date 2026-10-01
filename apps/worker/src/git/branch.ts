import type { TaskWorkspace } from "../workspace/workspace.js";
import { runGit } from "./git.js";

export async function createTaskBranch(
  workspace: TaskWorkspace,
  branchName: string,
): Promise<void> {
  if (!branchName.trim()) {
    throw new Error("Branch name cannot be empty");
  }

  await runGit(workspace, [
    "checkout",
    "-b",
    branchName,
  ]);
}