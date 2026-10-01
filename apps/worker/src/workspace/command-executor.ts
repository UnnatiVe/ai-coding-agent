import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TaskWorkspace } from "./workspace.js";

const execAsync = promisify(exec);

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

const ALLOWED_COMMANDS = new Set([
  "install",
  "generate",
  "typecheck",
  "build",
  "test",
  "lint",
  "format",
  "format:check",
]);

async function getAvailableScripts(
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
    scripts?: Record<string, unknown>;
  };

  return Object.keys(packageJson.scripts ?? {});
}

export async function executeCommand(
  workspace: TaskWorkspace,
  command: string,
): Promise<CommandResult> {
  const normalizedCommand = command
    .trim()
    .toLowerCase()
    .replace(/^npm\s+run\s+/, "")
    .replace(/^pnpm\s+run\s+/, "");

  if (!ALLOWED_COMMANDS.has(normalizedCommand)) {
    return {
      ok: false,
      stdout: "",
      stderr: `Command not allowed: ${command}`,
      exitCode: 1,
    };
  }

  if (
    normalizedCommand !== "install" &&
    normalizedCommand !== "generate"
  ) {
    const availableScripts =
      await getAvailableScripts(workspace);

    if (!availableScripts.includes(normalizedCommand)) {
      return {
        ok: false,
        stdout: "",
        stderr: [
          `Script "${normalizedCommand}" does not exist in package.json.`,
          `Available scripts: ${availableScripts.join(", ") || "(none)"}`,
        ].join("\n"),
        exitCode: 1,
      };
    }
  }

  const pnpmCommand =
    normalizedCommand === "install"
      ? "pnpm install"
      : normalizedCommand === "generate"
        ? "pnpm --filter @aca/db run generate"
        : `pnpm run ${normalizedCommand}`;

  try {
    const result = await execAsync(
      pnpmCommand,
      {
        cwd: workspace.rootPath,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
        shell: process.env.ComSpec,
      },
    );

    return {
      ok: true,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      exitCode: 0,
    };
  } catch (error) {
    const execError = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };

    return {
      ok: false,
      stdout:
        execError.stdout?.trim() ?? "",
      stderr:
        execError.stderr?.trim() ?? "",
      exitCode:
        typeof execError.code === "number"
          ? execError.code
          : 1,
    };
  }
}
