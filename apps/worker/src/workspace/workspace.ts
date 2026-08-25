import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const WORKSPACE_ROOT = path.join(PROJECT_ROOT, ".workspaces");

export interface TaskWorkspace {
  taskId: string;
  rootPath: string;
}

export async function createTaskWorkspace(taskId: string): Promise<TaskWorkspace> {
  const rootPath = path.join(WORKSPACE_ROOT, taskId);

  await mkdir(rootPath, { recursive: true });

  return {
    taskId,
    rootPath,
  };
}