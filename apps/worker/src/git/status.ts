import type { TaskWorkspace } from "../workspace/workspace.js";
import { runGit } from "./git.js";

export interface GitStatus {
  branch: string;
  isClean: boolean;
  output: string;
}

export async function getGitStatus(
  workspace: TaskWorkspace,
): Promise<GitStatus> {
  const result = await runGit(workspace, [
    "status",
    "--short",
    "--branch",
  ]);

  const lines = result.stdout
    .split(/\r?\n/)
    .filter(Boolean);

  const branchLine = lines.find((line) =>
    line.startsWith("##"),
  );

  const branch = branchLine
    ? branchLine.replace(/^##\s*/, "").trim()
    : "";

  const changedLines = lines.filter(
    (line) => !line.startsWith("##"),
  );

  return {
    branch,
    isClean: changedLines.length === 0,
    output: result.stdout,
  };
}