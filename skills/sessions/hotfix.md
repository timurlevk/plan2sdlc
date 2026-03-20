---
name: hotfix
description: Emergency bypass workflow for production incidents
---

# HOTFIX Session

Emergency bypass — speed over process.

## Entry Criteria
- Production incident
- Triggered by: "hotfix", "production down", "urgent", "/sdlc hotfix"

## What Gets SKIPPED
- BRAINSTORM
- PLAN
- ARCHITECTURE_REVIEW
- Full INTEGRATION_CHECK (smoke only)

## Process

### Step 1: TRIAGE (fast — 2 min)
- Orchestrator + architect (read-only assessment)
- Identify: affected domain, root cause hypothesis
- Assign: domain-developer

### Step 2: FIX
- Domain-developer in worktree from **main** (not release)
- + security-auditor (quick scan — no new vulnerabilities)
- + domain-tester (regression test for fix)
- Branch: `hotfix/{description}`

### Step 3: VERIFY (fast — smoke tests only)
- Mandatory: affected unit tests + smoke E2E
- Skip: full E2E suite, visual regression, a11y

### Step 4: HITL MERGE (always — even for trivial hotfix)
Show: diff, test results, security scan
Merge to: main AND release (backport)
Tag: `hotfix-{date}-{description}`

### Step 5: AUTO-CREATE FOLLOW-UPS
- POST_MORTEM task (investigate root cause)
- GAP_ANALYSIS task (why didn't tests catch this?)
- Backlog item for proper fix (if hotfix was band-aid)

## Budget
No budget cap during HOTFIX (emergency).

## Differences from Normal Flow
| Aspect | Normal | HOTFIX |
|--------|--------|--------|
| Branch source | release | **main (production)** |
| Governance | Full | Minimal |
| Tests | Full suite | Smoke only |
| HITL merge | XL only | **Always** |
| Post-merge | Optional | **POST_MORTEM mandatory** |
| Time target | Hours-days | **Minutes-1 hour** |
