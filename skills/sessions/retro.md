---
name: retro
description: Retrospective on recent work — process improvements, agent health
---

# RETRO Session

Review recent work, identify process improvements, assess agent health.

## Entry Criteria
- Bi-weekly cadence (config.triggers.retro.cadence)
- After N merges (config.triggers.retro.mergeThreshold)
- Manual: `/sdlc retro`

## Process
1. Dispatch governance agents
2. Review metrics:
   - Agent health: success rate, retry rate, cost trends
   - Workflow metrics: cycle time, first-time pass rate, escalation rate
   - Cost trends: by session type, by domain, by model
3. Identify issues:
   - Agents with success < 80% → prompt refinement needed
   - Agents with cost > 2x budget → model downgrade or optimization
   - Agents with retry > 15% → spec quality issue
   - Agents unused > 30 days → remove or repurpose
4. Propose process improvements:
   - Rule changes
   - Agent prompt updates
   - Workflow adjustments
   - New agents or skills needed
5. HITL: improvement approval
6. On approved changes → chain to ONBOARD

## Participants
- governance-architect (mandatory)
- governance-reviewer (mandatory)
- process-coach (if available)
- cost-optimizer (if over budget)

## Output
- Retrospective report
- Approved improvements
- Chains to ONBOARD if changes approved
