# claude-sdlc

Full SDLC governance plugin for Claude Code — orchestrator, agent teams, dynamic workflow engine.

## What It Does

claude-sdlc turns Claude Code into a structured development pipeline. Instead of ad-hoc coding sessions, every task flows through classification, planning, implementation, review, and merge — with cost tracking, safety hooks, and persistent state across sessions.

```
You: "fix the login redirect bug"

Orchestrator:
  Type: bugfix | Complexity: S | Domain: api
  Chain: QUICK_FIX → MERGE
  Team: api-developer
  Estimated cost: $1.00

  Dispatching...
```

## Key Features

- **17 session types** — QUICK_FIX, BRAINSTORM, PLAN, EXECUTE, REVIEW, MERGE, HOTFIX, RELEASE, and more
- **57-agent catalog** — governance, development, testing, design, product, business, specialists, SMEs
- **Task classification** — auto-detects type, complexity, affected domains, routes to correct session chain
- **Persistent state** — backlog, workflow tracking, cost logging, tech debt register survive across sessions
- **6-layer safety** — tool restrictions, hooks, permission modes, environment awareness, worktrees, git recovery
- **Cost control** — per-session budgets, monthly caps, pre-dispatch estimates for M/L/XL tasks
- **Project-aware** — inherits existing conventions (linting, testing, git workflow), never overrides

## Installation

```bash
# Add marketplace
/plugin marketplace add plan2skill/plan2sdlc

# Install plugin
/plugin install claude-sdlc

# Initialize in your project
/sdlc init
```

## Quick Start

```bash
# Start with orchestrator
claude --agent orchestrator

# Or create an alias
alias p2s="claude --agent orchestrator"

# Dispatch a task
/sdlc dispatch "add user authentication"

# Check status
/sdlc status

# View costs
/sdlc cost
```

## Commands

| Command | Description |
|---------|-------------|
| `/sdlc init` | Initialize plugin for your project |
| `/sdlc dispatch "X"` | Submit task to orchestrator |
| `/sdlc status` | Show backlog + active workflows |
| `/sdlc triage` | Prioritize inbox items |
| `/sdlc retro` | Run retrospective |
| `/sdlc release` | Cut release (version, changelog, tag) |
| `/sdlc hotfix` | Emergency production fix |
| `/sdlc cost` | Cost breakdown report |
| `/sdlc team` | Agent registry + health |
| `/sdlc add-agent` | Create new agent (guided) |
| `/sdlc add-domain` | Register new domain |
| `/sdlc add-sme "X"` | Create subject matter expert |
| `/sdlc undo` | Revert last plugin action |
| `/sdlc uninstall` | Remove plugin + cleanup |
| `/sdlc help` | Full command reference |

## How It Works

```
User describes task
  │
  ▼
CLASSIFY → type, complexity, domains
  │
  ├─ S/bugfix ──→ QUICK_FIX ──→ MERGE
  ├─ M/clear ───→ PLAN → EXECUTE → REVIEW → MERGE
  ├─ L/feature ─→ BRAINSTORM → PLAN → EXECUTE → REVIEW → MERGE
  ├─ XL ────────→ ARCHITECTURE_REVIEW → BRAINSTORM → PLAN → ...
  ├─ "hotfix" ──→ HOTFIX (emergency bypass)
  └─ "release" ─→ RELEASE
```

Each session runs with the right agents, in isolated worktrees, with cost tracking and HITL gates.

## Safety

| Layer | What | How |
|-------|------|-----|
| 1. Tool restrictions | Init agents can't write files | `disallowedTools` in frontmatter |
| 2. Hooks | Block credential access, guard config files | `PreToolUse` exit code 2 |
| 3. Permissions | User approves every edit | `permissionMode: acceptEdits` |
| 4. Environment | Production = read-only | Branch detection + permission injection |
| 5. Worktrees | Domain isolation | Each agent in own git worktree |
| 6. Git recovery | Everything revertable | Every change committed, `/sdlc undo` |

## Agent Catalog

57 agents across 9 categories, composed dynamically per task:

