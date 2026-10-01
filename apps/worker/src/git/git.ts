import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TaskWorkspace } from "../workspace/workspace.js";

const execFileAsync = promisify(execFile);

export interface GitCommandResult {
  stdout: string;
  stderr: string;
}

export async function runGit(
  workspace: TaskWorkspace,
  args: string[],
): Promise<GitCommandResult> {
  const result = await execFileAsync("git", args, {
    cwd: workspace.rootPath,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}
export async function addGitRemote(
  workspace: TaskWorkspace,
  remoteUrl: string,
): Promise<void> {
  if (!remoteUrl.trim()) {
    throw new Error("Git remote URL cannot be empty");
  }

  await runGit(workspace, [
    "remote",
    "add",
    "origin",
    remoteUrl,
  ]);
}