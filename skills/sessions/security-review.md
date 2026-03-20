---
name: security-review
description: Security review for auth/middleware/endpoint changes
---

# SECURITY_REVIEW Session

Security review triggered when sensitive files are modified.

## Entry Criteria
- Auth middleware files changed
- Endpoint security files changed
- File patterns matching config.triggers.securityReview.autoFor
- Manual trigger

## Process
1. Dispatch governance-tech-lead
2. Run dependency audit: `npm audit` / `pip audit` / etc.
3. Review changes for:
   - Hardcoded credentials or secrets
   - SQL injection vulnerabilities
   - XSS vulnerabilities
   - Authentication/authorization bypass
   - Insecure cryptographic operations
   - Missing input validation
   - CORS misconfigurations
   - Sensitive data exposure
4. Generate security report
5. HITL: always required

## Test Requirements
- Mandatory: dependency audit
- Optional: custom security rules
- Gate: no critical/high vulnerabilities

## Participants
- governance-tech-lead (mandatory)
- security-auditor (if available)
- security-sme (for complex issues)

## Output
- Security report
- Vulnerability findings with severity
- Recommended fixes
