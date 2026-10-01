import { readdir } from "node:fs/promises";
import path from "node:path";
import type { TaskWorkspace } from "./workspace.js";

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
]);

function resolveWorkspacePath(
  workspace: TaskWorkspace,
  relativePath: string,
): string {
  const targetPath = path.resolve(
    workspace.rootPath,
    relativePath,
  );

  if (
    targetPath !== workspace.rootPath &&
    !targetPath.startsWith(
      `${workspace.rootPath}${path.sep}`,
    )
  ) {
    throw new Error("Path escapes workspace");
  }

  return targetPath;
}

export async function listFiles(
  workspace: TaskWorkspace,
  relativePath = ".",
): Promise<string[]> {
  const targetPath = resolveWorkspacePath(
    workspace,
    relativePath,
  );

  const entries = await readdir(targetPath, {
    withFileTypes: true,
  });

  const results: string[] = [];

  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      IGNORED_DIRECTORIES.has(entry.name)
    ) {
      continue;
    }

    const entryPath = path.join(
      relativePath,
      entry.name,
    );

    if (entry.isDirectory()) {
      results.push(
        `${entryPath}${path.sep}`,
      );

      const nestedFiles = await listFiles(
        workspace,
        entryPath,
      );

      results.push(...nestedFiles);
    } else {
      results.push(entryPath);
    }
  }

  return results.sort();
}