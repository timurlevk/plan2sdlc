---
name: merge
description: Merge worktree branches to release branch
---

# MERGE Session

Merge approved worktree branches to the release branch.

## Entry Criteria
- REVIEW approved (or INTEGRATION_CHECK passed for multi-domain)
- All tests green

## Process
1. Show explicit merge confirmation:
   ```
   ⚠ MERGE to {release_branch}

   Worktrees: {list}
   Files changed: {count} across {domain_count} domains
   Tests: ✅ all green (unit: X, integration: Y, E2E: Z)
   Review: ✅ approved by governance-reviewer
   Security: ✅ no new vulnerabilities
   Coverage: ✅ domain thresholds met

   This merges code to your release branch.
   Recovery: git revert {commit-hash}

   Proceed? [y/n]
   ```
2. HITL required for L/XL per config.hitl.mergeApproval
3. Merge worktree branch(es) to release branch
4. Clean up worktrees
5. Update backlog item status to 'done'
6. Unlock domain locks
7. Trigger post-merge sessions:
   - GAP_ANALYSIS (for L/XL)
   - DOCS_SYNC (for L/XL)
   - SECURITY_REVIEW (if auth files touched)

## Participants
- orchestrator (direct, no governance agent needed)

## Output
- Merged commits on release branch
- Cleaned worktrees
- Updated backlog status
- Post-merge sessions queued
