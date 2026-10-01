import type { TaskWorkspace } from "../workspace/workspace.js";
import { runGit } from "./git.js";

export async function commitChanges(
  workspace: TaskWorkspace,
  message: string,
): Promise<string> {
  if (!message.trim()) {
    throw new Error("Commit message cannot be empty");
  }

  await runGit(workspace, [
    "add",
    "--",
    ".",
  ]);

  const result = await runGit(workspace, [
    "commit",
    "-m",
    message,
  ]);

  return result.stdout;
}