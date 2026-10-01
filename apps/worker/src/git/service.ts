import type { TaskWorkspace } from "../workspace/workspace.js";
import { initGitRepository } from "./init.js";
import { cloneRepository } from "./clone.js";
import { getGitStatus, type GitStatus } from "./status.js";
import { createTaskBranch } from "./branch.js";
import { getGitDiff } from "./diff.js";
import { commitChanges } from "./commit.js";
import { pushBranch } from "./push.js";

export interface GitService {
  init(): Promise<void>;
  clone(remoteUrl: string, baseBranch: string): Promise<void>;
  status(): Promise<GitStatus>;
  createBranch(branchName: string): Promise<void>;
  diff(): Promise<string>;
  commit(message: string): Promise<string>;
  push(branchName: string): Promise<string>;
}

export function createGitService(
  workspace: TaskWorkspace,
): GitService {
  return {
    init: () => initGitRepository(workspace),

    clone: (remoteUrl, baseBranch) =>
      cloneRepository(workspace, remoteUrl, baseBranch),

    status: () =>
      getGitStatus(workspace),

    createBranch: (branchName) =>
      createTaskBranch(workspace, branchName),

    diff: () =>
      getGitDiff(workspace),

    commit: (message) =>
      commitChanges(workspace, message),

    push: (branchName) =>
      pushBranch(workspace, branchName),
  };
}