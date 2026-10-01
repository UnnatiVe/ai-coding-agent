import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CreatePullRequestInput {
  repoFullName: string;
  baseBranch: string;
  headBranch: string;
  title: string;
  body: string;
}

export async function createPullRequest(
  input: CreatePullRequestInput,
): Promise<string> {
  const result = await execFileAsync(
    "gh",
    [
      "pr",
      "create",
      "--repo",
      input.repoFullName,
      "--base",
      input.baseBranch,
      "--head",
      input.headBranch,
      "--title",
      input.title,
      "--body",
      input.body,
    ],
    {
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  const url = result.stdout.trim();

  if (!url) {
    throw new Error("GitHub CLI did not return a pull request URL");
  }

  return url;
}