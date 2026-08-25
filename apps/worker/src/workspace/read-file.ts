import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TaskWorkspace } from "./workspace.js";

function resolveWorkspacePath(
  workspace: TaskWorkspace,
  relativePath: string,
): string {
  const targetPath = path.resolve(workspace.rootPath, relativePath);

  if (
    targetPath !== workspace.rootPath &&
    !targetPath.startsWith(`${workspace.rootPath}${path.sep}`)
  ) {
    throw new Error("Path escapes workspace");
  }

  return targetPath;
}

export async function readWorkspaceFile(
  workspace: TaskWorkspace,
  relativePath: string,
): Promise<string> {
  const targetPath = resolveWorkspacePath(workspace, relativePath);

  return readFile(targetPath, "utf8");
}