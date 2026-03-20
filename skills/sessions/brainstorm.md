---
name: brainstorm
description: Design session for L/XL features
---

# BRAINSTORM Session

Collaborative design session for complex features. Heavy HITL.

## Entry Criteria
- Complexity: L or XL
- Vague or complex requirement
- No existing spec

## Process

1. **Dispatch governance-architect** + relevant domain experts
2. If superpowers:brainstorming skill available → delegate to it
3. Otherwise use built-in flow:
   a. Analyze requirements — ask clarifying questions
   b. Explore approaches — propose 2-3 design options
   c. Evaluate trade-offs — complexity, risk, domain impact
   d. **HITL: user selects approach**
   e. Draft design spec with:
      - Problem statement
      - Selected approach + rationale
      - Domain boundaries and affected areas
      - Data model changes (if any)
      - API contracts (if any)
      - Acceptance criteria
      - Risk assessment
   f. **HITL: user approves spec**

## Participants
- governance-architect (mandatory)
- Relevant domain developers (for domain expertise)
- ux-designer (if UI feature)
- product-analyst (for L/XL features)
- Relevant SMEs (on-demand consultation)

## HITL
Heavy — questions, approach selection, spec approval.

## Output
- Design spec document (saved to docs/)
- Spec path stored in handoff artifacts
- Chains to PLAN
