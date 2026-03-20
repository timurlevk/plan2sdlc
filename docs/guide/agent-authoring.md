# Agent Authoring Guide

This guide covers how to create custom agents for the Claude SDLC plugin.

## Agent File Format

Agents are markdown files with YAML frontmatter. They live in `.claude/agents/` (project-level) or in the plugin's `agents/catalog/` directory.

```markdown
---
name: payments-developer
description: Payments domain development specialist
model: sonnet
tools: Read, Write, Edit, Bash, Glob, Grep
isolation: domain
permissionMode: bypassPermissions
maxTurns: 30
---

# Payments Developer

You are the payments domain developer. You work on the `apps/payments` directory.

## Responsibilities
- Implement payment processing features
- Write unit and integration tests
- Follow PCI-DSS compliance requirements

## Rules
- Never log credit card numbers
- Always use parameterized queries
- Run tests before marking work complete
```

## Available Fields

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique agent identifier (kebab-case). Used for referencing in registry and orchestrator routing. |
| `description` | string | One-line description of the agent's role. Shown in `/sdlc team` output. |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | string | `sonnet` | Model to use: `opus` (leads, SMEs), `sonnet` (workers), `haiku` (simple tasks). |
| `tools` | string | (all) | Comma-separated list of allowed tools. Restricts what the agent can do. |
| `isolation` | string | (none) | Isolation level: `domain` (scoped to paths), `full` (separate worktree). |
| `permissionMode` | string | `default` | Permission mode: `default`, `plan` (read-only analysis), `bypassPermissions` (trusted agents). |
| `maxTurns` | number | 20 | Maximum conversation turns before the agent must yield. Prevents runaway sessions. |
| `disallowedTools` | string | (none) | Comma-separated list of tools the agent must NOT use. |
| `customInstructions` | string | (none) | Additional instructions appended to the system prompt. |

### Model Selection Guide

- **opus**: Use for lead agents, architects, SMEs, and complex reasoning tasks. Higher cost but better judgment.
- **sonnet**: Use for most development and testing agents. Good balance of capability and cost.
- **haiku**: Use for simple, repetitive tasks like formatting checks or boilerplate generation.

## Templates

The plugin includes parameterized templates for common agent types. Templates use `{{variable}}` syntax for substitution.

### Developer Template

```markdown
---
name: {{domain}}-developer
description: {{domain}} domain development specialist
model: sonnet
tools: Read, Write, Edit, Bash, Glob, Grep
maxTurns: 30
---

# {{Domain}} Developer

You develop features in the `{{path}}` directory.

## Tech Stack
{{techStack}}

## Rules
- Write tests for all new code
- Follow existing code conventions
- Run linter before completing work
```

### Tester Template

```markdown
---
name: {{domain}}-tester
description: {{domain}} domain test specialist
model: sonnet
tools: Read, Write, Edit, Bash, Glob, Grep
maxTurns: 25
---

# {{Domain}} Tester

You write and maintain tests for the `{{path}}` directory.

## Responsibilities
- Unit tests for all public functions
- Integration tests for API endpoints
- E2E tests for critical user flows
```

### SME Template

```markdown
---
name: {{topic}}-sme
description: Subject matter expert for {{topic}}
model: opus
tools: Read, Glob, Grep
permissionMode: plan
maxTurns: 20
---

# {{Topic}} SME

You are a subject matter expert on {{topic}}.
Provide advice when consulted by other agents.
You do NOT write code directly -- you advise.
```

## Registration

Agents are registered in `.sdlc/registry.yaml`. Registration happens automatically when:

1. You run `/sdlc init` (all detected agents are registered)
2. You run `/sdlc add-agent` (new agent is created and registered)
3. You run `pnpm build:registry` (rebuilds registry from agent frontmatter)

### Registry Entry Format

```yaml
agents:
  - name: payments-developer
    description: Payments domain development specialist
    category: development
    tier: worker
    model: sonnet
    tools: [Read, Write, Edit, Bash, Glob, Grep]
    domains: [payments]
    status: active
    source: catalog/development/payments-developer.md
```

### Tiers

| Tier | Description | Typical Model |
|------|-------------|---------------|
| orchestrator | Main entry point, routes tasks | opus |
| lead | Domain leads, architects | opus |
| worker | Developers, testers | sonnet |
| consultant | SMEs, on-demand advisors | opus |
| utility | Formatting, linting, simple tasks | haiku |

## Best Practices

### Single Responsibility

Each agent should have one clear role. Avoid creating "god agents" that do everything. Instead, compose specialized agents via the orchestrator.

```
Good:  api-developer, api-tester, api-reviewer
Bad:   api-everything-agent
```

### Clear Rules

Be explicit about what the agent should and should not do. Ambiguous instructions lead to unpredictable behavior.

```markdown
## Rules
- Only modify files in `apps/api/src/`
- Never modify migration files directly
- Always run `pnpm test` after changes
- If tests fail, fix them before reporting completion
```

### Tool Restrictions

Only grant the tools an agent actually needs. A reviewer should not have Write access. An SME should not have Bash access.

```markdown
# Reviewer: read-only analysis
tools: Read, Glob, Grep

# Developer: full access
tools: Read, Write, Edit, Bash, Glob, Grep

# SME: read-only consultation
tools: Read, Glob, Grep
```

### Test Your Agents

Before relying on a custom agent in production workflows, test it:

1. Create the agent file
2. Run `claude --agent <name>` directly
3. Give it a representative task
4. Verify it stays within its defined scope
5. Check that tool restrictions are enforced

### Naming Conventions

Use kebab-case for agent names. Follow the pattern `{domain}-{role}`:

```
payments-developer
auth-tester
database-sme
api-reviewer
web-e2e-tester
```

For global agents (not domain-specific), use just the role:

```
orchestrator
architect
code-reviewer
tech-lead
```
