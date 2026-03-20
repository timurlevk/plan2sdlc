---
name: sdlc-help
description: Show SDLC plugin help
user-invocable: true
---

# /sdlc help

## CLAUDE SDLC PLUGIN v0.1.0

### COMMANDS
```
/sdlc init              Initialize plugin for this project
/sdlc dispatch "X"      Submit task to orchestrator
/sdlc status            Show backlog + active workflows
/sdlc triage            Prioritize inbox items
/sdlc retro             Run retrospective
/sdlc release           Cut release (version, changelog, deploy)
/sdlc hotfix            Emergency production fix
/sdlc cost              Cost breakdown report
/sdlc team              Agent registry + health
/sdlc add-agent         Create new agent (guided)
/sdlc add-domain        Register new domain (guided)
/sdlc add-sme "X"       Create subject matter expert
/sdlc undo              Revert last plugin action
/sdlc uninstall         Remove plugin + cleanup
/sdlc enable            Enable optional integrations
/sdlc help              This help
```

### DAILY WORKFLOW
1. Start:    `claude --agent orchestrator` (or alias: `p2s`)
2. Work:     describe task -> orchestrator handles routing
3. Review:   approve changes at HITL gates
4. Check:    `/sdlc status` for progress

### SESSIONS (automatic -- orchestrator picks the right one)
```
QUICK_FIX    S bugfix -> fast fix, auto-merge
TRIAGE       Prioritize multiple tasks
BRAINSTORM   Design feature (L/XL)
PLAN         Decompose into domain tasks
EXECUTE      Domain teams implement
REVIEW       Code review + acceptance
MERGE        Merge to release branch
RELEASE      Version bump + changelog + deploy
HOTFIX       Emergency production fix
RETRO        Review process, improve agents
... and 7 more
```

### RECOVERY
```
/sdlc undo              Revert last action
git revert {hash}       Manual revert
git stash               Stash all changes
/sdlc uninstall         Remove plugin entirely
```
