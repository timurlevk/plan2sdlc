---
name: sdlc-status
description: Show backlog, active workflows, and recent completions
user-invocable: true
---

# /sdlc status

Show the current state of the SDLC pipeline.

## Instructions

Read the following state files from `.sdlc/` directory in the project root:

1. **`.sdlc/backlog.json`** — task backlog
2. **`.sdlc/state.json`** — active workflows and domain locks
3. **`.sdlc/tech-debt.json`** — tech debt register (if exists)

## Output Format

Format the output as follows:

### BACKLOG

Show all non-done, non-abandoned items in a table:

```
BACKLOG ({count} items)
───────────────────────────────────────────────────────
{ID}  [{complexity}] {type:<8}  {priority:<8}  "{title}"  {status}
```

Sort by: priority (critical first), then by status (executing > reviewing > planned > triaged > inbox).

### ACTIVE WORKFLOWS

Show currently executing workflows:

```
ACTIVE WORKFLOWS
───────────────────────────────────────────────────────
{WF-ID}  {TASK-ID}  {currentSession} → {assigned agent}
```

If no active workflows, show "No active workflows."

### DOMAIN LOCKS

If any domains are locked, show:

```
DOMAIN LOCKS
───────────────────────────────────────────────────────
{domain}: locked by {workflowId} ({agent}) since {time}
```

### RECENT COMPLETIONS

Show items completed in the last 7 days:

```
RECENT (last 7 days)
───────────────────────────────────────────────────────
{ID}  [{complexity}] {type}  done  "{title}"  ${cost}  {sessionCount} sessions
```

### TECH DEBT

If `.sdlc/tech-debt.json` exists and has items:

```
TECH DEBT ({total} items, {open} open, trend: {trend})
───────────────────────────────────────────────────────
{severity}: {count} items
```

### Error Handling

If `.sdlc/` directory doesn't exist:
```
⚠ SDLC not initialized. Run /sdlc init first.
```

If files are empty or missing, show "No data" for that section.
