---
name: sdlc-add-agent
description: Guided creation of a new agent
user-invocable: true
---

# /sdlc add-agent

Create a new agent with registry integration.

## Process
1. Ask role: developer / tester / specialist / reviewer / other
2. Ask domain (or "global" for governance)
3. Suggest tools, skills, model based on role
4. Generate agent.md from template:
   - Developer -> domain-developer.md template
   - Tester -> domain-tester.md template
   - Other -> minimal template
5. Write to `.claude/agents/{name}.md`
6. Update `.sdlc/registry.yaml`
7. Verify agent resolves

## Example
```
/sdlc add-agent

Role? developer
Domain? payments
Model? sonnet (recommended for development)

Creating payments-developer agent...
  .claude/agents/payments-developer.md created
  .sdlc/registry.yaml updated
  Agent resolves correctly
```
