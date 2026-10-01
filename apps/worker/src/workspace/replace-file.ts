
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TaskWorkspace } from "./workspace.js";

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

export async function replaceInWorkspaceFile(
  workspace: TaskWorkspace,
  relativePath: string,
  oldText: string,
  newText: string,
): Promise<void> {
  if (!oldText) {
    throw new Error("oldText cannot be empty");
  }

  const targetPath = resolveWorkspacePath(
    workspace,
    relativePath,
  );

  const content = await readFile(
    targetPath,
    "utf8",
  );

  const occurrences =
    content.split(oldText).length - 1;

  if (occurrences === 0) {
    throw new Error(
      [
        `Exact text was not found in ${relativePath}.`,
        "You must call readFile again and copy the exact existing text before retrying replaceInFile.",
      ].join(" "),
    );
  }

  if (occurrences > 1) {
    throw new Error(
      [
        `Exact text occurs ${occurrences} times in ${relativePath}.`,
        "Use a larger, more specific exact text block.",
      ].join(" "),
    );
  }

  const updatedContent = content.replace(
    oldText,
    newText,
  );

  await writeFile(
    targetPath,
    updatedContent,
    "utf8",
  );
}

