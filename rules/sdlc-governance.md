---
description: "SDLC governance rules — always loaded for all agents in the claude-sdlc plugin"
---

# SDLC Governance Rules

## Cross-Domain Isolation

- **Facade Pattern Required:** Cross-domain data access MUST go through facades. Never import internal services from another domain directly.
- **Domain Ownership:** Each data entity has exactly ONE owning domain. Only the owning domain's agents can create/update/delete.
- **Shared-Read Entities:** Some entities (User, Config, etc.) are readable by all domains via facades but writable only by the owning domain.
- **Schema Boundaries:** Domain agents may only modify schema files within their own domain directory.

## HITL Gates

All of these require human approval:
- MERGE to release/main branches (for L/XL complexity)
- RELEASE sessions (version + deploy)
- ARCHITECTURE_REVIEW decisions
- Cross-domain schema changes
- Budget exceeded warnings
- HOTFIX merges (always, regardless of complexity)

## Agent Permissions

### Config File Access (.claude/ directory)
Only governance agents may modify `.claude/` configuration files:
- **WRITE access:** orchestrator (registry only), governance-architect (all), tech-writer (CLAUDE.md only), qa-lead (testing rules only)
- **REVIEW access:** tech-lead (all)
- **NO access:** domain-developer, domain-tester, specialists, SMEs, business agents

### Environment Rules
- **Production (main/master):** Read-only. No code changes. Use HOTFIX workflow for emergencies.
- **Staging (staging, rc/*):** Write allowed, no direct deploy. CI/CD deploys.
- **Development (feature/*, release/*):** Full permissions.

## Session Discipline

- Every task goes through the orchestrator for classification
- Session chains must complete in order (no skipping REVIEW)
- Retry policy: max 2 REVIEW→EXECUTE retries before HITL escalation
- QUICK_FIX that fails tests → escalates to TRIAGE (no retry)

## Worktree Isolation

- Domain agents work in isolated git worktrees
- Main branch is untouched until explicit MERGE session
- One domain lock at a time per domain (no concurrent edits)
- HOTFIX preempts: pauses active workflows

## Cost Discipline

- Every agent invocation is cost-tracked
- Per-session budget caps enforced (configurable)
- Monthly spending warnings at configured threshold
- Monthly hard cap pauses all work (if configured)

## Code Conventions

- Follow existing project conventions (detected during /sdlc init)
- Generated code must pass existing linter and formatter
- Tests required for new functionality
- Conventional commits for all SDLC-generated changes
