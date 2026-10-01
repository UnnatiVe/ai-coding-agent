import type { TaskWorkspace } from "../workspace/workspace.js";
import { runGit } from "./git.js";

export async function initGitRepository(
  workspace: TaskWorkspace,
): Promise<void> {
  await runGit(workspace, ["init"]);
}