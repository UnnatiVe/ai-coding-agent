import { mkdir, writeFile } from "node:fs/promises";
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

export async function writeWorkspaceFile(
  workspace: TaskWorkspace,
  relativePath: string,
  content: string,
): Promise<void> {
  const targetPath = resolveWorkspacePath(workspace, relativePath);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, "utf8");
}