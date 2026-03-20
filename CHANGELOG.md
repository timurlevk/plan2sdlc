# Changelog

All notable changes to the claude-sdlc plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-03-21

### Changed
- Orchestrator v2 — dispatch-only mode, removed superpowers integration table, added subagent dispatch protocol with status codes
- EXECUTE v2 — per-domain dispatch with TDD discipline and prompt-driven iterative retry (not Stop hook)

### Removed
- Superpowers integration table from orchestrator
- Cost tracking references from orchestrator and execute session
- "With/without superpowers" branching from execute session

## [0.3.0] - 2026-03-21

### Added
- SessionStart state injection — orchestrator receives SDLC context on startup (entry-check.cjs v2)
- Subagent dispatch template with TDD discipline, status protocol, self-review checklist
- Config schema v2 — execution settings (maxIterations, maxRetries), sharedPaths, generatedPaths
- RETRO v2 — quality rubric scoring (6 criteria, A-F grades per agent)
- v2 attribution for 5 adapted open-source patterns (THIRD_PARTY_NOTICES.md)

### Changed
- Superpowers guard simplified to block-all when SDLC active (165 → 34 lines)
- Config schema version bumped to 2

### Verified
- disallowedTools correctly wired in both domain-developer and domain-tester templates

## [0.1.1] - 2026-03-20

### Fixed
- Write guard blocking `/sdlc init` — skills without agent name can now write `.sdlc/` files
- Hooks renamed from `.js` to `.cjs` to fix ESM/CommonJS conflict
- Entry-check hook now detects uninitialized projects and prompts `/sdlc init`
- Plugin manifest: removed unrecognized fields, fixed agents format
- Critical bugs: backlog format, state.json format, handoff schema, cost domain aggregation, hardCap=0

### Added
- Privacy policy (PRIVACY.md)
- Schema versioning (schemaVersion: 1) for migration support
- Bash command inspection in secrets guard
- Per-file source attribution on all adapted agents
- Pre-dispatch cost estimate for M/L/XL tasks
- `.sdlc/` write protection for non-governance agents

## [0.1.0] - 2026-03-20

### Added
- `/sdlc init` — project bootstrap with ecosystem scan, domain mapping, agent selection
- `/sdlc dispatch` — task classification and session routing
- `/sdlc status` — backlog, active workflows, recent completions
- `/sdlc triage` — backlog prioritization
- `/sdlc retro` — retrospective with agent health review
- `/sdlc release` — version bump, changelog, tag
- `/sdlc hotfix` — emergency production fix bypass
- `/sdlc cost` — cost breakdown by session/domain/model
- `/sdlc team` — agent registry health and performance
- `/sdlc add-agent`, `/sdlc add-domain`, `/sdlc add-sme` — guided creation
- `/sdlc undo` — revert last plugin action
- `/sdlc uninstall` — clean removal with backup restore option
- 17 session types: QUICK_FIX, TRIAGE, BRAINSTORM, PLAN, EXECUTE, REVIEW, INTEGRATION_CHECK, MERGE, GAP_ANALYSIS, RETRO, POST_MORTEM, ARCHITECTURE_REVIEW, SECURITY_REVIEW, RELEASE, DOCS_SYNC, DEPENDENCY_AUDIT, ONBOARD, HOTFIX
- 57-agent catalog across 9 categories (governance, development, testing, design, product, business, specialists, consultants, bridges)
- 6-layer safety: tool restrictions, PreToolUse hooks (secrets guard, write guard, Bash inspection), permission modes, environment awareness, worktree isolation, git recovery
- Persistent state with schema versioning (.sdlc/ directory)
- Cost tracking with per-session and monthly budget controls
- Tech stack templates: NestJS monorepo, Next.js, Django, Express, React SPA, generic
- Project ecosystem integration: inherits existing conventions, never overrides
- Plugin interop: graceful degradation without superpowers/playwright/code-review plugins
- Pixel Agents visual dashboard integration (optional)
