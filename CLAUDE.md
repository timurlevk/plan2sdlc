# Claude SDLC Plugin

Full SDLC governance plugin for Claude Code — orchestrator, agent teams, dynamic workflow engine.

## What This Is

A Claude Code plugin that provides:
- **Orchestrator agent** — entry point, classifies tasks, composes teams, enforces pipeline
- **60 agent catalog** — governance, development, testing, design, product, business, specialists, SMEs
- **17 session types** — QUICK_FIX, TRIAGE, BRAINSTORM, PLAN, EXECUTE, REVIEW, MERGE, RELEASE, HOTFIX, etc.
- **Dynamic team composition** — registry with mandatory/auto-detected/on-demand agent assignment
- **Persistent state** — backlog, workflow tracking, cost logging, tech debt register
- **6-layer safety** — tool restrictions, hooks, permission modes, env awareness, worktrees, git recovery
- **Project ecosystem integration** — inherits existing conventions, enhances gaps

## Tech Stack

- **Language:** TypeScript (strict)
- **Runtime:** Claude Code plugin system (skills, agents, hooks, rules)
- **Scripts:** tsx for build/generation tools
- **Testing:** Vitest
- **Linting:** ESLint

## Project Structure

```
claude-sdlc/
├── .claude-plugin/plugin.json   ← plugin manifest
├── skills/                      ← session skills + CLI commands
│   ├── sdlc-init/               ← /sdlc init
│   ├── sdlc-dispatch/           ← /sdlc dispatch
│   ├── sdlc-status/             ← /sdlc status
│   └── sessions/                ← internal session skills (16 types)
├── agents/
│   ├── orchestrator.md          ← main entry point agent
│   ├── catalog/                 ← full agent catalog by category
│   └── templates/               ← parameterized templates
├── hooks/
│   ├── entry-check.js           ← SessionStart: warn if not orchestrator
│   ├── sdlc-write-guard.js      ← PreToolUse: block protected paths
│   └── sdlc-secrets-guard.js    ← PreToolUse: block credential access
├── rules/
│   └── sdlc-governance.md       ← always-loaded governance rules
├── templates/                   ← project-type starters
│   ├── nestjs-monorepo/
│   ├── nextjs-app/
│   └── generic/
├── schema/                      ← JSON schemas for state files
├── scripts/                     ← build/generation tools
│   ├── init.ts                  ← project bootstrap logic
│   ├── registry-builder.ts      ← build registry from agent frontmatter
│   ├── domain-detector.ts       ← auto-detect project domains
│   └── tech-stack-detector.ts   ← detect frameworks/ORMs
├── src/                         ← shared TypeScript utilities
├── docs/
│   ├── spec/                    ← design specs
│   └── guide/                   ← user guide, agent authoring guide
└── THIRD_PARTY_NOTICES.md       ← MIT attributions
```

## Commands

- `pnpm build` — compile TypeScript
- `pnpm build:registry` — regenerate registry from agent frontmatter
- `pnpm test` — run tests
- `pnpm lint` — lint

## Key Design Decisions

- **Plugin, not framework** — installs into any Claude Code project, inherits existing conventions
- **HITL-first** — all changes require user approval, agents propose, user decides
- **Inherit → Enhance** — never override existing project conventions
- **Read-only analysis** — init phase agents cannot write files (disallowedTools enforced)
- **6-layer safety** — tool restrictions > hooks > permissions > env > worktrees > git

## Specs

- Plugin design: `docs/spec/claude-sdlc-plugin-design.md` (27 sections)
- Parent spec (Plan2Skill-specific): referenced in Plan2Skill project
