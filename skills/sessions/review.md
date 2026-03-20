---
name: review
description: Code review gate with retry/escalation
---

# REVIEW Session

Code review gate — governance-reviewer evaluates implementation quality.

## Entry Criteria
- EXECUTE session completed
- Code in worktree(s) ready for review

## Process
1. Dispatch governance-reviewer
2. If superpowers:requesting-code-review available → delegate
3. If code-review plugin available → use code-review:code-review
4. Otherwise built-in review:
   a. Read implementation code
   b. Run typecheck: `pnpm build` or `tsc --noEmit`
   c. Run lint: `pnpm lint` or project linter
   d. Review against spec/plan:
      - Completeness — everything requested implemented?
      - Quality — clean, readable, maintainable?
      - Tests — new features tested? Coverage adequate?
      - Domain isolation — no cross-boundary violations?
      - Security — no hardcoded secrets? Input validation?
   e. Write review report

## Outcomes
- **approved** → chains to MERGE (or INTEGRATION_CHECK if multi-domain)
- **needs-changes** (retry < maxRetries) → chains back to EXECUTE with feedback
- **rejected** (retry >= maxRetries) → HITL escalation

## Retry Policy
Max retries configurable (default 2). Tracks reviewAttempt in workflow context.

## Participants
- governance-reviewer (mandatory)
- security-auditor (if auth files touched)
- visual-qa (if UI changes)

## Test Requirements
- Mandatory: typecheck, lint
- Gate: zero type errors, zero lint errors
