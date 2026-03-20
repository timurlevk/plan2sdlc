# Claude SDLC Plugin

Full SDLC governance plugin for Claude Code — orchestrator, agent teams, dynamic workflow engine.

## What This Is

A Claude Code plugin that provides:
- **Orchestrator agent** — dispatch-only entry point, classifies tasks, composes teams, enforces pipeline
- **60 agent catalog** — governance, development, testing, design, product, business, specialists, SMEs
- **17 session types** — QUICK_FIX, TRIAGE, BRAINSTORM, PLAN, EXECUTE, REVIEW, MERGE, RELEASE, HOTFIX, etc.
- **Platform-enforced domain isolation** — disallowedTools in agent frontmatter
- **Prompt-driven iterative execution** — TDD discipline with retry loops (adapted from ralph-loop)
- **3-agent parallel code review** — confidence scoring >= 80 threshold
- **4-phase systematic debugging** — root cause analysis scoped to domain
- **Dynamic team composition** — registry with mandatory/auto-detected/on-demand agent assignment
- **Persistent state** — backlog, workflow tracking, tech debt register
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
│   ├── orchestrator.md          ← main entry point agent (dispatch-only)
│   ├── catalog/                 ← full agent catalog by category
│   └── templates/               ← parameterized templates
│       ├── domain-developer.md  ← developer template (disallowedTools)
│       ├── domain-tester.md     ← tester template (disallowedTools)
│       └── subagent-dispatch.md ← canonical dispatch template
├── hooks/
│   ├── entry-check.cjs          ← SessionStart: state injection + warnings
│   ├── sdlc-write-guard.cjs     ← PreToolUse: block protected paths
│   ├── sdlc-secrets-guard.cjs   ← PreToolUse: block credential access
│   └── sdlc-superpowers-guard.cjs ← PreToolUse: block superpowers when SDLC active
├── rules/
│   └── sdlc-governance.md       ← always-loaded governance rules
├── templates/                   ← project-type starters
│   ├── nestjs-monorepo/
│   ├── nextjs-app/
│   └── generic/
├── schema/                      ← JSON schemas for state files (v2)
├── scripts/                     ← build/generation tools
│   ├── init.ts                  ← project bootstrap logic
│   ├── registry-builder.ts      ← build registry from agent frontmatter
│   ├── domain-detector.ts       ← auto-detect project domains
│   └── tech-stack-detector.ts   ← detect frameworks/ORMs
├── src/                         ← shared TypeScript utilities
├── docs/
│   ├── spec/                    ← design specs
│   ├── plans/                   ← implementation plans
│   └── guide/                   ← user guide, agent authoring guide
└── THIRD_PARTY_NOTICES.md       ← MIT attributions (11 sources)
```

## Commands

- `pnpm build` — compile TypeScript
- `pnpm build:registry` — regenerate registry from agent frontmatter
- `pnpm test` — run tests
- `pnpm lint` — lint

## Release Rules

- **Bump version on every fix/feature commit.** Update `version` in both `.claude-plugin/plugin.json` and `package.json` before pushing. Users cache plugins by version — if version doesn't change, they won't get the update.
- Use semver: patch for fixes (0.1.1), minor for features (0.2.0), major for breaking changes (1.0.0).
- Update `CHANGELOG.md` with every version bump.

## Key Design Decisions

- **Plugin, not framework** — installs into any Claude Code project, inherits existing conventions
- **HITL-first** — all changes require user approval, agents propose, user decides
- **Inherit > Enhance** — never override existing project conventions
- **Read-only analysis** — init phase agents cannot write files (disallowedTools enforced)
- **6-layer safety** — tool restrictions > hooks > permissions > env > worktrees > git
- **Domain isolation via disallowedTools** — platform-enforced, not hook-based (CLAUDE_AGENT_NAME unavailable in hooks)
- **Prompt-driven iteration** — retry loops inside dispatch prompts, not Stop hooks (Stop doesn't fire for subagents)
- **3-agent review** — governance+coverage, bugs+security, domain boundary (confidence >= 80)
- **Self-contained v2** — internalized superpowers/code-review/ralph-loop patterns, no external skill dependencies

## Specs

- Plugin design: `docs/spec/claude-sdlc-plugin-design.md` (27 sections)
- v2 design: `docs/spec/2026-03-20-sdlc-v2-self-contained-design.md`
- v2 implementation plan: `docs/plans/2026-03-20-sdlc-v2-implementation.md`
