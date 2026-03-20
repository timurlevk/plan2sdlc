---
name: dependency-audit
description: Audit dependencies for vulnerabilities and outdated versions
---

# DEPENDENCY_AUDIT Session

Comprehensive dependency health check.

## Entry Criteria
- Monthly cron (1st of month)
- npm/pip/gem audit finds critical/high
- After SECURITY_REVIEW flags outdated dependency
- Manual: `/sdlc deps`

## Process
1. Dispatch dependency-manager
2. Run package manager audit:
   - npm: `npm audit --json`
   - pip: `pip audit --format json`
   - gem: `bundle audit`
   - go: `govulncheck`
   - cargo: `cargo audit`
3. Classify findings:
   - Critical/High vulnerabilities → immediate fix tasks
   - Outdated major versions → assess breaking changes
   - License violations → flag for review
   - Unused dependencies → propose removal
4. For each finding, propose action:
   - (A) Update to patched version (auto if patch/minor)
   - (B) Major version upgrade (create backlog item)
   - (C) Replace dependency (if abandoned/vulnerable)
   - (D) Accept risk (document reason)
5. HITL: review proposed actions
6. Apply approved patch/minor updates with tests

## Participants
- dependency-manager (mandatory)
- security-auditor (if vulnerabilities found)

## Budget
$2 target, 10-20 min duration.

## Output
- Dependency health report
- Applied safe updates
- Backlog items for major upgrades
- License compliance report
