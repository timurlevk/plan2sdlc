---
name: onboard
description: Apply config changes from RETRO/POST_MORTEM
---

# ONBOARD Session

Apply approved configuration changes from RETRO or POST_MORTEM sessions.

## Entry Criteria
- After RETRO with approved changes
- After POST_MORTEM with preventive measures
- After new domain creation
- Manual: `/sdlc onboard`

## Process
1. Dispatch governance-architect
2. Read proposed changes from RETRO/POST_MORTEM handoff
3. Categorize changes:
   - CLAUDE.md updates → tech-writer drafts
   - Rules changes → governance-architect drafts
   - Skill changes → governance-architect drafts
   - Agent prompt changes → governance-architect drafts
   - Registry changes → orchestrator updates
4. For each change:
   a. Show current vs proposed (diff)
   b. Explain rationale (from RETRO/POST_MORTEM findings)
   c. HITL: approve / modify / reject
5. Apply approved changes
6. Validate:
   - All agents still resolvable?
   - All skills loadable?
   - Rules have valid paths: frontmatter?
   - CLAUDE.md under size limits?
   - Registry consistent with agent files?
7. Commit with conventional commit messages:
   `chore(sdlc): {description} after {RETRO|POST_MORTEM}-{id}`

## Participants
- governance-architect (mandatory)
- tech-writer (if CLAUDE.md changes)
- orchestrator (if registry changes)

## Output
- Updated .claude/ files (committed)
- Updated .sdlc/registry.yaml
- Change log entry in .sdlc/history/
