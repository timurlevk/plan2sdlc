---
name: docs-sync
description: Post-merge documentation sync
---

# DOCS_SYNC Session

Sync documentation with implementation after L/XL merges.

## Entry Criteria
- Post-merge for L/XL tasks
- Manual trigger

## Process
1. Dispatch governance-architect
2. Compare implementation with existing docs:
   - README.md — still accurate?
   - API docs — endpoints match implementation?
   - CLAUDE.md — project structure updated?
   - Domain CLAUDE.md files — rules current?
   - Architecture docs — diagrams match?
3. Update drifted documentation
4. HITL: doc review before commit

## Participants
- governance-architect (mandatory)
- tech-writer (if available)

## Output
- Updated documentation files
- Committed changes
