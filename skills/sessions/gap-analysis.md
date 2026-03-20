---
name: gap-analysis
description: Post-merge analysis for missing tests, docs drift, uncovered edge cases
---

# GAP_ANALYSIS Session

Identify gaps in testing, documentation, and coverage after merging work.

## Entry Criteria
- Post-merge for L/XL tasks
- Weekly cadence trigger
- Manual trigger

## Process
1. Dispatch governance-architect + governance-reviewer
2. Analyze recently merged code for:
   - Missing test coverage (uncovered branches/functions)
   - Documentation that drifted from implementation
   - Uncovered edge cases
   - Missing error handling
   - Accessibility gaps (for UI changes)
3. Generate gap report with severity ratings
4. Create backlog items for significant gaps
5. HITL: user approves gap prioritization

## Participants
- governance-architect (mandatory)
- governance-reviewer (mandatory)
- performance-auditor (optional, for perf gaps)
- a11y-tester (optional, for accessibility gaps)

## Output
- Gap report document
- New backlog items for gaps (added to .sdlc/backlog.json)
- Tech debt items for systemic issues
