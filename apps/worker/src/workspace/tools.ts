import { listFiles } from "./list-files.js";
import { readWorkspaceFile } from "./read-file.js";
import { writeWorkspaceFile } from "./write-file.js";
import type { TaskWorkspace } from "./workspace.js";

export interface WorkspaceTools {
  listFiles: (relativePath?: string) => Promise<string[]>;
  readFile: (relativePath: string) => Promise<string>;
  writeFile: (relativePath: string, content: string) => Promise<void>;
}

export function createWorkspaceTools(
  workspace: TaskWorkspace,
): WorkspaceTools {
  return {
    listFiles: (relativePath = ".") =>
      listFiles(workspace, relativePath),

    readFile: (relativePath) =>
      readWorkspaceFile(workspace, relativePath),

    writeFile: (relativePath, content) =>
      writeWorkspaceFile(workspace, relativePath, content),
  };
}