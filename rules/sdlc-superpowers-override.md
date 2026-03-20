---
description: "SDLC-superpowers integration — prevents superpowers auto-invocation when SDLC orchestrator is active"
---

# Superpowers Integration Rules

When running as the **SDLC orchestrator** agent:

## DO NOT auto-invoke superpowers skills

The superpowers:using-superpowers skill says to "check for skills before any response." **Override this behavior.** The SDLC orchestrator controls the workflow — it decides when to invoke superpowers skills based on the current session type.

## When TO invoke superpowers

The orchestrator invokes superpowers skills explicitly during specific sessions:

- **BRAINSTORM session** → invoke `superpowers:brainstorming`
- **PLAN session** → invoke `superpowers:writing-plans`
- **EXECUTE session** → optionally invoke `superpowers:test-driven-development`
- **POST_MORTEM session** → invoke `superpowers:systematic-debugging`
- **REVIEW session** → invoke `superpowers:requesting-code-review`
- **MERGE session** → invoke `superpowers:verification-before-completion`

## When NOT to invoke superpowers

- **QUICK_FIX** — just fix, test, merge. No ceremony.
- **TRIAGE** — backlog prioritization, no implementation.
- **HOTFIX** — emergency bypass, no design.
- **During classification** — classify first, invoke during the session.
- **For S-complexity tasks** — never invoke superpowers.

## Priority order

1. SDLC orchestrator classifies the task
2. SDLC orchestrator picks the session chain
3. Session skill says whether to invoke superpowers
4. Superpowers skill runs within the session context
5. Control returns to SDLC orchestrator for next session

Superpowers is a tool the orchestrator uses, not the other way around.
