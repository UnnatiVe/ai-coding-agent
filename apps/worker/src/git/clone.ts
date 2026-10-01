import type { TaskWorkspace } from "../workspace/workspace.js";
import { runGit } from "./git.js";

export async function cloneRepository(
  workspace: TaskWorkspace,
  remoteUrl: string,
  baseBranch: string,
): Promise<void> {
  if (!remoteUrl.trim()) {
    throw new Error("Git repository URL cannot be empty");
  }

  if (!baseBranch.trim()) {
    throw new Error("Base branch cannot be empty");
  }

  await runGit(workspace, [
    "clone",
    "--branch",
    baseBranch,
    "--single-branch",
    remoteUrl,
    ".",
  ]);
}