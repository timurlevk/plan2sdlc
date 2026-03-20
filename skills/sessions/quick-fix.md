---
name: quick-fix
description: Fast-path session for S/bugfix/single-domain tasks
---

# QUICK_FIX Session

Fast-path for simple bug fixes. Minimal governance overhead.

## Entry Criteria
- Complexity: S
- Type: bugfix (or simple refactor)
- Single domain affected

## Process

1. **Dispatch domain-developer** in worktree isolation
2. Developer fixes the issue
3. **Run affected unit tests** — only tests for changed files
4. If tests pass → chain to MERGE
5. If tests fail → escalate to TRIAGE (no retry)

## Participants
- domain-developer (from affected domain)

## No HITL Required
Auto-dispatched if `config.workflow.autoQuickFix = true`.

## Output
- Fixed code in worktree
- Test results
- Ready for MERGE

## On Failure
Tests fail → escalate to TRIAGE with context:
"QUICK_FIX failed for {task}. Tests: {failures}. Escalating to full workflow."
