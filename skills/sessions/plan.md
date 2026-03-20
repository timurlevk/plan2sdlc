---
name: plan
description: Decompose spec into domain-level tasks — invokes superpowers:writing-plans if available
---

# PLAN Session

Decompose an approved spec into concrete, domain-level tasks.

## Entry Criteria
- Approved spec (from BRAINSTORM) OR clear M-complexity task
- Spec path available in handoff

## Process

### With superpowers plugin (preferred)

If superpowers:writing-plans skill is available, invoke it:

```
Use the Skill tool: skill: "superpowers:writing-plans"
```

Superpowers will handle: reading spec → decomposing → creating step-by-step plan → review.

After plan is written and approved, return control to the SDLC orchestrator for EXECUTE.

### Without superpowers (fallback)

1. **Dispatch governance-architect**
2. Read the spec/requirements from handoff artifacts
3. Identify affected domains
4. Decompose into domain-level tasks
5. Organize into execution waves (parallel where possible)
6. For each task specify:
   - Domain and assigned agent
   - Description and acceptance criteria
   - Dependencies on other tasks
   - Test requirements
7. **HITL: user approves plan**

## Participants
- governance-architect (mandatory)

## HITL
Plan approval before proceeding.

## Output
- Implementation plan document
- Plan path stored in handoff artifacts
- Domain assignments for EXECUTE
- **Chains to EXECUTE** (orchestrator handles transition)
