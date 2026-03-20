---
name: sdlc-dispatch
description: Submit a task to the orchestrator
user-invocable: true
---

# /sdlc dispatch

Submit a task to the SDLC orchestrator for classification and execution.

## Usage

```
/sdlc dispatch "task description"
```

Or just describe a task naturally — the orchestrator classifies it automatically.

## Process

1. **Create backlog item** — add to `.sdlc/backlog.json` with status `inbox`
2. **Classify** — determine type (feature/bugfix/refactor/etc), complexity (S/M/L/XL), affected domains
3. **Route** — select session chain based on classification:
   - S/bugfix → QUICK_FIX → MERGE
   - M/clear → PLAN → EXECUTE → REVIEW → MERGE
   - L/feature → BRAINSTORM → PLAN → EXECUTE → REVIEW → MERGE
   - XL → ARCHITECTURE_REVIEW → BRAINSTORM → PLAN → ...
4. **Create workflow** — add to `.sdlc/state.json` active workflows
5. **Check conflicts** — verify no domain locks prevent execution
6. **Compose team** — select agents from registry
7. **Dispatch** — start first session in chain

## Output

Show the user:
```
Task: {title}
ID: {TASK-NNN}
Type: {type} | Complexity: {complexity} | Priority: {priority}
Domains: {domains}
Session chain: {chain}
Team: {agents}

Dispatching {first_session}...
```

## Error Handling

- If `.sdlc/` not initialized: "⚠ Run /sdlc init first."
- If domain conflict: "⚠ Domain {domain} locked by {workflow}. Queuing."
- If budget exceeded: "⚠ Monthly budget warning. Continue? [y/n]"
