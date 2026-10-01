import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TaskWorkspace } from "./workspace.js";

export async function getPackageScripts(
  workspace: TaskWorkspace,
): Promise<string[]> {
  const packageJsonPath = path.join(
    workspace.rootPath,
    "package.json",
  );

  const content = await readFile(
    packageJsonPath,
    "utf8",
  );

  const packageJson = JSON.parse(content) as {
    scripts?: Record<string, string>;
  };

  return Object.keys(packageJson.scripts ?? {});
}