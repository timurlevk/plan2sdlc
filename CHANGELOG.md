# Changelog

All notable changes to the claude-sdlc plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
