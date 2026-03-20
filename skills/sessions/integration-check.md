---
name: integration-check
description: Multi-domain integration verification
---

# INTEGRATION_CHECK Session

Cross-domain integration verification for multi-domain changes.

## Entry Criteria
- Multi-domain task (2+ domains affected)
- After REVIEW pass for all domains

## Process
1. Dispatch qa-e2e-writer
2. Run full test suite:
   - Unit tests (all domains)
   - Integration tests (cross-domain)
   - E2E tests (full user flows)
3. If playwright MCP tools available → use for E2E
4. Without playwright → skip E2E, run unit + integration only
5. Check for merge conflicts between domain worktrees
6. HITL on merge conflict

## Test Requirements
- Mandatory: unit, integration, e2e
- Optional: a11y, performance
- Gate: all green

## Participants
- qa-e2e-writer (mandatory)
- e2e-tester (if available)

## Output
- Integration report
- Test results
- Chains to MERGE (on pass)
- Retry: max 1 → then HITL
