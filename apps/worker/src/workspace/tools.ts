import { listFiles } from "./list-files.js";
import { readWorkspaceFile } from "./read-file.js";
import { writeWorkspaceFile } from "./write-file.js";
import { replaceInWorkspaceFile } from "./replace-file.js";
import { getPackageScripts } from "./get-scripts.js";
import type { TaskWorkspace } from "./workspace.js";

export interface WorkspaceTools {
  workspace: TaskWorkspace;

  listFiles: (
    relativePath?: string,
  ) => Promise<string[]>;

  readFile: (
    relativePath: string,
  ) => Promise<string>;

  writeFile: (
    relativePath: string,
    content: string,
  ) => Promise<void>;

  replaceInFile: (
    relativePath: string,
    oldText: string,
    newText: string,
  ) => Promise<void>;

  getScripts: () => Promise<string[]>;
}

export function createWorkspaceTools(
  workspace: TaskWorkspace,
): WorkspaceTools {
  return {
    workspace,

    listFiles: (relativePath = ".") =>
      listFiles(workspace, relativePath),

    readFile: (relativePath) =>
      readWorkspaceFile(workspace, relativePath),

    writeFile: (relativePath, content) =>
      writeWorkspaceFile(
        workspace,
        relativePath,
        content,
      ),

    replaceInFile: (
      relativePath,
      oldText,
      newText,
    ) =>
      replaceInWorkspaceFile(
        workspace,
        relativePath,
        oldText,
        newText,
      ),

    getScripts: () =>
      getPackageScripts(workspace),
  };
}