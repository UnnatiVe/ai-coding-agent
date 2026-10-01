
import type { WorkspaceTools } from "./tools.js";
import { executeCommand } from "./command-executor.js";

export type WorkspaceToolName =
  | "listFiles"
  | "readFile"
  | "writeFile"
  | "replaceInFile"
  | "getScripts"
  | "runCommand";

export interface WorkspaceToolCall {
  name: WorkspaceToolName;
  arguments: Record<string, unknown>;
}

export interface WorkspaceToolResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export async function executeWorkspaceTool(
  tools: WorkspaceTools,
  call: WorkspaceToolCall,
): Promise<WorkspaceToolResult> {
  try {
    switch (call.name) {
      case "listFiles": {
        const relativePath =
          typeof call.arguments.relativePath === "string"
            ? call.arguments.relativePath
            : ".";

        const result =
          await tools.listFiles(relativePath);

        return {
          ok: true,
          result,
        };
      }

      case "readFile": {
        const relativePath =
          call.arguments.relativePath;

        if (typeof relativePath !== "string") {
          return {
            ok: false,
            error:
              "readFile requires a string relativePath",
          };
        }

        const result =
          await tools.readFile(relativePath);

        return {
          ok: true,
          result,
        };
      }

      case "writeFile": {
        const relativePath =
          call.arguments.relativePath;

        const content =
          call.arguments.content;

        if (typeof relativePath !== "string") {
          return {
            ok: false,
            error:
              "writeFile requires a string relativePath",
          };
        }

        if (typeof content !== "string") {
          return {
            ok: false,
            error:
              "writeFile requires string content",
          };
        }

        await tools.writeFile(
          relativePath,
          content,
        );

        return {
          ok: true,
          result:
            "File written successfully",
        };
      }

      case "replaceInFile": {
        const relativePath =
          call.arguments.relativePath;

        const oldText =
          call.arguments.oldText;

        const newText =
          call.arguments.newText;

        if (typeof relativePath !== "string") {
          return {
            ok: false,
            error:
              "replaceInFile requires a string relativePath",
          };
        }

        if (typeof oldText !== "string") {
          return {
            ok: false,
            error:
              "replaceInFile requires a string oldText",
          };
        }

        if (typeof newText !== "string") {
          return {
            ok: false,
            error:
              "replaceInFile requires a string newText",
          };
        }

        await tools.replaceInFile(
          relativePath,
          oldText,
          newText,
        );

        return {
          ok: true,
          result:
            "File updated successfully",
        };
      }

      case "getScripts": {
        const result =
          await tools.getScripts();

        return {
          ok: true,
          result,
        };
      }

      case "runCommand": {
        const command =
          call.arguments.command;

        if (typeof command !== "string") {
          return {
            ok: false,
            error:
              "runCommand requires a string command",
          };
        }

        const result =
          await executeCommand(
            tools.workspace,
            command,
          );

        if (!result.ok) {
          return {
            ok: false,
            error: [
              `Command failed with exit code ${result.exitCode}`,
              result.stdout,
              result.stderr,
            ]
              .filter(Boolean)
              .join("\n"),
          };
        }

        return {
          ok: true,
          result: {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
          },
        };
      }

      default: {
        return {
          ok: false,
          error:
            `Unknown workspace tool: ${String(call.name)}`,
        };
      }
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Workspace tool execution failed",
    };
  }
}

