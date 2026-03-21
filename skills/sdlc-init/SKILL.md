---
name: sdlc-init
description: Initialize SDLC plugin for this project
user-invocable: true
---

# /sdlc init

Bootstrap the SDLC plugin for the current project.

## Process

### Step 1: Disclaimer
Show the startup disclaimer:
```
⚠ CLAUDE SDLC PLUGIN — EXPERIMENTAL

This plugin orchestrates AI agents that read and modify your codebase.
All changes require your approval (HITL gates).
Agents work in isolated git worktrees.
YOU are responsible for reviewing all changes.

Continue? [y/n]
```

Wait for user confirmation before proceeding.

### Step 2: Ecosystem Scan (read-only)
Run the init service to detect:
- Tech stack (frameworks, ORMs, databases)
- Domain mapping (bounded contexts)
- Existing conventions (naming, testing, CI/CD, git)
- Existing CLAUDE.md and .claude/ configuration

Present findings to user.

### Step 3: Domain Mapping (HITL)
Present detected domains for user confirmation:
- Show each domain with name, path, detected tech stack
- User can add, remove, or rename domains
- User confirms final domain map

### Step 4: Agent Selection (HITL)
Present agent roster:
- MANDATORY agents (cannot remove): orchestrator, per-domain developer/tester, product-analyst, architect, qa-lead
- AUTO-DETECTED agents (recommended, can toggle): based on tech stack signals
- Show total count
- User confirms selections

### Step 5: Config Generation
Generate all config files (user reviews each):
- `.sdlc/config.yaml` from matching template
- `.sdlc/registry.yaml` with selected agents
- `.sdlc/backlog.json` (empty)
- `.sdlc/state.json` (empty)
- `.sdlc/tech-debt.json` (empty)
- `.sdlc/ledger.md` (empty project ledger index)
- `.sdlc/ledger/` directory (for release archives)
- Orchestrator agent at `.claude/agents/orchestrator.md` (color: blue)
- Per-domain developers: `{domain}-developer.md` (color: green)
- Per-domain testers: `{domain}-tester.md` (color: yellow)
- Governance agents: `governance-architect.md` (color: cyan), `governance-reviewer.md` (color: red)

**IMPORTANT:** Every generated agent MUST have a `color` field in frontmatter for visual identification in the terminal. Use the colors above consistently.
- Path-scoped rules per domain
- `.gitignore` additions
- Backup existing .claude/ structure to `.sdlc/backup/`

### Step 6: Ecosystem Report
Show INHERIT/ENHANCE/PROPOSE report per detected convention.

### Step 7: Verification
- Check all agents are resolvable
- Show quick-start guide

## Important
- NEVER overwrite existing CLAUDE.md content
- ALWAYS backup existing .claude/ before modifying
- Inherit existing conventions
