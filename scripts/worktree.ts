/**
 * Git Worktree Manager — create, merge, and cleanup worktrees for parallel agent execution.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface WorktreeInfo {
  path: string;
  branch: string;
}

/**
 * Create a git worktree for a task.
 * Returns the worktree path and branch name.
 */
export function createWorktree(projectDir: string, taskId: string): WorktreeInfo {
  const safeName = taskId.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
  const branch = `sdlc-${safeName}`;
  const worktreePath = join(projectDir, '.sdlc', 'worktrees', safeName);

  // Remove stale worktree if exists
  if (existsSync(worktreePath)) {
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, { cwd: projectDir, stdio: 'pipe' });
    } catch { /* ignore */ }
  }

  // Delete branch if exists from previous run
  try {
    execSync(`git branch -D "${branch}"`, { cwd: projectDir, stdio: 'pipe' });
  } catch { /* branch doesn't exist, fine */ }

  // Create worktree from current HEAD
  execSync(`git worktree add "${worktreePath}" -b "${branch}"`, {
    cwd: projectDir,
    stdio: 'pipe',
    timeout: 30_000,
  });

  return { path: worktreePath, branch };
}

/**
 * Merge a worktree branch back to current branch.
 * Returns true if merge succeeded, false if conflicts.
 */
export function mergeWorktree(projectDir: string, branch: string): { success: boolean; conflicts: string[] } {
  try {
    // First try fast-forward
    execSync(`git merge --ff-only "${branch}"`, { cwd: projectDir, stdio: 'pipe' });
    return { success: true, conflicts: [] };
  } catch {
    // Try auto-merge
    try {
      execSync(`git merge --no-edit "${branch}"`, { cwd: projectDir, stdio: 'pipe' });
      return { success: true, conflicts: [] };
    } catch {
      // Get conflict files
      const conflictOutput = execSync('git diff --name-only --diff-filter=U', {
        cwd: projectDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      const conflicts = conflictOutput.split('\n').filter(f => f.trim());

      // Abort the failed merge
      try {
        execSync('git merge --abort', { cwd: projectDir, stdio: 'pipe' });
      } catch { /* already clean */ }

      return { success: false, conflicts };
    }
  }
}

/**
 * Remove a worktree and its branch.
 */
export function removeWorktree(projectDir: string, worktreePath: string, branch: string): void {
  try {
    execSync(`git worktree remove "${worktreePath}" --force`, { cwd: projectDir, stdio: 'pipe' });
  } catch { /* may already be removed */ }

  try {
    execSync(`git branch -D "${branch}"`, { cwd: projectDir, stdio: 'pipe' });
  } catch { /* branch may not exist */ }
}

/**
 * Prune stale worktree metadata.
 */
export function pruneWorktrees(projectDir: string): void {
  try {
    execSync('git worktree prune', { cwd: projectDir, stdio: 'pipe' });
  } catch { /* ignore */ }
}

/**
 * Commit all changes in a worktree.
 * Returns true if there were changes to commit.
 */
export function commitWorktree(worktreePath: string, message: string): boolean {
  try {
    // Always stage everything — agent may have created files without committing
    execSync('git add -A', { cwd: worktreePath, stdio: 'pipe' });

    // Check if there's anything to commit (after staging)
    const diff = execSync('git diff --cached --name-only', {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    if (!diff.trim()) return false;

    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: worktreePath,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}
