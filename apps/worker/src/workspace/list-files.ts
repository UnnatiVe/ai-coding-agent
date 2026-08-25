import { readdir } from "node:fs/promises";
import path from "node:path";
import type { TaskWorkspace } from "./workspace.js";

export async function listFiles(
  workspace: TaskWorkspace,
  relativePath = ".",
): Promise<string[]> {
  const targetPath = path.resolve(workspace.rootPath, relativePath);

  if (
    targetPath !== workspace.rootPath &&
    !targetPath.startsWith(`${workspace.rootPath}${path.sep}`)
  ) {
    throw new Error("Path escapes workspace");
  }

  const entries = await readdir(targetPath, {
    withFileTypes: true,
  });

  return entries
    .map((entry) => {
      const entryPath = path.join(relativePath, entry.name);

      return entry.isDirectory()
        ? `${entryPath}${path.sep}`
        : entryPath;
    })
    .sort();
}