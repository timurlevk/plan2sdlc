---
name: execute
description: Domain teams implement code in isolated worktrees — optionally uses superpowers:test-driven-development
---

# EXECUTE Session

Domain teams implement the planned changes in isolated git worktrees.

## Entry Criteria
- Plan approved (from PLAN session) OR direct dispatch (M tasks)
- Domains identified
- Spec/plan available in handoff artifacts

## Process

1. **Create worktree** per affected domain (branch from release)
2. **Dispatch domain-developer + domain-tester** per domain
3. Developer implements following the plan:
   - If superpowers:test-driven-development is available and orchestrator decided to use it:
     `Use the Skill tool: skill: "superpowers:test-driven-development"`
   - Otherwise: write tests first, then implement
   - Run domain test suite: `{test_command}`
4. **Track budget** per domain agent
5. On completion, write **SessionHandoff** with:
   - Worktree branches
   - Test results
   - Files changed

## Participants
- {domain}-developer (per affected domain)
- {domain}-tester (per affected domain, skip for S tasks)

## HITL
Only when agent signals a blocker. Otherwise fully autonomous.

## Budget
Per-session cap from `config.budget.perSession.EXECUTE` (per domain).

## Test Requirements
- During: unit tests (mandatory)
- After: full domain test suite (mandatory)
- Gate: coverage >= domain threshold

## Output
- Code in worktrees (not merged yet)
- Test results
- SessionHandoff → chains to REVIEW
