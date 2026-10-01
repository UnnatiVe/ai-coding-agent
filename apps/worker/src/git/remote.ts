import type { TaskWorkspace } from "../workspace/workspace.js";
import { addGitRemote } from "./git.js";

export async function setGitRemote(
  workspace: TaskWorkspace,
  remoteUrl: string,
): Promise<void> {
  await addGitRemote(workspace, remoteUrl);
}