---
name: release
description: Cut release — version bump, changelog, tag, deploy
---

# RELEASE Session

Cut a release: version bump, changelog generation, git tag, deploy verification.

## Entry Criteria
- Manual trigger only: `/sdlc release`
- All planned work merged

## Process
1. Dispatch governance-tech-lead
2. Run full pre-release test suite:
   - All unit tests
   - All integration tests
   - All E2E tests
   - Typecheck + lint
   - Gate: 100% green, coverage above all thresholds
3. Determine version bump (major/minor/patch):
   - Breaking changes → major
   - New features → minor
   - Bug fixes only → patch
4. Generate/update CHANGELOG.md
5. HITL: version + deploy approval
6. Create git tag per config.git.tagFormat (e.g., `v1.2.3`)
7. If CI/CD detected → trigger deploy pipeline

## Participants
- governance-tech-lead (mandatory)
- release-manager (if available)
- tech-writer (for changelog)

## HITL
Version and deploy approval always required.

## Output
- Version bump in package.json (or equivalent)
- Updated CHANGELOG.md
- Git tag created
- Deploy triggered (if CI/CD configured)
