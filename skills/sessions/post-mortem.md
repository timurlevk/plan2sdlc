---
name: post-mortem
description: Root cause analysis after failures
---

# POST_MORTEM Session

Root cause analysis after E2E failures or repeated integration failures.

## Entry Criteria
- E2E tests red
- Integration failures 2x in a row
- Manual trigger after incident

## Process
1. Dispatch governance-tech-lead
2. If superpowers:systematic-debugging available → delegate
3. Otherwise:
   a. Collect evidence: test logs, error messages, recent changes
   b. Identify root cause (not just symptom)
   c. Determine contributing factors
   d. Propose preventive measures:
      - New tests to catch this class of bug
      - Rule changes to prevent recurrence
      - Agent prompt improvements
   e. HITL: root cause approval
4. Create action items → dispatch to TRIAGE + ONBOARD

## Participants
- governance-tech-lead (mandatory)
- Relevant domain developers (for domain context)
- security-sme (if security incident)

## HITL
Root cause approval required.

## Output
- Post-mortem report
- Action items dispatched to TRIAGE
- Preventive measures dispatched to ONBOARD
- Tech debt items for systemic issues

## Depth Limit
Post-mortem action items don't trigger another post-mortem (maxDepth: 1).
If exceeded → HITL.
