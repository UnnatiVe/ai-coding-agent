
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

   const normalizeLineEndings = (text: string) =>
    text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const normalizedContent = normalizeLineEndings(content);
  const normalizedOldText = normalizeLineEndings(oldText);
  const normalizedNewText = normalizeLineEndings(newText);

  const occurrences =
    normalizedContent.split(normalizedOldText).length - 1;

  if (normalizedOldText === normalizedNewText) {
    throw new Error(
      "No-op replacement rejected: oldText and newText are identical. " +
        "Provide a newText that actually implements the requested change.",
    );
  }
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

    const usesCRLF = content.includes("\r\n");
  const replacementText = usesCRLF
    ? normalizedNewText.replace(/\n/g, "\r\n")
    : normalizedNewText;

  const updatedContent = normalizedContent.replace(
    normalizedOldText,
    replacementText,
  );

  await writeFile(
    targetPath,
    updatedContent,
    "utf8",
  );
}

