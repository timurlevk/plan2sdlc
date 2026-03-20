---
name: sdlc-add-domain
description: Register a new domain with agents and rules
user-invocable: true
---

# /sdlc add-domain

Register a new domain with agents and rules.

## Process
1. Ask domain name (kebab-case)
2. Ask path (e.g., `apps/payments`, `src/domains/billing`)
3. Ask tech stack
4. Generate:
   - Domain CLAUDE.md (if monorepo)
   - {domain}-developer.md agent
   - {domain}-tester.md agent
   - Path-scoped rule for domain
5. Update .sdlc/config.yaml with new domain
6. Update .sdlc/registry.yaml with new agents
