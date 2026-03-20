---
name: architecture-review
description: Architecture health review
---

# ARCHITECTURE_REVIEW Session

Architecture health review — pre-XL, monthly, or when coupling detected.

## Entry Criteria
- Pre-XL task (before BRAINSTORM)
- Monthly cadence
- Coupling detected (facade bloat, orphan models)

## Process
1. Dispatch governance-architect + tech-lead
2. Analyze:
   - Module coupling (import graph)
   - Facade health (method count, complexity)
   - Orphan models (entities not fitting any domain)
   - Domain boundary violations
   - Performance hotspots
   - Tech debt trends
3. Detect signals for new domain/service:
   - Facade > 18 methods → split required
   - 2+ orphan models → new domain?
   - New tech stack requirement → new service?
4. Propose options:
   - (A) Split domain into 2
   - (B) Create new domain
   - (C) Extract cross-service layer
   - (D) Do nothing (complexity doesn't justify yet)
5. HITL: direction approval
6. Generate ADR (Architecture Decision Record)

## Participants
- governance-architect (mandatory)
- tech-lead (mandatory)
- frontend-architect (for frontend L/XL)
- backend-architect (for backend L/XL)
- data-architect (for data L/XL)

## Output
- Architecture health report
- ADR document
- Action items (if structural changes needed)
- Chains to ONBOARD (if config changes needed)