| Category | Count | Examples |
|----------|-------|---------|
| Governance | 13 | orchestrator, architect, code-reviewer, tech-lead |
| Development | 5 | backend-dev, frontend-dev, mobile-dev, api-designer |
| Testing | 8 | e2e-tester, security-auditor, a11y-tester, visual-qa |
| Design | 5 | ux-designer, ui-designer, design-system-lead |
| Product | 3 | product-analyst, product-manager, data-analyst |
| Specialists | 10 | db-migration, ai-prompt-eng, devops, i18n-specialist |
| Consultants | 7 | SME template + domain experts (postgres, react, security) |
| Business | 4 | marketing-specialist, content-strategist |
| Bridges | 5 | superpowers, playwright, code-review integrations |

Team composition scales with complexity:
- **S task** → 1 developer (fast, no overhead)
- **M task** → developer + tester + reviewer
- **L task** → + architect + tech-lead + product-analyst
- **XL task** → + architecture review + full design team

## Project Structure

```
claude-sdlc/
├── .claude-plugin/          Plugin manifest + marketplace
├── skills/                  16 CLI commands + 17 session skills
├── agents/                  Orchestrator + templates + 57-agent catalog
├── hooks/                   Safety hooks (secrets, write guard, entry check)
├── rules/                   Governance rules (always loaded)
├── schema/                  JSON schemas for all state files
├── scripts/                 Build tools (registry builder, detectors)
├── src/                     TypeScript services, types, utilities (352 tests)
├── templates/               Tech stack configs (NestJS, Next.js, Django, etc.)
├── docs/                    Spec, user guide, agent authoring guide
└── integrations/            Optional: Pixel Agents visual dashboard
```

## Examples

### Bug fix (auto-classified as QUICK_FIX)
```
You: "fix the login redirect loop in api"

Orchestrator:
  Task: TASK-001 — Fix the login redirect loop in api
  Type: bugfix | Complexity: S | Domain: api
  Chain: QUICK_FIX → MERGE
  Team: api-developer
  Cost: ~$1.00

  → api-developer fixes in worktree
  → Tests pass
  → MERGE: approve? [y/n]
  → Done. Backlog updated.
```

### Feature (auto-classified as L)
```
You: "add daily rewards system with streak bonuses"

Orchestrator:
  Task: TASK-002 — Add daily rewards system with streak bonuses
  Type: feature | Complexity: L | Domains: api, web
  Chain: BRAINSTORM → PLAN → EXECUTE → REVIEW → INTEGRATION_CHECK → MERGE
  Estimated cost: $12-18

  ⚠ Cost Estimate — Continue? [y/n]

  → BRAINSTORM: architect + you design the spec
  → PLAN: decompose into domain tasks
  → EXECUTE: api-developer + web-developer in parallel worktrees
  → REVIEW: governance-reviewer checks quality
  → INTEGRATION_CHECK: cross-domain tests
  → MERGE: approve? [y/n]
```

### Hotfix (emergency bypass)
```
You: "/sdlc hotfix production login page crashes"

Orchestrator:
  HOTFIX MODE — skipping BRAINSTORM, PLAN, ARCH_REVIEW
  Fast triage → Fix → Smoke tests → HITL merge (always)
  Branch: hotfix/login-page-crash from main

  → Fix applied, smoke tests pass
  → Merge to main? [y/n]
  → Auto-created: POST_MORTEM task, GAP_ANALYSIS task
```

### Status check
```
You: "/sdlc status"

BACKLOG (3 items)
─────────────────────────────────────────────────────
TASK-003  [M] feature   high    "User profile page"       executing
TASK-004  [S] bugfix    medium  "Tooltip overflow"        inbox
TASK-005  [L] feature   medium  "Leaderboard redesign"    planned

ACTIVE WORKFLOWS
─────────────────────────────────────────────────────
WF-002  TASK-003  EXECUTE → web-developer

RECENT (last 7 days)
─────────────────────────────────────────────────────
TASK-001  [S] bugfix   done  "Login redirect loop"  $0.80  1 session
TASK-002  [L] feature  done  "Daily rewards"        $14.20 5 sessions
```

## Requirements

- Claude Code 1.0.0+
- Node.js 18+
- Git

## Disclaimer

This plugin orchestrates AI agents that modify your codebase. Despite multiple layers of technical safeguards, AI agents may produce incorrect or destructive code. **You are solely responsible for reviewing and approving all changes.**

Always maintain backups. Always review diffs before merging.

## License

Dual licensed:
- **MIT** — free for individual developers and open-source projects
- **Commercial License** — required for platforms/SaaS embedding the plugin ([details](https://plan2skill.com/commercial))

## Credits

Built by [Plan2Skill](https://plan2skill.com). Agent prompts adapted from MIT-licensed sources — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
