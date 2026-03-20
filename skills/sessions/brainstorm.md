---
name: brainstorm
description: Design session for L/XL features — invokes superpowers:brainstorming if available
---

# BRAINSTORM Session

Collaborative design session for complex features. Heavy HITL.

## Entry Criteria
- Complexity: L or XL
- Vague or complex requirement
- No existing spec

## Process

### With superpowers plugin (preferred)

If superpowers:brainstorming skill is available, invoke it:

```
Use the Skill tool: skill: "superpowers:brainstorming"
```

Superpowers will handle: context exploration → clarifying questions → approach proposals → design → spec writing → spec review → user approval.

After superpowers:brainstorming completes and user approves the spec, **do NOT let superpowers invoke writing-plans**. Instead, return control to the SDLC orchestrator which will chain to the PLAN session.

### Without superpowers (fallback)

1. **Dispatch governance-architect** + relevant domain experts
2. Analyze requirements — ask clarifying questions (one at a time)
3. Explore approaches — propose 2-3 design options with trade-offs
4. **HITL: user selects approach**
5. Draft design spec:
   - Problem statement
   - Selected approach + rationale
   - Domain boundaries and affected areas
   - Data model changes (if any)
   - API contracts (if any)
   - Acceptance criteria
   - Risk assessment
6. **HITL: user approves spec**
7. Save spec to `docs/specs/` directory

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
- **Chains to PLAN** (orchestrator handles transition)
